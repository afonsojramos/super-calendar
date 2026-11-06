import AxeBuilder from "@axe-core/playwright";
import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

describe(rendererName, () => {
  it.each(["picker", "range"])(
    "focuses the panel when the %s month has no available days",
    async (view) => {
      await open(`${view}-unavailable`);
      const trigger = page.locator('[data-slot="trigger"]');
      await trigger.click();
      await expect
        .poll(() =>
          page.getByRole("dialog").evaluate((element) => element === document.activeElement),
        )
        .toBe(true);
      await page.keyboard.press("Escape");
      expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
    },
  );
  it.each(["picker", "range"])(
    "navigates from the available date in a constrained %s",
    async (view) => {
      await open(`${view}-constrained`);
      await page.locator('[data-slot="trigger"]').click();
      const focusedDay = () =>
        page.evaluate(() => document.activeElement?.getAttribute("data-day"));
      await expect.poll(focusedDay).toBe("2026-07-05");
      // Firefox can route a page-level keydown to body immediately after autofocus.
      await page.locator('[data-day="2026-07-05"]:focus').press("ArrowRight");
      await expect.poll(focusedDay).toBe("2026-07-06");
      expect(await page.locator('[data-day="2026-07-06"]:focus').getAttribute("tabindex")).toBe(
        "0",
      );
    },
  );
  it.each([
    "months",
    "multiweek",
    "multiweek-eight",
    "multiweek-dense",
    "week",
    "picker",
    "range",
    "resources",
    "resources-vertical",
    "edit-actions",
    "edit-choices",
    "resource-actions",
  ])("has accessible %s controls", async (view) => {
    const fixture =
      view === "edit-actions" || view === "edit-choices"
        ? "edit"
        : view === "resource-actions"
          ? "resources"
          : view;
    await open(fixture);
    if (view === "picker" || view === "range") {
      await page.locator('[data-slot="trigger"]').click();
      await page.getByRole("dialog").waitFor();
    }
    if (view === "edit-actions" || view === "resource-actions" || view === "edit-choices") {
      await page.getByRole("button", { name: "Edit events", exact: true }).click();
    }
    if (view === "edit-actions" || view === "resource-actions") {
      await page.getByRole("button", { name: "Move or resize Planning", exact: true }).click();
      await page.getByRole("dialog").waitFor();
    }
    const result = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      })),
    ).toEqual([]);
  });

  it.each(["picker", "range"])(
    "opens %s from the keyboard and restores focus on Escape",
    async (view) => {
      await open(view);
      const trigger = page.locator('[data-slot="trigger"]');
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.keyboard.press("Escape");
      await expect.poll(() => dialog.count()).toBe(0);
      expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
    },
  );
});
