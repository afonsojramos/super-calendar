import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../../session";

const chip = '[data-slot="allDayEvent"]:has-text("Trip")';
const calls = () => page.getByLabel("Calls").textContent();

async function columnCenter(index: number) {
  const box = await page.locator('[data-slot="dayColumn"]').nth(index).boundingBox();
  if (!box) throw new Error(`Missing day column ${index}`);
  return box.x + box.width / 2;
}

describe(rendererName, () => {
  it("moves an all-day bar after a touch hold and presses it on a tap", async () => {
    await open("all-day-drag");
    const bounds = await page.locator(chip).boundingBox();
    if (!bounds) throw new Error("Missing Trip chip");
    expect(
      await page.locator(chip).evaluate((element) => getComputedStyle(element).touchAction),
    ).toBe("pan-y");
    const contact = { x: await columnCenter(1), y: bounds.y + bounds.height / 2, id: 1 };
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(calls).toBe('["press:Trip"]');

      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      // Wait past the 300 ms hold before moving.
      await page.waitForTimeout(450);
      const target = await columnCenter(3);
      for (const step of [0.25, 0.5, 0.75, 1]) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ ...contact, x: contact.x + (target - contact.x) * step }],
        });
        await page.waitForTimeout(20);
      }
      await expect
        .poll(() => page.locator('[data-slot="allDayColumn"][aria-hidden="true"]').count())
        .toBe(1);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(calls).toBe('["press:Trip","Trip@16:0:0-19:0:0"]');
    } finally {
      await cdp.detach();
    }
  });
});
