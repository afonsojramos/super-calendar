import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { rendererName, render, Calendar, MonthList } from "@calendar-test/renderer";

// 22:00 UTC on 12 November is already 07:00 on the 13th in Tokyo, and still the
// 12th in Los Angeles, whatever zone the tests run in.
const now = new Date("2026-11-12T22:00:00Z");
const theme = { todayBackground: "rgb(1, 2, 3)", textMuted: "rgb(4, 5, 6)" };
const HIGHLIGHT = "rgb(1, 2, 3)";
const MUTED = "rgb(4, 5, 6)";

const events: CalendarEvent[] = [12, 13, 20].map((day) => ({
  title: `Event ${day}`,
  start: new Date(2026, 10, day, 9),
  end: new Date(2026, 10, day, 10),
}));

describe(rendererName, () => {
  describe("schedule mode highlight", () => {
    const headerColors = (getByText: (text: string) => HTMLElement) => [
      getByText("Thursday, 12 November").style.color,
      getByText("Friday, 13 November").style.color,
      getByText("Friday, 20 November").style.color,
    ];

    it("highlights today in the time zone, not the date prop, by default", () => {
      const { getByText } = render(Calendar, {
        mode: "schedule",
        date: new Date(2026, 10, 20),
        events,
        now,
        timeZone: "Asia/Tokyo",
        theme,
      });
      expect(headerColors(getByText)).toEqual([MUTED, HIGHLIGHT, MUTED]);
    });

    it("follows a pinned now without a timeZone", () => {
      const { getByText } = render(Calendar, {
        mode: "schedule",
        date: new Date(2026, 10, 20),
        events,
        now: new Date(2026, 10, 12, 12),
        theme,
      });
      expect(headerColors(getByText)).toEqual([HIGHLIGHT, MUTED, MUTED]);
    });

    it("moves the highlight on a mounted schedule when now changes", () => {
      const props = { mode: "schedule" as const, date: new Date(2026, 10, 20), events, theme };
      const view = render(Calendar, { ...props, now: new Date(2026, 10, 12, 12) });
      view.rerender({ ...props, now: new Date(2026, 10, 13, 12) });
      expect(headerColors(view.getByText)).toEqual([MUTED, HIGHLIGHT, MUTED]);
    });

    it("highlights activeDate instead of today when set", () => {
      const { getByText } = render(Calendar, {
        mode: "schedule",
        date: new Date(2026, 10, 1),
        activeDate: new Date(2026, 10, 20),
        events,
        now,
        timeZone: "Asia/Tokyo",
        theme,
      });
      expect(headerColors(getByText)).toEqual([MUTED, MUTED, HIGHLIGHT]);
    });
  });

  describe("activeDate in the grid modes", () => {
    const activeDate = new Date(2026, 10, 20);
    const date = new Date(2026, 10, 12);
    const badgeOf = (container: HTMLElement, day: string) =>
      container.querySelector<HTMLElement>(
        `[data-slot="day"][data-day="${day}"] [data-slot="dayBadge"]`,
      );

    it.each(["month", "multiweek"] as const)(
      "fills the activeDate badge, not today's, in %s mode",
      (mode) => {
        const { container } = render(Calendar, {
          mode,
          date,
          numberOfWeeks: 2,
          events,
          now,
          timeZone: "Asia/Tokyo",
          activeDate,
          theme,
        });
        expect(badgeOf(container, "2026-11-20")?.style.background).toBe(HIGHLIGHT);
        expect(badgeOf(container, "2026-11-13")?.style.background).not.toBe(HIGHLIGHT);
        // `data-today` still states the real today.
        const today = [...container.querySelectorAll<HTMLElement>('[data-slot="day"][data-today]')];
        expect(today.map((day) => day.dataset.day)).toEqual(["2026-11-13"]);
      },
    );

    it("fills the activeDate badge, not today's, in year mode", () => {
      const { container } = render(Calendar, {
        mode: "year",
        date,
        now,
        timeZone: "Asia/Tokyo",
        activeDate,
        theme,
      });
      const badge = (label: string) =>
        container.querySelector<HTMLElement>(
          `[data-slot="day"][aria-label^="${label}"] [data-slot="dayBadge"]`,
        );
      expect(badge("Friday, 20 November 2026")?.style.background).toBe(HIGHLIGHT);
      expect(badge("Friday, 13 November 2026")?.style.background).not.toBe(HIGHLIGHT);
    });

    it("fills the activeDate column header, not today's, in week mode", () => {
      const { container } = render(Calendar, {
        mode: "week",
        date: activeDate,
        now: new Date(2026, 10, 19, 12),
        activeDate,
        theme,
      });
      const header = (day: string) =>
        [...container.querySelectorAll<HTMLElement>('[data-slot="columnHeaderDate"]')].find(
          (node) => node.textContent === day,
        );
      expect(header("20")?.style.background).toBe(HIGHLIGHT);
      expect(header("19")?.style.background).not.toBe(HIGHLIGHT);
      // The header still announces the real today.
      expect(
        container.querySelector('[data-slot="columnHeader"][data-today]')?.textContent,
      ).toContain("19");
    });

    it("moves the activeDate badge in a mounted month list", () => {
      const props = { date, pastMonths: 0, futureMonths: 0, theme };
      const view = render(MonthList, { ...props, activeDate });
      const badge = (label: string) =>
        view.container.querySelector<HTMLElement>(
          `[aria-label^="${label}"] [data-slot="dayBadge"]`,
        );
      expect(badge("Friday, 20 November 2026")?.style.background).toBe(HIGHLIGHT);
      view.rerender({ ...props, activeDate: new Date(2026, 10, 18) });
      expect(badge("Wednesday, 18 November 2026")?.style.background).toBe(HIGHLIGHT);
      expect(badge("Friday, 20 November 2026")?.style.background).not.toBe(HIGHLIGHT);
    });

    it("moves the activeDate highlight in a mounted schedule and week view", () => {
      const schedule = render(Calendar, { mode: "schedule", date, events, now, activeDate, theme });
      schedule.rerender({
        mode: "schedule",
        date,
        events,
        now,
        activeDate: new Date(2026, 10, 12),
        theme,
      });
      expect(schedule.getByText("Thursday, 12 November").style.color).toBe(HIGHLIGHT);
      expect(schedule.getByText("Friday, 20 November").style.color).toBe(MUTED);
      schedule.unmount();

      const weekProps = { mode: "week" as const, date: activeDate, now, theme };
      const week = render(Calendar, { ...weekProps, activeDate });
      week.rerender({ ...weekProps, activeDate: new Date(2026, 10, 18) });
      const header = (day: string) =>
        [...week.container.querySelectorAll<HTMLElement>('[data-slot="columnHeaderDate"]')].find(
          (node) => node.textContent === day,
        );
      expect(header("18")?.style.background).toBe(HIGHLIGHT);
      expect(header("20")?.style.background).not.toBe(HIGHLIGHT);
    });
  });
});
