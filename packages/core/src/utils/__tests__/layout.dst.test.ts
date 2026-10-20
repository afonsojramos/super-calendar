/**
 * @jest-environment ./tests/timezone-environment.js
 * @jest-environment-options {"timeZone": "America/New_York"}
 */
import { cellRangeFromDrag, movedClockSpan, resolveDraggedBounds, shiftMinutes } from "../drag";
import {
  backgroundBandsForDay,
  clockHoursBetween,
  drawnEnd,
  layoutDayEvents,
  wallClockHours,
} from "../layout";
import type { CalendarEvent } from "../../types";

// New York clocks go back at 02:00 on 1 Nov 2026 (a 25-hour day) and forward at
// 02:00 on 8 Mar 2026 (a 23-hour day). Rows follow the clock, not elapsed time.
const fallBack = new Date(2026, 10, 1);
const springForward = new Date(2026, 2, 8);

const ev = (title: string, start: Date, end: Date): CalendarEvent => ({ title, start, end });
const placed = (events: CalendarEvent[], day: Date) =>
  layoutDayEvents(events, day).map((p) => [p.event.title, p.startHours, p.durationHours]);

describe("layout on DST change days", () => {
  it("places events by clock time on a fall-back day", () => {
    const events = [
      ev("1-2", new Date(2026, 10, 1, 1), new Date(2026, 10, 1, 2)),
      ev("10-11", new Date(2026, 10, 1, 10), new Date(2026, 10, 1, 11)),
      ev("23-24", new Date(2026, 10, 1, 23), new Date(2026, 10, 2)),
    ];
    expect(placed(events, fallBack)).toEqual([
      ["1-2", 1, 1],
      ["10-11", 10, 1],
      ["23-24", 23, 1],
    ]);
  });

  it("places events by clock time on a spring-forward day", () => {
    const events = [
      ev("1-3", new Date(2026, 2, 8, 1), new Date(2026, 2, 8, 3)),
      ev("10-11", new Date(2026, 2, 8, 10), new Date(2026, 2, 8, 11)),
    ];
    expect(placed(events, springForward)).toEqual([
      ["1-3", 1, 2],
      ["10-11", 10, 1],
    ]);
  });

  it("clips a multi-day event at the clock's midnight", () => {
    const overnight = ev("overnight", new Date(2026, 9, 31, 22), new Date(2026, 10, 2, 3));
    expect(placed([overnight], fallBack)).toEqual([["overnight", 0, 24]]);
  });

  it("shades background bands by clock time", () => {
    const band = {
      ...ev("busy", new Date(2026, 10, 1, 9), new Date(2026, 10, 1, 17)),
      display: "background" as const,
    };
    expect(backgroundBandsForDay([band], fallBack)).toEqual([
      { event: band, startHours: 9, endHours: 17 },
    ]);
    const spring = { ...band, start: new Date(2026, 2, 8, 9), end: new Date(2026, 2, 8, 17) };
    expect(backgroundBandsForDay([spring], springForward)).toEqual([
      { event: spring, startHours: 9, endHours: 17 },
    ]);
  });

  it("draws a pressed row's time back in that row", () => {
    for (const day of [fallBack, springForward]) {
      // 10:00 at 48 px per hour.
      const range = cellRangeFromDrag(day, 480, 480, 48, 0, 60)!;
      expect(range.start.getHours()).toBe(10);
      expect(layoutDayEvents([ev("new", range.start, range.end)], day)[0].startHours).toBe(10);
    }
  });
});

describe("wallClockHours", () => {
  const dayStart = new Date(2026, 10, 1);
  const nextDayStart = new Date(2026, 10, 2);

  it("reads the clock, including seconds", () => {
    expect(wallClockHours(new Date(2026, 10, 1, 10, 30, 36), dayStart, nextDayStart)).toBe(10.51);
  });

  it("clamps to the day, reading its closing midnight as 24", () => {
    expect(wallClockHours(new Date(2026, 9, 31, 23), dayStart, nextDayStart)).toBe(0);
    expect(wallClockHours(nextDayStart, dayStart, nextDayStart)).toBe(24);
    expect(wallClockHours(new Date(2026, 10, 2, 1), dayStart, nextDayStart)).toBe(24);
  });
});

describe("the repeated fall-back hour", () => {
  // 01:00-02:00 happens twice on 1 Nov 2026: first in EDT (UTC-4), then in EST (UTC-5).
  const edt = (minutes: number) => new Date(Date.UTC(2026, 10, 1, 5, minutes));
  const est = (minutes: number) => new Date(Date.UTC(2026, 10, 1, 6, minutes));

  it("gives a span whose clock runs backwards its elapsed length", () => {
    // 01:30 EDT to 01:00 EST is 30 minutes long.
    const backwards = ev("backwards", edt(30), est(0));
    const inside = ev("inside", edt(35), edt(50));
    const laid = layoutDayEvents([backwards, inside], fallBack);
    expect(laid.map((p) => [p.event.title, p.startHours, p.durationHours, p.columns])).toEqual([
      ["backwards", 1.5, 0.5, 2],
      ["inside", 1 + 35 / 60, 0.25, 2],
    ]);
    expect(laid[0].column).not.toBe(laid[1].column);

    const band = { ...backwards, display: "background" as const };
    expect(backgroundBandsForDay([band], fallBack)).toEqual([
      { event: band, startHours: 1.5, endHours: 2 },
    ]);
  });

  it("keeps the occurrence when shifting by zero minutes", () => {
    expect(shiftMinutes(est(30), 0)).toEqual(est(30));
    expect(shiftMinutes(est(30), 60).getTime()).toBe(est(90).getTime());
  });
});

describe("shiftMinutes across a fall-back change", () => {
  const edt = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 4, minutes));
  const est = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 5, minutes));

  it("picks the repeated clock time nearer the elapsed shift", () => {
    expect(shiftMinutes(edt(0, 30), 60)).toEqual(edt(1, 30));
    expect(shiftMinutes(est(1), 15)).toEqual(est(1, 15));
    expect(shiftMinutes(est(2, 30), -60)).toEqual(est(1, 30));
  });

  it("keeps the clock time when shifting across the change", () => {
    expect(shiftMinutes(edt(0, 30), 120)).toEqual(est(2, 30));
  });
});

describe("clockHoursBetween", () => {
  it("counts clock hours across a change", () => {
    // 01:30 EST to 03:30 EDT on 8 Mar 2026: 1 hour passes, 2 on the clock.
    expect(clockHoursBetween(new Date(2026, 2, 8, 1, 30), new Date(2026, 2, 8, 3, 30))).toBe(2);
    // 01:00 EDT to 02:00 EST on 1 Nov 2026: 2 hours pass, 1 on the clock.
    expect(clockHoursBetween(new Date(2026, 10, 1, 1), new Date(2026, 10, 1, 2))).toBe(1);
  });

  it("falls back to elapsed hours when the clock runs backwards", () => {
    const from = new Date(Date.UTC(2026, 10, 1, 5, 30)); // 01:30 EDT
    const to = new Date(Date.UTC(2026, 10, 1, 6, 0)); // 01:00 EST
    expect(clockHoursBetween(from, to)).toBe(0.5);
  });
});

describe("movedClockSpan", () => {
  it("moves a start in a skipped hour on past it", () => {
    // 04:00-05:00 on 8 Mar 2026 moved back 90 minutes to 02:30, which doesn't exist.
    const moved = movedClockSpan(new Date(2026, 2, 8, 4), new Date(2026, 2, 8, 5), -90);
    expect(moved).toEqual({ startHours: -0.5, hours: 1 });
  });

  it("counts the rows a moved span covers once it gains a change", () => {
    // 04:00-05:00 moved back 150 minutes to 01:30 EST runs to 03:30 EDT.
    const moved = movedClockSpan(new Date(2026, 2, 8, 4), new Date(2026, 2, 8, 5), -150);
    expect(moved).toEqual({ startHours: -2.5, hours: 2 });
  });
});

describe("resizing in the repeated fall-back hour", () => {
  const edt = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 4, minutes));
  const est = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 5, minutes));

  it("draws a backwards span's end its elapsed length from the start", () => {
    // 01:30 EDT to 01:00 EST is drawn 01:30-02:00, so its edge is 02:00 EST.
    expect(drawnEnd(edt(1, 30), est(1))).toEqual(est(2));
    expect(drawnEnd(edt(0, 30), est(1, 30))).toEqual(est(1, 30));
  });

  it("shrinks a backwards span from its drawn edge", () => {
    // Pulling the 02:00 edge up 15 minutes leaves 01:30-01:45 EDT.
    expect(resolveDraggedBounds(edt(1, 30), est(1), 0, -15, 15)).toEqual({
      start: edt(1, 30),
      end: edt(1, 45),
    });
  });

  it("previews a span the move compresses at the layout's minimum", () => {
    // 00:00-01:03 EDT moved an hour later runs 01:00 EDT to 01:03 EST: 3 clock minutes.
    expect(movedClockSpan(edt(0), edt(1, 3), 60).hours).toBe(0.25);
  });
});

describe("extending a span whose clock runs backwards", () => {
  const edt = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 4, minutes));
  const est = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 5, minutes));

  it("moves the end to the row its drawn edge is dragged to", () => {
    // 01:30 EDT to 01:00 EST is drawn to 02:00; dragging that edge to 03:00 ends at 03:00 EST.
    expect(resolveDraggedBounds(edt(1, 30), est(1), 0, 60, 15)).toEqual({
      start: edt(1, 30),
      end: est(3),
    });
  });
});

describe("resize guards in the repeated fall-back hour", () => {
  const edt = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 4, minutes));
  const est = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 5, minutes));

  it("leaves the end alone on a top-edge resize", () => {
    expect(resolveDraggedBounds(edt(1, 30), est(1), 15, 0, 15)).toEqual({
      start: edt(1, 45),
      end: est(1),
    });
  });

  it("refuses an end dragged above the start", () => {
    // 01:30 EDT to 02:30 EST with its bottom edge dragged up to 01:00.
    expect(resolveDraggedBounds(edt(1, 30), est(2, 30), 0, -90, 15)).toBeNull();
  });
});
