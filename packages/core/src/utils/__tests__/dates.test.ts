import { format } from "date-fns";
import {
  buildMonthWeeks,
  getIsToday,
  getViewDays,
  getWeekDays,
  isSameCalendarDay,
  isWeekend,
  minutesIntoDay,
  viewDayCount,
  weekDaysCount,
} from "../dates";

describe("buildMonthWeeks", () => {
  const june = new Date(2026, 5, 15); // June 2026; 1 June is a Monday

  it("pads to whole weeks starting on Sunday", () => {
    const weeks = buildMonthWeeks(june, 0);
    expect(weeks[0]).toHaveLength(7);
    expect(format(weeks[0][0], "d LLL")).toBe("31 May"); // leading Sunday
    expect(format(weeks.at(-1)?.at(-1) as Date, "EEE")).toBe("Sat");
  });

  it("starts on the configured first weekday", () => {
    const weeks = buildMonthWeeks(june, 1); // Monday
    expect(format(weeks[0][0], "d LLL")).toBe("1 Jun");
  });

  it("always returns six rows when showSixWeeks is set", () => {
    expect(buildMonthWeeks(june, 0, { showSixWeeks: true })).toHaveLength(6);
  });

  it("reverses each week in RTL", () => {
    const ltr = buildMonthWeeks(june, 0);
    const rtl = buildMonthWeeks(june, 0, { isRTL: true });
    expect(format(rtl[0][0], "d LLL")).toBe(format(ltr[0][6], "d LLL"));
  });
});

describe("getWeekDays", () => {
  const wed = new Date(2026, 5, 17, 12); // Wednesday 17 Jun 2026

  it("returns 7 consecutive days", () => {
    const days = getWeekDays(wed, 1);
    expect(days).toHaveLength(7);
    expect(days.map((d) => format(d, "EEE"))).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("honours weekStartsOn = 0 (Sunday)", () => {
    const days = getWeekDays(wed, 0);
    expect(format(days[0], "EEE")).toBe("Sun");
    expect(format(days[6], "EEE")).toBe("Sat");
  });

  it("returns the same Monday-week when given that Monday (no off-by-one)", () => {
    const mon = new Date(2026, 5, 15, 9);
    const days = getWeekDays(mon, 1);
    expect(format(days[0], "d LLL")).toBe("15 Jun");
  });
});

describe("viewDayCount", () => {
  it("maps each mode to a column count", () => {
    expect(viewDayCount("day")).toBe(1);
    expect(viewDayCount("3days")).toBe(3);
    expect(viewDayCount("week")).toBe(7);
    expect(viewDayCount("custom", 5)).toBe(5);
    expect(viewDayCount("custom", 0)).toBe(1); // clamped to >= 1
  });
});

describe("getViewDays", () => {
  const wed = new Date(2026, 5, 17, 12); // Wednesday

  it("spans the calendar week for week mode", () => {
    const days = getViewDays("week", wed, 1);
    expect(days).toHaveLength(7);
    expect(format(days[0], "EEE")).toBe("Mon");
  });

  it("returns N consecutive days from the date for custom/3days/day", () => {
    expect(getViewDays("day", wed, 1).map((d) => format(d, "d"))).toEqual(["17"]);
    expect(getViewDays("3days", wed, 1).map((d) => format(d, "d"))).toEqual(["17", "18", "19"]);
    expect(getViewDays("custom", wed, 1, 2).map((d) => format(d, "d"))).toEqual(["17", "18"]);
  });

  it("reverses the column order when isRTL is set", () => {
    expect(getViewDays("3days", wed, 1, 1, true).map((d) => format(d, "d"))).toEqual([
      "19",
      "18",
      "17",
    ]);
    expect(getViewDays("week", wed, 1, 1, true).map((d) => format(d, "EEE"))).toEqual([
      "Sun",
      "Sat",
      "Fri",
      "Thu",
      "Wed",
      "Tue",
      "Mon",
    ]);
  });

  it("spans a custom partial week (weekStartsOn…weekEndsOn) anchored to the date", () => {
    // Mon-first work week (Mon–Fri) for a Wednesday: the five weekdays of its week.
    expect(getViewDays("custom", wed, 1, 1, false, 5).map((d) => format(d, "EEE d"))).toEqual([
      "Mon 15",
      "Tue 16",
      "Wed 17",
      "Thu 18",
      "Fri 19",
    ]);
  });

  it("custom without weekEndsOn keeps the consecutive-days model", () => {
    expect(getViewDays("custom", wed, 1, 3).map((d) => format(d, "d"))).toEqual(["17", "18", "19"]);
  });
});

describe("weekDaysCount", () => {
  it("counts an inclusive same-direction span", () => {
    expect(weekDaysCount(1, 5)).toBe(5); // Mon–Fri
    expect(weekDaysCount(0, 6)).toBe(7); // Sun–Sat
    expect(weekDaysCount(3, 3)).toBe(1); // single day
  });

  it("wraps when the end precedes the start", () => {
    expect(weekDaysCount(6, 3)).toBe(5); // Sat,Sun,Mon,Tue,Wed
  });
});

describe("isWeekend", () => {
  it("is true for Saturday and Sunday", () => {
    expect(isWeekend(new Date(2026, 5, 20))).toBe(true); // Sat
    expect(isWeekend(new Date(2026, 5, 21))).toBe(true); // Sun
  });
  it("is false on weekdays", () => {
    expect(isWeekend(new Date(2026, 5, 17))).toBe(false); // Wed
  });
});

describe("minutesIntoDay", () => {
  it("converts a time to minutes since midnight", () => {
    expect(minutesIntoDay(new Date(2026, 5, 17, 8, 30))).toBe(510);
    expect(minutesIntoDay(new Date(2026, 5, 17, 0, 0))).toBe(0);
  });
});

describe("isSameCalendarDay", () => {
  it("ignores the time component", () => {
    expect(isSameCalendarDay(new Date(2026, 5, 17, 1), new Date(2026, 5, 17, 23))).toBe(true);
    expect(isSameCalendarDay(new Date(2026, 5, 17), new Date(2026, 5, 18))).toBe(false);
  });
});

describe("getIsToday", () => {
  it("is true for now and false for a fixed past date", () => {
    expect(getIsToday(new Date())).toBe(true);
    expect(getIsToday(new Date(2000, 0, 1))).toBe(false);
  });

  it("compares against a given day instead of the device clock", () => {
    const today = new Date(2026, 10, 13, 7);
    expect(getIsToday(new Date(2026, 10, 13, 23, 59), today)).toBe(true);
    expect(getIsToday(new Date(2026, 10, 12, 23, 59), today)).toBe(false);
    expect(getIsToday(new Date(), today)).toBe(false);
  });
});
