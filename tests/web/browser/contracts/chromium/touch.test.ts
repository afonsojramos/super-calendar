import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../../session";

const eventSelector = '[data-slot="event"][aria-label^="Planning,"]';
const calls = () => page.getByLabel("Calls").textContent();

describe(rendererName, () => {
  it("scrolls with a touch swipe on an event without starting a drag", async () => {
    await open("week");
    await page.locator(eventSelector).waitFor();
    expect(
      await page
        .locator(`${eventSelector}, ${eventSelector} [style*="ns-resize"]`)
        .evaluateAll((elements) =>
          elements.map((element) => getComputedStyle(element).touchAction),
        ),
    ).toEqual(["pan-y", "pan-y", "pan-y"]);
    const scroller = await page.locator(eventSelector).evaluateHandle((event) => {
      let parent = event.parentElement;
      while (parent && getComputedStyle(parent).overflowY !== "auto") parent = parent.parentElement;
      if (!parent) throw new Error("Missing time-grid scroller");
      return parent;
    });
    const before = await scroller.evaluate((element) => element.scrollTop);
    const bounds = await box(eventSelector);
    const contact = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      for (const offset of [20, 40, 60, 80]) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ ...contact, y: contact.y - offset }],
        });
        await page.waitForTimeout(20);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect
        .poll(() => scroller.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(before + 20);
      expect(await calls()).toBe("[]");
      expect(await page.getByLabel("Drag starts").textContent()).toBe("0");
    } finally {
      await cdp.detach();
      await scroller.dispose();
    }
  });

  it("cancels a held touch drag and accepts a subsequent move", async () => {
    await open("week");
    await page.locator(eventSelector).waitFor();
    const bounds = await box(eventSelector);
    const contact = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 };
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      await expect.poll(() => page.getByLabel("Drag starts").textContent()).toBe("1");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...contact, y: contact.y + 56 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      expect(await calls()).toBe("[]");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      await expect.poll(() => page.getByLabel("Drag starts").textContent()).toBe("2");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...contact, y: contact.y + 56 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(calls).toBe('["15:10:0-11:0"]');
    } finally {
      await cdp.detach();
    }
  });
});
