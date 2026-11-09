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
    `import { registerRootComponent } from "expo";\nimport App from ${JSON.stringify(resolve(import.meta.dirname, "fixtures/native-month/main.tsx"))};\nregisterRootComponent(App);\n`,
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
    resolve(directory, "metro.config.js"),
    `const { getDefaultConfig } = require("expo/metro-config");\nconst config = getDefaultConfig(__dirname);\nconfig.watchFolders = [${JSON.stringify(root)}];\nconfig.resolver.nodeModulesPaths = [${JSON.stringify(resolve(root, "examples/native/node_modules"))}, ${JSON.stringify(resolve(root, "node_modules"))}];\nmodule.exports = config;\n`,
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
