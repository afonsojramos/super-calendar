import type { CalendarEvent } from "../types";

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
 * Map every event's `start`/`end` through {@link toZonedTime} so the calendar
 * displays them in `timeZone`. Other fields are preserved. Memoize the result
 * (e.g. with `useMemo`) since it allocates new dates.
 */
export function eventsInTimeZone<T>(
  events: CalendarEvent<T>[],
  timeZone: string,
): CalendarEvent<T>[] {
  return events.map((event) => ({
    ...event,
    start: toZonedTime(event.start, timeZone),
    end: toZonedTime(event.end, timeZone),
  }));
}
