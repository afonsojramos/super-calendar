import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { CalendarEvent, CalendarMode, WeekStartsOn } from "../types";
import { getViewDays } from "./dates";
import { clockHoursBetween, drawnEnd } from "./layout";
import { MIN_DURATION_HOURS } from "./minDuration";

/**
 * True when two time ranges overlap. Edges touching (one ends exactly when the
 * next begins) do not count as an overlap. Compares absolute instants, so events
 * at the same wall-clock time on different days do not overlap.
 */
export function eventsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * True when the range `[start, end)` would overlap any event in `events` other
 * than `moved` (compared by reference). Used by the `eventOverlap` guard to reject
 * a drag/resize that would land an event on top of another.
 */
export function overlapsOtherEvents<T>(
  events: readonly CalendarEvent<T>[],
  moved: CalendarEvent<T>,
  start: Date,
  end: Date,
): boolean {
  return events.some((e) => e !== moved && eventsOverlap(e.start, e.end, start, end));
}

/**
 * How many calendar days one time-grid page spans, used to advance the view by a
 * whole page (e.g. when dragging an event past the edge into the next week).
 * Deliberately ignores `hiddenDays` so a week always steps 7, matching the
 * keyboard PageUp/PageDown paging and `Calendar`'s own page step.
 */
export function pageStepDays(
  mode: CalendarMode,
  date: Date,
  weekStartsOn: WeekStartsOn,
  numberOfDays = 1,
): number {
  return getViewDays(mode, date, weekStartsOn, numberOfDays).length;
}

/**
 * Minutes to shift an event, snapping a vertical pixel drag to the nearest
 * `stepMinutes`. Runs on the UI thread inside the drag gesture. Returns 0 for a
 * degenerate grid (non-positive height/step).
 */
export function snapDeltaMinutes(
  translationPx: number,
  cellHeightPx: number,
  stepMinutes: number,
): number {
  "worklet";
  if (cellHeightPx <= 0 || stepMinutes <= 0) return 0;
  const rawMinutes = (translationPx / cellHeightPx) * 60;
  return Math.round(rawMinutes / stepMinutes) * stepMinutes;
}

/**
 * Where a moved event may start, in minutes from midnight, given the grid's
 * visible hour window. A move keeps its duration, so only the start is held
 * inside the window: it can reach one `snapMinutes` step before `maxHour`, and
 * the end is free to run past the end of the day, continuing on the following
 * day. That keeps the event starting in the column it was dropped on (a
 * cross-day *move* is the horizontal drag) while still allowing a range that
 * spans midnight. Runs on the UI thread inside the drag gesture.
 */
export function clampMoveStartMinutes(
  startMinutes: number,
  minHour: number,
  maxHour: number,
  snapMinutes: number,
): number {
  "worklet";
  const lower = minHour * 60;
  const upper = Math.max(lower, maxHour * 60 - snapMinutes);
  return Math.min(Math.max(startMinutes, lower), upper);
}

// The instant reading the same clock time as `date` that is nearest `target`
// (ms). In the hour a fall-back change repeats a clock time names two instants,
// one offset change apart; elsewhere this is `date`. Declared before the
// worklets that call it: the worklets plugin captures a worklet's dependencies
// when the module is evaluated, so a later declaration is still undefined.
function nearestOccurrence(date: Date, target: number): Date {
  "worklet";
  const offset = date.getTimezoneOffset();
  const later = new Date(date.getTime() + 3 * 3_600_000).getTimezoneOffset() - offset;
  const earlier = offset - new Date(date.getTime() - 3 * 3_600_000).getTimezoneOffset();
  let best = date;
  for (const change of [later, -earlier]) {
    if (change === 0) continue;
    const other = new Date(date.getTime() + change * 60_000);
    if (other.getHours() !== date.getHours() || other.getMinutes() !== date.getMinutes()) continue;
    if (Math.abs(other.getTime() - target) < Math.abs(best.getTime() - target)) best = other;
  }
  return best;
}

/**
 * A copy of `date` shifted by `minutes` (may be negative) on the clock, so a
 * shift across a DST change keeps the clock time. When the resulting clock time
 * occurs twice (the hour a fall-back change repeats), the occurrence nearer to
 * `minutes` of elapsed time wins.
 */
export function shiftMinutes(date: Date, minutes: number): Date {
  "worklet";
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return nearestOccurrence(next, date.getTime() + minutes * 60_000);
}

// `date`'s clock reading as milliseconds, equal for two instants that read the same.
const localTime = (date: Date): number => date.getTime() - date.getTimezoneOffset() * 60_000;

/**
 * Where moving `[start, end]` by `minutes` on the clock lands, in clock hours:
 * how far the start moves, and how many rows the moved span covers. The span
 * keeps its elapsed duration, as {@link resolveDraggedBounds} commits a move, so
 * gaining or losing a DST change changes its row count, and a start that lands
 * in the hour a spring-forward change skips moves on past it. The row count is
 * at least the layout's minimum box, as the committed event will be drawn.
 * Worklet-safe, for live drag previews.
 */
export function movedClockSpan(
  start: Date,
  end: Date,
  minutes: number,
): { startHours: number; hours: number } {
  "worklet";
  const nextStart = shiftMinutes(start, minutes);
  const nextEnd = new Date(nextStart.getTime() + end.getTime() - start.getTime());
  return {
    startHours:
      (nextStart.getTime() - start.getTime()) / 3_600_000 +
      (start.getTimezoneOffset() - nextStart.getTimezoneOffset()) / 60,
    hours: Math.max(clockHoursBetween(nextStart, nextEnd), MIN_DURATION_HOURS),
  };
}

/**
 * Resolve a committed drag into the event's new bounds: `start` shifts by
 * `deltaStartMinutes`, `end` by `deltaEndMinutes` (a move passes the same delta
 * to both and preserves elapsed duration, including across DST; a resize passes
 * 0 for the unchanged edge). Returns `null` only when the change
 * would *shrink* the event below one `snapMinutes` step, so a resize can't commit
 * a degenerate duration; a pure move (both deltas equal) keeps its duration and is
 * never rejected, even for an already sub-step event. Pure, so the commit path is
 * unit-testable without a running gesture.
 */
export function resolveDraggedBounds(
  start: Date,
  end: Date,
  deltaStartMinutes: number,
  deltaEndMinutes: number,
  snapMinutes: number,
): { start: Date; end: Date } | null {
  const nextStart = shiftMinutes(start, deltaStartMinutes);
  const oldDuration = end.getTime() - start.getTime();
  let nextEnd = end;
  if (deltaStartMinutes === deltaEndMinutes) {
    nextEnd = new Date(nextStart.getTime() + oldDuration);
  } else if (deltaEndMinutes !== 0) {
    // A resize moves the end to the clock time its drawn edge is dragged to. That
    // edge differs from `end` for a span whose clock runs backwards, and a clock
    // time in the hour a fall-back change repeats resolves to the occurrence
    // nearest `end` shifted by the same amount.
    const target = shiftMinutes(drawnEnd(start, end), deltaEndMinutes);
    nextEnd = nearestOccurrence(target, end.getTime() + deltaEndMinutes * 60_000);
    // An end dragged above the start can still land after it in the repeated
    // hour, where its edge would be drawn somewhere else; refuse it.
    if (localTime(drawnEnd(nextStart, nextEnd)) !== localTime(target)) return null;
  }
  const newDuration = nextEnd.getTime() - nextStart.getTime();
  // Reject only a shrink past one step — never a move, which preserves duration.
  if (newDuration < snapMinutes * 60_000 && newDuration < oldDuration) return null;
  return { start: nextStart, end: nextEnd };
}

/**
 * The all-day range swept out between two day cells of the month grid, ordered
 * whichever way the sweep ran: `start` is midnight of the first day and `end` is
 * midnight after the last, so a one-day sweep still yields a usable event. Shared
 * by both renderers so a month drag-to-create means the same thing on each.
 */
export function monthCreateRange(anchor: Date, hover: Date): { start: Date; end: Date } {
  const a = startOfDay(anchor);
  const b = startOfDay(hover);
  const first = a.getTime() <= b.getTime() ? a : b;
  const last = a.getTime() <= b.getTime() ? b : a;
  return { start: first, end: addDays(last, 1) };
}

/**
 * The new bounds for an event picked up on `fromDay` and dropped on `toDay` in
 * the month grid: both ends move by the same number of calendar days, so the
 * event keeps its time of day and duration (DST included). Returns `null` when
 * the drop lands on the day it started, so a stray drag commits nothing.
 */
export function monthDropBounds<T>(
  event: CalendarEvent<T>,
  fromDay: Date,
  toDay: Date,
): { start: Date; end: Date } | null {
  const delta = differenceInCalendarDays(startOfDay(toDay), startOfDay(fromDay));
  if (delta === 0) return null;
  return { start: addDays(event.start, delta), end: addDays(event.end, delta) };
}

/**
 * The start/end of a new event swept out on `day` by dragging from `startPx` to
 * `endPx` (vertical pixels from the grid's top, i.e. the `minHour` line). Both
 * ends snap to `snapMinutes`; the range is ordered (drag up or down) and widened
 * to at least one step so a stationary press still yields a usable event.
 * Returns `null` for a degenerate grid (non-positive height/step). Pure, so the
 * commit path is unit-testable without a running gesture.
 */
export function cellRangeFromDrag(
  day: Date,
  startPx: number,
  endPx: number,
  cellHeightPx: number,
  minHour: number,
  snapMinutes: number,
): { start: Date; end: Date } | null {
  if (cellHeightPx <= 0 || snapMinutes <= 0) return null;
  const snapAt = (px: number) => {
    const rawMinutes = (minHour + px / cellHeightPx) * 60;
    return Math.round(rawMinutes / snapMinutes) * snapMinutes;
  };
  const MAX = 24 * 60;
  let lower = Math.max(0, Math.min(MAX - snapMinutes, snapAt(startPx)));
  let upper = Math.max(0, Math.min(MAX, snapAt(endPx)));
  if (upper < lower) [lower, upper] = [upper, lower];
  // Keep the range at least one step wide without spilling past midnight.
  if (upper - lower < snapMinutes) upper = Math.min(MAX, lower + snapMinutes);
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  start.setMinutes(lower);
  const end = new Date(day);
  end.setHours(0, 0, 0, 0);
  end.setMinutes(upper);
  return { start, end };
}
