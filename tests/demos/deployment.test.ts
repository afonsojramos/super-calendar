import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { Browser, Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchBrowser } from "../support/browser";
import { serveDirectory } from "../support/static-server";

let browser: Browser;
let server: Awaited<ReturnType<typeof serveDirectory>>;

beforeAll(async () => {
  const directory = resolve(import.meta.dirname, "../../dist/demos");
  await access(resolve(directory, "solid/index.html"));
  server = await serveDirectory(directory);
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

async function checkPage(
  path: string,
  check: (page: Page) => Promise<void>,
  width = 1100,
  hasTouch = false,
  now?: Date,
  timezoneId?: string,
) {
  const page = await browser.newPage({ viewport: { width, height: 880 }, hasTouch, timezoneId });
  if (now) await page.clock.setFixedTime(now);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  try {
    const response = await page.goto(`${server.url}${path}`);
    expect(response?.status()).toBe(200);
    await check(page);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
}

async function nativeMultiWeekGrid(page: Page) {
  await page.getByText("multiweek", { exact: true }).click();
  await page.getByRole("button", { name: "4 weeks", exact: true }).click();
  const grids = page.getByTestId("multiweek-grid");
  const currentIndex = () =>
    grids.evaluateAll((nodes) =>
      nodes.findIndex((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      }),
    );
  await expect.poll(currentIndex).toBeGreaterThanOrEqual(0);
  const label = await grids.nth(await currentIndex()).getAttribute("aria-label");
  if (!label) throw new Error("Missing multi-week range label");
  const grid = grids.and(page.getByLabel(label, { exact: true }));
  await grid.evaluate((element) => {
    let viewport = element.parentElement;
    while (viewport && getComputedStyle(viewport).overflowY !== "auto")
      viewport = viewport.parentElement;
    if (!viewport) throw new Error("Missing multi-week scroll viewport");
    // Exercise the supported constrained-height consumer layout.
    viewport.dataset.testScroll = "true";
    viewport.style.height = "180px";
    viewport.style.maxHeight = "180px";
    viewport.style.flex = "0 0 180px";
  });
  const viewport = page.locator("[data-test-scroll]");
  await viewport.scrollIntoViewIfNeeded();
  await expect
    .poll(() => viewport.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(100);
  return { grid, viewport };
}

describe("published demos", () => {
  it.each(["/dom/", "/solid/"])(
    "labels a one-day draft before a skipped date on %s",
    async (path) => {
      await checkPage(
        path,
        async (page) => {
          if (path === "/solid/") {
            await page.getByLabel("View", { exact: true }).selectOption("year");
            for (let year = 0; year < 15; year++)
              await page.getByRole("button", { name: "Previous period" }).click();
            await page.getByLabel("View", { exact: true }).selectOption("month");
            await page.getByRole("button", { name: "Next period" }).click();
          } else await page.getByRole("button", { name: /^month$/i }).click();
          expect(await page.evaluate(() => new Date(2011, 11, 30).getDate())).toBe(31);
          const day = page.locator('[data-day="2011-12-29"]');
          await day.scrollIntoViewIfNeeded();
          const bounds = await day.boundingBox();
          if (!bounds) throw new Error("Missing day before skipped date");
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 10);
          await page.mouse.down();
          await expect
            .poll(() => page.locator('[data-slot="createGhost"]').allTextContents())
            .toEqual(["Draft: Dec 29"]);
          await page.mouse.up();
        },
        1100,
        false,
        new Date("2011-12-26T12:00:00Z"),
        "Pacific/Apia",
      );
    },
  );

  it.each(["/dom/", "/solid/"].flatMap((path) => [23, 24].map((day) => ({ path, day }))))(
    "labels a one-day draft on April $day around a midnight clock change on $path",
    async ({ path, day: dayNumber }) => {
      await checkPage(
        path,
        async (page) => {
          if (path === "/solid/") {
            await page.getByLabel("View", { exact: true }).selectOption("month");
            // The Solid example starts in November 2026; navigate to April.
            for (let month = 0; month < 7; month++)
              await page.getByRole("button", { name: "Previous period" }).click();
          } else await page.getByRole("button", { name: /^month$/i }).click();
          expect(await page.evaluate(() => new Date(2026, 3, 24).getHours())).toBe(1);
          const day = page.locator(`[data-day="2026-04-${dayNumber}"]`);
          await day.scrollIntoViewIfNeeded();
          const bounds = await day.boundingBox();
          if (!bounds) throw new Error("Missing midnight-transition day");
          await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 10);
          await page.mouse.down();
          await expect
            .poll(() => page.locator('[data-slot="createGhost"]').allTextContents())
            .toEqual([`Draft: Apr ${dayNumber}`]);
          const ghost = await page.locator('[data-slot="createGhost"]').boundingBox();
          if (!ghost) throw new Error("Missing midnight-transition draft");
          expect(ghost.x).toBeGreaterThanOrEqual(bounds.x - 1);
          expect(ghost.x + ghost.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
          expect(ghost.width).toBeGreaterThan(bounds.width / 2);
          await page.mouse.up();
        },
        1100,
        false,
        new Date("2026-04-23T12:00:00Z"),
        "Africa/Cairo",
      );
    },
  );

  it.each(
    (["month", "multiweek"] as const).flatMap((mode) => [
      {
        mode,
        timezoneId: "Europe/Madrid",
        now: new Date("2026-07-15T12:00:00Z"),
        row: mode === "month" ? 2 : 0,
        column: 4,
        single: "Draft: Jul 17",
        span: "Draft: Jul 17 to Jul 22",
        singleOnly: false,
      },
      {
        mode,
        timezoneId: "America/Sao_Paulo",
        now: new Date("2018-11-01T12:00:00Z"),
        row: 0,
        column: 5,
        single: "Draft: Nov 3",
        span: "Draft: Nov 3 to Nov 7",
        singleOnly: false,
      },
      {
        mode,
        timezoneId: "America/Sao_Paulo",
        now: new Date("2018-11-01T12:00:00Z"),
        row: 0,
        column: 6,
        single: "Draft: Nov 4",
        span: "",
        singleOnly: true,
      },
      {
        mode,
        timezoneId: "Pacific/Apia",
        now: new Date("2011-12-26T12:00:00Z"),
        row: mode === "month" ? 4 : 0,
        column: 3,
        single: "Draft: Dec 29",
        span: "",
        singleOnly: true,
      },
    ]),
  )(
    "shows live native-web $mode creation content in $timezoneId for $single",
    async ({ mode, timezoneId, now, row, column, single, span, singleOnly }) => {
      await checkPage(
        "/",
        async (page) => {
          await page.getByText(mode, { exact: true }).click();
          if (mode === "multiweek")
            await page.getByRole("button", { name: "2 weeks", exact: true }).click();
          const grids = page.getByTestId(mode === "month" ? "month-grid" : "multiweek-grid");
          const visibleIndex = () =>
            grids.evaluateAll((nodes) =>
              nodes.findIndex((node) => {
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth;
              }),
            );
          await expect.poll(visibleIndex, { timeout: 5_000 }).toBeGreaterThanOrEqual(0);
          const grid = grids.nth(await visibleIndex());
          await grid.scrollIntoViewIfNeeded();
          // Legend List initially measures its pages with pointer input disabled.
          await expect
            .poll(
              () =>
                grid.evaluate((element) => {
                  const rect = element.getBoundingClientRect();
                  return element.contains(
                    document.elementFromPoint(rect.x + rect.width / 2, rect.y + 10),
                  );
                }),
              { timeout: 5_000 },
            )
            .toBe(true);
          const bounds = await grid.boundingBox();
          if (!bounds) throw new Error("Native calendar grid has no bounds");
          const rows = mode === "month" ? 5 : 2;
          const origin = {
            x: bounds.x + (bounds.width * (column + 0.5)) / 7,
            y: bounds.y + (bounds.height * row) / rows + 10,
          };
          const target = {
            x: bounds.x + (bounds.width * 2.5) / 7,
            y: bounds.y + (bounds.height * (row + 1)) / rows + 10,
          };
          await page.mouse.move(origin.x, origin.y);
          await page.mouse.down();
          const draft = grid.getByTestId("month-draft-range");
          await expect.poll(() => draft.allTextContents()).toEqual([single]);
          if (singleOnly) {
            if (timezoneId === "Pacific/Apia")
              expect(await page.evaluate(() => new Date(2011, 11, 30).getDate())).toBe(31);
            else expect(await page.evaluate(() => new Date(2018, 10, 4).getHours())).toBe(1);
            await page.mouse.up();
            return;
          }
          await page.mouse.move(target.x, target.y, { steps: 8 });
          await expect.poll(() => draft.allTextContents()).toEqual([span, span]);
          expect(
            await grid
              .getByTestId("month-create-ghost")
              .evaluateAll((elements) =>
                elements.every(
                  (el) => el.getAttribute("aria-hidden") === "true" && el.hasAttribute("inert"),
                ),
              ),
          ).toBe(true);
          await page.mouse.up();
          await expect.poll(() => draft.count()).toBe(0);
          await expect
            .poll(() => grid.getByRole("button", { name: /^✨ New event,/ }).count())
            .toBe(2);
        },
        1100,
        false,
        now,
        timezoneId,
      );
    },
  );

  it.each(
    ["/dom/", "/solid/"].flatMap((path) => ["month", "multiweek"].map((mode) => ({ path, mode }))),
  )("shows live $mode date previews on $path", async ({ path, mode }) => {
    await checkPage(
      path,
      async (page) => {
        if (path === "/solid/") await page.getByLabel("View", { exact: true }).selectOption(mode);
        else await page.getByRole("button", { name: new RegExp(`^${mode}$`, "i") }).click();
        const first = page.locator('[data-day="2026-11-06"]');
        const last = page.locator('[data-day="2026-11-11"]');
        await first.scrollIntoViewIfNeeded();
        const origin = await first.boundingBox();
        const target = await last.boundingBox();
        if (!origin || !target) throw new Error("Missing month day bounds");
        await page.mouse.move(origin.x + origin.width / 2, origin.y + 10);
        await page.mouse.down();
        const ghost = page.locator('[data-slot="createGhost"]');
        await expect.poll(() => ghost.allTextContents()).toEqual(["Draft: Nov 6"]);
        await page.mouse.move(target.x + target.width / 2, target.y + 10, { steps: 8 });
        await expect
          .poll(() => ghost.allTextContents())
          .toEqual(["Draft: Nov 6 to Nov 11", "Draft: Nov 6 to Nov 11"]);
        expect(
          await ghost.evaluateAll((elements) =>
            elements.every(
              (el) => el.hasAttribute("inert") && el.getAttribute("aria-hidden") === "true",
            ),
          ),
        ).toBe(true);
        await page.mouse.up();
        await expect.poll(() => ghost.count()).toBe(0);
        await expect
          .poll(() => page.getByRole("button", { name: /^(✨ )?New event,/ }).count())
          .toBe(2);
      },
      1100,
      false,
      new Date(2026, 10, 2, 12),
    );
  });

  it("scrolls the native-web multi-week rows with a quick touch swipe", async () => {
    await checkPage(
      "/",
      async (page) => {
        const { viewport } = await nativeMultiWeekGrid(page);
        const bounds = await viewport.boundingBox();
        const contact = {
          x: bounds!.x + bounds!.width / 2,
          y: bounds!.y + bounds!.height - 20,
          id: 1,
        };
        const cdp = await page.context().newCDPSession(page);
        try {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [contact],
          });
          for (const offset of [20, 40, 70, 100, 120]) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ ...contact, y: contact.y - offset }],
            });
            await page.waitForTimeout(20);
          }
          await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
          await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);
          expect(await page.getByText("✨ New event", { exact: true }).count()).toBe(0);
        } finally {
          await cdp.detach();
        }
      },
      390,
      true,
    );
  });

  it.each(["day", "event"])(
    "creates and moves a held native-web event, then accepts a quick %s tap",
    async (target) => {
      await checkPage(
        "/",
        async (page) => {
          const { grid, viewport } = await nativeMultiWeekGrid(page);
          await viewport.evaluate((el) => {
            el.scrollTop = 180;
          });
          const bounds = await grid.boundingBox();
          const rowHeight = bounds!.height / 4;
          const contact = {
            x: bounds!.x + (bounds!.width * 1.5) / 7,
            y: bounds!.y + rowHeight * 2 + 10,
            id: 1,
          };
          const destination = {
            ...contact,
            x: bounds!.x + (bounds!.width * 3.5) / 7,
            y: bounds!.y + rowHeight * 3 + 10,
          };
          const cdp = await page.context().newCDPSession(page);
          try {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [contact],
            });
            await page.waitForTimeout(450);
            await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
            expect(await grid.getByText("✨ New event", { exact: true }).count()).toBe(0);
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [contact],
            });
            await page.waitForTimeout(450);
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ ...contact, x: destination.x }],
            });
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [destination],
            });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            const bars = grid.getByRole("button", { name: /^✨ New event,/ });
            await expect.poll(() => bars.count()).toBe(2);
            const bar = await bars.first().boundingBox();
            const grab = { x: bar!.x + 10, y: bar!.y + bar!.height / 2, id: 1 };
            await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [grab] });
            await page.waitForTimeout(450);
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [{ ...destination, x: bounds!.x + (bounds!.width * 5.5) / 7 }],
            });
            await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            await expect.poll(() => bars.count()).toBe(1);
            const moved = await bars.first().boundingBox();
            expect(moved!.y - bar!.y).toBeCloseTo(rowHeight, 0);
            expect(moved!.x - bar!.x).toBeCloseTo((bounds!.width * 4) / 7, 0);
            expect(await viewport.evaluate((el) => el.scrollTop)).toBe(180);
            if (target === "day") {
              await page.touchscreen.tap(bounds!.x + (bounds!.width * 0.5) / 7, destination.y);
              await page.getByTestId("time-grid-pager").first().waitFor();
            } else {
              const pressed = page.waitForEvent("console", {
                predicate: (message) =>
                  message.text().includes("press event:") &&
                  message.text().includes("✨ New event"),
              });
              await page.touchscreen.tap(moved!.x + 10, moved!.y + moved!.height / 2);
              await pressed;
            }
          } finally {
            await cdp.detach();
          }
        },
        390,
        true,
      );
    },
  );

  it.each(["event actions", "date range picker"])(
    "keeps React demo shortcuts outside the %s dialog",
    async (kind) => {
      await checkPage("/dom/", async (page) => {
        if (kind === "event actions") {
          await page.getByRole("button", { name: "Edit events", exact: true }).click();
          await page
            .getByRole("button", { name: /^Move or resize / })
            .first()
            .click();
        } else {
          await page.getByRole("button", { name: "field", exact: true }).click();
          await page.getByRole("button", { name: "Select dates", exact: true }).click();
        }
        const dialog = page.getByRole("dialog");
        const focusedInside = () =>
          dialog.evaluate((element) => element.contains(document.activeElement));
        await expect.poll(focusedInside).toBe(true);
        const content = await dialog.textContent();
        for (const key of ["m", "d", "a", "n", "p", "t", "w", "x", "j", "k"]) {
          await page.keyboard.press(key);
          expect(await dialog.count()).toBe(1);
          expect(await focusedInside()).toBe(true);
          expect(await dialog.textContent()).toBe(content);
        }
        await page.keyboard.press("Escape");
        expect(await dialog.count()).toBe(0);
        expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
        await page.keyboard.press("m");
        await page.getByRole("grid").first().waitFor();
        expect(await page.locator('[data-slot="dayColumn"]').count()).toBe(0);
      });
    },
  );

  it.each([
    [
      "/",
      "@super-calendar/native",
      '[data-testid="month-grid"]',
      '[data-testid="time-grid-pager"]',
    ],
    ["/dom/", "@super-calendar/dom", '[role="grid"]', '[data-slot="dayColumn"]'],
  ])("loads %s and changes calendar modes", async (path, title, month, week) => {
    await checkPage(path, async (page) => {
      await page.getByText(title, { exact: true }).waitFor();
      await page.getByText("month", { exact: true }).click();
      await page.locator(month).first().waitFor();
      await expect.poll(() => page.locator(week).count()).toBe(0);
      await page.getByText("week", { exact: true }).click();
      await page.locator(week).first().waitFor();
      await expect.poll(() => page.locator(month).count()).toBe(0);
    });
  });

  it.each(["/", "/dom/", "/solid/"])(
    "renders and navigates selectable multi-week ranges in %s",
    async (path) => {
      await checkPage(path, async (page) => {
        if (path === "/solid/")
          await page.getByLabel("View", { exact: true }).selectOption("multiweek");
        else await page.getByText("multiweek", { exact: true }).click();
        const grid = page.locator(
          path === "/" ? '[data-testid="multiweek-grid"]' : '[role="grid"]',
        );
        await grid.first().waitFor();
        expect(
          await page.locator('[data-slot="dayColumn"], [data-testid="time-grid-pager"]').count(),
        ).toBe(0);
        const title = page.getByTestId("visible-period");
        const initial = await title.textContent();
        if (path === "/") await page.getByRole("button", { name: "4 weeks", exact: true }).click();
        else await page.getByLabel("Weeks", { exact: true }).selectOption("4");
        await expect.poll(() => title.textContent()).not.toBe(initial);
        const fourWeeks = await title.textContent();
        if (path !== "/") expect(await grid.locator("[data-day]").count()).toBe(28);
        await page
          .getByRole("button", { name: path === "/solid/" ? "Next period" : "Next", exact: true })
          .click();
        await expect.poll(() => title.textContent()).not.toBe(fourWeeks);
        await page
          .getByRole("button", {
            name: path === "/solid/" ? "Previous period" : "Previous",
            exact: true,
          })
          .click();
        await expect.poll(() => title.textContent()).toBe(fourWeeks);
      });
    },
  );

  it("loads and refreshes the Solid feed from the published subpath", async () => {
    await checkPage("/solid/?view=feed", async (page) => {
      await page.getByText("Feed up to date", { exact: true }).waitFor();
      await page.getByText("Feed planning", { exact: true }).waitFor();
      const response = page.waitForResponse(`${server.url}/solid/events.json`);
      await page.getByRole("button", { name: "Refresh feed" }).click();
      expect((await response).status()).toBe(200);
      await page.getByText("Feed up to date", { exact: true }).waitFor();
    });
  });

  it.each([324, 681, 700, 1120])("keeps the Solid pickers inside a %ipx frame", async (width) => {
    await checkPage(
      "/solid/",
      async (page) => {
        for (const index of [0, 1]) {
          const trigger = page.locator('[data-slot="trigger"]').nth(index);
          await trigger.click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          const bounds = await dialog.boundingBox();
          expect(bounds).not.toBeNull();
          if (!bounds) throw new Error("Picker is not visible");
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(880);
          await trigger.click();
          expect(await dialog.count()).toBe(0);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      },
      width,
    );
  });

  it.each([
    ["/dom/", "✨ New event"],
    ["/solid/", "New event"],
  ])("previews the draft range on %s and creates that range", async (path, title) => {
    await checkPage(path, async (page) => {
      await page.locator('[data-slot="dayColumn"]').first().waitFor();
      // A point on empty column background with 120px of free space below it.
      const start = await page.evaluate(() => {
        for (const column of document.querySelectorAll<HTMLElement>('[data-slot="dayColumn"]')) {
          let scroller = column.parentElement;
          while (scroller && getComputedStyle(scroller).overflowY !== "auto") {
            scroller = scroller.parentElement;
          }
          const view = (scroller ?? column).getBoundingClientRect();
          const box = column.getBoundingClientRect();
          const x = box.left + box.width / 2;
          for (let y = Math.max(box.top, view.top) + 80; y < view.bottom - 140; y += 8) {
            let free = true;
            for (let dy = 0; dy <= 128 && free; dy += 4) {
              free = document.elementFromPoint(x, y + dy) === column;
            }
            if (free) return { x, y };
          }
        }
        return null;
      });
      if (!start) throw new Error("No empty slot to sweep");
      const created = () => page.getByText(title, { exact: true }).count();
      const before = await created();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, start.y + 120, { steps: 8 });
      const ghost = page.locator('[data-slot="createGhost"]');
      await ghost.waitFor();
      const range = (await ghost.locator("div").last().textContent()) ?? "";
      expect(range).toMatch(/^\d\d:\d\d - \d\d:\d\d$/);
      expect(await ghost.locator("strong").textContent()).toBe(title);
      expect(await created()).toBe(before + 1);
      await page.mouse.up();
      await expect.poll(() => ghost.count()).toBe(0);
      await expect.poll(created).toBe(before + 1);
      await page.getByText(range, { exact: true }).first().waitFor();
    });
  });

  it("returns 404 for missing assets instead of an application shell", async () => {
    const response = await fetch(`${server.url}/solid/assets/missing.js`);
    expect(response.status).toBe(404);
  });
});
