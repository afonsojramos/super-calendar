import type { CalendarEvent } from "../types";
import { isAllDayEvent } from "./layout";

// Building a formatter costs far more than formatting with it, and the views
// convert once per event and per rendered day, so keep one per zone. Zone names
// can come from untrusted input (an iCal `TZID`) and match in any letter case,
// so the cache is bounded: an app uses a handful of zones.
const MAX_ZONE_FORMATTERS = 32;
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    if (zoneFormatters.size >= MAX_ZONE_FORMATTERS) zoneFormatters.clear();
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

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
  const parts = zoneFormatter(timeZone).formatToParts(date);

  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };

  // `h23` can report midnight as 24; normalise to 0.
  const hour = field("hour") % 24;
  return new Date(
    field("year"),
    field("month") - 1,
    field("day"),
    hour,
    field("minute"),
    field("second"),
    date.getMilliseconds(),
  );
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
// if it were UTC, minus the real instant.
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const z = toZonedTime(instant, timeZone);
  const wallAsUtc = Date.UTC(
    z.getFullYear(),
    z.getMonth(),
    z.getDate(),
    z.getHours(),
    z.getMinutes(),
    z.getSeconds(),
    z.getMilliseconds(),
  );
  return wallAsUtc - instant.getTime();
}

/**
 * The inverse of {@link toZonedTime}: given a wall-clock time in `timeZone`,
 * return the absolute UTC instant. Pass the wall clock as a `Date` whose **UTC**
 * fields hold the components (e.g. `new Date(Date.UTC(y, m, d, h, min))`). Used to
 * resolve iCal `TZID` times; DST-correct via a two-pass offset (ambiguous
 * fall-back times resolve to the post-transition offset).
 */
export function zonedTimeToUtc(wallClock: Date, timeZone: string): Date {
  const guess = wallClock.getTime();
  const firstPass = zoneOffsetMs(new Date(guess), timeZone);
  const secondPass = zoneOffsetMs(new Date(guess - firstPass), timeZone);
  return new Date(guess - secondPass);
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

/**
 * Convert the bounds a view reports for a dragged event back to real instants.
 * `event` is the displayed event the view passed to `onDragEvent`, and `start`
 * / `end` the bounds it reported. For a display copy made by
 * {@link eventsInTimeZone}, each bound is read as a wall-clock time in that
 * zone; an edge the drag left alone keeps the source event's exact instant.
 * Bounds of any other event (an all-day event, or one that was never shifted)
 * are returned unchanged.
 */
export function zonedDragBounds<T>(
  event: CalendarEvent<T>,
  start: Date,
  end: Date,
): { start: Date; end: Date } {
  const zoned = zonedSources.get(event);
  if (!zoned) return { start, end };
  const source = zoned.event as CalendarEvent<T>;
  const real = (reported: Date, displayed: Date, original: Date) =>
    reported.getTime() === displayed.getTime() ? original : fromZonedTime(reported, zoned.timeZone);
  return {
    start: real(start, event.start, source.start),
    end: real(end, event.end, source.end),
  };
}
