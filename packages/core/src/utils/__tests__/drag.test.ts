import type { CalendarEvent } from "../../types";
import {
  cellRangeFromDrag,
  clampMoveStartMinutes,
  eventsOverlap,
  monthCreateRange,
  monthDropBounds,
  overlapsOtherEvents,
  pageStepDays,
  resolveDraggedBounds,
  shiftMinutes,
  snapDeltaMinutes,
} from "../drag";

describe("eventsOverlap", () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 6, h, m);
  it("detects intersecting ranges but not touching edges", () => {
    expect(eventsOverlap(at(9), at(10), at(9, 30), at(11))).toBe(true);
    expect(eventsOverlap(at(9), at(10), at(10), at(11))).toBe(false); // touch at 10:00
    expect(eventsOverlap(at(9), at(10), at(11), at(12))).toBe(false);
  });
  it("treats a zero-length range as the instant it occupies", () => {
    // Two at the same instant collide; apart they don't.
    expect(eventsOverlap(at(9), at(9), at(9), at(9))).toBe(true);
    expect(eventsOverlap(at(9), at(9), at(9, 15), at(9, 15))).toBe(false);
    // Inside a range, or at its start, in either argument order.
    expect(eventsOverlap(at(9, 30), at(9, 30), at(9), at(10))).toBe(true);
    expect(eventsOverlap(at(9), at(10), at(9, 30), at(9, 30))).toBe(true);
    expect(eventsOverlap(at(9), at(9), at(9), at(10))).toBe(true);
    expect(eventsOverlap(at(9), at(10), at(9), at(9))).toBe(true);
    // A range that ends at the instant has already finished.
    expect(eventsOverlap(at(10), at(10), at(9), at(10))).toBe(false);
    expect(eventsOverlap(at(9), at(10), at(10), at(10))).toBe(false);
  });
  it("does not overlap the same wall-clock time on different days", () => {
    expect(eventsOverlap(at(9), at(10), new Date(2026, 0, 7, 9), new Date(2026, 0, 7, 10))).toBe(
      false,
    );
  });
});

describe("overlapsOtherEvents", () => {
  const at = (h: number) => new Date(2026, 0, 6, h);
  const a: CalendarEvent = { start: at(9), end: at(10), title: "A" };
  const b: CalendarEvent = { start: at(11), end: at(12), title: "B" };
  const events = [a, b];
  it("ignores the event being moved and flags a real collision", () => {
    // Move A onto B's slot -> collides with B.
    expect(overlapsOtherEvents(events, a, at(11), at(12))).toBe(true);
    // Move A to a free slot -> no collision (and it doesn't collide with itself).
    expect(overlapsOtherEvents(events, a, at(13), at(14))).toBe(false);
  });
  it("flags a zero-length event dropped on another at the same instant", () => {
    const first: CalendarEvent = { start: at(14), end: at(14), title: "Deadline" };
    const second: CalendarEvent = { start: at(15), end: at(15), title: "Reminder" };
    expect(overlapsOtherEvents([first, second], second, at(14), at(14))).toBe(true);
    expect(overlapsOtherEvents([first, second], second, at(16), at(16))).toBe(false);
  });
});

describe("pageStepDays", () => {
  const date = new Date(2026, 5, 24); // Wed 24 Jun 2026

  it("spans a whole week regardless of hidden days", () => {
    expect(pageStepDays("week", date, 1)).toBe(7);
  });

  it("returns the column count for the count-based views", () => {
    expect(pageStepDays("day", date, 1)).toBe(1);
    expect(pageStepDays("3days", date, 1)).toBe(3);
    expect(pageStepDays("custom", date, 1, 4)).toBe(4);
  });
});

describe("cellRangeFromDrag clamping", () => {
  it("clamps a drag past the grid bottom to the end of the day, not past midnight", () => {
    const day = new Date(2026, 5, 26);
    const range = cellRangeFromDrag(day, 0, 1_000_000, 48, 0, 15);
    expect(range).not.toBeNull();
    // End is exactly the next midnight (24:00), never spilling into the next day.
    expect(range?.end.getTime()).toBe(new Date(2026, 5, 27).getTime());
    expect(range?.start.getTime()).toBe(day.getTime());
  });
});

describe("snapDeltaMinutes", () => {
  // 64px per hour grid, snapping to 15-minute steps.
  it("snaps a one-hour drag to 60 minutes", () => {
    expect(snapDeltaMinutes(64, 64, 15)).toBe(60);
  });

  it("snaps to the nearest step", () => {
    expect(snapDeltaMinutes(16, 64, 15)).toBe(15); // exactly 15 min
    expect(snapDeltaMinutes(5, 64, 15)).toBe(0); // ~4.7 min rounds to 0
    expect(snapDeltaMinutes(10, 64, 15)).toBe(15); // ~9.4 min rounds up
  });

  it("handles upward (negative) drags", () => {
    expect(snapDeltaMinutes(-64, 64, 15)).toBe(-60);
    expect(snapDeltaMinutes(-32, 64, 30)).toBe(-30);
  });

  it("respects a coarser step", () => {
    expect(snapDeltaMinutes(64, 64, 30)).toBe(60);
    expect(snapDeltaMinutes(40, 64, 30)).toBe(30); // ~37.5 min rounds to 30
  });

  it("returns 0 for a degenerate grid", () => {
    expect(snapDeltaMinutes(50, 0, 15)).toBe(0);
    expect(snapDeltaMinutes(50, 64, 0)).toBe(0);
  });
});

describe("clampMoveStartMinutes", () => {
  it("leaves a start inside the window alone", () => {
    expect(clampMoveStartMinutes(9 * 60, 0, 24, 15)).toBe(9 * 60);
  });

  it("lets the start reach one step before the end of the day", () => {
    // The end is free to run past midnight, so only the start is held back.
    expect(clampMoveStartMinutes(26 * 60, 0, 24, 15)).toBe(24 * 60 - 15);
    expect(clampMoveStartMinutes(23 * 60 + 45, 0, 24, 15)).toBe(23 * 60 + 45);
  });

  it("holds the start at the top of the window", () => {
    expect(clampMoveStartMinutes(-120, 0, 24, 15)).toBe(0);
    expect(clampMoveStartMinutes(7 * 60, 8, 18, 15)).toBe(8 * 60);
  });

  it("respects a narrowed window and the snap step", () => {
    expect(clampMoveStartMinutes(20 * 60, 8, 18, 30)).toBe(18 * 60 - 30);
  });

  it("never inverts when the step is wider than the window", () => {
    expect(clampMoveStartMinutes(12 * 60, 9, 10, 120)).toBe(9 * 60);
  });

  it("lets a start run before midnight when the duration is given", () => {
    // A 3h event moved to 22:00 the day before still ends at 01:00 on this day.
    expect(clampMoveStartMinutes(-120, 0, 24, 15, 180)).toBe(-120);
  });

  it("keeps one snap step of the event after midnight", () => {
    // The end stops at 00:15, mirroring the start stopping at 23:45.
    expect(clampMoveStartMinutes(-600, 0, 24, 15, 60)).toBe(-45);
    // A duration off the step grid still lands the start on it, ending at 00:20.
    expect(clampMoveStartMinutes(-600, 0, 24, 15, 50)).toBe(-30);
  });

  it("holds an event no longer than one step at midnight", () => {
    expect(clampMoveStartMinutes(-60, 0, 24, 15, 15)).toBe(0);
    expect(clampMoveStartMinutes(-60, 0, 24, 15, 0)).toBe(0);
    // Less than two steps long: no whole step fits before midnight.
    expect(clampMoveStartMinutes(-60, 0, 24, 15, 20)).toBe(0);
  });

  it("holds the start at a window that opens after midnight", () => {
    expect(clampMoveStartMinutes(-120, 8, 18, 15, 600)).toBe(8 * 60);
    expect(clampMoveStartMinutes(7 * 60, 8, 18, 15, 120)).toBe(8 * 60);
  });

  it("keeps the downward limit when the duration is given", () => {
    expect(clampMoveStartMinutes(26 * 60, 0, 24, 15, 240)).toBe(24 * 60 - 15);
  });
});

describe("shiftMinutes", () => {
  it("shifts forward without mutating the input", () => {
    const start = new Date(2026, 0, 1, 9, 0, 0);
    const shifted = shiftMinutes(start, 90);
    expect(shifted.getHours()).toBe(10);
    expect(shifted.getMinutes()).toBe(30);
    expect(start.getHours()).toBe(9); // original untouched
  });

  it("shifts backward across the hour", () => {
    const shifted = shiftMinutes(new Date(2026, 0, 1, 9, 0, 0), -15);
    expect(shifted.getHours()).toBe(8);
    expect(shifted.getMinutes()).toBe(45);
  });
});

describe("resolveDraggedBounds", () => {
  // A one-hour event, 15-minute snap.
  const start = new Date(2026, 0, 1, 9, 0, 0);
  const end = new Date(2026, 0, 1, 10, 0, 0);

  it("moves both edges by the same delta", () => {
    const next = resolveDraggedBounds(start, end, 30, 30, 15);
    expect(next).not.toBeNull();
    expect(next?.start.getHours()).toBe(9);
    expect(next?.start.getMinutes()).toBe(30);
    expect(next?.end.getHours()).toBe(10);
    expect(next?.end.getMinutes()).toBe(30);
  });

  it.each([
    [new Date(2026, 2, 28, 17), new Date(2026, 2, 30, 21)],
    [new Date(2026, 9, 24, 17), new Date(2026, 9, 26, 21)],
  ])("preserves elapsed duration when moving a range across a clock change", (start, end) => {
    for (const delta of [-1440, 1440]) {
      const next = resolveDraggedBounds(start, end, delta, delta, 15);
      expect(next?.start).toEqual(shiftMinutes(start, delta));
      expect(next!.end.getTime() - next!.start.getTime()).toBe(end.getTime() - start.getTime());
    }
  });

  it("resizes by moving only the end edge", () => {
    const next = resolveDraggedBounds(start, end, 0, 30, 15);
    expect(next?.start.getTime()).toBe(start.getTime()); // start untouched
    expect(next?.end.getHours()).toBe(10);
    expect(next?.end.getMinutes()).toBe(30);
  });

  it("does not mutate the inputs", () => {
    resolveDraggedBounds(start, end, 30, 30, 15);
    expect(start.getHours()).toBe(9);
    expect(end.getHours()).toBe(10);
  });

  it("returns null when a resize collapses below one step", () => {
    // Drag the end edge up by 50 min: a 10-min duration, under the 15-min step.
    expect(resolveDraggedBounds(start, end, 0, -50, 15)).toBeNull();
  });

  it("allows a resize down to exactly one step", () => {
    // 45 min up leaves a 15-min duration — exactly the step, so it commits.
    const next = resolveDraggedBounds(start, end, 0, -45, 15);
    expect(next).not.toBeNull();
    expect(next?.end.getMinutes()).toBe(15);
  });

  it("never rejects a pure move, however large", () => {
    // Both edges shift together, so the duration is preserved.
    expect(resolveDraggedBounds(start, end, -600, -600, 15)).not.toBeNull();
  });

  it("moves an event already shorter than one step without rejecting it", () => {
    // A 10-minute event (under the 15-min step) can still be moved: a move keeps
    // the duration, so the collapse guard (which is for shrinking resizes) must
    // not fire. Previously this was wrongly rejected.
    const short = new Date(2026, 0, 1, 9, 10, 0); // 9:00–9:10, 10 min
    const moved = resolveDraggedBounds(start, short, 30, 30, 15);
    if (!moved) throw new Error("expected the move to be accepted");
    expect(moved.start.getMinutes()).toBe(30);
    expect(moved.end.getTime() - moved.start.getTime()).toBe(10 * 60_000);
  });

  it("moves and extends a zero-length event", () => {
    const moved = resolveDraggedBounds(start, start, -45, -45, 15);
    expect(moved?.start).toEqual(new Date(2026, 0, 1, 8, 15));
    expect(moved?.end).toEqual(moved?.start);
    const extended = resolveDraggedBounds(start, start, 0, 15, 15);
    expect(extended).toEqual({ start, end: new Date(2026, 0, 1, 9, 15) });
  });

  it("still rejects shrinking a sub-step event further", () => {
    const short = new Date(2026, 0, 1, 9, 10, 0);
    expect(resolveDraggedBounds(start, short, 0, -5, 15)).toBeNull();
  });
});

describe("cellRangeFromDrag", () => {
  // A grid starting at midnight (minHour 0), 64px per hour, 15-minute snap.
  const day = new Date(2026, 0, 1);

  it("maps a downward drag to a snapped start/end on the day", () => {
    // 9:00 (576px) down to 10:30 (672px).
    const range = cellRangeFromDrag(day, 576, 672, 64, 0, 15);
    expect(range?.start.getHours()).toBe(9);
    expect(range?.start.getMinutes()).toBe(0);
    expect(range?.end.getHours()).toBe(10);
    expect(range?.end.getMinutes()).toBe(30);
  });

  it("orders an upward drag so start is always before end", () => {
    const range = cellRangeFromDrag(day, 672, 576, 64, 0, 15);
    expect(range?.start.getHours()).toBe(9);
    expect(range?.end.getHours()).toBe(10);
    expect(range?.end.getMinutes()).toBe(30);
  });

  it("snaps both ends to the step", () => {
    // 9:05 (581px) to 9:50 (629px) snaps to 9:00–9:45.
    const range = cellRangeFromDrag(day, 581, 629, 64, 0, 15);
    expect(range?.start.getMinutes()).toBe(0);
    expect(range?.end.getMinutes()).toBe(45);
  });

  it("widens a stationary press to one step", () => {
    const range = cellRangeFromDrag(day, 576, 576, 64, 0, 15);
    expect(range?.start.getHours()).toBe(9);
    expect(range?.end.getHours()).toBe(9);
    expect(range?.end.getMinutes()).toBe(15);
  });

  it("accounts for a non-zero minHour offset", () => {
    // minHour 8: y=0 is the 8:00 line, so 64px down is 9:00.
    const range = cellRangeFromDrag(day, 0, 64, 64, 8, 15);
    expect(range?.start.getHours()).toBe(8);
    expect(range?.end.getHours()).toBe(9);
  });

  it("returns null for a degenerate grid", () => {
    expect(cellRangeFromDrag(day, 100, 200, 0, 0, 15)).toBeNull();
    expect(cellRangeFromDrag(day, 100, 200, 64, 0, 0)).toBeNull();
  });
});

describe("monthCreateRange", () => {
  it("spans the swept days, ending at midnight after the last", () => {
    const range = monthCreateRange(new Date(2026, 6, 6, 13, 30), new Date(2026, 6, 8, 4));
    expect(range.start).toEqual(new Date(2026, 6, 6));
    expect(range.end).toEqual(new Date(2026, 6, 9));
  });

  it("orders a backwards sweep the same way", () => {
    const forward = monthCreateRange(new Date(2026, 6, 6), new Date(2026, 6, 8));
    const backward = monthCreateRange(new Date(2026, 6, 8), new Date(2026, 6, 6));
    expect(backward).toEqual(forward);
  });

  it("yields a single whole day when the sweep never leaves its cell", () => {
    const range = monthCreateRange(new Date(2026, 6, 6, 9), new Date(2026, 6, 6, 17));
    expect(range.start).toEqual(new Date(2026, 6, 6));
    expect(range.end).toEqual(new Date(2026, 6, 7));
  });
});

describe("monthDropBounds", () => {
  const event: CalendarEvent = {
    title: "Standup",
    start: new Date(2026, 6, 6, 9, 30),
    end: new Date(2026, 6, 6, 10, 15),
  };

  it("shifts both ends by the days dragged, keeping the time of day", () => {
    const next = monthDropBounds(event, new Date(2026, 6, 6), new Date(2026, 6, 9));
    expect(next?.start).toEqual(new Date(2026, 6, 9, 9, 30));
    expect(next?.end).toEqual(new Date(2026, 6, 9, 10, 15));
  });

  it("moves backwards and across a month boundary", () => {
    const next = monthDropBounds(event, new Date(2026, 6, 6), new Date(2026, 5, 30));
    expect(next?.start).toEqual(new Date(2026, 5, 30, 9, 30));
    expect(next?.end).toEqual(new Date(2026, 5, 30, 10, 15));
  });

  it("keeps a multi-day event's duration", () => {
    const trip: CalendarEvent = {
      title: "Trip",
      start: new Date(2026, 6, 6, 8),
      end: new Date(2026, 6, 10, 20),
    };
    const next = monthDropBounds(trip, new Date(2026, 6, 8), new Date(2026, 6, 10));
    expect(next?.start).toEqual(new Date(2026, 6, 8, 8));
    expect(next?.end).toEqual(new Date(2026, 6, 12, 20));
  });

  it("returns null when the drop lands on the day it started", () => {
    expect(monthDropBounds(event, new Date(2026, 6, 6, 1), new Date(2026, 6, 6, 23))).toBeNull();
  });
});
