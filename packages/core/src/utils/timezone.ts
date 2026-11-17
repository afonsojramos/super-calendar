import type { CalendarEvent } from "../types";
import { isAllDayEvent } from "./layout";
import { zoneFields } from "./zoneFields";

/**
 * Reinterpret an instant as its wall-clock time in `timeZone`, returned as a
 * device-local `Date` whose fields (hours, minutes, …) read back as that zone's
 * clock. The calendar lays events out from `getHours()`/`getMinutes()`, so
 * passing zoned dates makes it render in `timeZone` regardless of the device.
 *
 * DST-correct via `Intl` (available on modern React Native Hermes/JSC and the
 * web). The result is for display/layout only; it no longer points at the
 * original UTC instant, so don't round-trip it back to a real time.
 */
export function toZonedTime(date: Date, timeZone: string): Date {
  const [year, month, day, hour, minute, second] = zoneFields(date, timeZone);
  return new Date(year, month, day, hour, minute, second, date.getMilliseconds());
}

/**
 * The current instant, or the fixed `now` when given, as the wall clock of
 * `timeZone` (see {@link toZonedTime}). Without a `timeZone` it is the instant
 * itself, read on the device clock. Compare calendar days against it to find
 * "today" for a calendar displayed in another time zone.
 */
export function nowInTimeZone(now?: Date, timeZone?: string): Date {
  const instant = now ?? new Date();
  return timeZone ? toZonedTime(instant, timeZone) : instant;
}

// `timeZone`'s offset from UTC (ms) at `instant`: the zone's wall clock read as
// if it were UTC, minus the real instant. Read from plain fields, so the
// device's own DST changes can't distort it.
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const [year, month, day, hour, minute, second] = zoneFields(instant, timeZone);
  const wallAsUtc = Date.UTC(year, month, day, hour, minute, second, instant.getUTCMilliseconds());
  return wallAsUtc - instant.getTime();
}

/**
 * The inverse of {@link toZonedTime}: given a wall-clock time in `timeZone`,
 * return the absolute UTC instant. Pass the wall clock as a `Date` whose **UTC**
 * fields hold the components (e.g. `new Date(Date.UTC(y, m, d, h, min))`). Used to
 * resolve iCal `TZID` times; DST-correct via a two-pass offset. A time in the
 * hour a spring-forward change skips names no instant; it resolves the same
 * distance after the skipped hour (02:30 becomes 03:30), as a device clock does.
 */
export function zonedTimeToUtc(wallClock: Date, timeZone: string): Date {
  const guess = wallClock.getTime();
  const firstPass = zoneOffsetMs(new Date(guess), timeZone);
  const secondPass = zoneOffsetMs(new Date(guess - firstPass), timeZone);
  const instant = new Date(guess - secondPass);
  // Neither offset maps a skipped time back to itself. Read it with the offset
  // in force before the change, which is the smaller of the two.
  if (firstPass !== secondPass && zoneOffsetMs(instant, timeZone) !== secondPass) {
    return new Date(guess - Math.min(firstPass, secondPass));
  }
  return instant;
}

/**
 * The inverse of {@link toZonedTime}: the real instant for a date whose
 * device-local fields hold a wall-clock time in `timeZone`, such as a date a
 * calendar displaying that zone reports. DST-correct via {@link zonedTimeToUtc}.
 */
export function fromZonedTime(date: Date, timeZone: string): Date {
  return zonedTimeToUtc(
    new Date(
      Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds(),
      ),
    ),
    timeZone,
  );
}

// Each display copy made by `eventsInTimeZone`, mapped to the event it copies
// and the zone it was shifted into.
const zonedSources = new WeakMap<object, { event: object; timeZone: string }>();

/**
 * Shift every timed event's `start`/`end` through {@link toZonedTime} so the
 * calendar displays them in `timeZone`. Other fields are preserved. All-day
 * events (see `isAllDayEvent`) name calendar days, not instants, so they are
 * returned as they are and stay on their days. Memoize the result (e.g. with
 * `useMemo`) since it allocates new dates.
 */
export function eventsInTimeZone<T>(
  events: CalendarEvent<T>[],
  timeZone: string,
): CalendarEvent<T>[] {
  return events.map((event) => {
    if (isAllDayEvent(event)) return event;
    const zoned = {
      ...event,
      start: toZonedTime(event.start, timeZone),
      end: toZonedTime(event.end, timeZone),
    };
    zonedSources.set(zoned, { event, timeZone });
    return zoned;
  });
}

/**
 * The event a display copy made by {@link eventsInTimeZone} stands for, with its
 * real `start` and `end`. Any other event is returned as it is. Use it in the
 * callbacks of a view that displays zoned events, to get back the event you
 * passed in.
 */
export function zonedEventSource<T>(event: CalendarEvent<T>): CalendarEvent<T> {
  return (zonedSources.get(event)?.event as CalendarEvent<T> | undefined) ?? event;
}

/** Options for {@link zonedDragBounds}. */
export interface ZonedDragBoundsOptions {
  /**
   * Keep the event's real elapsed duration when the drag moved both edges, as a
   * time-grid move does: the start is read off the zone's wall clock and the end
   * follows it, so a move across a DST change in the zone doesn't stretch or
   * shrink the event. Leave it off for a month-grid drop, which keeps the clock
   * time of both edges.
   */
  keepDuration?: boolean;
}

/**
 * Convert the bounds a view reports for a dragged event back to real instants.
 * `event` is the displayed event the view passed to `onDragEvent`, and `start`
 * / `end` the bounds it reported. For a display copy made by
 * {@link eventsInTimeZone}, each bound is read as a wall-clock time in that
 * zone, following the zone's own DST changes; an edge the drag left alone keeps
 * the source event's exact instant. Bounds of any other event (an all-day
 * event, or one that was never shifted) are returned unchanged.
 */
export function zonedDragBounds<T>(
  event: CalendarEvent<T>,
  start: Date,
  end: Date,
  { keepDuration = false }: ZonedDragBoundsOptions = {},
): { start: Date; end: Date } {
  const zoned = zonedSources.get(event);
  if (!zoned) return { start, end };
  const source = zoned.event as CalendarEvent<T>;
  const startMoved = start.getTime() !== event.start.getTime();
  const endMoved = end.getTime() !== event.end.getTime();
  const realStart = startMoved ? fromZonedTime(start, zoned.timeZone) : source.start;
  if (keepDuration && startMoved && endMoved) {
    const durationMs = source.end.getTime() - source.start.getTime();
    return { start: realStart, end: new Date(realStart.getTime() + durationMs) };
  }
  return {
    start: realStart,
    end: endMoved ? fromZonedTime(end, zoned.timeZone) : source.end,
  };
}
