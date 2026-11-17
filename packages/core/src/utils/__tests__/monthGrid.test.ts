import type { CalendarEvent } from "../../types";
import { buildMonthGrid, layoutMonthWeek } from "../monthGrid";

describe("layoutMonthWeek", () => {
  // A Sun-Sat week: 21-27 June 2026.
  const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 21 + i));
  const ev = (title: string, s: [number, number?], e: [number, number?]): CalendarEvent => ({
    title,
    start: new Date(2026, 5, s[0], s[1] ?? 0),
    end: new Date(2026, 5, e[0], e[1] ?? 0),
  });

  it("spans a multi-day event as one segment across its columns", () => {
    // Tue 23 -> Thu 25 (end midnight Fri 26 -> covers through Thu 25).
    const { segments } = layoutMonthWeek(days, [ev("Trip", [23], [26])]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      startCol: 2,
      endCol: 4,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it("clips a bar to the row edges and marks it continuing", () => {
    // Starts before the row (18) and ends after it (30 next month-ish).
    const { segments } = layoutMonthWeek(days, [ev("Long", [18], [30])]);
    expect(segments[0]).toMatchObject({
      startCol: 0,
      endCol: 6,
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it("stacks overlapping events into separate lanes, longest on top", () => {
    const { segments, laneCount } = layoutMonthWeek(days, [
      ev("A", [22], [25]), // Mon-Wed
      ev("B", [23], [24]), // Tue (overlaps A)
    ]);
    expect(laneCount).toBe(2);
    const a = segments.find((s) => s.event.title === "A");
    const b = segments.find((s) => s.event.title === "B");
    expect(a?.lane).toBe(0);
    expect(b?.lane).toBe(1);
  });

  it("reuses a lane for non-overlapping events", () => {
    const { laneCount } = layoutMonthWeek(days, [
      ev("A", [21], [22]), // Sun
      ev("B", [24], [25]), // Wed (no overlap)
    ]);
    expect(laneCount).toBe(1);
  });

  it("lays out a reversed (RTL) week with columns and edge-mapped continues", () => {
    const rtl = [...days].reverse(); // Sat 27 … Sun 21
    // Starts before the row (18) and ends Wed 24 (covers 21-24).
    const { segments } = layoutMonthWeek(rtl, [ev("Long", [18], [25])]);
    expect(segments).toHaveLength(1);
    // Days 21-24 sit at the right end of the reversed array (indices 3..6), and
    // the clipped (chronologically-before) end squares the array's right edge.
    expect(segments[0]).toMatchObject({
      startCol: 3,
      endCol: 6,
      continuesBefore: false,
      continuesAfter: true,
    });
  });

  it("skips an event that only falls on a hidden interior day", () => {
    // Mon/Tue/Thu/Fri week (Wed 24 dropped): a Wed-only event has no column here.
    const noWed = [days[1], days[2], days[4], days[5]];
    const { segments } = layoutMonthWeek(noWed, [ev("Wed", [24], [25])]);
    expect(segments).toHaveLength(0);
  });
});

const month = new Date(2026, 5, 15); // June 2026

const findDay = (g: ReturnType<typeof buildMonthGrid>, id: string) =>
  g.weeks.flatMap((w) => w.days).find((d) => d.id === id);

describe("buildMonthGrid", () => {
  it("returns whole weeks and seven weekday labels", () => {
    const g = buildMonthGrid(month, { weekStartsOn: 1 });
    expect(g.weeks.every((w) => w.days.length === 7)).toBe(true);
    expect(g.weekdays.map((w) => w.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("flags current-month vs adjacent days", () => {
    const g = buildMonthGrid(month, { weekStartsOn: 0 });
    expect(findDay(g, "2026-06-15")?.isCurrentMonth).toBe(true);
    expect(findDay(g, "2026-05-31")?.isCurrentMonth).toBe(false);
  });

  it("annotates range endpoints, interior and outside days", () => {
    const g = buildMonthGrid(month, {
      selectedRange: { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) },
    });
    expect(findDay(g, "2026-06-10")).toMatchObject({
      isRangeStart: true,
      isSelected: true,
      isInRange: true,
    });
    expect(findDay(g, "2026-06-12")).toMatchObject({ isSelected: false, isInRange: true });
    expect(findDay(g, "2026-06-14")).toMatchObject({ isRangeEnd: true, isSelected: true });
    expect(findDay(g, "2026-06-16")).toMatchObject({ isInRange: false, isSelected: false });
  });

  it("marks disabled days and never selects them", () => {
    const g = buildMonthGrid(month, {
      minDate: new Date(2026, 5, 10),
      selectedDates: [new Date(2026, 5, 5)],
    });
    expect(findDay(g, "2026-06-05")).toMatchObject({ isDisabled: true, isSelected: false });
    expect(findDay(g, "2026-06-15")?.isDisabled).toBe(false);
  });
});

describe("buildMonthGrid today", () => {
  const flagged = (today?: Date) =>
    buildMonthGrid(new Date(2026, 10, 12), { today })
      .weeks.flatMap((week) => week.days)
      .filter((day) => day.isToday)
      .map((day) => day.id);

  it("flags the given day instead of the device's", () => {
    expect(flagged(new Date(2026, 10, 13, 7))).toEqual(["2026-11-13"]);
  });

  it("flags nothing when the given day is outside the grid", () => {
    expect(flagged(new Date(2030, 0, 1))).toEqual([]);
  });
});
