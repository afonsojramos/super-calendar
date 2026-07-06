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

  it("skips occurrences on EXDATE exception days", () => {
    const event: CalendarEvent = {
      ...base, // Thu 1 Jan 2026, 09:00, daily
      recurrence: { freq: "daily", count: 5, exdates: [at(2026, 0, 2), at(2026, 0, 4)] },
    };
    const result = expandRecurringEvents([event], at(2026, 0, 1), at(2026, 0, 31));
    // 1–5 Jan minus the 2nd and 4th.
    expect(result.map((e) => e.start.getDate())).toEqual([1, 3, 5]);
  });
});
