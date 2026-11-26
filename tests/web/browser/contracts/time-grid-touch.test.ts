import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

describe(rendererName, () => {
  it("presses the snapped TimeGrid slot after a touch tap", async () => {
    await open("create-day-touch");
    await page.locator('[data-slot="dayColumn"]').tap({ position: { x: 24, y: 49 } });
    await expect.poll(() => page.getByLabel("Calls").textContent()).toBe('["cell:15:2:0"]');
  });
});
