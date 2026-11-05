import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, inject } from "vitest";
import { fixtureConfig } from "./fixture-config";
import { launchBrowser, type BrowserEngine } from "../../support/browser";

declare module "vitest" {
  export interface ProvidedContext {
    browserRenderer: "react" | "solid";
    browserArtifact: "source" | "dist";
    browserEngine: BrowserEngine;
    browserReactVersion?: 18 | 19;
  }
}

export const renderer = inject("browserRenderer");
export const artifact = inject("browserArtifact");
export const engine = inject("browserEngine");
const reactVersion = inject("browserReactVersion") ?? 19;
export const rendererName = `${renderer === "react" ? `React DOM${reactVersion === 18 ? " 18" : ""}` : "Solid"} (${artifact}, ${engine})`;
const { config, entry } = fixtureConfig(renderer, artifact, reactVersion);
let server: ViteDevServer;
let browser: Browser;
let context: BrowserContext;
export let page: Page;
let origin: string;
let cache: string | undefined;
const diagnostics: string[] = [];
let loadedLibrary = false;

beforeAll(async () => {
  if (!existsSync(entry)) throw new Error(`Missing ${entry}. Run pnpm build before browser tests.`);
  cache = await mkdtemp(path.join(tmpdir(), `calendar-web-${renderer}-${artifact}-`));
  server = await createServer({ ...config, cacheDir: cache });
  await server.listen();
  origin = server.resolvedUrls!.local[0];
  browser = await launchBrowser(engine);
  // Finish Vite's first dependency crawl before recording browser diagnostics.
  // Its initial optimizer reload can cancel requests in the warmup page.
  const warmup = await browser.newPage();
  const startupErrors: string[] = [];
  warmup.on("pageerror", (error) => startupErrors.push(error.message));
  warmup.setDefaultNavigationTimeout(15_000);
  try {
    await warmup.goto(origin);
    // The next test page needs Vite's static imports to be ready.
    await server.waitForRequestsIdle();
    await warmup
      .getByRole("button", { name: "Update props", exact: true })
      .waitFor({ timeout: 15_000 });
    expect(startupErrors, "Fixture startup errors").toEqual([]);
  } finally {
    await warmup.close();
  }
});

beforeEach(async () => {
  diagnostics.length = 0;
  loadedLibrary = false;
  context = await browser.newContext({
    viewport: { width: 1100, height: 850 },
    hasTouch: true,
    timezoneId: "Europe/Madrid",
  });
  page = await context.newPage();
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  page.on("response", (response) => {
    if (decodeURI(response.url()).includes(entry)) loadedLibrary = true;
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  page.on("console", (message) => {
    // Gecko reports browser privacy/scroll heuristics through the console too.
    // Keep module-load failures and all application warnings as test failures.
    if (
      engine === "firefox" &&
      message.type() === "warning" &&
      (message.text().includes("has been classified as a bounce tracker.") ||
        message.text().includes("This site appears to use a scroll-linked positioning effect."))
    )
      return;
    if (message.type() === "error" || message.type() === "warning")
      diagnostics.push(message.text());
  });
});

afterEach(async () => {
  try {
    expect(diagnostics).toEqual([]);
    expect(loadedLibrary, `Browser loaded ${entry}`).toBe(true);
  } finally {
    await context?.close();
  }
});

afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    try {
      await server?.close();
    } finally {
      if (cache) await rm(cache, { recursive: true, force: true });
    }
  }
});

export async function open(view: string) {
  await page.goto(`${origin}?view=${view}`);
  await page.getByRole("button", { name: "Update props", exact: true }).waitFor();
  if (renderer === "react")
    expect(await page.locator("html").getAttribute("data-react-version")).toMatch(
      new RegExp(`^${reactVersion}\\.`),
    );
}

export async function box(selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  if (!bounds) throw new Error(`No visible bounds for ${selector}`);
  return bounds;
}
