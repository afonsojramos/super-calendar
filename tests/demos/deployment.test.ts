import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser } from "../support/browser";
import { serveDirectory } from "../support/static-server";

let browser: Browser;
let server: Awaited<ReturnType<typeof serveDirectory>>;

beforeAll(async () => {
  const directory = resolve(import.meta.dirname, "../../dist/demos");
  await access(resolve(directory, "solid/index.html"));
  server = await serveDirectory(directory);
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function checkPage(path: string, check: (page: Page) => Promise<void>, width = 1100) {
  const page = await browser.newPage({ viewport: { width, height: 880 } });
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  try {
    const response = await page.goto(`${server.url}${path}`);
    expect(response?.status()).toBe(200);
    await check(page);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}

describe("published demos", () => {
  it.each(["event actions", "date range picker"])(
    "keeps React demo shortcuts outside the %s dialog",
    async (kind) => {
      await checkPage("/dom/", async (page) => {
        if (kind === "event actions") {
          await page.getByRole("button", { name: "Edit events", exact: true }).click();
          await page
            .getByRole("button", { name: /^Move or resize / })
            .first()
            .click();
        } else {
          await page.getByRole("button", { name: "field", exact: true }).click();
          await page.getByRole("button", { name: "Select dates", exact: true }).click();
        }
        const dialog = page.getByRole("dialog");
        const focusedInside = () =>
          dialog.evaluate((element) => element.contains(document.activeElement));
        await expect.poll(focusedInside).toBe(true);
        const content = await dialog.textContent();
        for (const key of ["m", "d", "a", "n", "p", "t", "w", "x", "j", "k"]) {
          await page.keyboard.press(key);
          expect(await dialog.count()).toBe(1);
          expect(await focusedInside()).toBe(true);
          expect(await dialog.textContent()).toBe(content);
        }
        await page.keyboard.press("Escape");
        expect(await dialog.count()).toBe(0);
        expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
        await page.keyboard.press("m");
        await page.getByRole("grid").first().waitFor();
        expect(await page.locator('[data-slot="dayColumn"]').count()).toBe(0);
      });
    },
  );

  it.each([
    [
      "/",
      "@super-calendar/native",
      '[data-testid="month-grid"]',
      '[data-testid="time-grid-pager"]',
    ],
    ["/dom/", "@super-calendar/dom", '[role="grid"]', '[data-slot="dayColumn"]'],
  ])("loads %s and changes calendar modes", async (path, title, month, week) => {
    await checkPage(path, async (page) => {
      await page.getByText(title, { exact: true }).waitFor();
      await page.getByText("month", { exact: true }).click();
      await page.locator(month).first().waitFor();
      await expect.poll(() => page.locator(week).count()).toBe(0);
      await page.getByText("week", { exact: true }).click();
      await page.locator(week).first().waitFor();
      await expect.poll(() => page.locator(month).count()).toBe(0);
    });
  });

  it("loads and refreshes the Solid feed from the published subpath", async () => {
    await checkPage("/solid/?view=feed", async (page) => {
      await page.getByText("Feed up to date", { exact: true }).waitFor();
      await page.getByText("Feed planning", { exact: true }).waitFor();
      const response = page.waitForResponse(`${server.url}/solid/events.json`);
      await page.getByRole("button", { name: "Refresh feed" }).click();
      expect((await response).status()).toBe(200);
      await page.getByText("Feed up to date", { exact: true }).waitFor();
    });
  });

  it.each([324, 681, 700, 1120])("keeps the Solid pickers inside a %ipx frame", async (width) => {
    await checkPage(
      "/solid/",
      async (page) => {
        for (const index of [0, 1]) {
          const trigger = page.locator('[data-slot="trigger"]').nth(index);
          await trigger.click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          const bounds = await dialog.boundingBox();
          expect(bounds).not.toBeNull();
          if (!bounds) throw new Error("Picker is not visible");
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(880);
          await trigger.click();
          expect(await dialog.count()).toBe(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      },
      width,
    );
  });

  it("returns 404 for missing assets instead of an application shell", async () => {
    const response = await fetch(`${server.url}/solid/assets/missing.js`);
    expect(response.status).toBe(404);
  });
});
