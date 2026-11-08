import { format } from "date-fns";
import { useTimeZone } from "../../../../../tests/support/timezone";
import { buildMultiWeekGrid } from "../multiWeekGrid";
import { getViewDays, viewDayCount } from "../dates";
import { pageStepDays } from "../drag";

useTimeZone("America/New_York");

const ids = (days: { date: Date }[]) => days.map((d) => format(d.date, "yyyy-MM-dd"));

describe("buildMultiWeekGrid", () => {
  it("defaults to two full weeks starting on the week that contains the date", () => {
    // Wednesday 4 November 2026; weeks start on Sunday by default.
    const grid = buildMultiWeekGrid(new Date(2026, 10, 4, 15, 30));
    expect(grid.weeks).toHaveLength(2);
    expect(ids(grid.weeks[0].days)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
    expect(ids(grid.weeks[1].days)[0]).toBe("2026-11-08");
    expect(grid.period.start).toEqual(new Date(2026, 10, 1));
    expect(grid.period.endExclusive).toEqual(new Date(2026, 10, 15));
    expect(grid.visibleRange).toEqual(grid.period);
    expect(grid.weekdays.map((w) => w.label)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });

  it.each([2, 3, 4, 8])("returns %i consecutive seven-day rows", (numberOfWeeks) => {
    const grid = buildMultiWeekGrid(new Date(2026, 10, 4), { numberOfWeeks, weekStartsOn: 1 });
    expect(grid.weeks).toHaveLength(numberOfWeeks);
    const all = grid.weeks.flatMap((w) => w.days);
    expect(all).toHaveLength(7 * numberOfWeeks);
    expect(ids(all)[0]).toBe("2026-11-02");
    // Every day appears exactly once and in order.
    for (let i = 1; i < all.length; i++) {
      expect(all[i].date.getTime()).toBeGreaterThan(all[i - 1].date.getTime());
    }
    expect(new Set(ids(all)).size).toBe(all.length);
  });

  it("crosses month and year boundaries without month membership metadata", () => {
    const grid = buildMultiWeekGrid(new Date(2026, 11, 28), { numberOfWeeks: 3 });
    expect(ids(grid.weeks[0].days)[0]).toBe("2026-12-27");
    expect(ids(grid.weeks[2].days)[6]).toBe("2027-01-16");
    expect(grid.period.endExclusive).toEqual(new Date(2027, 0, 17));
    for (const week of grid.weeks) {
      for (const day of week.days) expect(day).not.toHaveProperty("isCurrentMonth");
    }
  });

  it("uses calendar days across DST transitions", () => {
    // US DST ends on Sunday 1 November 2026 and starts on Sunday 8 March 2026.
    for (const date of [new Date(2026, 9, 28), new Date(2026, 2, 4)]) {
      const grid = buildMultiWeekGrid(date, { numberOfWeeks: 4 });
      for (const day of grid.weeks.flatMap((w) => w.days)) {
        expect(day.date.getHours()).toBe(0);
        expect(day.date.getMinutes()).toBe(0);
      }
      const days = grid.weeks.flatMap((w) => w.days);
      expect(days).toHaveLength(28);
      expect(grid.period.endExclusive.getHours()).toBe(0);
    }
  });

  it("hides weekdays inside rows without changing the period, and keeps row ids canonical", () => {
    const grid = buildMultiWeekGrid(new Date(2026, 10, 4), {
      numberOfWeeks: 2,
      hiddenDays: [0, 6],
    });
    expect(grid.weeks.map((w) => w.days.length)).toEqual([5, 5]);
    expect(grid.weeks.map((w) => w.id)).toEqual(["2026-11-01", "2026-11-08"]);
    expect(grid.weekdays.map((w) => w.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(grid.period).toEqual({
      start: new Date(2026, 10, 1),
      endExclusive: new Date(2026, 10, 15),
    });
    expect(grid.visibleRange).toEqual({
      start: new Date(2026, 10, 2),
      endExclusive: new Date(2026, 10, 14),
    });
  });

  it("treats hiding every weekday as hiding nothing", () => {
    const grid = buildMultiWeekGrid(new Date(2026, 10, 4), {
      hiddenDays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(grid.weeks.map((w) => w.days.length)).toEqual([7, 7]);
  });

  it("reverses display order for RTL without changing the endpoints", () => {
    const grid = buildMultiWeekGrid(new Date(2026, 10, 4), { isRTL: true, hiddenDays: [5] });
    expect(ids(grid.weeks[0].days)).toEqual([
      "2026-11-07",
      "2026-11-05",
      "2026-11-04",
      "2026-11-03",
      "2026-11-02",
      "2026-11-01",
    ]);
    expect(grid.weekdays[0].label).toBe("Sat");
    expect(grid.weeks[0].id).toBe("2026-11-01");
    expect(grid.visibleRange).toEqual({
      start: new Date(2026, 10, 1),
      endExclusive: new Date(2026, 10, 15),
    });
  });

  it("annotates selection, constraints, today, and weekends", () => {
    const grid = buildMultiWeekGrid(new Date(2026, 10, 4), {
      selectedRange: { start: new Date(2026, 10, 3), end: new Date(2026, 10, 10) },
      minDate: new Date(2026, 10, 2),
      isDateDisabled: (d) => d.getDate() === 12,
      weekdayFormat: "narrow",
    });
    const byId = new Map(grid.weeks.flatMap((w) => w.days).map((d) => [d.id, d]));
    expect(byId.get("2026-11-01")!.isDisabled).toBe(true);
    expect(byId.get("2026-11-01")!.isWeekend).toBe(true);
    expect(byId.get("2026-11-03")!.isRangeStart).toBe(true);
    expect(byId.get("2026-11-07")!.isInRange).toBe(true);
    expect(byId.get("2026-11-10")!.isRangeEnd).toBe(true);
    expect(byId.get("2026-11-12")!.isDisabled).toBe(true);
    expect(byId.get("2026-11-04")!.label).toBe("4");
    expect(grid.weekdays[0].label).toBe("S");
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects a %s week count with a RangeError", (_name, numberOfWeeks) => {
    expect(() => buildMultiWeekGrid(new Date(2026, 10, 4), { numberOfWeeks })).toThrow(
      /numberOfWeeks must be a positive whole number/,
    );
    expect(() => buildMultiWeekGrid(new Date(2026, 10, 4), { numberOfWeeks })).toThrow(RangeError);
  });

  it("rejects a safe count whose end date cannot be represented", () => {
    expect(() => buildMultiWeekGrid(new Date(2026, 10, 4), { numberOfWeeks: 2 ** 40 })).toThrow(
      /cannot be represented/,
    );
  });

  it("rejects an invalid date", () => {
    expect(() => buildMultiWeekGrid(new Date(Number.NaN))).toThrow(RangeError);
  });

  it("scales past a month without a product ceiling", () => {
    const grid = buildMultiWeekGrid(new Date(2026, 0, 1), { numberOfWeeks: 60 });
    expect(grid.weeks).toHaveLength(60);
    expect(grid.period.endExclusive).toEqual(new Date(2027, 1, 21));
  });
});

describe("timed-column helpers reject multiweek", () => {
  it("throws instead of falling back to one day", () => {
    expect(() => viewDayCount("multiweek")).toThrow(/buildMultiWeekGrid/);
    expect(() => getViewDays("multiweek", new Date(2026, 10, 4), 0)).toThrow(/buildMultiWeekGrid/);
    expect(() => pageStepDays("multiweek", new Date(2026, 10, 4), 0)).toThrow(/buildMultiWeekGrid/);
  });

  it("keeps custom as a timed column count above seven", () => {
    expect(getViewDays("custom", new Date(2026, 10, 4), 0, 10)).toHaveLength(10);
  });
});
