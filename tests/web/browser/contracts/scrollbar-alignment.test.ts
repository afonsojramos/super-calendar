import { describe, expect, it } from "vitest";
import { engine, launchWith, open, page, rendererName } from "../session";

// Playwright hides Chromium's scrollbars by default. Firefox's headless agent
// sheet sets `scrollbar-width: none !important`, which a page cannot override,
// so only Chromium and WebKit can show the classic scrollbar these cases need.
if (engine === "chromium") launchWith({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const scrollbars = engine !== "firefox";

interface Edges {
  left: number;
  right: number;
}

function edges(selector: string): Promise<Edges[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    }),
  );
}

/** The largest left or right edge difference between matching boxes. */
function drift(actual: Edges[], expected: Edges[]) {
  expect(actual.length).toBe(expected.length);
  expect(actual.length).toBeGreaterThan(0);
  return Math.max(
    ...actual.flatMap((box, index) => [
      Math.abs(box.left - expected[index].left),
      Math.abs(box.right - expected[index].right),
    ]),
  );
}

/** The vertical scrollbar width of the scroll container around `selector`. */
function scrollbarWidth(selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowY;
        if (overflow === "auto" || overflow === "scroll")
          return node.offsetWidth - node.clientWidth;
      }
      throw new Error("No scroll container");
    });
}

async function press(name = "Update props") {
  await page
    .getByRole("button", { name, exact: true })
    .evaluate((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

async function timeGridDrift() {
  const columns = await edges('[data-slot="dayColumn"]');
  const [gutter] = await edges('[data-slot="hourGutter"]');
  const spans = await page.locator('[data-slot="allDayColumn"]').evaluateAll((elements) =>
    elements.map((element) => {
      const [start, span] = (element as HTMLElement).style.gridColumn
        .split("/")
        .map((part) => Number.parseInt(part.replace("span", ""), 10));
      return { first: start - 1, last: start + span - 2 };
    }),
  );
  return Math.max(
    drift(await edges('[data-slot="columnHeader"]'), columns),
    drift(await edges('[data-slot="weekNumber"]'), [gutter]),
    drift(await edges('[data-slot="allDayLabel"]'), [gutter]),
    drift(
      await edges('[data-slot="allDayColumn"]'),
      spans.map(({ first, last }) => ({ left: columns[first].left, right: columns[last].right })),
    ),
  );
}

async function weekdayDrift(days: string[]) {
  const cells = await Promise.all(days.map(async (day) => (await edges(day))[0]));
  return drift(await edges('[data-slot="weekday"]'), cells);
}

// A full week, Monday 20 to Sunday 26 July 2026.
const week = Array.from({ length: 7 }, (_, index) => `[data-day="2026-07-${20 + index}"]`);

describe(rendererName, () => {
  it("lines up the time-grid header and all-day lane with the day columns", async () => {
    await open("scrollbar-week");
    const column = '[data-slot="dayColumn"]';
    if (scrollbars) expect(await scrollbarWidth(column)).toBeGreaterThan(10);
    expect(await timeGridDrift()).toBeLessThanOrEqual(1);

    // Narrow the hours so the scrollbar goes, then widen them so it comes back.
    await press("Toggle disabled");
    await expect.poll(() => scrollbarWidth(column)).toBe(0);
    await expect.poll(timeGridDrift).toBeLessThanOrEqual(1);
    await press("Toggle disabled");
    if (scrollbars) await expect.poll(() => scrollbarWidth(column)).toBeGreaterThan(10);
    await expect.poll(timeGridDrift).toBeLessThanOrEqual(1);
  });

  it("lines up the multi-week weekday header with the day cells", async () => {
    await open("scrollbar-multiweek");
    // The first row, Monday 13 to Sunday 19 July 2026.
    const days = Array.from({ length: 7 }, (_, index) => `[data-day="2026-07-${13 + index}"]`);
    if (scrollbars) expect(await scrollbarWidth(days[0])).toBeGreaterThan(10);
    expect(await weekdayDrift(days)).toBeLessThanOrEqual(1);

    await press();
    await expect.poll(() => scrollbarWidth(days[0])).toBe(0);
    await expect.poll(() => weekdayDrift(days)).toBeLessThanOrEqual(1);
  });

  it("lines up the month list weekday header with the day cells", async () => {
    await open("scrollbar-months");
    await page.locator(week[0]).waitFor();
    if (scrollbars) expect(await scrollbarWidth(week[0])).toBeGreaterThan(10);
    expect(await weekdayDrift(week)).toBeLessThanOrEqual(1);
  });

  it("lines up the vertical resource timeline header with the resource columns", async () => {
    await open("scrollbar-resources");
    const tracks = '[data-slot="track"]';
    if (scrollbars) expect(await scrollbarWidth(tracks)).toBeGreaterThan(10);
    // Each resource column draws a 1px left grid line outside its track.
    const columns = (await edges(tracks)).map(({ left, right }) => ({ left: left - 1, right }));
    expect(drift(await edges('[data-slot="resourceLabel"]'), columns)).toBeLessThanOrEqual(1);
  });
});
