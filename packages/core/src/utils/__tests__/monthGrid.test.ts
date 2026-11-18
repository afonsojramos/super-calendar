import type { CalendarEvent } from "../../types";
import {
  buildMonthGrid,
  keepMonthDraftVisible,
  layoutMonthWeek,
  monthExtraLaneColumns,
  monthVisibleBars,
  withDraftEventDays,
} from "../monthGrid";
import { compareDayEvents, groupEventsByDay } from "../layout";

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

describe("per-day month overflow", () => {
  // A Sun-Sat week: 21-27 June 2026, showing two lanes before "+N more".
  const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 21 + i));
  const ev = (title: string, first: number, last = first): CalendarEvent => ({
    title,
    start: new Date(2026, 5, first),
    end: new Date(2026, 5, last + 1),
    allDay: true,
  });
  const visibleLanes = 2;

  it("gives the extra lane to days whose only hidden event is on the first hidden lane", () => {
    // Monday holds four events (two hidden); Tuesday and Wednesday three (one hidden).
    const layout = layoutMonthWeek(days, [
      ev("A", 22, 24),
      ev("B", 22, 24),
      ev("C", 22, 24),
      ev("D", 22),
    ]);
    expect(layout.segments.map((s) => [s.event.title, s.lane])).toEqual([
      ["A", 0],
      ["B", 1],
      ["C", 2],
      ["D", 3],
    ]);
    expect(monthExtraLaneColumns(layout, visibleLanes, 7)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("keeps the label when the one hidden event sits on a lower lane", () => {
    // A, B and C fill Sunday and Monday, so D starts on Monday on lane 3. On
    // Tuesday and Wednesday D is the only hidden event, but lane 2 is empty there.
    const layout = layoutMonthWeek(days, [
      ev("A", 21, 22),
      ev("B", 21, 22),
      ev("C", 21, 22),
      ev("D", 22, 24),
    ]);
    expect(layout.segments.find((s) => s.event.title === "D")?.lane).toBe(3);
    // Only Sunday, whose one hidden event (C) is on lane 2, gets the extra lane.
    expect(monthExtraLaneColumns(layout, visibleLanes, 7)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("returns no extra lanes when nothing is hidden", () => {
    const layout = layoutMonthWeek(days, [ev("A", 22), ev("B", 22)]);
    expect(monthExtraLaneColumns(layout, visibleLanes, 7)).toEqual(Array(7).fill(false));
  });

  it("draws a first-hidden-lane bar only over extra-lane columns, split into runs", () => {
    // "Long" sits on lane 2 from Monday to Friday. Monday and Thursday hide a
    // second event, so it shows on Tuesday-Wednesday and on Friday only.
    const layout = layoutMonthWeek(days, [
      ev("Long", 22, 26),
      ev("A", 22, 26),
      ev("B", 22, 26),
      ev("Mon", 22),
      ev("Thu", 25),
    ]);
    expect(layout.segments.find((s) => s.event.title === "B")?.lane).toBe(2);
    const extra = monthExtraLaneColumns(layout, visibleLanes, 7);
    expect(extra).toEqual([false, false, true, true, false, true, false]);
    const bars = monthVisibleBars(layout, visibleLanes, extra);
    expect(
      bars.map((b) => [
        b.event.title,
        b.lane,
        b.startCol,
        b.endCol,
        b.continuesBefore,
        b.continuesAfter,
      ]),
    ).toEqual([
      ["Long", 0, 1, 5, false, false],
      ["A", 1, 1, 5, false, false],
      ["B", 2, 2, 3, true, true],
      ["B", 2, 5, 5, true, false],
    ]);
  });

  it("keeps a bar's own continuation when the cut leaves its edge alone", () => {
    const layout = layoutMonthWeek(days, [ev("A", 18, 21), ev("B", 18, 21), ev("Edge", 18, 21)]);
    const bars = monthVisibleBars(layout, visibleLanes, [
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(bars.find((b) => b.event.title === "Edge")).toMatchObject({
      startCol: 0,
      endCol: 0,
      continuesBefore: true,
      continuesAfter: false,
    });
  });
});

describe("month create draft placement", () => {
  // A Sun-Sat week: 21-27 June 2026.
  const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 5, 21 + i));
  const allDay = (title: string, first: number, last = first): CalendarEvent => ({
    title,
    start: new Date(2026, 5, first),
    end: new Date(2026, 5, last + 1),
    allDay: true,
  });
  const timed = (title: string, day: number, hour: number): CalendarEvent => ({
    title,
    start: new Date(2026, 5, day, hour),
    end: new Date(2026, 5, day, hour + 1),
  });
  const rowOf = (map: ReadonlyMap<string, CalendarEvent[]>) => {
    const seen = new Set<CalendarEvent>();
    for (const day of days) for (const event of map.get(day.toISOString()) ?? []) seen.add(event);
    return [...seen];
  };
  const sortedDays = (events: CalendarEvent[]) => {
    const map = groupEventsByDay(events);
    for (const list of map.values()) list.sort(compareDayEvents);
    return map;
  };

  it("adds the draft to each day it covers where an appended event would go", () => {
    const morning = timed("Morning", 23, 9);
    const holiday = allDay("Holiday", 23);
    const draft = allDay("", 23, 24);
    const base = sortedDays([morning, holiday]);
    const sorted = withDraftEventDays(base, draft);
    expect(sorted.get(new Date(2026, 5, 23).toISOString())).toEqual([holiday, draft, morning]);
    expect(sorted.get(new Date(2026, 5, 24).toISOString())).toEqual([draft]);
    expect(withDraftEventDays(base, draft, false).get(new Date(2026, 5, 23).toISOString())).toEqual(
      [holiday, morning, draft],
    );
    // The original map is left alone.
    expect(base.get(new Date(2026, 5, 23).toISOString())).toEqual([holiday, morning]);
  });

  it("lays the draft out on the lane the created event will take", () => {
    // Trip starts earlier and keeps lane 0; Lunch starts with the draft but is
    // shorter, so it moves below it, exactly as after the event is created.
    const trip = allDay("Trip", 22, 24);
    const lunch = timed("Lunch", 23, 12);
    const draft = allDay("", 23, 25);
    const placed = layoutMonthWeek(
      days,
      rowOf(withDraftEventDays(sortedDays([trip, lunch]), draft)),
    );
    const created = layoutMonthWeek(days, rowOf(sortedDays([trip, lunch, { ...draft }])));
    expect(placed.segments.map((s) => [s.event.title, s.lane])).toEqual([
      ["Trip", 0],
      ["", 1],
      ["Lunch", 2],
    ]);
    expect(created.segments.map((s) => [s.event.title, s.lane])).toEqual(
      placed.segments.map((s) => [s.event.title, s.lane]),
    );
  });

  it("moves the draft to lane 0 only when its lane would be hidden", () => {
    const a = allDay("A", 22, 24);
    const b = allDay("B", 22, 24);
    const draft = allDay("", 23);
    const withDraft = layoutMonthWeek(days, rowOf(withDraftEventDays(sortedDays([a, b]), draft)));
    const without = layoutMonthWeek(days, rowOf(sortedDays([a, b])));
    expect(withDraft.segments.find((s) => s.event === draft)?.lane).toBe(2);
    // Three lanes fit: the draft keeps the lane it will land on.
    expect(
      keepMonthDraftVisible(withDraft, without, draft, {
        visibleLanes: (count) => Math.min(count, 3),
      }),
    ).toBe(withDraft);
    // Two lanes fit: the draft takes lane 0 and A and B move down.
    const kept = keepMonthDraftVisible(withDraft, without, draft, {
      visibleLanes: (count) => Math.min(count, 2),
    });
    expect(kept.laneCount).toBe(3);
    expect(kept.segments.map((s) => [s.event.title, s.lane, s.startCol, s.endCol])).toEqual([
      ["", 0, 2, 2],
      ["A", 1, 1, 3],
      ["B", 2, 1, 3],
    ]);
    // A row the draft misses is returned as is.
    expect(keepMonthDraftVisible(without, without, draft, { visibleLanes: () => 1 })).toBe(without);
  });

  it("keeps a draft on the first hidden lane where each day draws that lane", () => {
    // A and B cover Monday to Thursday, C and D Monday only. A Thursday draft lands
    // on lane 2, which a cap of three hides, but it is Thursday's only hidden
    // event, so Thursday draws it in place of its label, as it will once created.
    const events = [allDay("A", 22, 25), allDay("B", 22, 25), allDay("C", 22), allDay("D", 22)];
    const draft = allDay("", 25);
    const withDraft = layoutMonthWeek(days, rowOf(withDraftEventDays(sortedDays(events), draft)));
    const without = layoutMonthWeek(days, rowOf(sortedDays(events)));
    expect(withDraft.segments.find((s) => s.event === draft)?.lane).toBe(2);
    const visibleLanes = (count: number) => (count > 3 ? 2 : count);
    expect(
      keepMonthDraftVisible(withDraft, without, draft, {
        visibleLanes,
        extraLaneFits: (shown) => shown < 3,
      }),
    ).toBe(withDraft);
    // Without the per-day lane, the draft moves to lane 0.
    expect(
      keepMonthDraftVisible(withDraft, without, draft, { visibleLanes }).segments.find(
        (s) => s.event === draft,
      )?.lane,
    ).toBe(0);
  });
});
