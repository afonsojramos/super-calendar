import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../session";

const calls = () => page.getByLabel("Calls").textContent();
const day = (id: string) => `[data-day="${id}"]`;
const dropDays = () =>
  page
    .locator("[data-day][data-drop]")
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-day")));

describe(rendererName, () => {
  it.each(["month-drag-trip", "multiweek-trip"])(
    "previews a moved event across its destination days in %s",
    async (view) => {
      await open(view);
      const chip = page.getByRole("button", { name: /^Trip,/ });
      const origin = await box(day("2026-07-17"));
      const target = await box(day("2026-07-18"));
      const bar = (await chip.boundingBox())!;
      // Grab the bar inside its first day, then carry it one day later.
      await page.mouse.move(origin.x + origin.width / 2, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, bar.y + bar.height / 2, { steps: 8 });

      const previews = page.locator("[data-dragging]");
      await expect.poll(() => previews.count()).toBe(2);
      expect(await dropDays()).toEqual(["2026-07-18", "2026-07-19", "2026-07-20"]);
      // Saturday to Sunday in the first row, Monday in the next.
      const sunday = await box(day("2026-07-19"));
      const monday = await box(day("2026-07-20"));
      const first = (await previews.nth(0).boundingBox())!;
      const second = (await previews.nth(1).boundingBox())!;
      expect(first.x).toBeGreaterThanOrEqual(target.x);
      expect(first.x).toBeLessThan(target.x + 4);
      expect(first.x + first.width).toBeGreaterThan(sunday.x + sunday.width - 4);
      expect(first.x + first.width).toBeLessThanOrEqual(sunday.x + sunday.width);
      expect(second.x).toBeGreaterThanOrEqual(monday.x);
      expect(second.x + second.width).toBeLessThanOrEqual(monday.x + monday.width);
      expect(second.y).toBeGreaterThan(first.y);
      expect(await previews.nth(0).textContent()).toBe("Trip");
      // The preview never takes the pointer: the cell beneath it is hit instead.
      const hit = await page.evaluate(
        ({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          return {
            preview: element?.closest("[data-dragging]") != null,
            day: element?.closest("[data-day]")?.getAttribute("data-day"),
          };
        },
        { x: first.x + first.width * 0.75, y: first.y + first.height / 2 },
      );
      expect(hit).toEqual({ preview: false, day: "2026-07-19" });

      await page.mouse.up();
      await expect.poll(calls).toBe('["Trip@18:0:0-21:0:0"]');
      expect(await previews.count()).toBe(0);
      expect(await dropDays()).toEqual([]);
    },
  );

  it.each(["month-drag-trip", "multiweek-trip"])(
    "removes the preview when %s cancels the move",
    async (view) => {
      await open(view);
      const chip = page.getByRole("button", { name: /^Trip,/ });
      const origin = await box(day("2026-07-17"));
      const target = await box(day("2026-07-22"));
      const bar = (await chip.boundingBox())!;
      await page.mouse.move(origin.x + origin.width / 2, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 8,
      });
      await expect.poll(() => page.locator("[data-dragging]").count()).toBe(1);
      expect(await dropDays()).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"]);
      await page.keyboard.press("Escape");
      await expect.poll(() => page.locator("[data-dragging]").count()).toBe(0);
      expect(await dropDays()).toEqual([]);
      await page.mouse.up();
      expect(await calls()).toBe("[]");
    },
  );
});
