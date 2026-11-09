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

  it.each(
    ["draft-day", "draft-resources", "draft-resources-vertical"].flatMap((view) => [
      view,
      `${view}-focus`,
    ]),
  )("keeps the $0 content out of focus and assistive tech", async (view) => {
    await page.setViewportSize({ width: 1100, height: 1000 });
    await open(view);
    await page.evaluate(() => {
      document.addEventListener("focusin", (event) => {
        if (event.target instanceof Element && event.target.closest('[data-slot="createGhost"]'))
          document.body.dataset.focusedDraft = "true";
      });
    });
    const resources = view.startsWith("draft-resources");
    const horizontal = resources && !view.includes("-vertical");
    const column = await bounds(resources ? '[data-slot="track"]' : '[data-slot="dayColumn"]');
    const point = (hour: number) => ({
      x: horizontal ? column.x + (hour - 8) * 80 + 2 : column.x + column.width / 2,
      y: horizontal
        ? column.y + column.height / 2
        : at(column, hour, resources ? 48 : 24, resources ? 8 : 0),
    });
    await page.mouse.move(point(9).x, point(9).y);
    await page.mouse.down();
    await page.mouse.move(point(12).x, point(12).y, { steps: 6 });
    const button = page.locator(`${GHOST} button`).first();
    await button.waitFor({ state: "attached" });
    if (view.endsWith("-focus"))
      await expect
        .poll(() => page.locator("body").getAttribute("data-draft-focus-connected"))
        .toBe("true");
    expect(await page.locator(GHOST).getAttribute("aria-hidden")).toBe("true");
    expect(await page.locator("body").getAttribute("data-focused-draft")).toBeNull();
    expect(await page.locator(GHOST).getAttribute("inert")).not.toBeNull();
    await button.evaluate((element) => (element as HTMLElement).focus());
    expect(await button.evaluate((element) => element === document.activeElement)).toBe(false);
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    expect(await button.evaluate((element) => element === document.activeElement)).toBe(false);
    expect(await page.getByRole("button", { name: "Draft action" }).count()).toBe(0);
    await page.mouse.up();
  });

  it.each(["scroll", "smooth scroll", "ancestor scroll", "zoom in", "zoom out"])(
    "commits the shown range after %s without another pointer move",
    async (change) => {
      const column = await openColumn("draft-day-scrolled");
      const x = column.x + column.width / 2;
      await page.mouse.move(x, at(column, 9, 48));
      await page.mouse.down();
      await page.mouse.move(x, at(column, 11, 48), { steps: 6 });
      await expect.poll(draft).toBe("Draft 15:9:0-15:11:0");
      if (change.startsWith("zoom")) {
        await page.keyboard.down("Control");
        await page.mouse.wheel(0, change === "zoom in" ? -150 : 600);
        await page.keyboard.up("Control");
        await expect
          .poll(async () => (await bounds('[data-slot="dayColumn"]')).height)
          .not.toBe(column.height);
      } else if (change === "ancestor scroll") {
        await page.evaluate(() => {
          const spacer = document.createElement("div");
          spacer.style.height = "1500px";
          document.body.append(spacer);
          window.scrollBy(0, 96);
        });
        await expect
          .poll(async () => (await bounds('[data-slot="dayColumn"]')).y)
          .toBeLessThan(column.y);
      } else {
        const targetScrollTop = await page.locator('[data-slot="dayColumn"]').evaluate((column) => {
          let scroller = column.parentElement;
          while (scroller && getComputedStyle(scroller).overflowY !== "auto")
            scroller = scroller.parentElement;
          if (!scroller) throw new Error("Missing time-grid scroll container");
          scroller.dataset.scrollTarget = "true";
          return Math.min(scroller.scrollTop + 96, scroller.scrollHeight - scroller.clientHeight);
        });
        if (change === "smooth scroll")
          await page
            .locator("[data-scroll-target]")
            .evaluate((scroller) => scroller.scrollBy({ top: 96, behavior: "smooth" }));
        else await page.mouse.wheel(0, 96);
        await expect
          .poll(async () => (await bounds('[data-slot="dayColumn"]')).y, { interval: 1 })
          .toBeLessThan(column.y);
        // Wheel dispatch and the first moved pixel can precede the final scroll position.
        await expect
          .poll(() =>
            page.locator("[data-scroll-target]").evaluate((scroller) => scroller.scrollTop),
          )
          .toBe(targetScrollTop);
      }
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const shown = await draft();
      expect(shown).toMatch(/^Draft /);
      await page.mouse.up();
      expect(await calls()).toBe(JSON.stringify([shown!.slice("Draft ".length)]));
      await expect.poll(() => page.locator(GHOST).count()).toBe(0);
    },
  );

  it.each(["horizontal", "vertical"] as const)(
    "commits the shown resource range after %s scrolling without another pointer move",
    async (orientation) => {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await open(
        orientation === "vertical"
          ? "draft-resources-vertical-scrolled"
          : "draft-resources-scrolled",
      );
      const lane = await bounds('[data-slot="track"]');
      const point = (hours: number) =>
        orientation === "vertical"
          ? { x: lane.x + lane.width / 2, y: lane.y + (hours - 8) * 48 + 2 }
          : { x: lane.x + (hours - 8) * 80 + 2, y: lane.y + lane.height / 2 };
      await page.mouse.move(point(9).x, point(9).y);
      await page.mouse.down();
      await page.mouse.move(point(11).x, point(11).y, { steps: 6 });
      await expect.poll(draft).toBe("Draft a 15:9:0-15:11:0");
      // Finish the scroll before sampling the preview. Wheel input can keep
      // animating between that sample and pointer release in WebKit.
      await page.locator(".fixture-resource-scroll").evaluate((element, direction) => {
        element.scrollBy({
          left: direction === "horizontal" ? 160 : 0,
          top: direction === "vertical" ? 96 : 0,
          behavior: "instant",
        });
      }, orientation);
      await expect
        .poll(
          async () =>
            (await bounds('[data-slot="track"]'))[orientation === "horizontal" ? "x" : "y"],
        )
        .toBe(
          lane[orientation === "horizontal" ? "x" : "y"] -
            (orientation === "horizontal" ? 160 : 96),
        );
      await expect.poll(draft).toBe("Draft a 15:9:0-15:13:0");
      const shown = await draft();
      await page.mouse.up();
      expect(await calls()).toBe(JSON.stringify([`${shown!.slice("Draft a ".length)}@a`]));
      await expect.poll(() => page.locator(GHOST).count()).toBe(0);
    },
  );

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

  it.each(["draft-day", "draft-resources", "draft-resources-vertical"])(
    "Escape cancels the $0 preview and allows a fresh sweep",
    async (view) => {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await open(view);
      const resources = view.startsWith("draft-resources");
      const vertical = view !== "draft-resources";
      const column = await bounds(resources ? '[data-slot="track"]' : '[data-slot="dayColumn"]');
      const point = (hours: number) => ({
        x: vertical ? column.x + column.width / 2 : column.x + (hours - 8) * 80 + 2,
        y: vertical
          ? at(column, hours, resources ? 48 : 24, resources ? 8 : 0)
          : column.y + column.height / 2,
      });
      await page.mouse.move(point(9).x, point(9).y);
      await page.mouse.down();
      await page.mouse.move(point(11).x, point(11).y, { steps: 6 });
      await page.locator(GHOST).waitFor();
      await page.keyboard.press("Escape");
      await expect.poll(() => page.locator(GHOST).count()).toBe(0);
      await page.mouse.move(point(12).x, point(12).y);
      await page.mouse.up();
      expect(await calls()).toBe("[]");
      await page.mouse.move(point(9).x, point(9).y);
      await page.mouse.down();
      await page.mouse.move(point(10).x, point(10).y, { steps: 6 });
      await page.mouse.up();
      expect(await calls()).toBe(JSON.stringify([`15:9:0-15:10:0${resources ? "@a" : ""}`]));
    },
  );

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
