import { eventDayKeys, isAllDayEvent, layoutDayEvents } from "../layout";
import type { CalendarEvent } from "../../types";

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
