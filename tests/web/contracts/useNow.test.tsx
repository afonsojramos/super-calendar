import { vi } from "vitest";
import { toZonedTime } from "@super-calendar/core/vanilla";
import { rendererName, act, renderNow } from "@calendar-test/renderer";

describe(rendererName, () => {
  describe("useNow", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("ticks the clock every interval while enabled", () => {
      vi.setSystemTime(new Date(2026, 6, 20, 9, 0));
      const { result: now } = renderNow({});
      expect(now().getHours()).toBe(9);
      act(() => {
        vi.advanceTimersByTime(5 * 60_000);
      });
      expect(now().getMinutes()).toBe(5);
    });

    it("pins to a fixed now override without ticking", () => {
      const fixed = new Date(2026, 6, 20, 12, 34);
      const { result: now } = renderNow({ now: fixed });
      act(() => {
        vi.advanceTimersByTime(10 * 60_000);
      });
      expect(now().getTime()).toBe(fixed.getTime());
    });

    it("shifts the instant into the given time zone like eventsInTimeZone", () => {
      const instant = new Date("2026-07-20T12:00:00Z");
      vi.setSystemTime(instant);
      const { result: now } = renderNow({ timeZone: "America/New_York" });
      expect(now().getTime()).toBe(toZonedTime(instant, "America/New_York").getTime());
    });
  });
});
