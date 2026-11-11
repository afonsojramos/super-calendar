import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

const planning = () => page.locator('[data-slot="event"][aria-label^="Planning,"]');
const label = () => planning().textContent();
const calls = () => page.getByLabel("Calls").textContent();

describe(rendererName, () => {
  it("shows the previewed times in the built-in label while moving and resizing", async () => {
    await open("edit");
    const bounds = (await planning().boundingBox())!;
    const x = Math.round(bounds.x + bounds.width / 2);
    const y = Math.round(bounds.y + bounds.height / 2);
    expect(await label()).toContain("09:00 - 10:00");

    // The fixture grid is 56px per hour, so 56px is one hour later.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 56, { steps: 4 });
    await expect.poll(label).toContain("10:00 - 11:00");
    // Back at the origin the label follows, and the drop reports the same times.
    await page.mouse.move(x, y, { steps: 4 });
    await expect.poll(label).toContain("09:00 - 10:00");
    await page.mouse.up();
    await expect.poll(calls).toBe('["Planning@15:9:0-15:10:0"]');

    // The bottom grip changes only the end.
    const bottom = Math.round(bounds.y + bounds.height - 3);
    await page.mouse.move(x, bottom);
    await page.mouse.down();
    await page.mouse.move(x, bottom + 28, { steps: 4 });
    await expect.poll(label).toContain("09:00 - 10:30");
    await page.mouse.up();
    await expect.poll(calls).toContain("Planning@15:9:0-15:10:30");
  });
});
