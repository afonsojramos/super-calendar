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
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date.setUTCHours(hour, minute, second, ms);
}
