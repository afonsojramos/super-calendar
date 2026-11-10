import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

const box = (title: string) => page.locator(`[data-slot="event"][aria-label^="${title},"]`);
const rect = async (title: string) => {
  const bounds = await box(title).boundingBox();
  if (!bounds) throw new Error(`Missing ${title} bounds`);
  return bounds;
};

describe(rendererName, () => {
  it("floats a moved overlapping event across its whole day column", async () => {
    await open("edit-crowded");
    const resting = await rect("Second");
    const column = await box("Second").evaluate((element) => {
      // The event boxes are positioned inside the column's padding box, not its border.
      const parent = element.parentElement!;
      const bounds = parent.getBoundingClientRect();
      return { x: bounds.x + parent.clientLeft, width: parent.clientWidth };
    });
    // Three events share the column, so each rests in roughly a third of it.
    expect(resting.width).toBeLessThan(column.width / 2);

    const x = resting.x + resting.width / 2;
    const y = resting.y + resting.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect.poll(async () => (await rect("Second")).width).toBe(resting.width);
    await page.mouse.move(x, y + 30, { steps: 4 });
    await expect.poll(() => box("Second").getAttribute("data-dragging")).not.toBeNull();
    const carried = await rect("Second");
    const gap = carried.x - column.x;
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(8);
    expect(carried.width).toBeCloseTo(column.width - gap * 2, 0);

    await page.mouse.up();
    await expect.poll(() => page.getByLabel("Calls").textContent()).toContain("Second@");
  });

  it("keeps the carried width and grab offset in the ghost after edge paging", async () => {
    await open("edit-crowded");
    const resting = await rect("Second");
    const geometry = await box("Second").evaluate((element) => {
      const column = element.parentElement!;
      const row = column.parentElement!.getBoundingClientRect();
      return { x: column.getBoundingClientRect().x + column.clientLeft, right: row.right };
    });
    // Whole pixels: Firefox and WebKit round pointer coordinates.
    const x = Math.round(resting.x + resting.width / 2);
    const y = Math.round(resting.y + resting.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 30, { steps: 4 });
    const carried = await rect("Second");
    expect(carried.x - geometry.x).toBeLessThan(8);
    // Dwell inside the right edge zone until the grid pages and the ghost takes over.
    const edgeX = Math.round(geometry.right - 10);
    await page.mouse.move(edgeX, y + 30, { steps: 6 });
    await expect
      .poll(() => page.getByLabel("Calls").textContent(), { timeout: 3000 })
      .toContain("page:");
    await page.mouse.move(edgeX - 5, y + 30);
    const ghost = await page.evaluate(() => {
      const element = [...document.querySelectorAll<HTMLElement>("[aria-hidden]")].find(
        (candidate) => getComputedStyle(candidate).position === "fixed",
      );
      const bounds = element?.getBoundingClientRect();
      return bounds ? { x: bounds.x, width: bounds.width } : null;
    });
    expect(ghost).not.toBeNull();
    expect(ghost!.width).toBeCloseTo(carried.width, 0);
    expect(edgeX - 5 - ghost!.x).toBeCloseTo(x - carried.x, 0);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
});
