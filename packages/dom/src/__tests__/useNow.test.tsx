import { act, renderHook } from "@testing-library/react";
import { toZonedTime, useNow } from "@super-calendar/core";

describe("useNow", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("ticks the clock every interval while enabled", () => {
    jest.setSystemTime(new Date(2026, 6, 20, 9, 0));
    const { result } = renderHook(() => useNow(true));
    expect(result.current.getHours()).toBe(9);
    // Modern fake timers advance the mocked clock along with the interval.
    act(() => {
      jest.advanceTimersByTime(5 * 60_000);
    });
    expect(result.current.getMinutes()).toBe(5);
  });

  it("pins to a fixed now override without ticking", () => {
    const fixed = new Date(2026, 6, 20, 12, 34);
    const { result } = renderHook(() => useNow(true, { now: fixed }));
    act(() => jest.advanceTimersByTime(10 * 60_000));
    expect(result.current.getTime()).toBe(fixed.getTime());
  });

  it("shifts the instant into the given time zone like eventsInTimeZone", () => {
    const instant = new Date("2026-07-20T12:00:00Z");
    jest.setSystemTime(instant);
    const { result } = renderHook(() => useNow(true, { timeZone: "America/New_York" }));
    expect(result.current.getTime()).toBe(toZonedTime(instant, "America/New_York").getTime());
  });
});
