import type { CalendarEvent } from "../../types";
import { expandRecurringEvents } from "../recurrence";

const at = (y: number, m: number, d: number, h = 9): Date => new Date(y, m, d, h, 0, 0, 0);

const base: CalendarEvent = {
  start: at(2026, 0, 1), // Thu 1 Jan 2026, 09:00
  end: at(2026, 0, 1, 10),
  title: "Standup",
};

describe("expandRecurringEvents", () => {
  it("passes non-recurring events through untouched", () => {
    const result = expandRecurringEvents([base], at(2026, 0, 1), at(2026, 11, 31));
    expect(result).toEqual([base]);
  });

  it("expands a daily rule across the range, preserving duration", () => {
    const event: CalendarEvent = { ...base, recurrence: { freq: "daily" } };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 5, 23));
    expect(result).toHaveLength(5);
    expect(result.map((e) => e.start.getDate())).toEqual([1, 2, 3, 4, 5]);
    for (const e of result) {
      expect(e.end.getTime() - e.start.getTime()).toBe(60 * 60 * 1000);
      expect(e.start.getHours()).toBe(9);
    }
  });

  it("honours interval", () => {
    const event: CalendarEvent = { ...base, recurrence: { freq: "daily", interval: 2 } };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 7, 23));
    expect(result.map((e) => e.start.getDate())).toEqual([1, 3, 5, 7]);
  });

  it("stops after count occurrences", () => {
    const event: CalendarEvent = { ...base, recurrence: { freq: "daily", count: 3 } };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 11, 31));
    expect(result).toHaveLength(3);
  });

  it("stops on the until date (inclusive)", () => {
    const event: CalendarEvent = {
      ...base,
      recurrence: { freq: "daily", until: at(2026, 0, 3, 9) },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 11, 31));
    expect(result.map((e) => e.start.getDate())).toEqual([1, 2, 3]);
  });

  it("only returns occurrences overlapping the range, but counts from the start", () => {
    const event: CalendarEvent = { ...base, recurrence: { freq: "daily", count: 10 } };
    const result = expandRecurringEvents([event], at(2026, 0, 5), at(2026, 0, 7, 23));
    // Occurrences 1–4 are before the range; only 5,6,7 overlap.
    expect(result.map((e) => e.start.getDate())).toEqual([5, 6, 7]);
  });

  it("repeats weekly on the start's weekday by default", () => {
    const event: CalendarEvent = { ...base, recurrence: { freq: "weekly" } };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31, 23));
    // 1 Jan 2026 is a Thursday → 1, 8, 15, 22, 29.
    expect(result.map((e) => e.start.getDate())).toEqual([1, 8, 15, 22, 29]);
  });

  it("repeats weekly on multiple weekdays", () => {
    // Start Mon 5 Jan 2026; repeat Mon (1) / Wed (3) / Fri (5).
    const event: CalendarEvent = {
      start: at(2026, 0, 5),
      end: at(2026, 0, 5, 10),
      title: "Gym",
      recurrence: { freq: "weekly", weekdays: [1, 3, 5] },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 5), at(2026, 0, 11, 23));
    // Week of 5 Jan: Mon 5, Wed 7, Fri 9.
    expect(result.map((e) => e.start.getDate())).toEqual([5, 7, 9]);
  });

  it("steps months without drifting the day-of-month", () => {
    const event: CalendarEvent = {
      start: at(2026, 0, 15),
      end: at(2026, 0, 15, 10),
      title: "Rent",
      recurrence: { freq: "monthly", count: 3 },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 11, 31));
    expect(result.map((e) => [e.start.getMonth(), e.start.getDate()])).toEqual([
      [0, 15],
      [1, 15],
      [2, 15],
    ]);
  });

  it("drops the recurrence field from materialised occurrences", () => {
    const event: CalendarEvent = { ...base, recurrence: { freq: "daily", count: 2 } };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 2, 23));
    expect(result.every((e) => e.recurrence === undefined)).toBe(true);
  });

  it("repeats on the Nth weekday of each month", () => {
    const event: CalendarEvent = {
      start: at(2026, 0, 1),
      end: at(2026, 0, 1, 10),
      title: "Board",
      recurrence: { freq: "monthly", count: 3, nthWeekday: { week: 3, weekday: 1 } },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 11, 31));
    // 3rd Monday of Jan/Feb/Mar 2026.
    expect(result.map((e) => [e.start.getMonth(), e.start.getDate()])).toEqual([
      [0, 19],
      [1, 16],
      [2, 16],
    ]);
    expect(result.every((e) => e.start.getHours() === 9)).toBe(true);
  });

  it("supports the last weekday of the month (week -1)", () => {
    const event: CalendarEvent = {
      start: at(2026, 0, 1),
      end: at(2026, 0, 1, 10),
      title: "Payday",
      recurrence: { freq: "monthly", count: 2, nthWeekday: { week: -1, weekday: 5 } },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 11, 31));
    // Last Friday of Jan (30th) and Feb (27th) 2026.
    expect(result.map((e) => [e.start.getMonth(), e.start.getDate()])).toEqual([
      [0, 30],
      [1, 27],
    ]);
  });

  it("skips occurrences on EXDATE exception days", () => {
    const event: CalendarEvent = {
      ...base, // Thu 1 Jan 2026, 09:00, daily
      recurrence: { freq: "daily", count: 5, exdates: [at(2026, 0, 2), at(2026, 0, 4)] },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31));
    // 1–5 Jan minus the 2nd and 4th.
    expect(result.map((e) => e.start.getDate())).toEqual([1, 3, 5]);
  });

  it("drops only the matching occurrence when a timed EXDATE targets one of two same-day starts", () => {
    const event: CalendarEvent = {
      ...base, // daily 09:00
      recurrence: {
        freq: "daily",
        count: 3,
        rdates: [at(2026, 0, 2, 15)], // a second occurrence on the 2nd
        exdates: [at(2026, 0, 2, 15)], // cancel just that one
      },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31));
    expect(result.map((e) => [e.start.getDate(), e.start.getHours()])).toEqual([
      [1, 9],
      [2, 9],
      [3, 9],
    ]);
  });

  it("drops every same-day occurrence for a date-only (midnight) EXDATE", () => {
    const event: CalendarEvent = {
      ...base,
      recurrence: {
        freq: "daily",
        count: 3,
        rdates: [at(2026, 0, 2, 15)],
        exdates: [new Date(2026, 0, 2)], // whole-day exception
      },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31));
    expect(result.map((e) => e.start.getDate())).toEqual([1, 3]);
  });

  it("does not let a timed EXDATE cancel an occurrence at a different time", () => {
    const event: CalendarEvent = {
      ...base, // daily 09:00
      recurrence: { freq: "daily", count: 3, exdates: [at(2026, 0, 2, 10)] },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31));
    expect(result.map((e) => e.start.getDate())).toEqual([1, 2, 3]);
  });

  it("repeats on specific days of the month (BYMONTHDAY), in order", () => {
    const event: CalendarEvent = {
      start: at(2026, 0, 1),
      end: at(2026, 0, 1, 10),
      title: "Payroll",
      recurrence: { freq: "monthly", monthDays: [15, 1] },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 2, 31));
    // Emits the 1st then the 15th each month, chronologically.
    expect(result.map((e) => [e.start.getMonth(), e.start.getDate()])).toEqual([
      [0, 1],
      [0, 15],
      [1, 1],
      [1, 15],
      [2, 1],
      [2, 15],
    ]);
    expect(result.every((e) => e.start.getHours() === 9)).toBe(true);
  });

  it("resolves a negative BYMONTHDAY as the last day, per month length", () => {
    const event: CalendarEvent = {
      start: at(2026, 0, 1),
      end: at(2026, 0, 1, 10),
      title: "Month end",
      recurrence: { freq: "monthly", monthDays: [-1] },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 2, 31));
    // Jan 31, Feb 28 (2026 is not a leap year), Mar 31.
    expect(result.map((e) => [e.start.getMonth(), e.start.getDate()])).toEqual([
      [0, 31],
      [1, 28],
      [2, 31],
    ]);
  });

  it("skips months that lack the requested day-of-month", () => {
    const event: CalendarEvent = {
      start: at(2026, 0, 31),
      end: at(2026, 0, 31, 10),
      title: "31st only",
      recurrence: { freq: "monthly", monthDays: [31] },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 3, 30));
    // Jan and Mar have a 31st; Feb and Apr don't.
    expect(result.map((e) => e.start.getMonth())).toEqual([0, 2]);
  });

  it("repeats yearly in the listed months (BYMONTH), keeping the day-of-month", () => {
    const event: CalendarEvent = {
      start: at(2026, 0, 15),
      end: at(2026, 0, 15, 10),
      title: "Review",
      recurrence: { freq: "yearly", months: [3, 9], count: 4 },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2027, 11, 31));
    // The 15th of March and September, two years running.
    expect(result.map((e) => [e.start.getFullYear(), e.start.getMonth()])).toEqual([
      [2026, 2],
      [2026, 8],
      [2027, 2],
      [2027, 8],
    ]);
  });

  it("adds RDATE dates to the set, ordered and de-duplicated against the rule", () => {
    const event: CalendarEvent = {
      ...base, // Thu 1 Jan 2026, 09:00
      recurrence: {
        freq: "weekly",
        count: 2, // 1 Jan, 8 Jan
        rdates: [at(2026, 0, 5), at(2026, 0, 8)], // 5th is extra; 8th duplicates the rule
      },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31));
    expect(result.map((e) => e.start.getDate())).toEqual([1, 5, 8]);
  });

  it("finds a long-lived daily event in a far-future window (no runaway-guard exhaustion)", () => {
    // Regression: a daily event started in 2015 with no count/until must still
    // surface when queried a decade and a half later — the generator has to
    // fast-forward to the window instead of iterating (and exhausting its guard)
    // from the original start.
    const event: CalendarEvent = {
      start: at(2015, 0, 1),
      end: at(2015, 0, 1, 10),
      title: "Daily since 2015",
      recurrence: { freq: "daily" },
    };
    const result = expandRecurringEvents([event], at(2030, 0, 1), at(2030, 0, 3, 23));
    expect(result.map((e) => e.start.getDate())).toEqual([1, 2, 3]);
    expect(result.every((e) => e.start.getFullYear() === 2030)).toBe(true);
    expect(result.every((e) => e.start.getHours() === 9)).toBe(true);
  });

  it("does not drift a monthly rule that starts on the 31st", () => {
    // Regression: computing each occurrence from the previous one let date-fns'
    // month clamp compound (Jan 31 → Feb 28 → Mar 28…). Each occurrence must be
    // computed from the origin so long months keep the 31st.
    const event: CalendarEvent = {
      start: at(2026, 0, 31), // Sat 31 Jan 2026
      end: at(2026, 0, 31, 10),
      title: "Month-end",
      recurrence: { freq: "monthly", count: 5 },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 11, 31));
    // Jan 31, Feb 28 (clamped), Mar 31, Apr 30 (clamped), May 31.
    expect(result.map((e) => [e.start.getMonth(), e.start.getDate()])).toEqual([
      [0, 31],
      [1, 28],
      [2, 31],
      [3, 30],
      [4, 31],
    ]);
  });

  it("does not collapse a yearly Feb-29 rule to Feb 28 after the first leap year", () => {
    // Regression: a leap-day start computed from the previous occurrence sticks
    // on Feb 28 forever; computed from the origin it returns to Feb 29 each leap year.
    const event: CalendarEvent = {
      start: at(2024, 1, 29), // Thu 29 Feb 2024 (leap)
      end: at(2024, 1, 29, 10),
      title: "Leap day",
      recurrence: { freq: "yearly" },
    };
    const result = expandRecurringEvents([event], at(2024, 0, 1), at(2028, 11, 31));
    // 2024 (leap) and 2028 (leap) have a 29th; the non-leap years in between clamp to the 28th.
    expect(
      result.map((e) => [e.start.getFullYear(), e.start.getMonth(), e.start.getDate()]),
    ).toEqual([
      [2024, 1, 29],
      [2025, 1, 28],
      [2026, 1, 28],
      [2027, 1, 28],
      [2028, 1, 29],
    ]);
  });

  it("keeps count semantics when the whole count precedes a far-future window", () => {
    // A capped daily event whose occurrences all fall before the window yields nothing.
    const event: CalendarEvent = {
      start: at(2026, 0, 1),
      end: at(2026, 0, 1, 10),
      title: "Ten mornings",
      recurrence: { freq: "daily", count: 10 },
    };
    const result = expandRecurringEvents([event], at(2030, 0, 1), at(2030, 0, 31));
    expect(result).toEqual([]);
  });

  it("surfaces a long-lived weekly-by-weekday event in a far-future window", () => {
    // The by-weekday branch must also fast-forward rather than spend its guard on
    // the years of throwaway occurrences before the window.
    const event: CalendarEvent = {
      start: at(2015, 0, 5), // Mon 5 Jan 2015
      end: at(2015, 0, 5, 10),
      title: "Weekdays since 2015",
      recurrence: { freq: "weekly", weekdays: [1, 2, 3, 4, 5] },
    };
    const result = expandRecurringEvents([event], at(2030, 0, 7), at(2030, 0, 11, 23));
    // Mon 7 – Fri 11 Jan 2030.
    expect(result.map((e) => e.start.getDate())).toEqual([7, 8, 9, 10, 11]);
    expect(result.every((e) => e.start.getFullYear() === 2030)).toBe(true);
  });

  it("still applies EXDATE to an RDATE-augmented set", () => {
    const event: CalendarEvent = {
      ...base,
      recurrence: {
        freq: "weekly",
        count: 1, // just 1 Jan
        rdates: [at(2026, 0, 5)],
        exdates: [at(2026, 0, 5)],
      },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31));
    expect(result.map((e) => e.start.getDate())).toEqual([1]);
  });
});
