import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

describe(rendererName, () => {
  it.each([
    { view: "snap-day", from: 67, to: 188, top: 60, end: 195 },
    { view: "snap-day", from: 188, to: 67, top: 60, end: 195 },
    { view: "snap-day-content", from: 67, to: 188, top: 60, end: 195 },
    { view: "snap-day-content", from: 188, to: 67, top: 60, end: 195 },
    { view: "snap-week-30", from: 77, to: 185, top: 90, end: 180 },
    { view: "snap-day-fractional", from: 58, to: 182, top: 54, end: 189 },
    { view: "snap-day-dst", from: 127, to: 248, top: 180, end: 255 },
    { view: "snap-day-default", from: 50, to: 58, top: 48, end: 62 },
    { view: "snap-day-minimum", from: 50, to: 58, top: 48, end: 76 },
  ])(
    "aligns the $view preview with its created event from $from to $to",
    async ({ view, from, to, top, end }) => {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await open(view);
      const column = (await page.locator('[data-slot="dayColumn"]').first().boundingBox())!;
      const x = column.x + column.width / 2;
      await page.mouse.move(x, column.y + from);
      await page.mouse.down();
      await page.mouse.move(x, column.y + to, { steps: 3 });
      const ghost = (await page.locator('[data-slot="createGhost"]').boundingBox())!;
      expect(Math.abs(ghost.y - column.y - top)).toBeLessThan(1);
      expect(Math.abs(ghost.y + ghost.height - column.y - end)).toBeLessThan(1);
      await page.mouse.up();
      const event = (await page.locator('[data-slot="event"]').boundingBox())!;
      expect(Math.abs(event.y - ghost.y)).toBeLessThan(1);
      expect(Math.abs(event.height - ghost.height)).toBeLessThan(1);
      expect(await page.locator('[data-slot="createGhost"]').count()).toBe(0);
      expect(JSON.parse((await page.getByLabel("Calls").textContent())!)).toHaveLength(1);
    },
  );

  it("shows a snapped full slot on the initial press", async () => {
    await open("snap-day");
    const column = (await page.locator('[data-slot="dayColumn"]').boundingBox())!;
    await page.mouse.move(column.x + column.width / 2, column.y + 67);
    await page.mouse.down();
    const ghost = (await page.locator('[data-slot="createGhost"]').boundingBox())!;
    expect(Math.abs(ghost.y - column.y - 60)).toBeLessThan(1);
    expect(ghost.height).toBe(15);
    await page.mouse.up();
    expect(await page.getByLabel("Calls").textContent()).toBe("[]");
  });

  it.each(["snap-day-default", "snap-day-minimum"])(
    "clips the $view minimum height at the final visible hour",
    async (view) => {
      await open(view);
      const column = (await page.locator('[data-slot="dayColumn"]').boundingBox())!;
      const x = column.x + column.width / 2;
      await page.mouse.move(x, column.y + 278);
      await page.mouse.down();
      await page.mouse.move(x, column.y + 286);
      const ghost = (await page.locator('[data-slot="createGhost"]').boundingBox())!;
      expect(ghost.y - column.y).toBe(276);
      expect(ghost.height).toBe(12);
      expect(ghost.y + ghost.height).toBe(column.y + column.height);
      await page.mouse.up();
      expect(await page.getByLabel("Calls").textContent()).toBe(
        JSON.stringify(["15:13:45-15:14:0"]),
      );
    },
  );
});
