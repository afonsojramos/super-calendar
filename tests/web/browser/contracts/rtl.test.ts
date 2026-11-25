import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../session";

// Right-to-left layout with real layout and pointer input. The fixture passes
// `isRTL` when the URL carries `rtl=1`. Weeks start on Monday 13 July 2026.
const calls = () => page.getByLabel("Calls").textContent();
const column = (index: number) => page.locator('[data-slot="dayColumn"]').nth(index);
const columnBox = async (index: number) => {
  const bounds = await column(index).boundingBox();
  if (!bounds) throw new Error(`Missing day column ${index}`);
  return bounds;
};
const center = (bounds: { x: number; y: number; width: number; height: number }) => ({
  x: Math.round(bounds.x + bounds.width / 2),
  y: Math.round(bounds.y + bounds.height / 2),
});

describe(rendererName, () => {
  it("runs the week's columns, headers and hour gutter right to left", async () => {
    await open("edit&rtl=1");
    const monday = await columnBox(0);
    const tuesday = await columnBox(1);
    const sunday = await columnBox(6);
    expect(monday.x).toBeGreaterThan(tuesday.x);
    expect(tuesday.x).toBeGreaterThan(sunday.x);
    const headers = page.locator('[data-slot="columnHeader"]');
    const first = (await headers.nth(0).boundingBox())!;
    expect(Math.abs(first.x - monday.x)).toBeLessThanOrEqual(2);
    // The hour gutter sits on the right of the first day, its labels against the grid.
    const gutter = await box('[data-slot="hourGutter"]');
    expect(gutter.x).toBeGreaterThanOrEqual(monday.x + monday.width - 1);
    const label = (await page.locator('[data-slot="hourLabel"]').nth(9).boundingBox())!;
    expect(label.x - gutter.x).toBeLessThan(gutter.x + gutter.width - (label.x + label.width));
    expect(await page.locator("[dir]").first().getAttribute("dir")).toBe("rtl");
  });

  it("moves a timed event to the next day when dragged one column left", async () => {
    await open("edit&rtl=1");
    const event = page.locator('[data-slot="event"][aria-label^="Planning,"]');
    const start = center((await event.boundingBox())!);
    const wednesday = await columnBox(2);
    const thursday = await columnBox(3);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - wednesday.width, start.y, { steps: 8 });
    // The carried box sits over Thursday, the column on Wednesday's left.
    const carried = (await event.boundingBox())!;
    expect(Math.abs(carried.x - thursday.x)).toBeLessThan(6);
    await page.mouse.up();
    await expect.poll(calls).toBe('["Planning@16:9:0-16:10:0"]');
  });

  it("pages to the next week at the left edge", async () => {
    await open("edit&rtl=1");
    const event = page.locator('[data-slot="event"][aria-label^="Planning,"]');
    const start = center((await event.boundingBox())!);
    const sunday = await columnBox(6);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 30, { steps: 4 });
    await page.mouse.move(Math.round(sunday.x + 10), start.y + 30, { steps: 6 });
    await expect.poll(calls, { timeout: 3000 }).toContain("page:22:0:0");
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });

  it("moves an all-day bar by the columns it crosses on screen", async () => {
    await open("all-day-drag&rtl=1");
    const chip = page.locator('button[data-slot="allDayEvent"]').filter({ hasText: "Trip" });
    const y = center((await chip.boundingBox())!).y;
    const tuesday = center(await columnBox(1));
    const thursday = center(await columnBox(3));
    await page.mouse.move(tuesday.x, y);
    await page.mouse.down();
    await page.mouse.move(thursday.x, y, { steps: 6 });
    // The preview covers Thursday to Saturday: Saturday on the left, Thursday on the right.
    const preview = (await page
      .locator('[data-slot="allDayColumn"][aria-hidden="true"]')
      .boundingBox())!;
    const thursdayBox = await columnBox(3);
    const saturdayBox = await columnBox(5);
    expect(Math.abs(preview.x - saturdayBox.x)).toBeLessThanOrEqual(2);
    expect(
      Math.abs(preview.x + preview.width - (thursdayBox.x + thursdayBox.width)),
    ).toBeLessThanOrEqual(2);
    await page.mouse.up();
    await expect.poll(calls).toBe('["Trip@16:0:0-19:0:0"]');
  });

  it("squares the right end of a lane bar that began the week before", async () => {
    await open("all-day-drag&rtl=1");
    const chip = page.locator('button[data-slot="allDayEvent"]').filter({ hasText: "Before" });
    expect(await chip.getAttribute("data-continues-after")).toBe("");
    const corners = await chip.evaluate((element) => {
      const card = element.firstElementChild as HTMLElement;
      const style = getComputedStyle(card);
      return [style.borderTopLeftRadius, style.borderTopRightRadius];
    });
    expect(corners).toEqual(["6px", "0px"]);
    // Monday is its last visible day, on the right edge of the lane.
    const bar = (await chip.boundingBox())!;
    const monday = await columnBox(0);
    expect(Math.abs(bar.x + bar.width - (monday.x + monday.width))).toBeLessThanOrEqual(3);
  });

  it("drops a month event on the day to its left as the next day", async () => {
    await open("month-drag-trip&rtl=1");
    const chip = page.getByRole("button", { name: /^Trip,/ });
    const friday = await box('[data-day="2026-07-17"]');
    const saturday = await box('[data-day="2026-07-18"]');
    expect(saturday.x).toBeLessThan(friday.x);
    const bar = (await chip.boundingBox())!;
    // Trip starts on Friday, so its bar is anchored on Friday's right edge.
    expect(Math.abs(bar.x + bar.width - (friday.x + friday.width))).toBeLessThanOrEqual(4);
    await page.mouse.move(center(friday).x, Math.round(bar.y + bar.height / 2));
    await page.mouse.down();
    await page.mouse.move(center(saturday).x, Math.round(bar.y + bar.height / 2), { steps: 8 });
    await page.mouse.up();
    await expect.poll(calls).toBe('["Trip@18:0:0-21:0:0"]');
  });

  it("moves keyboard focus to the day on the left with ArrowLeft", async () => {
    await open("multiweek&rtl=1");
    const today = page.locator('[data-day="2026-07-15"]');
    await today.focus();
    await page.keyboard.press("ArrowLeft");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-day"));
    expect(focused).toBe("2026-07-16");
    const next = await box('[data-day="2026-07-16"]');
    const from = await box('[data-day="2026-07-15"]');
    expect(next.x).toBeLessThan(from.x);
  });
});
