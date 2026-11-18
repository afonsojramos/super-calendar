import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Browser } from "playwright";
import { afterAll, beforeAll, expect, it } from "vitest";
import { launchBrowser } from "../support/browser";
import { serveDirectory } from "../support/static-server";

let server: Awaited<ReturnType<typeof serveDirectory>>;
let browser: Browser;
let directory: string;
const root = resolve(import.meta.dirname, "../..");
beforeAll(async () => {
  const nativeRequire = createRequire(resolve(root, "examples/native/package.json"));
  directory = await mkdtemp(resolve(tmpdir(), "calendar-native-month-"));
  await symlink(
    resolve(root, "examples/native/node_modules"),
    resolve(directory, "node_modules"),
    "dir",
  );
  await writeFile(
    resolve(directory, "package.json"),
    JSON.stringify({ name: "calendar-native-preview-test", private: true, main: "index.js" }),
  );
  await writeFile(
    resolve(directory, "index.js"),
    `import "./global.css";\nimport { registerRootComponent } from "expo";\nimport App from ${JSON.stringify(resolve(import.meta.dirname, "fixtures/native-month/main.tsx"))};\nregisterRootComponent(App);\n`,
  );
  await writeFile(
    resolve(directory, "app.json"),
    JSON.stringify({
      expo: {
        name: "Calendar preview test",
        slug: "calendar-preview-test",
        web: { bundler: "metro" },
      },
    }),
  );
  await writeFile(
    resolve(directory, "global.css"),
    `@import "tailwindcss";\n@import "uniwind";\n@source ${JSON.stringify(resolve(import.meta.dirname, "fixtures/native-month"))};\n`,
  );
  await writeFile(
    resolve(directory, "metro.config.js"),
    `const { getDefaultConfig } = require("expo/metro-config");\nconst config = getDefaultConfig(__dirname);\nconfig.watchFolders = [${JSON.stringify(root)}];\nconfig.resolver.nodeModulesPaths = [${JSON.stringify(resolve(root, "examples/native/node_modules"))}, ${JSON.stringify(resolve(root, "node_modules"))}];\nmodule.exports = require("uniwind/metro").withUniwindConfig(config, { cssEntryFile: "./global.css" });\n`,
  );
  const output = resolve(directory, "dist");
  await promisify(execFile)(
    process.execPath,
    [
      resolve(dirname(nativeRequire.resolve("expo/package.json")), "bin/cli"),
      "export",
      "--platform",
      "web",
      "--output-dir",
      output,
      "--max-workers",
      "2",
    ],
    {
      cwd: directory,
      env: { ...process.env, CI: "1" },
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  server = await serveDirectory(output);
  browser = await launchBrowser();
}, 65_000);
afterAll(async () => {
  await browser?.close();
  await server?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it.each(["styles", "classes"])(
  "keeps multi-week dates, bars, overflow buttons and hit targets aligned with %s",
  async (source) => {
    const gap = source === "classes" ? 18 : 14;
    const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url + "?multiweek=" + source);
      const grid = page.getByTestId("multiweek-grid");
      const bar = grid.getByText("Conference", { exact: true });
      await bar.waitFor();
      const rows = grid.locator(":scope > *");
      const day = (n: number) => page.getByTestId(`date-${n}`);
      const more = (n: number) => page.getByRole("button", { name: `1 more events, ${n} June` });
      const box = async (locator: typeof bar) => {
        const bounds = await locator.boundingBox();
        if (!bounds) throw new Error("Missing multi-week layout");
        return bounds;
      };
      await expect
        .poll(async () => {
          const dateBox = await box(day(16));
          return (await box(bar)).y - dateBox.y - dateBox.height;
        })
        .toBeCloseTo(gap, 0);
      const lane = await box(bar);
      const monday = await box(more(15));
      const tuesday = await box(more(16));
      expect(monday.y).toBeCloseTo(tuesday.y, 0);
      expect(monday.y - lane.y).toBeCloseTo(20 + gap + 2, 0);
      const host = await box(page.getByRole("cell", { name: /Tuesday,? 16 June/ }));
      expect(host.y + host.height - tuesday.y - tuesday.height).toBeGreaterThanOrEqual(4.5);
      expect(await rows.first().evaluate((row) => getComputedStyle(row).paddingTop)).toBe("18px");
      const heights = await rows.evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().height),
      );
      expect(heights).toHaveLength(3);
      for (const height of heights) expect(height).toBeCloseTo(heights[0], 0);
      await more(16).click();
      expect(await page.locator("output").textContent()).toBe("More 16");
      await bar.scrollIntoViewIfNeeded();
      const target = await box(bar);
      await page.mouse.move(target.x + 6, target.y + 5);
      await page.mouse.down();
      try {
        await expect.poll(() => page.locator("output").textContent()).toBe("Conference");
      } finally {
        await page.mouse.up();
      }
      const currentBar = await box(bar);
      await page.mouse.move(currentBar.x + 6, currentBar.y + 24);
      await page.mouse.down();
      await page.mouse.move(currentBar.x + host.width + 6, currentBar.y + 24);
      await page.mouse.up();
      await expect.poll(() => page.locator("output").textContent()).toBe("Create 15");
    } finally {
      await page.close();
    }
  },
);

it("hides native-web creation content and prevents focus", async () => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  try {
    await page.goto(server.url);
    const grid = page.getByTestId("month-grid");
    await grid.waitFor({ timeout: 15000 });
    const bounds = await grid.boundingBox();
    if (!bounds) throw new Error("Month grid has no bounds");
    const origin = {
      x: bounds.x + (bounds.width * 2.5) / 7,
      y: bounds.y + (bounds.height * 2) / 5 + 8,
    };
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    const preview = page.getByTestId("month-create-ghost");
    await preview.waitFor();
    expect(await preview.getAttribute("aria-hidden")).toBe("true");
    expect(await preview.getAttribute("inert")).not.toBeNull();
    expect(await page.getByRole("textbox", { name: "Draft input" }).count()).toBe(0);
    const input = preview.locator("input");
    await input.evaluate((element) => element.focus());
    expect(await input.evaluate((element) => element === document.activeElement)).toBe(false);
    await page.keyboard.press("Tab");
    expect(await preview.evaluate((element) => element.contains(document.activeElement))).toBe(
      false,
    );
    await page.mouse.move(origin.x + bounds.width / 7, origin.y);
    await page.mouse.up();
    await expect.poll(() => page.locator("output").textContent()).toBe("16 to 18");
    await page.getByRole("button", { name: "Report focus" }).click();
    expect(await page.locator("html").getAttribute("data-draft-focus")).toBe("0");
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});
