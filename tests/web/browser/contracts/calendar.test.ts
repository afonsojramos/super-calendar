import { describe, expect, it } from "vitest";
import { box, open, page, rendererName } from "../session";

const eventSelector = '[data-slot="event"][aria-label^="Planning,"]';
const calls = () => page.getByLabel("Calls").textContent();

describe(rendererName, () => {
  it("updates cached month callbacks, constraints, and styles without replacing dates", async () => {
    await open("months");
    const day = page.locator('[data-day="2026-07-15"]');
    await day.waitFor();
    await page.getByRole("button", { name: "Update props" }).click();
    await expect.poll(() => day.evaluate((element) => element.style.height)).toBe("80px");
    expect(await day.evaluate((element) => element.style.color)).toBe("rgb(12, 34, 56)");
    expect(await page.locator('[data-slot="weekday"]').allTextContents()).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    await day.click();
    await expect.poll(calls).toBe('["current"]');
    await page.getByRole("button", { name: "Restrict dates" }).click();
    await expect.poll(() => day.isDisabled()).toBe(true);
    const bounds = await box('[data-day="2026-07-15"]');
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    expect(await calls()).toBe('["current"]');
  });

  it("scrolls through a long month list while keeping the mounted day count bounded", async () => {
    await open("months");
    await page.locator('[data-day="2026-07-15"]').waitFor();
    const days = page.locator("[data-day]");
    const first = await days.first().getAttribute("data-day");
    expect(await days.count()).toBeLessThan(400);
    await page.locator('[data-day="2026-07-15"]').hover();
    await page.mouse.wheel(0, 4000);
    await expect.poll(() => days.first().getAttribute("data-day")).not.toBe(first);
    expect(await days.count()).toBeLessThan(400);
  });

  it.each(["picker", "range"])(
    "updates %s themes, disables an open dialog, and can reopen",
    async (view) => {
      await open(view);
      const trigger = page.locator('[data-slot="trigger"]');
      await trigger.click();
      await page.locator('[data-day="2026-07-15"]').waitFor();
      // Keyboard controls avoid outside-click dismissal masking the prop transition.
      await page.getByRole("button", { name: "Update props" }).press("Enter");
      const day = page.locator('[data-day="2026-07-15"]');
      await expect.poll(() => day.evaluate((element) => element.style.height)).toBe("80px");
      expect(await day.evaluate((element) => element.style.color)).toBe("rgb(12, 34, 56)");
      await page.getByRole("button", { name: "Toggle disabled" }).press("Enter");
      await expect.poll(() => page.getByRole("dialog").count()).toBe(0);
      expect(await trigger.isDisabled()).toBe(true);
      expect(await trigger.getAttribute("aria-expanded")).toBe("false");
      expect(await calls()).toBe("[]");
      await page.getByRole("button", { name: "Toggle disabled" }).click();
      expect(await page.getByRole("dialog").count()).toBe(0);
      await trigger.click();
      if (view === "range") {
        await page.getByRole("button", { name: "Clear", exact: true }).click();
        await expect.poll(calls).toBe('["clear"]');
      } else {
        await page.locator('[data-day="2026-07-16"]').click();
        await expect.poll(calls).toBe('["select"]');
        expect(await page.getByRole("dialog").count()).toBe(0);
      }
    },
  );

  it("keeps pointer capture through a cross-day drag and then resizes the moved event", async () => {
    await open("week");
    await page.locator(eventSelector).waitFor();
    await page.evaluate(() =>
      document.addEventListener(
        "gotpointercapture",
        (event) => {
          if (event.target instanceof HTMLElement)
            event.target.dataset.capturedPointer = String(event.pointerId);
        },
        { once: true },
      ),
    );
    const initial = await box(eventSelector);
    const columnWidth = await page
      .locator('[data-slot="dayColumn"]')
      .first()
      .evaluate((element) => element.getBoundingClientRect().width);
    const x = initial.x + initial.width / 2;
    const y = initial.y + initial.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + columnWidth, y + 56, { steps: 5 });
    expect(
      await page
        .locator("[data-captured-pointer]")
        .evaluate(
          (element) =>
            element.isConnected &&
            element.hasPointerCapture(Number(element.getAttribute("data-captured-pointer"))),
        ),
    ).toBe(true);
    await page.mouse.up();
    await expect.poll(calls).toBe('["16:10:0-11:0"]');
    const moved = await box(eventSelector);
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 3);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height + 53, { steps: 5 });
    await page.mouse.up();
    await expect.poll(calls).toBe('["16:10:0-11:0","16:10:0-12:0"]');
  });

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
