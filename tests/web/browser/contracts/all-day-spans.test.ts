import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

async function expectSpan(title: string, first: number, last: number) {
  const events = page.locator('[data-slot="allDayEvent"]').filter({ hasText: title });
  expect(await events.count()).toBe(1);
  const span = await events.boundingBox();
  const start = await page.locator('[data-slot="dayColumn"]').nth(first).boundingBox();
  const end = await page.locator('[data-slot="dayColumn"]').nth(last).boundingBox();
  if (!span || !start || !end) throw new Error(`Missing bounds for ${title}`);
  expect(span.x - start.x).toBeGreaterThanOrEqual(0);
  expect(span.x - start.x).toBeLessThanOrEqual(3);
  expect(Math.abs(span.x + span.width - (end.x + end.width - 1))).toBeLessThanOrEqual(1);
  return span;
}

describe(rendererName, () => {
  it.each([320, 1100])(
    "draws one bar per all-day event at %i px and stacks overlapping spans",
    async (width) => {
      await page.setViewportSize({ width, height: 900 });
      await open("all-day-spans");
      const trip = await expectSpan("Trip", 1, 3);
      const overlap = await expectSpan("Overlap", 2, 4);
      await expectSpan("Single", 0, 0);
      await expectSpan("Before", 0, 0);
      await expectSpan("After", 5, 6);
      expect(overlap.y).toBeGreaterThanOrEqual(trip.y + trip.height);
      expect(
        await page.locator('[data-slot="event"]').filter({ hasText: "Overnight" }).count(),
      ).toBe(2);
      await page.locator('[data-slot="allDayEvent"]').filter({ hasText: "Trip" }).focus();
      await page.keyboard.press("Enter");
      expect(await page.getByLabel("Calls").textContent()).toBe('["press:Trip"]');
      await page.keyboard.press("Tab");
      expect(
        await page
          .locator('[data-slot="allDayEvent"]')
          .filter({ hasText: "Trip" })
          .evaluate((element) => element === document.activeElement),
      ).toBe(false);
    },
  );

  it.each(["long", "no-hours"])(
    "keeps all-day spans inside narrow columns with %s content",
    async (variant) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await open(`all-day-spans-${variant}`);
      await expectSpan("Trip", 1, 3);
      expect(
        await page
          .locator('[data-slot="allDayLane"]')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
    },
  );

  it("compresses hidden dates without duplicating a spanning event", async () => {
    await open("all-day-spans-hidden");
    await expectSpan("Trip", 1, 2);
    await expectSpan("Overlap", 2, 3);
    expect(
      await page.locator('[data-slot="allDayEvent"]').filter({ hasText: "After" }).count(),
    ).toBe(0);
  });

  it("keeps spanning geometry with slot classes and updates after navigation", async () => {
    await open("all-day-spans-classed");
    await expectSpan("Trip", 1, 3);
    expect(await page.locator(".all-day-cell .all-day-event").count()).toBe(5);
    await page.getByRole("button", { name: "Update props", exact: true }).click();
    expect(await page.locator('[data-slot="allDayEvent"]').count()).toBe(1);
    await expectSpan("After", 0, 1);
  });
});
