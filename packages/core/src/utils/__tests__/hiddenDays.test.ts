import { buildMonthWeeks, filterHiddenDays, getViewDays } from "../dates";

const WEEKEND = [0, 6];
const monday = new Date(2026, 6, 20); // Monday, 20 July 2026

describe("hiddenDays", () => {
  it("drops hidden weekdays from a week view", () => {
    const days = getViewDays("week", monday, 1, 1, false, undefined, WEEKEND);
    expect(days).toHaveLength(5);
    expect(days.every((d) => d.getDay() !== 0 && d.getDay() !== 6)).toBe(true);
  });

  it("keeps the column count of count-based views by skipping hidden days", () => {
    const friday = new Date(2026, 6, 24);
    const days = getViewDays("3days", friday, 1, 1, false, undefined, WEEKEND);
    expect(days.map((d) => d.getDate())).toEqual([24, 27, 28]); // Fri, Mon, Tue
  });

  it("starts from the next visible day when the anchor is hidden", () => {
    const saturday = new Date(2026, 6, 25);
    const days = getViewDays("day", saturday, 1, 1, false, undefined, WEEKEND);
    expect(days[0].getDate()).toBe(27); // Monday
  });

  it("treats a fully-hidden week as hide nothing", () => {
    const days = getViewDays("week", monday, 1, 1, false, undefined, [0, 1, 2, 3, 4, 5, 6]);
    expect(days).toHaveLength(7);
  });

  it("drops hidden weekdays from month weeks and the filter helper", () => {
    const weeks = buildMonthWeeks(monday, 1, { hiddenDays: WEEKEND });
    expect(weeks.every((week) => week.length === 5)).toBe(true);
    expect(filterHiddenDays(weeks[0], [1])).toHaveLength(4);
  });
});
