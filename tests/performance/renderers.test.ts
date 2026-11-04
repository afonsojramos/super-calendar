import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { arch, cpus, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import type { Browser } from "playwright";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { launchBrowser } from "../support/browser";
import { serveDirectory } from "../support/static-server";
import { fixtureConfig } from "../web/browser/fixture-config";

const renderer = inject("browserRenderer");
const root = resolve(import.meta.dirname, "../..");
const samples: {
  loadToPaintMs: number;
  updateToPaintMs: number;
  scrollToPaintMs: number;
  nodes: number;
}[] = [];
let directory: string;
let browser: Browser;
let server: Awaited<ReturnType<typeof serveDirectory>>;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), `calendar-performance-${renderer}-`));
  const { config } = fixtureConfig(renderer, "dist");
  await build({ ...config, logLevel: "silent", build: { outDir: directory, emptyOutDir: true } });
  server = await serveDirectory(directory);
  browser = await launchBrowser();
});

afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    await server?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

it(`${renderer} records production rendering, scrolling, and bundle baselines`, async () => {
  // Discard browser startup effects before measuring the same cold-page scenarios.
  for (let sample = 0; sample < 8; sample++) {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 850 },
      timezoneId: "Europe/Madrid",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${server.url}/?view=dense`);
      await page.waitForFunction(
        () => document.querySelectorAll('[data-slot="event"]').length === 1000,
      );
      const loadToPaintMs = await page.evaluate(
        () =>
          new Promise<number>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now()))),
          ),
      );
      const nodes = await page.locator("*").count();
      const updateToPaintMs = await page
        .getByRole("button", { name: "Update events" })
        .evaluate((button) => {
          if (!(button instanceof HTMLButtonElement)) throw new Error("Missing update button");
          const start = performance.now();
          button.click();
          return new Promise<number>((done, reject) => {
            const rendered = () => {
              const events = [...document.querySelectorAll('[data-slot="event"]')];
              if (
                events.length === 1000 &&
                events.every((event) => event.textContent?.includes("!"))
              ) {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => done(performance.now() - start)),
                );
              } else if (performance.now() - start > 5_000) {
                reject(new Error("The bulk event update did not render"));
              } else requestAnimationFrame(rendered);
            };
            requestAnimationFrame(rendered);
          });
        });
      expect(await page.getByLabel("Revision").textContent()).toBe("1");
      expect(await page.locator('[data-slot="event"]').count()).toBe(1000);
      expect(
        (await page.locator('[data-slot="event"]').allTextContents()).every((title) =>
          title.includes("!"),
        ),
      ).toBe(true);

      await page.goto(`${server.url}/?view=months`);
      const days = page.locator("[data-day]");
      await days.first().waitFor();
      const scrollToPaintMs = await days.first().evaluate((day) => {
        let scroller = day.parentElement;
        while (scroller && getComputedStyle(scroller).overflowY !== "auto")
          scroller = scroller.parentElement;
        if (!scroller) throw new Error("No month scroller");
        const first = day.getAttribute("data-day");
        const start = performance.now();
        scroller.scrollTop += 4000;
        return new Promise<number>((done, reject) => {
          const rendered = () => {
            const next = document.querySelector("[data-day]")?.getAttribute("data-day");
            if (next && next !== first) {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => done(performance.now() - start)),
              );
            } else if (performance.now() - start > 5_000) {
              reject(new Error("The scrolled month rows did not render"));
            } else requestAnimationFrame(rendered);
          };
          requestAnimationFrame(rendered);
        });
      });
      expect(await days.count()).toBeLessThan(400);
      expect(errors).toEqual([]);
      if (sample > 0) samples.push({ loadToPaintMs, updateToPaintMs, scrollToPaintMs, nodes });
    } finally {
      await context.close();
    }
  }

  const assets = (await readdir(join(directory, "assets"))).filter(
    (file) => file.endsWith(".js") || file.endsWith(".css"),
  );
  const bundles = await Promise.all(
    assets.map(async (file) => {
      const data = await readFile(join(directory, "assets", file));
      return { file, bytes: data.byteLength, gzipBytes: gzipSync(data).byteLength };
    }),
  );
  const metrics = ["loadToPaintMs", "updateToPaintMs", "scrollToPaintMs", "nodes"] as const;
  const summary = Object.fromEntries(
    metrics.map((metric) => {
      const values = samples.map((sample) => sample[metric]).sort((a, b) => a - b);
      expect(values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      return [
        metric,
        {
          median: values[Math.floor(values.length / 2)],
          p95: values[Math.ceil(values.length * 0.95) - 1],
        },
      ];
    }),
  );
  const output = join(root, "dist/performance");
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, `${renderer}.json`),
    `${JSON.stringify(
      {
        renderer,
        commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        dirty:
          execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()
            .length > 0,
        collectedAt: new Date().toISOString(),
        environment: {
          platform: platform(),
          arch: arch(),
          cpu: cpus()[0]?.model,
          node: process.version,
          browser: browser.version(),
        },
        fixture: {
          eventCount: 1000,
          monthCount: 121,
          viewport: { width: 1100, height: 850 },
          warmupRuns: 1,
        },
        bundles,
        summary,
        samples,
      },
      null,
      2,
    )}\n`,
  );
});
