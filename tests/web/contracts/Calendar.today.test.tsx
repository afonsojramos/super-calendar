import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { rendererName, render, Agenda, Calendar } from "@calendar-test/renderer";

// 22:00 UTC on 12 November is already 07:00 on the 13th in Tokyo, and still the
// 12th in Los Angeles, whatever zone the tests run in.
const now = new Date("2026-11-12T22:00:00Z");
const date = new Date(2026, 10, 12);

describe(rendererName, () => {
  describe("the day highlighted as today", () => {
    const todayOf = (container: HTMLElement, slot: string) => [
      ...container.querySelectorAll<HTMLElement>(`[data-slot="${slot}"][data-today]`),
    ];

    it.each(["month", "multiweek"] as const)("follows now and timeZone in %s mode", (mode) => {
      const tokyo = render(Calendar, { mode, date, now, timeZone: "Asia/Tokyo" });
      expect(todayOf(tokyo.container, "day").map((day) => day.dataset.day)).toEqual(["2026-11-13"]);
      tokyo.unmount();

      const losAngeles = render(Calendar, { mode, date, now, timeZone: "America/Los_Angeles" });
      expect(todayOf(losAngeles.container, "day").map((day) => day.dataset.day)).toEqual([
        "2026-11-12",
      ]);
    });

    it("follows now and timeZone in year mode", () => {
      const { container } = render(Calendar, { mode: "year", date, now, timeZone: "Asia/Tokyo" });
      expect(todayOf(container, "day").map((day) => day.getAttribute("aria-label"))).toEqual([
        "Friday, 13 November 2026, today",
      ]);
    });

    it.each([true, false])(
      "marks the same day in the week header and column (now indicator: %s)",
      (showNowIndicator) => {
        const { container } = render(Calendar, {
          mode: "week",
          date,
          now,
          timeZone: "Asia/Tokyo",
          showNowIndicator,
        });
        const headers = todayOf(container, "columnHeader");
        expect(headers).toHaveLength(1);
        expect(headers[0].textContent).toContain("13");
        // The column that holds the now indicator is the one marked today.
        const columns = [...container.querySelectorAll('[data-slot="dayColumn"]')];
        const marked = columns.map((column) => column.hasAttribute("data-today"));
        expect(marked.filter(Boolean)).toHaveLength(1);
        if (showNowIndicator) {
          const line = container.querySelector('[data-slot="nowIndicator"]');
          expect(line?.closest('[data-slot="dayColumn"]')).toBe(columns[marked.indexOf(true)]);
        }
      },
    );

    it("follows a pinned now without a timeZone", () => {
      const pinned = new Date(2026, 10, 20, 12);
      const { container } = render(Calendar, { mode: "month", date, now: pinned });
      expect(todayOf(container, "day").map((day) => day.dataset.day)).toEqual(["2026-11-20"]);
    });

    describe("on the device clock", () => {
      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 12, 23, 0));
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it("re-reads the clock when a month view navigates after midnight", () => {
        const view = render(Calendar, { mode: "month", date });
        expect(todayOf(view.container, "day").map((day) => day.dataset.day)).toEqual([
          "2026-11-12",
        ]);
        vi.setSystemTime(new Date(2026, 10, 13, 1, 0));
        view.rerender({ mode: "month", date: new Date(2026, 10, 13) });
        expect(todayOf(view.container, "day").map((day) => day.dataset.day)).toEqual([
          "2026-11-13",
        ]);
      });

      it("re-reads the clock in a week view without the now indicator", () => {
        const props = { mode: "week" as const, showNowIndicator: false };
        const view = render(Calendar, { ...props, date });
        expect(todayOf(view.container, "columnHeader")[0].textContent).toContain("12");
        vi.setSystemTime(new Date(2026, 10, 13, 1, 0));
        view.rerender({ ...props, date: new Date(2026, 10, 13) });
        const headers = todayOf(view.container, "columnHeader");
        expect(headers).toHaveLength(1);
        expect(headers[0].textContent).toContain("13");
      });
    });

    it("highlights the zone's current day in a standalone agenda", () => {
      const events: CalendarEvent[] = [12, 13].map((day) => ({
        title: `Event ${day}`,
        start: new Date(2026, 10, day, 9),
        end: new Date(2026, 10, day, 10),
      }));
      const { getByText } = render(Agenda, {
        events,
        now,
        timeZone: "Asia/Tokyo",
        theme: { todayBackground: "rgb(1, 2, 3)", textMuted: "rgb(4, 5, 6)" },
      });
      expect(getByText("Friday, 13 November").style.color).toBe("rgb(1, 2, 3)");
      expect(getByText("Thursday, 12 November").style.color).toBe("rgb(4, 5, 6)");
    });
  });
});
