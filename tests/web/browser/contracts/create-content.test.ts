import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

type Bounds = { x: number; y: number; width: number; height: number };

const GHOST = '[data-slot="createGhost"]';
const calls = () => page.getByLabel("Calls").textContent();
const draft = () => page.locator(`${GHOST} strong`).textContent();

async function bounds(selector: string, index = 0): Promise<Bounds> {
  const found = await page.locator(selector).nth(index).boundingBox();
  if (!found) throw new Error(`No visible bounds for ${selector}`);
  return found;
}

// Open a scenario and return the first time-grid day column.
async function openColumn(view: string) {
  await page.setViewportSize({ width: 1100, height: 1000 });
  await open(view);
  return bounds('[data-slot="dayColumn"]');
}

// The page y of `hours` into a column drawn at `hourHeight` px per hour from
// `fromHour`, a little past the line so rounding cannot reach the step before.
const at = (column: Bounds, hours: number, hourHeight: number, fromHour = 0) =>
  column.y + (hours - fromHour) * hourHeight + 2;

function expectInside(inner: Bounds, outer: Bounds) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

describe(rendererName, () => {
  it.each([
    // The whole day fits at 24px per hour.
    { view: "draft-day", hourHeight: 24 },
    // At 48px per hour the column scrolls, and opens scrolled to 08:00.
    { view: "draft-day-scrolled", hourHeight: 48 },
  ])(
    "updates the $view content during a held drag and creates the shown range",
    async ({ view, hourHeight }) => {
      const column = await openColumn(view);
      const x = column.x + column.width / 2;
      await page.mouse.move(x, at(column, 9, hourHeight));
      await page.mouse.down();
      await page.locator(GHOST).waitFor();
      expect(await draft()).toBe("Draft 15:9:0-15:9:15");
      await page.mouse.move(x, at(column, 11, hourHeight), { steps: 6 });
      await expect.poll(draft).toBe("Draft 15:9:0-15:11:0");
      await page.mouse.move(x, at(column, 10, hourHeight), { steps: 6 });
      await expect.poll(draft).toBe("Draft 15:9:0-15:10:0");
      await page.mouse.move(x, at(column, 8, hourHeight), { steps: 6 });
      await expect.poll(draft).toBe("Draft 15:8:0-15:9:0");
      expect(await calls()).toBe("[]");
      expectInside(await bounds(GHOST), column);
      await page.mouse.up();
      expect(await calls()).toBe(JSON.stringify(["15:8:0-15:9:0"]));
      await expect.poll(() => page.locator(GHOST).count()).toBe(0);
    },
  );

  it.each(["draft-day", "draft-day-window"])(
    "clips long content to the $view preview, which stays inside the grid",
    async (view) => {
      const column = await openColumn(view);
      const x = column.x + column.width / 2;
      // From the middle of the column to 60px past its top edge.
      await page.mouse.move(x, column.y + column.height / 2);
      await page.mouse.down();
      await page.mouse.move(x, column.y - 60, { steps: 8 });
      await page.locator(GHOST).waitFor();
      const ghost = await bounds(GHOST);
      expectInside(ghost, column);
      // The content does not widen the preview: one 1px gap on each side.
      expect(Math.abs(ghost.width - (column.width - 2))).toBeLessThanOrEqual(1);
      // The unbroken word overflows the preview, which clips it.
      const clip = await page.locator(GHOST).evaluate((element) => ({
        overflow: getComputedStyle(element).overflow,
        overflowing: element.scrollWidth > element.clientWidth,
      }));
      expect(clip).toEqual({ overflow: "hidden", overflowing: true });
      // The window view clips the box at 08:00, but the range starts earlier.
      const expected = view === "draft-day" ? "15:0:0-15:12:0" : "15:5:30-15:13:0";
      await expect.poll(draft).toBe(`Draft ${expected}`);
      await page.mouse.up();
      expect(await calls()).toBe(JSON.stringify([expected]));
    },
  );

  it("keeps the content out of focus and assistive tech", async () => {
    const column = await openColumn("draft-day");
    const x = column.x + column.width / 2;
    await page.mouse.move(x, at(column, 9, 24));
    await page.mouse.down();
    await page.mouse.move(x, at(column, 12, 24), { steps: 6 });
    const button = page.locator(`${GHOST} button`);
    await button.waitFor({ state: "attached" });
    expect(await page.locator(GHOST).getAttribute("aria-hidden")).toBe("true");
    await button.evaluate((element) => (element as HTMLElement).focus());
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    expect(await button.evaluate((element) => element === document.activeElement)).toBe(false);
    expect(await page.getByRole("button", { name: "Draft action" }).count()).toBe(0);
    await page.mouse.up();
  });

  it("shows content for a press without creating", async () => {
    const column = await openColumn("draft-day");
    const x = column.x + column.width / 2;
    await page.mouse.move(x, at(column, 9, 24));
    await page.mouse.down();
    await page.locator(GHOST).waitFor();
    expect(await draft()).toBe("Draft 15:9:0-15:9:15");
    await page.mouse.up();
    expect(await calls()).toBe("[]");
    await expect.poll(() => page.locator(GHOST).count()).toBe(0);
  });

  it("clears the content without creating when the sweep loses pointer capture", async () => {
    const column = await openColumn("draft-day");
    await page.evaluate(() => {
      const target = window as unknown as { captured?: [Element, number] };
      document.addEventListener(
        "gotpointercapture",
        (event) => (target.captured = [event.target as Element, event.pointerId]),
        true,
      );
    });
    const x = column.x + column.width / 2;
    await page.mouse.move(x, at(column, 9, 24));
    await page.mouse.down();
    await page.mouse.move(x, at(column, 12, 24), { steps: 6 });
    await expect.poll(draft).toBe("Draft 15:9:0-15:12:0");
    await page.evaluate(() => {
      const [element, pointerId] = (window as unknown as { captured: [Element, number] }).captured;
      element.releasePointerCapture(pointerId);
    });
    // Engines may report the lost capture with the next pointer event.
    await page.mouse.move(x, at(column, 14, 24), { steps: 4 });
    await expect.poll(() => page.locator(GHOST).count()).toBe(0);
    await page.mouse.up();
    expect(await calls()).toBe("[]");
    expect(await page.locator(GHOST).count()).toBe(0);
  });

  it.each(["horizontal", "vertical"] as const)(
    "shows the $0 resource lane's live range and creates it",
    async (orientation) => {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await open(orientation === "vertical" ? "draft-resources-vertical" : "draft-resources");
      const lane = await bounds('[data-slot="track"]', 1);
      // The board starts at 08:00, at 80px per hour across or 48px per hour down.
      const point = (hours: number) =>
        orientation === "vertical"
          ? { x: lane.x + lane.width / 2, y: lane.y + (hours - 8) * 48 + 2 }
          : { x: lane.x + (hours - 8) * 80 + 2, y: lane.y + lane.height / 2 };
      await page.mouse.move(point(9).x, point(9).y);
      await page.mouse.down();
      await page.locator(GHOST).waitFor();
      expect(await draft()).toBe("Draft b 15:9:0-15:9:15");
      await page.mouse.move(point(12).x, point(12).y, { steps: 6 });
      await expect.poll(draft).toBe("Draft b 15:9:0-15:12:0");
      expectInside(await bounds(GHOST), lane);
      await page.mouse.up();
      expect(await calls()).toBe(JSON.stringify(["15:9:0-15:12:0@b"]));
    },
  );
});
