import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../session";

const calls = () => page.getByLabel("Calls").textContent();
const day = (id: string) => `[data-day="${id}"]`;

describe(rendererName, () => {
  it.each([390, 1100])("keeps eight week rows usable and scrollable at %ipx", async (width) => {
    await page.setViewportSize({ width, height: 900 });
    await open("multiweek-eight");
    const grid = page.getByRole("grid");
    expect(await grid.locator("[data-day]").count()).toBe(56);
    const first = await box(day("2026-07-13"));
    expect(first.height).toBeGreaterThanOrEqual(80);
    const metrics = await grid.evaluate((el) => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      height: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.height);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
    const last = grid.locator("[data-day]").last();
    await grid.locator("[data-day]").first().focus();
    await page.keyboard.press("End");
    expect(await last.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const lastBox = await last.boundingBox();
    const gridBox = await grid.boundingBox();
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(gridBox!.y + gridBox!.height + 1);
  });

  it.each(["page", "hidden", "disabled"])(
    "keeps real day focus coherent after %s changes",
    async (change) => {
      await open("multiweek");
      const grid = page.getByRole("grid");
      await grid.locator(day(change === "hidden" ? "2026-07-18" : "2026-07-16")).focus();
      if (change === "page") await page.keyboard.press("PageDown");
      else
        await page
          .getByRole("button", {
            name: change === "hidden" ? "Restrict dates" : "Toggle disabled",
            exact: true,
          })
          .evaluate((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await expect
        .poll(() =>
          grid.evaluate((root) => {
            const target = root.querySelector('[data-day][tabindex="0"]');
            return {
              active: document.activeElement?.getAttribute("data-day"),
              target: target?.getAttribute("data-day"),
              disabled: document.activeElement?.getAttribute("aria-disabled"),
            };
          }),
        )
        .toEqual({
          active: change === "page" ? "2026-07-27" : "2026-07-13",
          target: change === "page" ? "2026-07-27" : "2026-07-13",
          disabled: null,
        });
      if (change === "page") {
        await page.keyboard.press("ArrowRight");
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-day"))).toBe(
          "2026-07-28",
        );
      }
    },
  );

  it("creates and moves across rows using actual pointer geometry", async () => {
    await open("multiweek");
    const origin = page.locator(day("2026-07-17"));
    await origin.hover({ position: { x: 10, y: 10 } });
    expect(await origin.evaluate((el) => el.matches(":hover"))).toBe(true);
    await page.mouse.down();
    const to = await box(day("2026-07-22"));
    await page.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 8 });
    await page.mouse.up();
    await expect.poll(calls).toBe('["17:0:0-23:0:0"]');
    await page.getByTitle("Planning", { exact: true }).hover();
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + 10, { steps: 8 });
    await page.mouse.up();
    await expect.poll(calls).toBe('["17:0:0-23:0:0","Planning@22:9:0-22:10:0"]');
  });

  it("keeps narrow overflow labels inside their row and opens the full event list", async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open("multiweek-eight-dense");
    const more = page.locator('[data-slot="more"]').first();
    await more.scrollIntoViewIfNeeded();
    const fits = await more.evaluate((button) => {
      const range = document.createRange();
      range.selectNodeContents(button);
      const text = range.getBoundingClientRect();
      const box = button.getBoundingClientRect();
      return text.top >= box.top - 1 && text.bottom <= box.bottom + 1;
    });
    expect(fits).toBe(true);
    await more.click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await expect.poll(() => more.evaluate((el) => el === document.activeElement)).toBe(true);
  });

  it("keeps keyboard focus on the grid when the next window is entirely disabled", async () => {
    await open("multiweek-disabled-next");
    const grid = page.getByRole("grid");
    await grid.locator(day("2026-07-16")).focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => grid.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await grid.locator('[data-day][tabindex="0"]').count()).toBe(0);
    await page.keyboard.press("PageUp");
    await expect
      .poll(() => grid.locator("[data-day]").first().getAttribute("data-day"))
      .toBe("2026-07-13");
  });

  it("updates the week count and visible tracks, then pages by the new window", async () => {
    await open("multiweek");
    const grid = page.getByRole("grid");
    await page.getByRole("button", { name: "Update props", exact: true }).click();
    await expect.poll(() => grid.locator("[data-day]").count()).toBe(21);
    await page.getByRole("button", { name: "Restrict dates", exact: true }).click();
    await expect.poll(() => grid.locator("[data-day]").count()).toBe(15);
    const monday = await box(day("2026-07-13"));
    const friday = await box(day("2026-07-17"));
    const bounds = await grid.boundingBox();
    expect(friday.x + friday.width - monday.x).toBeCloseTo(bounds!.width, 0);
    await grid.locator("[data-day]").first().focus();
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => grid.locator("[data-day]").first().getAttribute("data-day"))
      .toBe("2026-08-03");
    await page.keyboard.press("PageUp");
    await expect
      .poll(() => grid.locator("[data-day]").first().getAttribute("data-day"))
      .toBe("2026-07-13");
  });
});
