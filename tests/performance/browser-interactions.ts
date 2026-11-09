import type { Locator, Page } from "playwright";
import { expect } from "vitest";
import type { InteractionId } from "./interactions";

type Expected = { selector: string; count?: number; text?: string };
type TimingWindow = Window & {
  calendarTiming?: { done: boolean; duration?: number; error?: string };
};

async function arm(page: Page, event: "click" | "pointerup", expected: Expected[]) {
  await page.evaluate(
    ({ event, expected }) => {
      const state: NonNullable<TimingWindow["calendarTiming"]> = { done: false };
      (window as TimingWindow).calendarTiming = state;
      // Window capture runs before the calendar's document capture release handler.
      window.addEventListener(
        event,
        () => {
          const start = performance.now();
          const rendered = () => {
            const matches = expected.every(({ selector, count, text }) => {
              const elements = document.querySelectorAll(selector);
              return (
                (count === undefined ? elements.length > 0 : elements.length === count) &&
                (text === undefined || elements[0]?.textContent === text)
              );
            });
            if (matches)
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  state.duration = performance.now() - start;
                  state.done = true;
                }),
              );
            else if (performance.now() - start > 5_000) {
              state.error = `The interaction did not render: ${JSON.stringify(expected.map(({ selector, count, text }) => ({ selector, count, text, actualCount: document.querySelectorAll(selector).length, actualText: document.querySelector(selector)?.textContent?.slice(0, 120) })))}`;
              state.done = true;
            } else requestAnimationFrame(rendered);
          };
          requestAnimationFrame(rendered);
        },
        { once: true, capture: true },
      );
    },
    { event, expected },
  );
}

async function finish(page: Page) {
  await page.waitForFunction(() => (window as TimingWindow).calendarTiming?.done);
  const state = await page.evaluate(() => (window as TimingWindow).calendarTiming!);
  if (state.error || state.duration === undefined)
    throw new Error(state.error ?? "Missing interaction timing");
  return state.duration;
}

export async function clickTiming(page: Page, button: Locator, expected: Expected[]) {
  const element = await button.elementHandle();
  if (!element) throw new Error("Missing interaction button");
  await arm(page, "click", expected);
  await element.evaluate((target) => {
    if (!(target instanceof HTMLButtonElement)) throw new Error("Expected a button");
    target.click();
  });
  return finish(page);
}

const eventSelector = '[data-slot="event"]';
const columnSelector = '[data-slot="dayColumn"]';

export async function measureEditing(
  page: Page,
  url: string,
): Promise<Partial<Record<InteractionId, number>>> {
  const measured: Partial<Record<InteractionId, number>> = {};
  const open = async () => {
    await page.goto(`${url}/?view=performance`);
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-slot="dayColumn"]').length === 7 &&
        document.querySelectorAll('[data-slot="event"]').length === 1,
    );
    await page.locator(eventSelector).waitFor();
  };
  const box = async (locator: Locator) => {
    const bounds = await locator.boundingBox();
    if (!bounds) throw new Error("Missing interaction geometry");
    return bounds;
  };
  await open();
  measured["week.next"] = await clickTiming(
    page,
    page.getByRole("button", { name: "Next week", exact: true }),
    [
      { selector: '[data-perf="date"]', text: "22" },
      { selector: '[data-slot="dayColumn"][data-date="2026-07-19T22:00:00.000Z"]', count: 1 },
      { selector: columnSelector, count: 7 },
      { selector: eventSelector, count: 1 },
    ],
  );
  expect(await page.locator(eventSelector).getAttribute("aria-label")).toContain("Planning");
  measured["week.month"] = await clickTiming(
    page,
    page.getByRole("button", { name: "Show month", exact: true }),
    [{ selector: '[data-day="2026-07-22"]' }, { selector: columnSelector, count: 0 }],
  );

  await open();
  await page.getByRole("button", { name: "Edit events", exact: true }).click();
  measured["event.dialog"] = await clickTiming(
    page,
    page.getByRole("button", { name: "Move or resize Planning", exact: true }),
    [{ selector: "dialog[open]", count: 1 }],
  );
  measured["event.action"] = await clickTiming(
    page,
    page.getByRole("button", { name: "Move 15 minutes later", exact: true }),
    [{ selector: '[data-perf="committed"]', text: "15:9:15-15:10:15" }],
  );
  expect(await page.getByRole("dialog").textContent()).toContain("09:15");

  await open();
  let bounds = await box(page.locator(eventSelector));
  const width = (await box(page.locator(columnSelector).first())).width;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + width, bounds.y + bounds.height / 2 + 56, {
    steps: 5,
  });
  await arm(page, "pointerup", [{ selector: '[data-perf="committed"]', text: "16:10:0-16:11:0" }]);
  await page.mouse.up();
  measured["event.move"] = await finish(page);
  const moved = await box(page.locator(eventSelector));
  expect(moved.x).toBeCloseTo(bounds.x + width, 0);
  expect(moved.y).toBeCloseTo(bounds.y + 56, 0);

  await open();
  bounds = await box(page.locator(eventSelector));
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 3);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height + 53, { steps: 5 });
  await arm(page, "pointerup", [{ selector: '[data-perf="committed"]', text: "15:9:0-15:11:0" }]);
  await page.mouse.up();
  measured["event.resize"] = await finish(page);
  expect((await box(page.locator(eventSelector))).height).toBeCloseTo(bounds.height + 56, 0);

  await open();
  bounds = await box(page.locator(columnSelector).first());
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 112);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 224, { steps: 5 });
  await arm(page, "pointerup", [
    { selector: '[data-perf="committed"]', text: "13:10:0-13:12:0" },
    { selector: eventSelector, count: 2 },
  ]);
  await page.mouse.up();
  measured["event.create"] = await finish(page);
  return measured;
}
