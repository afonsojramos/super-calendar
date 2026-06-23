import { shiftMinutes, snapDeltaMinutes } from "../drag";

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
