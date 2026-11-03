import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, inject } from "vitest";
import { solid } from "../../support/solid-plugin.mts";

declare module "vitest" {
  export interface ProvidedContext {
    browserRenderer: "react" | "solid";
    browserArtifact: "source" | "dist";
  }
}

const root = path.resolve(import.meta.dirname, "../../..");
export const renderer = inject("browserRenderer");
export const artifact = inject("browserArtifact");
export const rendererName = `${renderer === "react" ? "React DOM" : "Solid"} (${artifact})`;
const pkg = renderer === "react" ? "dom" : "solid";
const relativeEntry =
  artifact === "source"
    ? "src/index.ts"
    : renderer === "react"
      ? "dist/index.mjs"
      : "dist/client/index.js";
const entry = path.join(root, "packages", pkg, relativeEntry);
const fixture = path.join(root, "tests/web/browser/fixtures");
let server: ViteDevServer;
let browser: Browser;
export let page: Page;
let origin: string;
let cache: string | undefined;
const diagnostics: string[] = [];
let loadedLibrary = false;

beforeAll(async () => {
  if (!existsSync(entry)) throw new Error(`Missing ${entry}. Run pnpm build before browser tests.`);
  cache = await mkdtemp(path.join(tmpdir(), `calendar-web-${renderer}-${artifact}-`));
  server = await createServer({
    configFile: false,
    root: fixture,
    cacheDir: cache,
    optimizeDeps: { exclude: ["@calendar-browser/library"] },
    logLevel: "error",
    plugins: renderer === "solid" ? [solid("dom")] : [],
    oxc: { jsx: { runtime: "automatic" } },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
    resolve: {
      alias: [
        { find: "@calendar-browser/adapter", replacement: path.join(fixture, `${renderer}.ts`) },
        { find: "@calendar-browser/library", replacement: entry },
        {
          find: /^@super-calendar\/core$/,
          replacement: path.join(
            root,
            "packages/core",
            artifact === "source" ? "src/index.ts" : "dist/index.mjs",
          ),
        },
        {
          find: /^@super-calendar\/core\/vanilla$/,
          replacement: path.join(
            root,
            "packages/core",
            artifact === "source" ? "src/vanilla.ts" : "dist/vanilla.mjs",
          ),
        },
      ],
    },
  });
  await server.listen();
  origin = server.resolvedUrls!.local[0];
  const executablePath =
    process.env.CHROME ??
    [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ].find(existsSync);
  browser = await chromium.launch({ headless: true, executablePath });
});

beforeEach(async () => {
  diagnostics.length = 0;
  loadedLibrary = false;
  page = await browser.newPage({
    viewport: { width: 1100, height: 850 },
    hasTouch: true,
    timezoneId: "Europe/Madrid",
  });
  page.setDefaultTimeout(5_000);
  page.on("response", (response) => {
    if (decodeURI(response.url()).includes(entry)) loadedLibrary = true;
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      diagnostics.push(message.text());
  });
});

afterEach(async () => {
  try {
    expect(diagnostics).toEqual([]);
    expect(loadedLibrary, `Browser loaded ${entry}`).toBe(true);
  } finally {
    await page?.close();
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
}

export async function box(selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  if (!bounds) throw new Error(`No visible bounds for ${selector}`);
  return bounds;
}
