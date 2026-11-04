import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

const calls = () => page.getByLabel("Calls").textContent();
const dragStarts = () => page.getByLabel("Drag starts").textContent();
const trigger = (title: string) =>
  page.getByRole("button", { name: `Move or resize ${title}`, exact: true });
const menu = () => page.getByRole("button", { name: "Edit events", exact: true });
async function showChoices() {
  if ((await menu().getAttribute("aria-expanded")) !== "true") await menu().click();
}
const dialog = () => page.getByRole("dialog");
const action = (name: string) => dialog().getByRole("button", { name, exact: true });
const focusedText = () => page.evaluate(() => document.activeElement?.textContent ?? "");
const isFocused = (locator: ReturnType<typeof trigger>) =>
  locator.evaluate((element) => element === document.activeElement);
const eventBox = (label: string) => page.locator(`[data-slot="event"][aria-label="${label}"]`);

describe(rendererName, () => {
  it.each(["edit-invalid-id", "resources-invalid-id", "resources-vertical-invalid-id"])(
    "returns focus safely when the %s getter returns a missing ID",
    async (view) => {
      await open(view);
      for (const title of ["Planning", "Planning refreshed"]) {
        await showChoices();
        await trigger(title).click();
        await expect.poll(() => dialog().count()).toBe(0);
        expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
        expect(await calls()).toBe("[]");
        if (title === "Planning") {
          await page.getByRole("button", { name: "Refresh events", exact: true }).click();
        }
      }
    },
  );

  it("centers the action dialog when a consumer resets margins", async () => {
    for (const width of [320, 1100]) {
      await page.setViewportSize({ width, height: 640 });
      await open("edit");
      await page.addStyleTag({ content: "* { margin: 0; }" });
      await showChoices();
      await trigger("Planning").click();
      const bounds = await dialog().boundingBox();
      if (!bounds) throw new Error("Missing action dialog");
      expect(bounds.x).toBeGreaterThanOrEqual(16);
      expect(bounds.y).toBeGreaterThanOrEqual(16);
      expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0);
      expect(bounds.y + bounds.height / 2).toBeCloseTo(320, 0);
      await page.keyboard.press("Escape");
      expect(await isFocused(menu())).toBe(true);
    }
  });

  it.each(["edit-many", "resources-many", "resources-vertical-many"])(
    "wraps unbroken event titles inside the %s action dialog",
    async (view) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await open(view);
      await showChoices();
      await page.getByRole("button", { name: /^Move or resize https:/ }).click();
      expect(await dialog().textContent()).toContain(
        "https://meet.example.com/quarterlyoperationsreviewwithregionalleadershipandcustomerteams2026",
      );
      expect(await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.keyboard.press("Escape");
      expect(await isFocused(menu())).toBe(true);
    },
  );

  it.each(["edit-many", "resources-many", "resources-vertical-many"])(
    "keeps complete event descriptions readable in a scrolling %s chooser",
    async (view) => {
      for (const width of [320, 1100]) {
        await page.setViewportSize({ width, height: 640 });
        await open(view);
        await showChoices();
        const choices = page.getByRole("group", { name: "Edit events", exact: true });
        const buttons = choices.getByRole("button");
        expect(await buttons.count()).toBe(12);
        expect(
          await choices.evaluate((element) => element.scrollHeight > element.clientHeight),
        ).toBe(true);
        for (const button of await buttons.all()) {
          expect(
            await button.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              return [...element.children].every((child) => {
                const content = child.getBoundingClientRect();
                return content.top >= bounds.top && content.bottom <= bounds.bottom;
              });
            }),
          ).toBe(true);
          expect(
            await button.evaluate((element) => element.scrollWidth <= element.clientWidth),
          ).toBe(true);
        }
        const last = buttons.last();
        await buttons.first().press("End");
        expect(await isFocused(last)).toBe(true);
        expect(
          await last.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
            );
          }),
        ).toBe(true);
        await last.press("Enter");
        expect(await dialog().textContent()).toContain("Planning session 12");
        await page.keyboard.press("Escape");
        expect(await isFocused(menu())).toBe(true);
      }
    },
  );

  it.each([
    "calendar-actions-stable",
    "edit-stable",
    "resources-stable",
    "resources-vertical-stable",
  ])("keeps editing the refreshed event by stable ID in %s", async (view) => {
    await open(view);
    await showChoices();
    await trigger("Planning").click();
    await page
      .getByRole("button", { name: "Refresh events", exact: true })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect.poll(() => dialog().textContent()).toContain("Planning refreshed, 10:00 to 11:00");
    expect(await focusedText()).toBe("Move 15 minutes later");
    await page.keyboard.press("Enter");
    await expect.poll(() => dialog().textContent()).toContain("Planning refreshed, 10:15 to 11:15");
    await page.keyboard.press("Enter");
    await expect.poll(() => dialog().textContent()).toContain("Planning refreshed, 10:30 to 11:30");
    const resource = view.startsWith("resources") ? "@a" : "";
    expect(JSON.parse((await calls()) ?? "[]")).toEqual([
      `Planning refreshed@15:10:15-15:11:15${resource}`,
      `Planning refreshed@15:10:30-15:11:30${resource}`,
    ]);
    await page
      .getByRole("button", { name: "Duplicate event ID", exact: true })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect.poll(() => dialog().count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
    await showChoices();
    await trigger("Planning refreshed").first().click();
    await expect.poll(() => dialog().count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
    expect(JSON.parse((await calls()) ?? "[]")).toHaveLength(2);
  });

  it("keeps modal paging keys inside the Calendar wrapper", async () => {
    await open("calendar-actions");
    await showChoices();
    await trigger("Planning").click();
    await page.keyboard.press("PageDown");
    await page.keyboard.press("PageUp");
    expect(await calls()).toBe("[]");
    expect(await dialog().isVisible()).toBe(true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("PageDown");
    await expect.poll(calls).toContain("page:");
  });
  it("moves a time-grid event from the keyboard and returns focus to its button", async () => {
    await open("edit");
    await menu().focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => isFocused(trigger("Planning"))).toBe(true);
    await page.keyboard.press("ArrowDown");
    expect(await isFocused(trigger("Standup"))).toBe(true);
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await dialog().waitFor();
    expect(await dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(await focusedText()).toBe("Move 15 minutes later");
    await page.keyboard.press("ArrowDown");
    expect(await focusedText()).toBe("Move 15 minutes earlier");
    await page.keyboard.press("End");
    expect(await focusedText()).toBe("Close");
    await page.keyboard.press("ArrowDown");
    expect(await focusedText()).toBe("Move 15 minutes later");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(calls).toBe('["Planning@15:8:45-15:9:45"]');
    await eventBox("Planning, 08:45 to 09:45").waitFor();
    // The dialog follows the moved event, so repeated steps keep the same focus.
    await expect.poll(() => dialog().textContent()).toContain("Planning, 08:45 to 09:45");
    expect(await focusedText()).toBe("Move 15 minutes earlier");
    await page.keyboard.press("Enter");
    await eventBox("Planning, 08:30 to 09:30").waitFor();
    await page.keyboard.press("Escape");
    await expect.poll(() => dialog().count()).toBe(0);
    expect(await isFocused(menu())).toBe(true);
    expect(JSON.parse((await calls()) ?? "[]")).toEqual([
      "Planning@15:8:45-15:9:45",
      "Planning@15:8:30-15:9:30",
    ]);
    expect(await dragStarts()).toBe("0");
  });

  it("opens actions with a click without pressing or dragging the event", async () => {
    await open("edit");
    await showChoices();
    await trigger("Planning").click();
    await dialog().waitFor();
    expect(await focusedText()).toBe("Move 15 minutes later");
    await action("Close").click();
    await expect.poll(() => dialog().count()).toBe(0);
    expect(await isFocused(menu())).toBe(true);
    expect(await calls()).toBe("[]");
    expect(await dragStarts()).toBe("0");
    // A click on the backdrop, outside the dialog box, also closes it.
    await showChoices();
    await trigger("Planning").click();
    await dialog().waitFor();
    await page.mouse.click(2, 2);
    await expect.poll(() => dialog().count()).toBe(0);
    expect(await isFocused(menu())).toBe(true);
    expect(await calls()).toBe("[]");
    // The event itself still presses as before.
    await eventBox("Planning, 09:00 to 10:00").click({ position: { x: 10, y: 30 } });
    await expect.poll(calls).toBe('["press:Planning"]');
  });

  it("opens actions with a tap", async () => {
    await open("edit");
    await showChoices();
    await trigger("Planning").tap();
    await dialog().waitFor();
    await action("Extend by 15 minutes").tap();
    await expect.poll(calls).toBe('["Planning@15:9:0-15:10:15"]');
    await eventBox("Planning, 09:00 to 10:15").waitFor();
    expect(await dragStarts()).toBe("0");
  });

  it("edits clipped morning and overnight events", async () => {
    await open("edit-clipped");
    for (const title of ["Morning", "Overnight"]) {
      await showChoices();
      await trigger(title).click();
      if (title === "Overnight") {
        expect(await dialog().textContent()).toContain("2026-07-15 - 2026-07-16");
      }
      await action("Extend by 15 minutes").click();
      await page.keyboard.press("Escape");
      expect(await isFocused(menu())).toBe(true);
    }
    expect(await calls()).toBe('["Morning@15:7:0-15:9:15","Overnight@15:22:0-16:10:15"]');
  });

  it("preserves the focused event choice through a reorder", async () => {
    await open("edit-crowded");
    await showChoices();
    await page.keyboard.press("Escape");
    expect(await menu().getAttribute("aria-expanded")).toBe("false");
    expect(await isFocused(menu())).toBe(true);
    await showChoices();
    await trigger("First").focus();
    await page
      .getByRole("button", { name: "Reverse events" })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect.poll(() => isFocused(trigger("First"))).toBe(true);
    await page.keyboard.press("Enter");
    expect(await dialog().textContent()).toContain("First, 09:00 to 10:00");
    expect(await calls()).toBe("[]");
  });

  it("restores calendar focus when the focused choice is removed", async () => {
    await open("edit-crowded");
    await showChoices();
    await trigger("First").focus();
    await page
      .getByRole("button", { name: "Remove events" })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await expect.poll(() => menu().count()).toBe(0);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.getAttribute("tabindex")))
      .toBe("-1");
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  });

  it.each(["edit-crowded", "resources-crowded", "resources-vertical-crowded"])(
    "keeps distinct action targets in narrow %s layouts",
    async (view) => {
      await page.setViewportSize({ width: 324, height: 700 });
      await open(view);
      await showChoices();
      let previousBottom = 0;
      for (const title of ["First", "Second", "Third"]) {
        const button = trigger(title);
        const rect = await button.boundingBox();
        if (!rect) throw new Error("Missing event choice");
        expect(rect.width).toBeGreaterThanOrEqual(24);
        expect(rect.height).toBeGreaterThanOrEqual(24);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(324);
        expect(rect.y).toBeGreaterThanOrEqual(previousBottom);
        previousBottom = rect.y + rect.height;
        expect(
          await button.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(rect.x + 2, rect.y + rect.height - 2),
            );
          }),
        ).toBe(true);
      }
      await trigger("Second").click();
      expect(await dialog().getAttribute("aria-labelledby")).toBeTruthy();
      expect(await dialog().textContent()).toContain("Second, 09:00 to 10:00");
      expect(await calls()).toBe("[]");
    },
  );

  it.each(["resources", "resources-vertical"])(
    "restores calendar focus when the last %s events are removed",
    async (view) => {
      await open(view);
      await showChoices();
      await trigger("Planning").click();
      // The consumer can remove data while the modal makes other UI inert.
      await page
        .getByRole("button", { name: "Remove events" })
        .evaluate((element) => (element as HTMLButtonElement).click());
      await expect.poll(() => dialog().count()).toBe(0);
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.getAttribute("tabindex")))
        .toBe("-1");
      expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
    },
  );

  it("refuses overlapping and rejected changes without moving the event", async () => {
    await open("edit");
    await page.getByRole("button", { name: "Toggle overlap" }).click();
    await showChoices();
    await trigger("Planning").click();
    await action("Move 15 minutes later").click();
    // eventOverlap={false} refuses the drop before onDragEvent runs.
    await action("Move 15 minutes earlier").waitFor();
    await expect
      .poll(() => dialog().getByRole("status").textContent())
      .toBe("This change is not allowed.");
    expect(await calls()).toBe("[]");
    expect(await eventBox("Planning, 09:00 to 10:00").count()).toBe(1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Toggle rejection" }).click();
    await showChoices();
    await trigger("Planning").click();
    await action("Move 15 minutes earlier").click();
    await expect.poll(calls).toBe('["Planning@15:8:45-15:9:45"]');
    expect(await eventBox("Planning, 09:00 to 10:00").count()).toBe(1);
    expect(await dialog().textContent()).toContain("Planning, 09:00 to 10:00");
    await expect
      .poll(() => dialog().getByRole("status").textContent())
      .toBe("This change is not allowed.");
    await page
      .getByRole("button", { name: "Toggle rejection" })
      .evaluate((element) => (element as HTMLButtonElement).click());
    await action("Move 15 minutes earlier").click();
    await expect.poll(() => dialog().getByRole("status").textContent()).toBe("");
    await expect.poll(() => dialog().textContent()).toContain("Planning, 08:45 to 09:45");
  });

  it("keeps resize actions within the minimum duration and event editability", async () => {
    await open("edit");
    await showChoices();
    await trigger("Short").click();
    const shorten = action("Shorten by 15 minutes");
    expect(await shorten.getAttribute("aria-disabled")).toBe("true");
    // Unavailable actions stay focusable (aria-disabled) but do nothing.
    await shorten.click({ force: true });
    expect(await calls()).toBe("[]");
    await action("Extend by 15 minutes").click();
    await expect.poll(calls).toBe('["Short@16:9:0-16:9:30"]');
    await expect.poll(() => shorten.getAttribute("aria-disabled")).toBeNull();
    await page.keyboard.press("Escape");

    await showChoices();

    await trigger("Fixed start").click();
    expect(await dialog().getByRole("button").allTextContents()).toEqual([
      "Extend by 15 minutes",
      "Shorten by 15 minutes",
      "Close",
    ]);
    await page.keyboard.press("Escape");
    expect(await trigger("Locked").count()).toBe(0);
    await page.getByRole("button", { name: "Toggle editing" }).click();
    await expect.poll(() => menu().count()).toBe(0);
  });

  it("moves an event a page and restores focus inside the calendar", async () => {
    await open("edit");
    await showChoices();
    await trigger("Planning").click();
    await action("Move to next week").click();
    await expect.poll(calls).toBe('["Planning@22:9:0-22:10:0"]');
    await expect.poll(() => eventBox("Planning, 09:00 to 10:00").count()).toBe(0);
    expect(await dialog().textContent()).toContain("Planning, 09:00 to 10:00");
    await expect.poll(() => dialog().textContent()).toContain("2026-07-22");
    await page.keyboard.press("Escape");
    await expect.poll(() => dialog().count()).toBe(0);
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        return !!active && active !== document.body && !!active.closest("main");
      }),
    ).toBe(true);
  });

  it.each(["resources", "resources-vertical"])(
    "moves %s events across lanes and in time",
    async (view) => {
      await open(view);
      expect(await trigger("Locked").count()).toBe(0);
      await showChoices();
      await trigger("Planning").focus();
      await page.keyboard.press("Enter");
      await dialog().waitFor();
      expect(await dialog().getByRole("button").allTextContents()).toEqual([
        "Move 15 minutes later",
        "Move 15 minutes earlier",
        "Extend by 15 minutes",
        "Shorten by 15 minutes",
        "Move to Room B",
        "Close",
      ]);
      await action("Move to Room B").click();
      await expect.poll(calls).toBe('["Planning@15:9:0-15:10:0@b"]');
      await action("Move to Room A").waitFor();
      await action("Move to Room C").waitFor();
      await action("Extend by 15 minutes").click();
      await expect.poll(calls).toBe('["Planning@15:9:0-15:10:0@b","Planning@15:9:0-15:10:15@b"]');
      await page.keyboard.press("Escape");
      await expect.poll(() => dialog().count()).toBe(0);
      expect(await isFocused(menu())).toBe(true);
      expect(
        await page
          .locator('[data-resource-id="b"]')
          .getByRole("button", { name: "Planning", exact: true })
          .count(),
      ).toBe(1);

      await page.getByRole("button", { name: "Toggle rejection" }).click();
      await showChoices();
      await trigger("Planning").click();
      await action("Move 15 minutes later").click();
      await expect.poll(async () => JSON.parse((await calls()) ?? "[]").length).toBe(3);
      expect(await dialog().textContent()).toContain("Planning, 09:00 to 10:15");
      await action("Close").click();
      expect(await page.getByRole("button", { name: "Planning", exact: true }).count()).toBe(1);
      expect(await dragStarts()).toBe("0");
    },
  );

  it.each([
    ["resources", "Planning", 324, 700],
    ["resources", "Planning", 1100, 850],
    ["edit", "Quarterly planning review with the regional operations leadership team", 324, 700],
    ["edit", "Quarterly planning review with the regional operations leadership team", 1100, 850],
  ])(
    "keeps the %s actions dialog for %s inside a %ipx viewport",
    async (view, title, width, height) => {
      await page.setViewportSize({ width, height });
      await open(view);
      await showChoices();
      await trigger(title).click();
      const bounds = await dialog().boundingBox();
      if (!bounds) throw new Error("No dialog bounds");
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
      for (const button of await dialog().getByRole("button").all()) {
        const rect = await button.boundingBox();
        if (!rect) throw new Error("No action bounds");
        expect(rect.height).toBeGreaterThanOrEqual(24);
        expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      }
      // Long titles wrap inside the dialog instead of overflowing it.
      expect(await dialog().evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.keyboard.press("Escape");
      await showChoices();
      const target = await trigger(title).boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(24);
      expect(target?.height).toBeGreaterThanOrEqual(24);
    },
  );
});
