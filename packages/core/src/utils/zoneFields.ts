// Internal: read an instant's calendar fields in an IANA time zone. Kept apart
// from `timezone.ts`, whose exports are public API.

/** Calendar fields: year, month (0 = January), day, hour, minute, second. */
export type ZoneFields = [number, number, number, number, number, number];

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
 * The wall-clock fields `date` reads in `timeZone`, as plain numbers. Unlike a
 * device-local `Date` holding those fields, the result can't be bent by the
 * device's own DST changes.
 */
export function zoneFields(date: Date, timeZone: string): ZoneFields {
  const parts = zoneFormatter(timeZone).formatToParts(date);
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  // `h23` can report midnight as 24; normalise to 0.
  return [
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour") % 24,
    field("minute"),
    field("second"),
  ];
}

/**
 * A calendar reading as a UTC time value. Fields may overflow and roll over.
 * Setters, not `Date.UTC`, which reads a year below 100 as 19xx.
 */
export function utcTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  if (year >= 100) return Date.UTC(year, month, day, hour, minute, second, ms);
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date.setUTCHours(hour, minute, second, ms);
}

// `timeZone`'s offset from UTC (ms) at `instant`: the zone's wall clock read as
// if it were UTC, minus the real instant. Read from plain fields, so the
// device's own DST changes can't distort it.
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const [year, month, day, hour, minute, second] = zoneFields(instant, timeZone);
  const wallAsUtc = utcTime(year, month, day, hour, minute, second, instant.getUTCMilliseconds());
  return wallAsUtc - instant.getTime();
}

/**
 * Internal implementation of `zonedTimeToUtc`: convert a wall-clock time (stored
 * in the UTC fields of `wallClock`) in `timeZone` to its absolute UTC instant.
 * Kept here so `layout.ts` can check midnight-skipping DST transitions without
 * introducing a circular import with `timezone.ts`.
 */
export function zonedWallClockToUtc(wallClock: Date, timeZone: string): Date {
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
 * Internal registry mapping each display copy made by `eventsInTimeZone` to its
 * source event and display zone. Shared between `timezone.ts` and `layout.ts`.
 */
export const zonedSources = new WeakMap<
  object,
  { event: { start: Date; end: Date }; timeZone: string }
>();
