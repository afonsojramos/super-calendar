import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../../session";

describe(rendererName, () => {
  it.each(
    ["create-day", "create-week", "draft-day"].flatMap((view) =>
      [false, true].map((outside) => ({ view, outside })),
    ),
  )(
    "completes $view after early capture loss, outside column: $outside",
    async ({ view, outside }) => {
      await page.setViewportSize({ width: 1100, height: 1000 });
      await open(view);
      const column = page.locator('[data-slot="dayColumn"]').first();
      const bounds = (await column.boundingBox())!;
      await column.evaluate((element) => {
        element.addEventListener("gotpointercapture", (event) => {
          if (event instanceof PointerEvent)
            element.setAttribute("data-pointer", String(event.pointerId));
        });
        document.addEventListener(
          "lostpointercapture",
          (event) => {
            document.body.setAttribute("data-release-order", `lost:${event.buttons}`);
          },
          true,
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
      });
      const x = bounds.x + bounds.width / 2;
      await page.mouse.move(x, bounds.y + 9 * 24 + 2);
      await page.mouse.down();
      await page.mouse.move(outside ? bounds.x - 20 : x, bounds.y + 11 * 24 + 2);
      await column.evaluate((element) => {
        element.releasePointerCapture(Number(element.getAttribute("data-pointer")));
      });
      await page.mouse.up();
      expect(await page.locator("body").getAttribute("data-release-order")).toBe("lost:0,up");
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
});
