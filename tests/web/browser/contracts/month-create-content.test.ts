import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../session";

const views = ["month-draft", "multiweek-draft"];
const ghost = () => page.locator('[data-slot="createGhost"]');
const day = (id: string) => `[data-day="2026-07-${id}"]`;
async function start(view: string, reversed = false) {
  await open(view);
  const origin = await box(day(reversed ? "22" : "17"));
  const target = await box(day(reversed ? "17" : "22"));
  await page.mouse.move(origin.x + origin.width / 2, origin.y + 10);
  await page.mouse.down();
  await expect.poll(() => ghost().count()).toBe(1);
  return target;
}

describe(rendererName, () => {
  it.each(
    views.flatMap((view) =>
      [false, true].flatMap((reversed) => [390, 1100].map((width) => ({ view, reversed, width }))),
    ),
  )(
    "shows the full $view draft across rows at $width px, reversed: $reversed",
    async ({ view, reversed, width }) => {
      await page.setViewportSize({ width, height: 900 });
      const target = await start(view, reversed);
      await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
      await expect
        .poll(() => ghost().locator("strong").allTextContents())
        .toEqual(["Draft 17:0:0-23:0:0", "Draft 17:0:0-23:0:0"]);
      expect(
        await ghost().evaluateAll((elements) =>
          elements.every((element) => {
            const bounds = element.getBoundingClientRect();
            const row = element.closest('[role="row"]')!.getBoundingClientRect();
            return (
              bounds.left >= row.left - 1 &&
              bounds.right <= row.right + 1 &&
              bounds.top >= row.top - 1 &&
              bounds.bottom <= row.bottom + 1 &&
              getComputedStyle(element).overflow === "hidden"
            );
          }),
        ),
      ).toBe(true);
      const grid = page.getByRole("grid");
      expect(await grid.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
        true,
      );
      await page.mouse.up();
      await expect.poll(() => ghost().count()).toBe(0);
      expect(await page.getByLabel("Calls").textContent()).toBe('["17:0:0-23:0:0"]');
      expect(await page.getByTitle("Created", { exact: true }).count()).toBe(2);
    },
  );

  it.each(views)("keeps $view preview controls hidden and out of focus", async (view) => {
    const target = await start(`${view}-focus`);
    await expect
      .poll(() => page.locator("body").getAttribute("data-draft-focus-connected"))
      .toBe("true");
    expect(await ghost().getAttribute("aria-hidden")).toBe("true");
    expect(await ghost().getAttribute("inert")).not.toBeNull();
    expect(await page.getByRole("button", { name: "Draft action", exact: true }).count()).toBe(0);
    expect(await ghost().evaluate((element) => element.contains(document.activeElement))).toBe(
      false,
    );
    await ghost()
      .locator("button")
      .first()
      .evaluate((element) => element.focus());
    expect(await ghost().evaluate((element) => element.contains(document.activeElement))).toBe(
      false,
    );
    await page.keyboard.press("Tab");
    expect(await ghost().evaluate((element) => element.contains(document.activeElement))).toBe(
      false,
    );
    await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
    await page.mouse.up();
    expect(await page.getByLabel("Calls").textContent()).toBe('["17:0:0-23:0:0"]');
  });

  it.each(views)("retains $view geometry with a custom border", async (view) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const target = await start(`${view}-custom`);
    await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
    await expect.poll(() => ghost().count()).toBe(2);
    expect(
      await ghost().evaluateAll((elements) =>
        elements.every((element) => {
          const rect = element.getBoundingClientRect();
          const row = element.closest('[role="row"]')!.getBoundingClientRect();
          return (
            rect.height === 28 &&
            rect.bottom <= row.bottom &&
            rect.right <= row.right &&
            getComputedStyle(element).boxSizing === "border-box"
          );
        }),
      ),
    ).toBe(true);
    await page.mouse.up();
    expect(await page.getByLabel("Calls").textContent()).toBe('["17:0:0-23:0:0"]');
  });
});
