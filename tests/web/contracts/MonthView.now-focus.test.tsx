import { MonthView, MultiWeekView, render, rendererName } from "@calendar-test/renderer";
import { useTimeZone } from "../../support/timezone";

// 23:30 UTC on 17 January is already 18 January in Tokyo, so the device's day and
// the calendar's `timeZone` day differ.
useTimeZone("UTC");

describe(rendererName, () => {
  it.each(["month", "multiweek"])(
    "starts the %s tab stop on today in the calendar's time zone",
    (mode) => {
      const view = render(mode === "month" ? MonthView : MultiWeekView, {
        date: new Date(2030, 0, 14),
        weekStartsOn: 1,
        now: new Date(Date.UTC(2030, 0, 17, 23, 30)),
        timeZone: "Asia/Tokyo",
        // Multi-week rows show events, where day tab stops are opt-in.
        keyboardDayNavigation: true,
      });
      const tabStops = view.container.querySelectorAll('[data-day][tabindex="0"]');
      expect(Array.from(tabStops, (day) => day.getAttribute("data-day"))).toEqual(["2030-01-18"]);
    },
  );
});
