import { cellRangeFromDrag, resolveDraggedBounds, shiftMinutes, snapDeltaMinutes } from "../drag";

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
