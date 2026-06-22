import { layoutDayEvents } from '../layout';
import type { CalendarEvent } from '../../types';

const at = (h: number, m = 0) => new Date(2026, 5, 15, h, m); // 15 Jun 2026, local
const ev = (startH: number, endH: number, id?: string): CalendarEvent<{ id?: string }> => ({
  id,
  start: at(startH),
  end: at(endH),
});

describe('layoutDayEvents', () => {
  const day = at(0);

  it('returns an empty array when there are no events that day', () => {
    expect(layoutDayEvents([], day)).toEqual([]);
  });

  it('excludes events from other days', () => {
    const other: CalendarEvent = { start: new Date(2026, 5, 16, 10), end: new Date(2026, 5, 16, 11) };
    expect(layoutDayEvents([other], day)).toEqual([]);
  });

  it('places a single event in column 0 of a single column', () => {
    const [positioned] = layoutDayEvents([ev(10, 11)], day);
    expect(positioned).toMatchObject({ column: 0, columns: 1, startHours: 10, durationHours: 1 });
  });

  it('computes fractional start and duration', () => {
    const [positioned] = layoutDayEvents([{ start: at(9, 30), end: at(10, 15) }], day);
    expect(positioned.startHours).toBeCloseTo(9.5);
    expect(positioned.durationHours).toBeCloseTo(0.75);
  });

  it('clamps non-positive durations to a minimum sliver', () => {
    const [positioned] = layoutDayEvents([{ start: at(10), end: at(10) }], day);
    expect(positioned.durationHours).toBeCloseTo(0.25);
  });

  it('keeps non-overlapping events in a single column', () => {
    const result = layoutDayEvents([ev(9, 10), ev(11, 12)], day);
    expect(result.map((p) => p.columns)).toEqual([1, 1]);
    expect(result.map((p) => p.column)).toEqual([0, 0]);
  });

  it('splits two overlapping events into side-by-side columns', () => {
    const result = layoutDayEvents([ev(10, 11), ev(10, 11)], day);
    expect(result.every((p) => p.columns === 2)).toBe(true);
    expect(result.map((p) => p.column).sort()).toEqual([0, 1]);
  });

  it('reuses a freed column when an event starts as another ends', () => {
    // A 10-11, B 10:30-11:30 overlap (2 cols); C 11-12 can reuse A's column.
    const a = ev(10, 11, 'a');
    const b: CalendarEvent<{ id: string }> = { id: 'b', start: at(10, 30), end: at(11, 30) };
    const c = ev(11, 12, 'c');
    const result = layoutDayEvents([a, b, c], day);
    const byId = Object.fromEntries(result.map((p) => [p.event.id, p]));
    expect(byId.a.columns).toBe(2);
    expect(byId.a.column).toBe(0);
    expect(byId.b.column).toBe(1);
    // C starts exactly when A ends -> shares A's column, cluster stays 2 wide.
    expect(byId.c.column).toBe(0);
    expect(byId.c.columns).toBe(2);
  });

  it('orders output by start time regardless of input order', () => {
    const result = layoutDayEvents([ev(14, 15), ev(8, 9), ev(11, 12)], day);
    expect(result.map((p) => p.startHours)).toEqual([8, 11, 14]);
  });
});
