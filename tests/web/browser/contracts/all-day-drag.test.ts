import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

// Monday 13 to Sunday 19 July 2026; Trip covers Tuesday to Thursday.
const chip = (title: string) =>
  page.locator('button[data-slot="allDayEvent"]').filter({ hasText: title });
const preview = () => page.locator('[data-slot="allDayColumn"][aria-hidden="true"]');
const calls = () => page.getByLabel("Calls").textContent();

async function columnCenter(index: number) {
  const box = await page.locator('[data-slot="dayColumn"]').nth(index).boundingBox();
  if (!box) throw new Error(`Missing day column ${index}`);
  return box.x + box.width / 2;
}

async function grab(title: string, column: number) {
  const box = await chip(title).boundingBox();
  if (!box) throw new Error(`Missing ${title} chip`);
  const y = box.y + box.height / 2;
  await page.mouse.move(await columnCenter(column), y);
  await page.mouse.down();
  return y;
}

describe(rendererName, () => {
  it("moves an all-day bar to other days with a mouse drag", async () => {
    await open("all-day-drag");
    const y = await grab("Trip", 1);
    await page.mouse.move(await columnCenter(3), y, { steps: 6 });
    // The carried bar fades and a preview covers the days it would land on.
    expect(await chip("Trip").getAttribute("data-dragging")).toBe("");
    expect(await chip("Trip").evaluate((element) => getComputedStyle(element).opacity)).toBe("0.4");
    await expect.poll(() => preview().count()).toBe(1);
    const target = await preview().boundingBox();
    const thursday = await page.locator('[data-slot="dayColumn"]').nth(3).boundingBox();
    const saturday = await page.locator('[data-slot="dayColumn"]').nth(5).boundingBox();
    if (!target || !thursday || !saturday) throw new Error("Missing preview bounds");
    expect(Math.abs(target.x - thursday.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(target.x + target.width - (saturday.x + saturday.width))).toBeLessThanOrEqual(
      2,
    );
    await page.mouse.up();
    await expect.poll(calls).toBe('["Trip@16:0:0-19:0:0"]');
    expect(await preview().count()).toBe(0);
    // The committed bar now starts on Thursday.
    const moved = await chip("Trip").boundingBox();
    expect(moved && Math.abs(moved.x - thursday.x)).toBeLessThanOrEqual(3);
  });

  it("clamps a drag past the first visible day", async () => {
    await open("all-day-drag");
    // Grab Thursday and travel over the hour gutter, more than three columns left.
    // The pointer stays inside the viewport, where every engine reports it.
    const y = await grab("Trip", 3);
    await page.mouse.move(1, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(calls).toBe('["Trip@11:0:0-14:0:0"]');
  });

  it("presses the bar on a click with jitter inside the slop", async () => {
    await open("all-day-drag");
    const box = await chip("Trip").boundingBox();
    if (!box) throw new Error("Missing Trip chip");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 2, y + 1);
    await page.mouse.up();
    await expect.poll(calls).toBe('["press:Trip"]');
  });

  it("cancels a drag on Escape without moving or pressing the bar", async () => {
    await open("all-day-drag");
    const y = await grab("Trip", 1);
    await page.mouse.move(await columnCenter(4), y, { steps: 6 });
    await expect.poll(() => preview().count()).toBe(1);
    await page.keyboard.press("Escape");
    expect(await preview().count()).toBe(0);
    await page.mouse.up();
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    expect(await calls()).toBe("[]");
  });
});
