import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../../session";

const calls = () => page.getByLabel("Calls").textContent();

describe(rendererName, () => {
  it("scrolls a short multiweek grid by touch with creation and moving enabled", async () => {
    await open("multiweek-eight");
    const grid = page.getByRole("grid");
    const bounds = await grid.boundingBox();
    const contact = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height - 20, id: 1 };
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      for (const offset of [20, 40, 70, 100, 120]) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ ...contact, y: contact.y - offset }],
        });
        await page.waitForTimeout(20);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);
      expect(await calls()).toBe("[]");
    } finally {
      await cdp.detach();
    }
  });

  it("holds an event to move it across rows", async () => {
    await open("multiweek");
    const from = await box('[title="Planning"]');
    const to = await box('[data-day="2026-07-22"]');
    const contact = { x: from.x + from.width / 2, y: from.y + from.height / 2, id: 1 };
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      await page.waitForTimeout(450);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...contact, x: to.x + to.width / 2, y: to.y + 10 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(calls).toBe('["Planning@22:9:0-22:10:0"]');
    } finally {
      await cdp.detach();
    }
  });

  it.each([0, 450])("cancels a %ims hold when the window changes", async (delay) => {
    await open("multiweek");
    const from = await box('[data-day="2026-07-17"]');
    const to = await box('[data-day="2026-07-22"]');
    const contact = { x: from.x + from.width / 2, y: from.y + 10, id: 1 };
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      if (delay) await page.waitForTimeout(delay);
      await page
        .getByRole("button", { name: "Update props", exact: true })
        .evaluate((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await page.waitForTimeout(450);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...contact, x: to.x + to.width / 2, y: to.y + 10 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      expect(await calls()).toBe("[]");
    } finally {
      await cdp.detach();
    }
  });

  it("holds to create across rows without scrolling and cancels an interrupted hold", async () => {
    await open("multiweek");
    const from = await box('[data-day="2026-07-17"]');
    const to = await box('[data-day="2026-07-22"]');
    const contact = { x: from.x + from.width / 2, y: from.y + 10, id: 1 };
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      await page.waitForTimeout(450);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      expect(await calls()).toBe("[]");
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
      await page.waitForTimeout(450);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...contact, x: to.x + to.width / 2, y: to.y + 10 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(calls).toBe('["17:0:0-23:0:0"]');
      expect(await page.getByRole("grid").evaluate((el) => el.scrollTop)).toBe(0);
    } finally {
      await cdp.detach();
    }
  });
});
