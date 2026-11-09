import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../../session";

describe(rendererName, () => {
  it.each(
    ["create-day", "create-week", "draft-day"].flatMap((view) =>
      [false, true].flatMap((outside) => [0, 1].map((buttons) => ({ view, outside, buttons }))),
    ),
  )(
    "completes $view with release-time capture loss, buttons: $buttons, outside column: $outside",
    async ({ view, outside, buttons }) => {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await open(view);
      const column = page.locator('[data-slot="dayColumn"]').first();
      const bounds = (await column.boundingBox())!;
      await column.evaluate(
        (element, { outside, buttons }) => {
          // A release between automation commands can arrive before mouse-up, with
          // buttons=1. Inject both possible button states in the real release
          // task instead. Outside releases also exercise the document listener
          // without relying on the browser to retain pointer capture.
          if (outside) element.setPointerCapture = () => {};
          window.addEventListener(
            "pointerup",
            (event) => {
              element.releasePointerCapture(event.pointerId);
              element.dispatchEvent(
                new PointerEvent("lostpointercapture", {
                  bubbles: true,
                  pointerId: event.pointerId,
                  buttons,
                }),
              );
            },
            { capture: true, once: true },
          );
          document.addEventListener(
            "lostpointercapture",
            (event) => {
              document.body.setAttribute("data-release-order", `lost:${event.buttons}`);
            },
            { capture: true, once: true },
          );
          document.addEventListener(
            "pointerup",
            () => {
              document.body.setAttribute(
                "data-release-order",
                `${document.body.getAttribute("data-release-order")},up`,
              );
            },
            true,
          );
        },
        { outside, buttons },
      );
      const x = bounds.x + bounds.width / 2;
      await page.mouse.move(x, bounds.y + 9 * 24 + 2);
      await page.mouse.down();
      await page.mouse.move(outside ? bounds.x - 20 : x, bounds.y + 11 * 24 + 2);
      await page.mouse.up();
      expect(await page.locator("body").getAttribute("data-release-order")).toBe(
        `lost:${buttons},up`,
      );
      const day = view === "create-week" ? 13 : 15;
      expect(await page.getByLabel("Calls").textContent()).toBe(
        JSON.stringify([`${day}:9:0-${day}:11:0`]),
      );
      expect(await page.locator('[data-slot="createGhost"]').count()).toBe(0);
      // The completed sweep must detach its release listener.
      await page.mouse.move(x, bounds.y + 12 * 24 + 2);
      await page.mouse.down();
      await page.mouse.move(x, bounds.y + 13 * 24 + 2);
      await page.mouse.up();
      expect(await page.getByLabel("Calls").textContent()).toBe(
        JSON.stringify([`${day}:9:0-${day}:11:0`, `${day}:12:0-${day}:13:0`]),
      );
    },
  );

  it.each(["create-day", "create-week"])(
    "discards a missed $view release before an unrelated click",
    async (view) => {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await open(view);
      const column = page.locator('[data-slot="dayColumn"]').first();
      const bounds = (await column.boundingBox())!;
      await column.evaluate((element) => {
        element.setPointerCapture = () => {};
        // Model a release outside the window: the browser resets its button
        // state, but the calendar does not receive the pointerup.
        window.addEventListener("pointerup", (event) => event.stopImmediatePropagation(), {
          capture: true,
          once: true,
        });
        const other = document.createElement("button");
        other.textContent = "Unrelated action";
        other.style.cssText = "position:fixed;right:0;top:0;z-index:9999";
        document.body.append(other);
      });
      const x = bounds.x + bounds.width / 2;
      await page.mouse.move(x, bounds.y + 9 * 24 + 2);
      await page.mouse.down();
      await page.mouse.move(x, bounds.y + 11 * 24 + 2);
      await page.mouse.up();
      expect(await page.locator('[data-slot="createGhost"]').count()).toBe(1);
      await page.getByRole("button", { name: "Unrelated action" }).click();
      expect(await page.getByLabel("Calls").textContent()).toBe("[]");
      expect(await page.locator('[data-slot="createGhost"]').count()).toBe(0);
      await page.mouse.move(x, bounds.y + 12 * 24 + 2);
      await page.mouse.down();
      await page.mouse.move(x, bounds.y + 13 * 24 + 2);
      await page.mouse.up();
      const day = view === "create-week" ? 13 : 15;
      expect(await page.getByLabel("Calls").textContent()).toBe(
        JSON.stringify([`${day}:12:0-${day}:13:0`]),
      );
    },
  );
});
