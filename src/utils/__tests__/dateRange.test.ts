import {
  type DateRange,
  daySelectionState,
  isDateSelectable,
  isRangeEndpoint,
  isWithinDateRange,
  nextDateRange,
} from "../dateRange";

const day = (d: number) => new Date(2026, 5, d, 9); // June 2026, 09:00

describe("isDateSelectable", () => {
  it("allows any day with no constraints", () => {
    expect(isDateSelectable(day(15))).toBe(true);
  });

  it("rejects days before minDate (inclusive)", () => {
    expect(isDateSelectable(day(9), { minDate: day(10) })).toBe(false);
    expect(isDateSelectable(day(10), { minDate: day(10) })).toBe(true);
  });

  it("rejects days after maxDate (inclusive)", () => {
    expect(isDateSelectable(day(21), { maxDate: day(20) })).toBe(false);
    expect(isDateSelectable(day(20), { maxDate: day(20) })).toBe(true);
  });

  it("compares by calendar day, ignoring time of day", () => {
    expect(isDateSelectable(new Date(2026, 5, 10, 23), { minDate: new Date(2026, 5, 10, 0) })).toBe(
      true,
    );
  });

  it("honours isDateDisabled", () => {
    const isDateDisabled = (d: Date) => d.getDate() === 15;
    expect(isDateSelectable(day(15), { isDateDisabled })).toBe(false);
    expect(isDateSelectable(day(16), { isDateDisabled })).toBe(true);
  });
});

describe("nextDateRange", () => {
  it("opens a new range from no selection", () => {
    const next = nextDateRange(null, day(10));
    expect(next).toEqual({ start: new Date(2026, 5, 10), end: null });
  });

  it("normalises endpoints to the start of the day", () => {
    const next = nextDateRange(null, day(10));
    expect(next?.start.getHours()).toBe(0);
  });

  it("closes an open range with a later press", () => {
    const open: DateRange = { start: new Date(2026, 5, 10), end: null };
    expect(nextDateRange(open, day(14))).toEqual({
      start: new Date(2026, 5, 10),
      end: new Date(2026, 5, 14),
    });
  });

  it("auto-swaps when the second press precedes the first", () => {
    const open: DateRange = { start: new Date(2026, 5, 14), end: null };
    expect(nextDateRange(open, day(10))).toEqual({
      start: new Date(2026, 5, 10),
      end: new Date(2026, 5, 14),
    });
  });

  it("resets to a fresh range on the third press", () => {
    const complete: DateRange = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };
    expect(nextDateRange(complete, day(20))).toEqual({ start: new Date(2026, 5, 20), end: null });
  });

  it("keeps the current range when the press is rejected", () => {
    const open: DateRange = { start: new Date(2026, 5, 10), end: null };
    expect(nextDateRange(open, day(5), { minDate: day(8) })).toBe(open);
  });

  it("rejects a disabled first press", () => {
    expect(nextDateRange(null, day(15), { isDateDisabled: (d) => d.getDate() === 15 })).toBeNull();
  });
});

describe("isRangeEndpoint", () => {
  const range: DateRange = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };

  it("matches either endpoint", () => {
    expect(isRangeEndpoint(day(10), range)).toBe(true);
    expect(isRangeEndpoint(day(14), range)).toBe(true);
  });

  it("ignores days inside the range", () => {
    expect(isRangeEndpoint(day(12), range)).toBe(false);
  });

  it("matches the lone start of an open range", () => {
    expect(isRangeEndpoint(day(10), { start: new Date(2026, 5, 10), end: null })).toBe(true);
  });

  it("is false for a null range", () => {
    expect(isRangeEndpoint(day(10), null)).toBe(false);
  });
});

describe("isWithinDateRange", () => {
  const range: DateRange = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };

  it("includes endpoints and interior days", () => {
    expect(isWithinDateRange(day(10), range)).toBe(true);
    expect(isWithinDateRange(day(12), range)).toBe(true);
    expect(isWithinDateRange(day(14), range)).toBe(true);
  });

  it("excludes days outside the range", () => {
    expect(isWithinDateRange(day(9), range)).toBe(false);
    expect(isWithinDateRange(day(15), range)).toBe(false);
  });

  it("is false for an open or null range", () => {
    expect(isWithinDateRange(day(10), { start: new Date(2026, 5, 10), end: null })).toBe(false);
    expect(isWithinDateRange(day(10), null)).toBe(false);
  });
});

describe("daySelectionState", () => {
  const range: DateRange = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };

  it("flags nothing without selection or constraints", () => {
    expect(daySelectionState(day(12), {})).toEqual({
      isDisabled: false,
      isSelected: false,
      isInRange: false,
      isRangeStart: false,
      isRangeEnd: false,
    });
  });

  it("marks a discrete selected day", () => {
    expect(daySelectionState(day(12), { selectedDates: [day(12)] })).toMatchObject({
      isSelected: true,
      isInRange: false,
    });
  });

  it("marks range endpoints and interior", () => {
    expect(daySelectionState(day(10), { selectedRange: range })).toMatchObject({
      isRangeStart: true,
      isRangeEnd: false,
      isSelected: true,
      isInRange: true,
    });
    expect(daySelectionState(day(14), { selectedRange: range })).toMatchObject({
      isRangeEnd: true,
      isSelected: true,
    });
    expect(daySelectionState(day(12), { selectedRange: range })).toMatchObject({
      isSelected: false,
      isInRange: true,
    });
  });

  it("never selects a disabled day, even when in the selection", () => {
    const state = daySelectionState(
      day(10),
      { selectedRange: range, selectedDates: [day(10)] },
      { minDate: day(11) },
    );
    expect(state).toMatchObject({
      isDisabled: true,
      isSelected: false,
      isInRange: false,
      isRangeStart: false,
    });
  });
});
