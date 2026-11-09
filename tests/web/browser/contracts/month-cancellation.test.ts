import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../session";

describe(rendererName, () => {
  it.each(["month-drag", "multiweek"])(
    "keeps a cancelled %s release suppressed after Enter",
    async (view) => {
      await open(view);
      const chip = page.getByRole("button", { name: /^Planning,/ });
      const origin = (await chip.boundingBox())!;
      const target = await box('[data-day="2026-07-22"]');
      await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
      await page.mouse.down();
      await chip.focus();
      await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Enter");
      await expect.poll(() => page.getByLabel("Calls").textContent()).toBe('["press:Planning"]');
      await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
      await page.mouse.up();
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      expect(await page.getByLabel("Calls").textContent()).toBe('["press:Planning"]');
    },
  );
  it.each(["month-drag", "multiweek"])(
    "keeps keyboard event activation after cancelling a %s move",
    async (view) => {
      await open(view);
      const chip = page.getByRole("button", { name: /^Planning,/ });
      const origin = await chip.boundingBox();
      if (!origin) throw new Error("Missing event chip bounds");
      const target = await box('[data-day="2026-07-22"]');
      await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
      await page.mouse.down();
      // WebKit does not focus a button on pointerdown; establish the focused drag first.
      await chip.focus();
      await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
      await expect.poll(() => page.locator("[data-day][data-drop]").count()).toBe(1);
      await page.keyboard.press("Escape");
      await page.mouse.up();
      expect(await page.getByLabel("Calls").textContent()).toBe("[]");
      expect(await chip.evaluate((element) => document.activeElement === element)).toBe(true);
      await page.keyboard.press("Enter");
      await expect.poll(() => page.getByLabel("Calls").textContent()).toBe('["press:Planning"]');
    },
  );
  it.each(
    ["month-drag", "multiweek"].flatMap((view) =>
      ["Escape", "pointercancel", "other pointer"].map((reason) => ({ view, reason })),
    ),
  )("handles $reason during a $view creation sweep", async ({ view, reason }) => {
    await open(view);
    const origin = await box('[data-day="2026-07-17"]');
    const target = await box('[data-day="2026-07-22"]');
    await page.getByRole("grid").evaluate((element) => {
      element.addEventListener(
        "pointerdown",
        (event) => {
          if (event instanceof PointerEvent) element.dataset.pointerId = String(event.pointerId);
        },
        { once: true },
      );
    });
    await page.mouse.move(origin.x + origin.width / 2, origin.y + 10);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
    await expect.poll(() => page.locator("[data-day][data-creating]").count()).toBe(6);
    if (reason === "Escape") await page.keyboard.press("Escape");
    else
      await page.getByRole("grid").evaluate((element, other) => {
        const pointerId = Number(element.dataset.pointerId) + (other ? 1 : 0);
        window.dispatchEvent(new PointerEvent("pointercancel", { pointerId }));
        if (other) window.dispatchEvent(new PointerEvent("pointerup", { pointerId }));
      }, reason === "other pointer");
    await expect
      .poll(() => page.locator("[data-day][data-creating]").count())
      .toBe(reason === "other pointer" ? 6 : 0);
    expect(await page.getByLabel("Calls").textContent()).toBe("[]");
    await page.mouse.up();
    if (reason === "other pointer")
      expect(await page.getByLabel("Calls").textContent()).toBe('["17:0:0-23:0:0"]');
    else {
      expect(await page.getByLabel("Calls").textContent()).toBe("[]");
      await page.mouse.move(origin.x + origin.width / 2, origin.y + 10);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
      await page.mouse.up();
      expect(await page.getByLabel("Calls").textContent()).toBe('["17:0:0-23:0:0"]');
    }
  });
});
