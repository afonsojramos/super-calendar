import { addDays, differenceInMinutes, max as maxDate, min as minDate, startOfDay } from "date-fns";
import type { BusinessHours, CalendarEvent } from "../types";

const MINUTES_PER_HOUR = 60;
// Minimum duration (in hours) a positioned event is given, so a zero/negative
// span still occupies a sliver rather than collapsing to nothing.
const MIN_DURATION_HOURS = 0.25;

/** An event placed on a single day's time grid by {@link layoutDayEvents}, with its vertical span and overlap column. */
export type PositionedEvent<T> = {
  /** The source event for this segment. */
  event: CalendarEvent<T>;
  /** Hours from midnight to the event's segment start on this day (fractional). */
  startHours: number;
  /** Segment duration in hours on this day (clamped to a small minimum). */
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
 * Lay out a single day's events: events that overlap in time are split into
 * side-by-side columns. Multi-day events are clipped to the portion that falls
 * on `day` (e.g. a 23:00→01:00 event renders 23:00–24:00 on the start day and
 * 00:00–01:00 on the next). Pure — safe to call per render, never per frame.
 */
export function layoutDayEvents<T>(events: CalendarEvent<T>[], day: Date): PositionedEvent<T>[] {
  const dayStart = startOfDay(day);
  const nextDayStart = addDays(dayStart, 1);

  const segments: Segment<T>[] = events
    // All-day events live in the lane, not the timed columns.
    .filter((event) => !isAllDayEvent(event))
    // Overlaps this day if it starts before the day ends and ends after it begins.
    .filter((event) => event.start < nextDayStart && event.end > dayStart)
    .map((event) => {
      const segStart = maxDate([event.start, dayStart]);
      const segEnd = minDate([event.end, nextDayStart]);
      return {
        event,
        start: differenceInMinutes(segStart, dayStart) / MINUTES_PER_HOUR,
        end: differenceInMinutes(segEnd, dayStart) / MINUTES_PER_HOUR,
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
  const start = Math.max(minHour, Math.min(maxHour, open.start));
  const end = Math.max(minHour, Math.min(maxHour, open.end));
  // Inverted or empty open hours mean nothing is open: shade the whole window.
  if (start >= end) return [{ start: minHour, end: maxHour }];
  const bands: { start: number; end: number }[] = [];
  if (start > minHour) bands.push({ start: minHour, end: start });
  if (end < maxHour) bands.push({ start: end, end: maxHour });
  return bands;
}
