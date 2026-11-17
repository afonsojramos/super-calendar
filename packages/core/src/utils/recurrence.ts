import type { CalendarEvent, RecurrenceFrequency, RecurrenceRule } from "../types";
import { isAllDayEvent } from "./layout";
import { toZonedTime, zonedTimeToUtc } from "./timezone";
import { utcTime, zoneFields } from "./zoneFields";

// Runaway guard on in-range occurrences. Generous enough for realistic windows
// (e.g. ~13 years of a daily event); set `count`/`until`, or query a tighter
// range, for anything larger.
const MAX_OCCURRENCES = 5000;

// Average length of each frequency's step, used only to estimate how far to
// fast-forward before iterating; the estimate is then corrected exactly.
const APPROX_STEP_MS: Record<RecurrenceFrequency, number> = {
  daily: 864e5,
  weekly: 6048e5,
  monthly: 2629746e3,
  yearly: 31556952e3,
};

const DAY_MS = 864e5;
// The largest time value a `Date` can hold.
const MAX_DATE_MS = 8.64e15;

const WEEKDAYS: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6]);

// The wall clock a rule repeats on. A rule keeps its event's clock time from one
// occurrence to the next, so the occurrences depend on whose clock that is: the
// device's, or a named zone's with its own DST changes.
interface Clock {
  /** The year, month (0 = January), day, hour, minute, second and ms `instant` reads. */
  fields(instant: Date): [number, number, number, number, number, number, number];
  /**
   * The instant a reading names. Fields may overflow (day 32, month 13) and roll
   * over as in the `Date` constructor.
   */
  at(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    ms: number,
  ): Date;
}

const DEVICE_CLOCK: Clock = {
  fields: (instant) => [
    instant.getFullYear(),
    instant.getMonth(),
    instant.getDate(),
    instant.getHours(),
    instant.getMinutes(),
    instant.getSeconds(),
    instant.getMilliseconds(),
  ],
  at(year, month, day, hour, minute, second, ms) {
    // Setters, not the constructor, which reads a year below 100 as 19xx.
    const date = new Date(2000, 0, 1);
    date.setFullYear(year, month, day);
    date.setHours(hour, minute, second, ms);
    return date;
  },
};

// `timeZone`'s clock. A reading equal to `start`'s returns `start` itself, so a
// first occurrence in the hour a fall-back change repeats keeps its instant.
function zoneClock(timeZone: string, start: Date): Clock {
  const fields: Clock["fields"] = (instant) => [
    ...zoneFields(instant, timeZone),
    instant.getUTCMilliseconds(),
  ];
  const origin = fields(start);
  return {
    fields,
    at(...reading) {
      if (reading.every((value, index) => value === origin[index])) return new Date(start);
      const wallClock = utcTime(...reading);
      // Resolving a reading needs a day's room either side of it.
      if (!(Math.abs(wallClock) <= MAX_DATE_MS - DAY_MS)) return new Date(Number.NaN);
      return zonedTimeToUtc(new Date(wallClock), timeZone);
    },
  };
}

// Calendar arithmetic on plain fields, the same on every clock.
const weekdayOf = (year: number, month: number, day: number): number =>
  new Date(utcTime(year, month, day)).getUTCDay();
const daysInMonth = (year: number, month: number): number =>
  new Date(utcTime(year, month + 1, 0)).getUTCDate();

// The day of the month of the `week`th `weekday` in a given month (`week` 1–5, or
// -1 for the last). Returns null when that week doesn't exist (e.g. a 5th Monday
// it lacks).
function nthWeekdayOfMonth(
  year: number,
  month: number,
  week: number,
  weekday: number,
): number | null {
  const lastDay = daysInMonth(year, month);
  if (week === -1) return lastDay - ((weekdayOf(year, month, lastDay) - weekday + 7) % 7);
  const day = 1 + ((weekday - weekdayOf(year, month, 1) + 7) % 7) + (week - 1) * 7;
  return day <= lastDay ? day : null;
}

// Occurrence start dates from `event.start` forward, in chronological order, up
// to `rangeEnd` (and the rule's own `count`/`until`). `earliestStart` is the
// earliest occurrence-start that can still overlap the query window
// (`rangeStart - duration`); the plain fallback rule fast-forwards to it.
function* occurrenceStarts(
  start: Date,
  rule: RecurrenceRule,
  earliestStart: Date,
  rangeEnd: Date,
  clock: Clock,
): Generator<Date> {
  const interval = Math.max(1, Math.trunc(rule.interval ?? 1));
  const [startYear, startMonth, startDay, hour, minute, second, ms] = clock.fields(start);
  // The start's time of day on a calendar day, and that day's midnight.
  const onDay = (year: number, month: number, day: number) =>
    clock.at(year, month, day, hour, minute, second, ms);
  const dayStart = (year: number, month: number, day: number) =>
    clock.at(year, month, day, 0, 0, 0, 0);
  // `produced` counts occurrences from the origin, honouring `count`; `emitted`
  // counts only in-window yields, so the runaway guard isn't spent on the
  // throwaway occurrences that precede a far-future query window.
  let produced = 0;
  let emitted = 0;
  const consider = (date: Date): "skip" | "stop" | "emit" => {
    if (date.getTime() < start.getTime()) return "skip"; // before the first occurrence
    // A large interval can advance beyond Date's representable range (NaN).
    if (!(date.getTime() <= rangeEnd.getTime())) return "stop";
    if (rule.until != null && date.getTime() > rule.until.getTime()) return "stop";
    if (rule.count != null && produced >= rule.count) return "stop";
    produced += 1;
    if (date.getTime() < earliestStart.getTime()) return "skip"; // before the window
    if (emitted >= MAX_OCCURRENCES) return "stop";
    emitted += 1;
    return "emit";
  };

  if (rule.freq === "weekly" && rule.weekdays?.length) {
    // The week start decides which days share a week, so it changes the result
    // only when `interval` skips weeks. RFC 5545 defaults WKST to Monday.
    const weekStartsOn = WEEKDAYS.has(rule.weekStartsOn as number) ? rule.weekStartsOn! : 1;
    const offsets = [...new Set(rule.weekdays.map((day) => (day - weekStartsOn + 7) % 7))].sort(
      (a, b) => a - b,
    );
    // The week's first day, as a day of the start's month (zero or negative when
    // the week began in the month before).
    let weekStart =
      startDay - ((weekdayOf(startYear, startMonth, startDay) - weekStartsOn + 7) % 7);
    while (true) {
      for (const offset of offsets) {
        const date = onDay(startYear, startMonth, weekStart + offset);
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "skip") continue;
        yield date;
      }
      weekStart += 7 * interval;
      if (!(dayStart(startYear, startMonth, weekStart).getTime() <= rangeEnd.getTime())) return;
    }
  }

  if (rule.freq === "monthly" && rule.monthDays?.length) {
    let year = startYear;
    let month = startMonth;
    while (true) {
      const lastDay = daysInMonth(year, month);
      // Resolve each configured day to a concrete date-of-month (negatives count
      // from the end), drop days this month lacks, and emit in chronological order.
      const days = [...new Set(rule.monthDays.map((d) => (d < 0 ? lastDay + d + 1 : d)))]
        .filter((d) => d >= 1 && d <= lastDay)
        .sort((a, b) => a - b);
      for (const d of days) {
        const date = onDay(year, month, d);
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "skip") continue;
        yield date;
      }
      month += interval;
      year += Math.floor(month / 12);
      month = ((month % 12) + 12) % 12;
      // No occurrence yielded yet but we've run past the range: stop.
      if (!(dayStart(year, month, 1).getTime() <= rangeEnd.getTime())) return;
    }
  }

  if ((rule.freq === "monthly" || rule.freq === "yearly") && rule.nthWeekday) {
    const { week, weekday } = rule.nthWeekday;
    const stepMonths = rule.freq === "monthly" ? interval : 12 * interval;
    let year = startYear;
    let month = startMonth;
    while (true) {
      const day = nthWeekdayOfMonth(year, month, week, weekday);
      if (day !== null) {
        const date = onDay(year, month, day);
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "emit") yield date;
      }
      month += stepMonths;
      year += Math.floor(month / 12);
      month = ((month % 12) + 12) % 12;
      // No occurrence yielded yet but we've run past the range: stop.
      if (!(dayStart(year, month, 1).getTime() <= rangeEnd.getTime())) return;
    }
  }

  if (rule.freq === "yearly" && rule.months?.length) {
    const months = [...new Set(rule.months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
    let year = startYear;
    while (true) {
      for (const m of months) {
        const month = m - 1;
        // Skip a year whose listed month lacks the start's day (e.g. Feb 29).
        if (startDay > daysInMonth(year, month)) continue;
        const date = onDay(year, month, startDay);
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "skip") continue;
        yield date;
      }
      year += interval;
      if (!(dayStart(year, 0, 1).getTime() <= rangeEnd.getTime())) return;
    }
  }

  // Fallback: plain daily/weekly/monthly/yearly stepping. Each occurrence is
  // computed from the original `start` (never the previous occurrence), so a
  // month-end or Feb-29 start doesn't drift: a shorter month clamps to its last
  // day, and the next longer one returns to the start's day.
  const occAt = (n: number): Date => {
    if (n === 0) return new Date(start.getTime());
    const steps = n * interval;
    if (rule.freq === "daily") return onDay(startYear, startMonth, startDay + steps);
    if (rule.freq === "weekly") return onDay(startYear, startMonth, startDay + 7 * steps);
    const month = startMonth + (rule.freq === "monthly" ? steps : 12 * steps);
    return onDay(startYear, month, Math.min(startDay, daysInMonth(startYear, month)));
  };
  const lowerBound = earliestStart.getTime();
  // Fast-forward to the first occurrence that can overlap the window so a
  // far-future query doesn't iterate (and exhaust the guard) from `start`.
  let n = 0;
  if (occAt(0).getTime() < lowerBound) {
    n = Math.max(
      0,
      Math.floor((lowerBound - start.getTime()) / (APPROX_STEP_MS[rule.freq] * interval)),
    );
    // Correct the estimate exactly for calendar/DST wobble.
    while (n > 0 && occAt(n - 1).getTime() >= lowerBound) n -= 1;
    while (occAt(n).getTime() < lowerBound) n += 1;
  }
  while (true) {
    if (rule.count != null && n >= rule.count) return;
    if (emitted >= MAX_OCCURRENCES) return;
    const date = occAt(n);
    if (!(date.getTime() <= rangeEnd.getTime())) return;
    if (rule.until != null && date.getTime() > rule.until.getTime()) return;
    emitted += 1;
    n += 1;
    yield date;
  }
}

function instanceAt<T>(event: CalendarEvent<T>, start: Date, durationMs: number): CalendarEvent<T> {
  const instance = { ...event, start, end: new Date(start.getTime() + durationMs) };
  // Occurrences aren't themselves recurring.
  delete (instance as { recurrence?: unknown }).recurrence;
  return instance;
}

// `date` on `timeZone`'s wall clock; an invalid date stays invalid, where `Intl`
// would throw.
const zonedOrInvalid = (date: Date, timeZone: string): Date =>
  Number.isNaN(date.getTime()) ? date : toZonedTime(date, timeZone);

// A reading of exactly midnight.
const isMidnight = (fields: readonly number[]): boolean =>
  fields[3] === 0 && fields[4] === 0 && fields[5] === 0 && fields[6] === 0;

/** Options for {@link expandRecurringEvents}. */
export interface ExpandRecurringEventsOptions {
  /**
   * The IANA time zone whose wall clock the rules repeat on (e.g.
   * `"America/New_York"`). A timed event keeps its clock time in that zone across
   * the zone's DST changes, and its weekday, month-day and exception rules read
   * that zone's calendar. An exception that reads the event's own time of day
   * there (or equals one of the `rdates`) drops the occurrence at that instant;
   * any other exception at midnight, on the device or in the zone, drops its
   * whole day. Omit it to repeat on the device's clock. All-day events
   * name calendar days, so they always repeat on the device's calendar.
   */
  timeZone?: string;
}

/**
 * Materialise recurring events into concrete occurrences overlapping
 * `[rangeStart, rangeEnd]`. Non-recurring events pass through untouched, so the
 * result is ready to hand to `<Calendar events={...} />`. Each occurrence keeps
 * the original event's duration and fields (minus `recurrence`).
 *
 * Pass `timeZone` to repeat timed events on that zone's wall clock instead of
 * the device's. `rangeStart` and `rangeEnd` are real instants either way.
 */
export function expandRecurringEvents<T>(
  events: CalendarEvent<T>[],
  rangeStart: Date,
  rangeEnd: Date,
  { timeZone }: ExpandRecurringEventsOptions = {},
): CalendarEvent<T>[] {
  const out: CalendarEvent<T>[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      out.push(event);
      continue;
    }
    const durationMs = event.end.getTime() - event.start.getTime();
    // An all-day event names calendar days, which a display zone doesn't shift
    // (see `eventsInTimeZone`), so it repeats on the device's calendar and the
    // window is read as the zone's days.
    // An invalid start has no reading on a zone's clock; the device clock turns
    // it into no occurrences.
    const zoned = timeZone != null && !isAllDayEvent(event) && !Number.isNaN(event.start.getTime());
    const clock = zoned ? zoneClock(timeZone, event.start) : DEVICE_CLOCK;
    const [from, to] =
      timeZone != null && isAllDayEvent(event)
        ? [zonedOrInvalid(rangeStart, timeZone), zonedOrInvalid(rangeEnd, timeZone)]
        : [rangeStart, rangeEnd];
    // Union the rule's occurrences with any explicit RDATE additions, keyed by
    // exact start time so a date the rule already produces isn't duplicated.
    const starts = new Map<number, Date>();
    // Occurrences starting up to one duration before the range can still overlap it.
    const earliestStart = new Date(from.getTime() - durationMs);
    for (const start of occurrenceStarts(event.start, event.recurrence, earliestStart, to, clock)) {
      starts.set(start.getTime(), start);
    }
    for (const rdate of event.recurrence.rdates ?? []) {
      if (rdate.getTime() <= to.getTime()) starts.set(rdate.getTime(), rdate);
    }
    // Exceptions (EXDATE): a date-only exception (local midnight) drops every
    // occurrence on that calendar day (RFC 5545 VALUE=DATE); a timed exception
    // drops only the occurrence starting at that exact instant, so two
    // same-day occurrences can be cancelled independently.
    const dayKey = (fields: readonly number[]) => `${fields[0]}-${fields[1]}-${fields[2]}`;
    const excludedDays = new Set<string>();
    const excludedInstants = new Set<number>();
    const startFields = clock.fields(event.start);
    const rdateTimes = new Set((event.recurrence.rdates ?? []).map((rdate) => rdate.getTime()));
    for (const exdate of event.recurrence.exdates ?? []) {
      if (Number.isNaN(exdate.getTime())) continue;
      const onDevice = DEVICE_CLOCK.fields(exdate);
      if (!zoned) {
        if (isMidnight(onDevice)) excludedDays.add(dayKey(onDevice));
        else excludedInstants.add(exdate.getTime());
        continue;
      }
      // On a zone's clock, device midnight is an arbitrary time of day, so an
      // exception that can be an occurrence's own start (it reads the start's
      // time of day in the zone, or is one of the `rdates`) is that occurrence's.
      // Any other date at midnight, on the device (a parsed `VALUE=DATE`) or in
      // the zone, names the calendar day it reads there. Decided from the dates
      // alone, so the answer doesn't change with the query window.
      const inZone = clock.fields(exdate);
      excludedInstants.add(exdate.getTime());
      if (rdateTimes.has(exdate.getTime())) continue;
      if ([3, 4, 5, 6].every((index) => inZone[index] === startFields[index])) continue;
      if (isMidnight(onDevice)) excludedDays.add(dayKey(onDevice));
      else if (isMidnight(inZone)) excludedDays.add(dayKey(inZone));
    }
    const ordered = [...starts.values()].sort((a, b) => a.getTime() - b.getTime());
    for (const start of ordered) {
      // Skip occurrences that end before the range opens, but keep iterating.
      if (start.getTime() + durationMs < from.getTime()) continue;
      if (excludedInstants.has(start.getTime())) continue;
      if (excludedDays.size > 0 && excludedDays.has(dayKey(clock.fields(start)))) continue;
      const instance = instanceAt(event, start, durationMs);
      if (Number.isFinite(instance.end.getTime())) out.push(instance);
    }
  }
  return out;
}
