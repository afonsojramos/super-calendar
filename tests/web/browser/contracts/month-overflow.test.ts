import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../session";

const bounds = async (name: string) => {
  const found = await page.getByRole("button", { name, exact: true }).boundingBox();
  if (!found) throw new Error(`${name} is not visible`);
  return found;
};

describe(rendererName, () => {
  it("draws a day's one hidden event in the row its overflow label would take", async () => {
    await open("month-overflow");
    const above = await bounds("B, 15 July");
    const bar = await bounds("Span, 16 July");
    const label = await bounds("2 more events, 15 July");
    const thursday = await box('[data-day="2026-07-16"]');
    // Span takes the next lane below B (20px chips, 2px gaps), the row Wednesday
    // gives its label, and stays inside Thursday's cell.
    expect(Math.abs(bar.y - above.y - 22)).toBeLessThanOrEqual(1);
    expect(Math.abs(bar.y - label.y)).toBeLessThanOrEqual(3);
    expect(bar.x).toBeGreaterThanOrEqual(thursday.x - 1);
    expect(bar.x + bar.width).toBeLessThanOrEqual(thursday.x + thursday.width + 1);
    expect(bar.y + bar.height).toBeLessThanOrEqual(thursday.y + thursday.height + 1);
    expect(await page.getByRole("button", { name: /^1 more events?,/ }).count()).toBe(0);
    expect(await page.getByText("Solo", { exact: true }).count()).toBe(0);
  });
});
