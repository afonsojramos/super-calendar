import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

describe(rendererName, () => {
  it.each(["month-drag", "multiweek"])("presses a movable %s chip on click", async (view) => {
    await open(view);
    const chip = page.getByRole("button", { name: /^Planning,/ });
    const origin = (await chip.boundingBox())!;
    const x = origin.x + origin.width / 2;
    const y = origin.y + origin.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Hand jitter inside the drag slop is still a click.
    await page.mouse.move(x + 2, y + 1);
    await page.mouse.up();
    await expect.poll(() => page.getByLabel("Calls").textContent()).toBe('["press:Planning"]');
  });

  it.each(["month-drag", "multiweek"])(
    "presses neither the %s chip nor its day when a move returns to its origin",
    async (view) => {
      await open(view);
      const chip = page.getByRole("button", { name: /^Planning,/ });
      const origin = (await chip.boundingBox())!;
      const x = origin.x + origin.width / 2;
      const y = origin.y + origin.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 30, y + 20, { steps: 4 });
      await page.mouse.move(x, y, { steps: 4 });
      await page.mouse.up();
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      expect(await page.getByLabel("Calls").textContent()).toBe("[]");
      expect(await page.locator("[data-day]").count()).toBeGreaterThan(0);
    },
  );
});
