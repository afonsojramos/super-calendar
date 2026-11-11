import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

const segments = () => page.locator('[data-slot="event"][aria-label^="Overnight,"]');
const previews = () => page.locator("[data-dragging][aria-hidden]");
const calls = () => page.getByLabel("Calls").textContent();
const nextFrame = () =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const boxes = () =>
  segments().evaluateAll((elements) =>
    elements.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        width: bounds.width,
        visibility: getComputedStyle(element).visibility,
      };
    }),
  );

describe(rendererName, () => {
  it("keeps a pressed multi-day event in its shared column until it moves", async () => {
    await open("edit-overnight");
    const resting = await boxes();
    expect(resting).toHaveLength(2);
    // The next-day segment ends at 10:00, beside Breakfast; grab its visible end.
    const segment = (await segments().nth(1).boundingBox())!;
    const column = await segments()
      .nth(1)
      .evaluate((element) => element.parentElement!.clientWidth);
    expect(segment.width).toBeLessThan(column / 2 + 1);
    const x = segment.x + segment.width / 2;
    const y = segment.y + segment.height - 20;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await nextFrame();
    expect(await previews().count()).toBe(0);
    expect(await boxes()).toEqual(resting);
    await page.mouse.up();
    await expect.poll(calls).toBe('["press:Overnight"]');
    expect(await boxes()).toEqual(resting);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 4 });
    await expect.poll(() => previews().count()).toBeGreaterThan(0);
    expect((await boxes()).every((box) => box.visibility === "hidden")).toBe(true);
    await page.mouse.up();
    await expect.poll(calls).toContain("Overnight@");
  });
});
