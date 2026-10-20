import { addDays, max as maxDate, min as minDate, startOfDay } from "date-fns";
import type { BusinessHours, CalendarEvent } from "../types";
import { MIN_DURATION_HOURS } from "./minDuration";

/** An event placed on a single day's time grid by {@link layoutDayEvents}, with its vertical span and overlap column. */
export type PositionedEvent<T> = {
  /** The source event for this segment. */
  event: CalendarEvent<T>;
  /**
   * Clock time of the segment start on this day, in fractional hours: the
   * time-grid row it starts in. On a DST change day this differs from the time
   * elapsed since midnight (see {@link wallClockHours}).
   */
  startHours: number;
  /** Clock hours the segment spans on this day (clamped to a small minimum). */
  durationHours: number;
  /** Zero-based column index within its overlap cluster. */
  column: number;
  /** Total columns in this event's overlap cluster. */
  columns: number;
  /** True when the segment is clipped because the event continues before/after this day. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

type Segment<T> = {
  event: CalendarEvent<T>;
  start: number;
  end: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * The fractional hour `date` shows on the clock, which is the time-grid row it
 * belongs in, clamped to `[dayStart, nextDayStart]` so the midnight that ends
 * the day reads 24. On a DST change day this differs from the time elapsed
 * since midnight: after clocks go back, 10:00 is 11 hours in but reads 10.
 * Worklet-safe, so a UI-thread preview places events the same way.
 */
export function wallClockHours(date: Date, dayStart: Date, nextDayStart: Date): number {
  "worklet";
  if (date.getTime() >= nextDayStart.getTime()) return 24;
  if (date.getTime() <= dayStart.getTime()) return 0;
  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3_600_000
  );
}

/**
 * The hours between `from` and `to` as the clock reads them: the elapsed hours
 * plus any DST offset change between the two, so 01:30 to 03:30 is 2 even on a
 * spring-forward day when only 1 hour passes. In the hour a fall-back change
 * repeats the clock can read earlier at `to` than at `from` (01:30 EDT to 01:00
 * EST); such a span keeps its elapsed length so it still has a size to draw.
 * Worklet-safe, so a UI-thread drag preview sizes boxes the same way.
 */
export function clockHoursBetween(from: Date, to: Date): number {
  "worklet";
  const elapsed = (to.getTime() - from.getTime()) / 3_600_000;
  const clock = elapsed + (from.getTimezoneOffset() - to.getTimezoneOffset()) / 60;
  return clock > 0 || elapsed <= 0 ? clock : elapsed;
}

/**
 * The instant a time grid draws the bottom edge of `[start, end]` at. That is
 * `end`, except in the hour a fall-back change repeats: a span whose clock runs
 * backwards (01:30 EDT to 01:00 EST) is drawn its elapsed length from `start`
 * (see {@link clockHoursBetween}), so its edge reads 02:00. Resizing from that
 * instant keeps the edge under the pointer. Worklet-safe.
 */
export function drawnEnd(start: Date, end: Date): Date {
  "worklet";
  const offsetChange = end.getTimezoneOffset() - start.getTimezoneOffset();
  const elapsed = end.getTime() - start.getTime();
  if (elapsed <= 0 || elapsed - offsetChange * 60_000 > 0) return end;
  return new Date(end.getTime() + offsetChange * 60_000);
}

// The clock-hour rows `[from, to]` covers on a day.
const clockSpan = (
  from: Date,
  to: Date,
  dayStart: Date,
  nextDayStart: Date,
): { start: number; end: number } => {
  const start = wallClockHours(from, dayStart, nextDayStart);
  return { start, end: Math.min(24, start + clockHoursBetween(from, to)) };
};

/**
 * Lay out a single day's events: events that overlap in time are split into
 * side-by-side columns. Multi-day events are clipped to the portion that falls
 * on `day` (e.g. a 23:00→01:00 event renders 23:00–24:00 on the start day and
 * 00:00–01:00 on the next). Pure — safe to call per render, never per frame.
 */
export function layoutDayEvents<T>(events: CalendarEvent<T>[], day: Date): PositionedEvent<T>[] {
  const dayStart = startOfDay(day);
  const nextDayStart = addDays(dayStart, 1);

  const segments: Segment<T>[] = events
    // All-day events live in the lane, not the timed columns; background events
    // paint as bands (see `backgroundBandsForDay`), not boxes.
    .filter((event) => !isAllDayEvent(event) && !isBackgroundEvent(event))
    // Overlaps this day if it starts before the day ends and ends after it begins.
    .filter((event) => event.start < nextDayStart && event.end > dayStart)
    .map((event) => {
      const segStart = maxDate([event.start, dayStart]);
      const segEnd = minDate([event.end, nextDayStart]);
      return {
        event,
        ...clockSpan(segStart, segEnd, dayStart, nextDayStart),
        continuesBefore: event.start < dayStart,
        continuesAfter: event.end > nextDayStart,
      };
    })
    .sort((a, b) => a.start - b.start);

  const positioned: PositionedEvent<T>[] = [];
  let cluster: Segment<T>[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flushCluster = () => {
    const columnEnds: number[] = [];
    const columnOf = new Map<Segment<T>, number>();
    for (const seg of cluster) {
      let column = columnEnds.findIndex((end) => end <= seg.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(seg.end);
      } else {
        columnEnds[column] = seg.end;
      }
      columnOf.set(seg, column);
    }
    for (const seg of cluster) {
      positioned.push({
        event: seg.event,
        startHours: seg.start,
        durationHours: Math.max(seg.end - seg.start, MIN_DURATION_HOURS),
        column: columnOf.get(seg) ?? 0,
        columns: columnEnds.length,
        continuesBefore: seg.continuesBefore,
        continuesAfter: seg.continuesAfter,
      });
    }
    cluster = [];
  };

  for (const seg of segments) {
    if (cluster.length > 0 && seg.start >= clusterEnd) flushCluster();
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.end);
  }
  if (cluster.length > 0) flushCluster();

  return positioned;
}

const atMidnight = (date: Date): boolean =>
  date.getHours() === 0 &&
  date.getMinutes() === 0 &&
  date.getSeconds() === 0 &&
  date.getMilliseconds() === 0;

/**
 * Whether an event belongs in the all-day lane. An explicit `allDay` flag wins;
 * otherwise it's inferred when the event spans whole days (both `start` and
 * `end` land on midnight, e.g. an iCal-style all-day event). Pure.
 */
export function isAllDayEvent<T>(event: CalendarEvent<T>): boolean {
  if (typeof event.allDay === "boolean") return event.allDay;
  return event.end > event.start && atMidnight(event.start) && atMidnight(event.end);
}

/**
 * The `startOfDay` ISO keys of every calendar day an event touches (inclusive).
 * An event ending exactly at midnight does not count the following day. Used to
 * index events by day for the month grid. Pure.
 */
export function eventDayKeys<T>(event: CalendarEvent<T>): string[] {
  const first = startOfDay(event.start);
  // The last instant the event occupies; an end of exactly midnight belongs to
  // the previous day.
  const lastInstant = event.end > event.start ? new Date(event.end.getTime() - 1) : event.start;
  const last = startOfDay(lastInstant);

  const keys: string[] = [];
  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    keys.push(cursor.toISOString());
  }
  return keys;
}

/**
 * Index events by the `startOfDay` ISO key of every day they touch (via
 * {@link eventDayKeys}), so a month grid can look up a day's events with
 * `startOfDay(date).toISOString()`. Built once and shared across month cells.
 */
export function groupEventsByDay<T>(
  events: readonly CalendarEvent<T>[],
): Map<string, CalendarEvent<T>[]> {
  const map = new Map<string, CalendarEvent<T>[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
  }
  return map;
}

/**
 * Order a day's events for the month and list views: all-day events come first
 * (they head the day regardless of their start time), then timed events by start.
 * Shared by both renderers so the order is identical. Use as an `Array.sort`
 * comparator.
 */
export function compareDayEvents<T>(a: CalendarEvent<T>, b: CalendarEvent<T>): number {
  const aAllDay = isAllDayEvent(a);
  const bAllDay = isAllDayEvent(b);
  if (aAllDay !== bAllDay) return aAllDay ? -1 : 1;
  return a.start.getTime() - b.start.getTime();
}

/**
 * The closed hour-spans of a day to shade on the time grid, given a
 * `businessHours` callback and the visible `[minHour, maxHour]` window: the spans
 * before open and after close (clamped to the window), the whole window when the
 * day is closed (`null`) or the open hours are inverted/empty, or none when the
 * callback returns `undefined`. Shared by both renderers so shading stays
 * identical. Co-located with `groupEventsByDay`; both feed the grid layout.
 */
export function closedHourBands(
  day: Date,
  businessHours: BusinessHours | undefined,
  minHour = 0,
  maxHour = 24,
): { start: number; end: number }[] {
  const open = businessHours?.(day);
  if (open === undefined) return [];
  if (open === null) return [{ start: minHour, end: maxHour }];
  // Clamp every open window to the visible range and drop empty/inverted ones.
  const windows = (Array.isArray(open) ? open : [open])
    .map((w) => ({
      start: Math.max(minHour, Math.min(maxHour, w.start)),
      end: Math.max(minHour, Math.min(maxHour, w.end)),
    }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start);
  // Nothing open: shade the whole window.
  if (windows.length === 0) return [{ start: minHour, end: maxHour }];
  // Merge overlapping/touching windows so the closed bands are the gaps between
  // (and around) them: before the first, between windows (e.g. lunch), after the last.
  const merged: { start: number; end: number }[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  const bands: { start: number; end: number }[] = [];
  let cursor = minHour;
  for (const w of merged) {
    if (w.start > cursor) bands.push({ start: cursor, end: w.start });
    cursor = w.end;
  }
  if (cursor < maxHour) bands.push({ start: cursor, end: maxHour });
  return bands;
}

/** True when the event paints as a shaded background band, not an event box. */
export function isBackgroundEvent<T>(event: CalendarEvent<T>): boolean {
  return event.display === "background";
}

/**
 * The background events of `events` sliced to `day`, as fractional-hour bands
 * (an all-day or multi-day background covers the day's full window). Shared by
 * both renderers so the shading can't disagree.
 */
export function backgroundBandsForDay<T>(
  events: CalendarEvent<T>[],
  day: Date,
): { event: CalendarEvent<T>; startHours: number; endHours: number }[] {
  const dayStart = startOfDay(day);
  const nextDayStart = addDays(dayStart, 1);
  const out: { event: CalendarEvent<T>; startHours: number; endHours: number }[] = [];
  for (const event of events) {
    if (!isBackgroundEvent(event)) continue;
    if (event.start >= nextDayStart || event.end <= dayStart) continue;
    const from = event.start > dayStart ? event.start : dayStart;
    const to = event.end < nextDayStart ? event.end : nextDayStart;
    const { start: startHours, end: endHours } = clockSpan(from, to, dayStart, nextDayStart);
    if (endHours > startHours) out.push({ event, startHours, endHours });
  }
  return out;
}
