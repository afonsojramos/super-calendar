import {
  closedHourBands,
  compareDayEvents,
  eventDayKeys,
  groupEventsByDay,
  isAllDayEvent,
  isAllDayLaneEvent,
  layoutDayEvents,
} from "../layout";
import type { CalendarEvent } from "../../types";

describe("closedHourBands", () => {
  const day = new Date(2026, 5, 26);

  it("returns no bands when the callback is undefined or returns undefined", () => {
    expect(closedHourBands(day, undefined)).toEqual([]);
    expect(closedHourBands(day, () => undefined as never)).toEqual([]);
  });

  it("shades the whole window when the day is closed (null)", () => {
    expect(closedHourBands(day, () => null, 0, 24)).toEqual([{ start: 0, end: 24 }]);
  });

  it("shades before open and after close, clamped to the window", () => {
    expect(closedHourBands(day, () => ({ start: 9, end: 17 }), 0, 24)).toEqual([
      { start: 0, end: 9 },
      { start: 17, end: 24 },
    ]);
    // Open hours wider than the window collapse to no bands.
    expect(closedHourBands(day, () => ({ start: 0, end: 24 }), 8, 18)).toEqual([]);
  });

  it("emits no leading/trailing band when open hours touch the window edge", () => {
    // Open from the window start: no leading band.
    expect(closedHourBands(day, () => ({ start: 8, end: 24 }), 8, 24)).toEqual([]);
    // Open until the window end: no trailing band.
    expect(closedHourBands(day, () => ({ start: 0, end: 18 }), 0, 18)).toEqual([]);
  });

  it("treats inverted or empty open hours as fully closed", () => {
    expect(closedHourBands(day, () => ({ start: 17, end: 9 }), 0, 24)).toEqual([
      { start: 0, end: 24 },
    ]);
    expect(closedHourBands(day, () => ({ start: 12, end: 12 }), 0, 24)).toEqual([
      { start: 0, end: 24 },
    ]);
  });

  it("shades the gap between multiple open windows (a lunch break)", () => {
    expect(
      closedHourBands(
        day,
        () => [
          { start: 9, end: 12 },
          { start: 13, end: 17 },
        ],
        0,
        24,
      ),
    ).toEqual([
      { start: 0, end: 9 },
      { start: 12, end: 13 },
      { start: 17, end: 24 },
    ]);
  });

  it("merges overlapping or touching windows and drops empty ones", () => {
    // 9-12 and 11-15 overlap into 9-15; the 16-16 window is empty and ignored.
    expect(
      closedHourBands(
        day,
        () => [
          { start: 11, end: 15 },
          { start: 9, end: 12 },
          { start: 16, end: 16 },
        ],
        0,
        24,
      ),
    ).toEqual([
      { start: 0, end: 9 },
      { start: 15, end: 24 },
    ]);
  });

  it("shades the whole window when every open window is empty", () => {
    expect(closedHourBands(day, () => [], 0, 24)).toEqual([{ start: 0, end: 24 }]);
  });
});

describe("groupEventsByDay", () => {
  const key = (d: Date) => {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return s.toISOString();
  };

  it("indexes events under each day they touch", () => {
    const single: CalendarEvent = {
      title: "A",
      start: new Date(2026, 5, 26, 9),
      end: new Date(2026, 5, 26, 10),
    };
    const span: CalendarEvent = {
      title: "B",
      start: new Date(2026, 5, 26),
      end: new Date(2026, 5, 28),
    };
    const map = groupEventsByDay([single, span]);
    expect(map.get(key(new Date(2026, 5, 26)))).toEqual([single, span]);
    expect(map.get(key(new Date(2026, 5, 27)))).toEqual([span]);
    // End at midnight of the 28th does not include the 28th.
    expect(map.get(key(new Date(2026, 5, 28)))).toBeUndefined();
  });
});

describe("compareDayEvents", () => {
  const timed = (h: number, title: string): CalendarEvent => ({
    title,
    start: new Date(2026, 5, 26, h),
    end: new Date(2026, 5, 26, h + 1),
  });
  const allDay = (title: string): CalendarEvent => ({
    title,
    start: new Date(2026, 5, 26),
    end: new Date(2026, 5, 27),
    allDay: true,
  });

  it("puts all-day events before timed events", () => {
    const morning = timed(9, "Morning");
    const holiday = allDay("Holiday");
    expect([morning, holiday].sort(compareDayEvents)).toEqual([holiday, morning]);
  });

  it("orders timed events by start time", () => {
    const a = timed(9, "A");
    const b = timed(14, "B");
    expect([b, a].sort(compareDayEvents)).toEqual([a, b]);
  });

  it("keeps all-day events ahead even when their start is later in the day", () => {
    // An explicit all-day flag wins regardless of the start clock time.
    const lateAllDay: CalendarEvent = {
      title: "All day",
      start: new Date(2026, 5, 26, 15),
      end: new Date(2026, 5, 26, 16),
      allDay: true,
    };
    const early = timed(8, "Early");
    expect([early, lateAllDay].sort(compareDayEvents)).toEqual([lateAllDay, early]);
  });
});

const at = (h: number, m = 0) => new Date(2026, 5, 15, h, m); // 15 Jun 2026, local
const ev = (startH: number, endH: number, id?: string): CalendarEvent<{ id?: string }> => ({
  id,
  start: at(startH),
  end: at(endH),
});

describe("layoutDayEvents", () => {
  const day = at(0);

  it("returns an empty array when there are no events that day", () => {
    expect(layoutDayEvents([], day)).toEqual([]);
  });

  it("excludes events from other days", () => {
    const other: CalendarEvent = {
      start: new Date(2026, 5, 16, 10),
      end: new Date(2026, 5, 16, 11),
    };
    expect(layoutDayEvents([other], day)).toEqual([]);
  });

  it("excludes all-day events (they belong in the lane)", () => {
    const allDayFlag: CalendarEvent = { start: at(9), end: at(10), allDay: true };
    const midnightSpan: CalendarEvent = { start: at(0), end: new Date(2026, 5, 16, 0) };
    const timed = ev(10, 11);
    const result = layoutDayEvents([allDayFlag, midnightSpan, timed], day);
    expect(result).toHaveLength(1);
    expect(result[0].startHours).toBe(10);
  });

  it("places a single event in column 0 of a single column", () => {
    const [positioned] = layoutDayEvents([ev(10, 11)], day);
    expect(positioned).toMatchObject({ column: 0, columns: 1, startHours: 10, durationHours: 1 });
  });

  it("computes fractional start and duration", () => {
    const [positioned] = layoutDayEvents([{ start: at(9, 30), end: at(10, 15) }], day);
    expect(positioned.startHours).toBeCloseTo(9.5);
    expect(positioned.durationHours).toBeCloseTo(0.75);
  });

  it("clamps non-positive durations to a minimum sliver", () => {
    const [positioned] = layoutDayEvents([{ start: at(10), end: at(10) }], day);
    expect(positioned.durationHours).toBeCloseTo(0.25);
  });

  describe("events shorter than the minimum box", () => {
    const point = (h: number, m = 0, id?: string): CalendarEvent<{ id?: string }> => ({
      id,
      start: at(h, m),
      end: at(h, m),
    });

    it("places zero-length events at the same time side by side", () => {
      const result = layoutDayEvents([point(7, 30), point(7, 30)], day);
      expect(result.map((p) => [p.column, p.columns])).toEqual([
        [0, 2],
        [1, 2],
      ]);
    });

    it("places a zero-length event beside the event that starts with it", () => {
      const result = layoutDayEvents([point(9, 0, "point"), ev(9, 10, "long")], day);
      expect(result.map((p) => p.columns)).toEqual([2, 2]);
      expect(result.map((p) => p.column).sort((a, b) => a - b)).toEqual([0, 1]);
    });

    it("keeps a zero-length event under the event that ends as it starts", () => {
      const result = layoutDayEvents([ev(8, 9), point(9)], day);
      expect(result.map((p) => [p.column, p.columns])).toEqual([
        [0, 1],
        [0, 1],
      ]);
    });

    it("separates short events whose minimum boxes would overlap", () => {
      // 09:00-09:05 is drawn to 09:15, so an event at 09:10 can't share its column.
      const result = layoutDayEvents(
        [
          { start: at(9), end: at(9, 5) },
          { start: at(9, 10), end: at(9, 40) },
        ],
        day,
      );
      expect(result.map((p) => [p.column, p.columns])).toEqual([
        [0, 2],
        [1, 2],
      ]);
    });

    it("reuses a short event's column once its minimum box ends", () => {
      const result = layoutDayEvents(
        [
          { start: at(9), end: at(9, 5) },
          { start: at(9, 15), end: at(9, 45) },
        ],
        day,
      );
      expect(result.map((p) => [p.column, p.columns])).toEqual([
        [0, 1],
        [0, 1],
      ]);
    });

    it("shows a zero-length event at midnight on the day it starts", () => {
      const midnight: CalendarEvent = { start: at(0), end: at(0) };
      expect(layoutDayEvents([midnight], day)).toMatchObject([
        { startHours: 0, durationHours: 0.25, continuesBefore: false, continuesAfter: false },
      ]);
      expect(layoutDayEvents([midnight], new Date(2026, 5, 14))).toEqual([]);
    });
  });

  it("keeps non-overlapping events in a single column", () => {
    const result = layoutDayEvents([ev(9, 10), ev(11, 12)], day);
    expect(result.map((p) => p.columns)).toEqual([1, 1]);
    expect(result.map((p) => p.column)).toEqual([0, 0]);
  });

  it("splits two overlapping events into side-by-side columns", () => {
    const result = layoutDayEvents([ev(10, 11), ev(10, 11)], day);
    expect(result.every((p) => p.columns === 2)).toBe(true);
    expect(result.map((p) => p.column).sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it("reuses a freed column when an event starts as another ends", () => {
    // A 10-11, B 10:30-11:30 overlap (2 cols); C 11-12 can reuse A's column.
    const a = ev(10, 11, "a");
    const b: CalendarEvent<{ id: string }> = { id: "b", start: at(10, 30), end: at(11, 30) };
    const c = ev(11, 12, "c");
    const result = layoutDayEvents([a, b, c], day);
    const byId = Object.fromEntries(result.map((p) => [p.event.id, p]));
    expect(byId.a.columns).toBe(2);
    expect(byId.a.column).toBe(0);
    expect(byId.b.column).toBe(1);
    // C starts exactly when A ends -> shares A's column, cluster stays 2 wide.
    expect(byId.c.column).toBe(0);
    expect(byId.c.columns).toBe(2);
  });

  it("orders output by start time regardless of input order", () => {
    const result = layoutDayEvents([ev(14, 15), ev(8, 9), ev(11, 12)], day);
    expect(result.map((p) => p.startHours)).toEqual([8, 11, 14]);
  });

  describe("multi-day events", () => {
    // 15 Jun 23:00 -> 16 Jun 02:00
    const spanning: CalendarEvent = {
      start: new Date(2026, 5, 15, 23, 0),
      end: new Date(2026, 5, 16, 2, 0),
    };

    it("clips to the tail of the start day", () => {
      const [p] = layoutDayEvents([spanning], new Date(2026, 5, 15));
      expect(p).toMatchObject({ startHours: 23, durationHours: 1, continuesAfter: true });
      expect(p.continuesBefore).toBe(false);
    });

    it("clips to the head of the following day", () => {
      const [p] = layoutDayEvents([spanning], new Date(2026, 5, 16));
      expect(p).toMatchObject({ startHours: 0, durationHours: 2, continuesBefore: true });
      expect(p.continuesAfter).toBe(false);
    });

    it("fills a fully-covered middle day (0 to 24h)", () => {
      const threeDay: CalendarEvent = {
        start: new Date(2026, 5, 15, 8),
        end: new Date(2026, 5, 17, 9),
      };
      const [p] = layoutDayEvents([threeDay], new Date(2026, 5, 16));
      expect(p.startHours).toBe(0);
      expect(p.durationHours).toBe(24);
      expect(p.continuesBefore).toBe(true);
      expect(p.continuesAfter).toBe(true);
    });

    it("excludes a day the event only touches at midnight", () => {
      // ends exactly at 16 Jun 00:00 -> does not appear on 16 Jun
      const toMidnight: CalendarEvent = {
        start: new Date(2026, 5, 15, 10),
        end: new Date(2026, 5, 16, 0),
      };
      expect(layoutDayEvents([toMidnight], new Date(2026, 5, 16))).toEqual([]);
      expect(layoutDayEvents([toMidnight], new Date(2026, 5, 15))).toHaveLength(1);
    });

    it("excludes >= 24h timed events under 'all-day' placement and leaves < 24h cross-midnight events on the grid", () => {
      const threeDay: CalendarEvent = {
        title: "Conference",
        start: new Date(2026, 5, 15, 9),
        end: new Date(2026, 5, 17, 17),
        allDay: false,
      };
      const fullDayTimed: CalendarEvent = {
        title: "On-call",
        start: new Date(2026, 5, 16, 0),
        end: new Date(2026, 5, 17, 0),
        allDay: false,
      };
      const exact24h: CalendarEvent = {
        title: "Shift",
        start: new Date(2026, 5, 15, 9),
        end: new Date(2026, 5, 16, 9),
        allDay: false,
      };
      const under24h: CalendarEvent = {
        title: "Almost 24h",
        start: new Date(2026, 5, 15, 9),
        end: new Date(2026, 5, 16, 8, 59),
        allDay: false,
      };
      const midDay: CalendarEvent = {
        title: "Standup",
        start: new Date(2026, 5, 16, 10),
        end: new Date(2026, 5, 16, 11),
      };
      const all = [threeDay, fullDayTimed, exact24h, under24h, spanning, midDay];

      // Default "grid" keeps all timed events on the grid; Standup shares width with Conference and On-call.
      const onGrid = layoutDayEvents(all, new Date(2026, 5, 16));
      expect(onGrid.find((p) => p.event === midDay)?.columns).toBeGreaterThan(1);

      // "all-day" excludes >= 24h timed events, so Standup gets the full column width.
      const promoted = layoutDayEvents(all, new Date(2026, 5, 16), {
        multiDayTimedEventPlacement: "all-day",
      });
      expect(promoted.map((p) => p.event)).toEqual([under24h, spanning, midDay]);
      expect(promoted.find((p) => p.event === midDay)).toMatchObject({ column: 0, columns: 1 });
    });
  });
});

describe("isAllDayLaneEvent", () => {
  it("always includes all-day events and excludes background events", () => {
    const explicit: CalendarEvent = {
      start: new Date(2026, 5, 15, 9),
      end: new Date(2026, 5, 15, 10),
      allDay: true,
    };
    const inferred: CalendarEvent = {
      start: new Date(2026, 5, 15),
      end: new Date(2026, 5, 16),
    };
    const bg: CalendarEvent = {
      start: new Date(2026, 5, 15),
      end: new Date(2026, 5, 18),
      allDay: true,
      display: "background",
    };
    const bgTimed: CalendarEvent = {
      start: new Date(2026, 5, 15, 9),
      end: new Date(2026, 5, 18, 17),
      allDay: false,
      display: "background",
    };

    expect(isAllDayLaneEvent(explicit, "grid")).toBe(true);
    expect(isAllDayLaneEvent(explicit, "all-day")).toBe(true);
    expect(isAllDayLaneEvent(inferred, "grid")).toBe(true);
    expect(isAllDayLaneEvent(inferred, "all-day")).toBe(true);
    expect(isAllDayLaneEvent(bg, "grid")).toBe(false);
    expect(isAllDayLaneEvent(bg, "all-day")).toBe(false);
    expect(isAllDayLaneEvent(bgTimed, "all-day")).toBe(false);
  });

  it("promotes timed events >= 24h only when placement is 'all-day'", () => {
    const exactMidnight: CalendarEvent = {
      start: new Date(2026, 5, 15, 0),
      end: new Date(2026, 5, 16, 0),
      allDay: false,
    };
    const exact24h: CalendarEvent = {
      start: new Date(2026, 5, 15, 9),
      end: new Date(2026, 5, 16, 9),
      allDay: false,
    };
    const multiDay: CalendarEvent = {
      start: new Date(2026, 5, 15, 9),
      end: new Date(2026, 5, 17, 17),
      allDay: false,
    };
    const under24h: CalendarEvent = {
      start: new Date(2026, 5, 15, 9, 0, 0, 0),
      end: new Date(2026, 5, 16, 8, 59, 59, 999),
      allDay: false,
    };
    const overnight: CalendarEvent = {
      start: new Date(2026, 5, 15, 22),
      end: new Date(2026, 5, 16, 6),
      allDay: false,
    };
    const zero: CalendarEvent = {
      start: new Date(2026, 5, 15, 9),
      end: new Date(2026, 5, 15, 9),
      allDay: false,
    };

    for (const e of [exactMidnight, exact24h, multiDay]) {
      expect(isAllDayLaneEvent(e)).toBe(false);
      expect(isAllDayLaneEvent(e, "grid")).toBe(false);
      expect(isAllDayLaneEvent(e, "all-day")).toBe(true);
    }
    for (const e of [under24h, overnight, zero]) {
      expect(isAllDayLaneEvent(e, "grid")).toBe(false);
      expect(isAllDayLaneEvent(e, "all-day")).toBe(false);
    }
  });
});

describe("isAllDayEvent", () => {
  it("honours an explicit allDay flag over the heuristic", () => {
    expect(
      isAllDayEvent({
        start: new Date(2026, 5, 15, 9),
        end: new Date(2026, 5, 15, 10),
        allDay: true,
      }),
    ).toBe(true);
    // midnight-to-midnight but explicitly not all-day
    expect(
      isAllDayEvent({ start: new Date(2026, 5, 15), end: new Date(2026, 5, 16), allDay: false }),
    ).toBe(false);
  });

  it("infers all-day from midnight-to-midnight spans", () => {
    expect(isAllDayEvent({ start: new Date(2026, 5, 15), end: new Date(2026, 5, 16) })).toBe(true);
    expect(isAllDayEvent({ start: new Date(2026, 5, 15), end: new Date(2026, 5, 18) })).toBe(true);
  });

  it("is false for timed events", () => {
    expect(isAllDayEvent({ start: new Date(2026, 5, 15, 9), end: new Date(2026, 5, 15, 10) })).toBe(
      false,
    );
    // starts at midnight but ends mid-day -> timed
    expect(isAllDayEvent({ start: new Date(2026, 5, 15), end: new Date(2026, 5, 15, 12) })).toBe(
      false,
    );
  });
});

describe("eventDayKeys", () => {
  const keyOf = (y: number, m: number, d: number) => new Date(y, m, d).toISOString();

  it("returns one key for a single-day event", () => {
    const e: CalendarEvent = { start: new Date(2026, 5, 15, 9), end: new Date(2026, 5, 15, 10) };
    expect(eventDayKeys(e)).toEqual([keyOf(2026, 5, 15)]);
  });

  it("returns every spanned day for a multi-day event", () => {
    const e: CalendarEvent = { start: new Date(2026, 5, 15, 23), end: new Date(2026, 5, 17, 2) };
    expect(eventDayKeys(e)).toEqual([keyOf(2026, 5, 15), keyOf(2026, 5, 16), keyOf(2026, 5, 17)]);
  });

  it("does not count a trailing midnight end as an extra day", () => {
    const e: CalendarEvent = { start: new Date(2026, 5, 15, 10), end: new Date(2026, 5, 16, 0) };
    expect(eventDayKeys(e)).toEqual([keyOf(2026, 5, 15)]);
  });
});
