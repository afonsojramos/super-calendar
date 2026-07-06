import { addDays, addMonths, addWeeks, addYears, startOfWeek } from "date-fns";
import type { CalendarEvent, RecurrenceFrequency, RecurrenceRule } from "../types";

const STEP: Record<RecurrenceFrequency, (date: Date, amount: number) => Date> = {
  daily: addDays,
  weekly: addWeeks,
  monthly: addMonths,
  yearly: addYears,
};

// Runaway guard. Generous enough for realistic ranges (e.g. ~13 years of a daily
// event); set `count`/`until`, or query a tighter range, for anything larger.
const MAX_OCCURRENCES = 5000;

// Copy `source`'s time of day onto `date`.
function withTimeOf(date: Date, source: Date): Date {
  const next = new Date(date);
  next.setHours(
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  );
  return next;
}

// The date of the `week`th `weekday` in a given month (`week` 1–5, or -1 for the
// last). Returns null when that week doesn't exist (e.g. a 5th Monday it lacks).
function nthWeekdayOfMonth(
  year: number,
  month: number,
  week: number,
  weekday: number,
): Date | null {
  if (week === -1) {
    const lastDay = new Date(year, month + 1, 0);
    const back = (lastDay.getDay() - weekday + 7) % 7;
    return new Date(year, month, lastDay.getDate() - back);
  }
  const firstWeekday = new Date(year, month, 1).getDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (week - 1) * 7;
  const date = new Date(year, month, day);
  return date.getMonth() === month ? date : null;
}

// Occurrence start dates from `event.start` forward, in chronological order, up
// to `rangeEnd` (and the rule's own `count`/`until`).
function* occurrenceStarts(start: Date, rule: RecurrenceRule, rangeEnd: Date): Generator<Date> {
  const interval = Math.max(1, Math.trunc(rule.interval ?? 1));
  let produced = 0;
  const within = (date: Date) =>
    date.getTime() <= rangeEnd.getTime() &&
    (rule.until == null || date.getTime() <= rule.until.getTime()) &&
    (rule.count == null || produced < rule.count) &&
    produced < MAX_OCCURRENCES;

  if (rule.freq === "weekly" && rule.weekdays?.length) {
    const weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
    let weekStart = startOfWeek(start, { weekStartsOn: 0 });
    while (true) {
      let advanced = false;
      for (const weekday of weekdays) {
        const date = withTimeOf(addDays(weekStart, weekday), start);
        if (date.getTime() < start.getTime()) continue; // before the first occurrence
        if (!within(date)) return;
        produced += 1;
        advanced = true;
        yield date;
      }
      const nextWeek = addWeeks(weekStart, interval);
      // Guard against a week that yielded nothing yet hasn't reached the range.
      if (!advanced && nextWeek.getTime() > rangeEnd.getTime()) return;
      weekStart = nextWeek;
    }
  }

  if (rule.freq === "monthly" && rule.monthDays?.length) {
    let year = start.getFullYear();
    let month = start.getMonth();
    while (true) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      // Resolve each configured day to a concrete date-of-month (negatives count
      // from the end), drop days this month lacks, and emit in chronological order.
      const days = [...new Set(rule.monthDays.map((d) => (d < 0 ? daysInMonth + d + 1 : d)))]
        .filter((d) => d >= 1 && d <= daysInMonth)
        .sort((a, b) => a - b);
      for (const d of days) {
        const date = withTimeOf(new Date(year, month, d), start);
        if (date.getTime() < start.getTime()) continue; // before the first occurrence
        if (!within(date)) return;
        produced += 1;
        yield date;
      }
      month += interval;
      year += Math.floor(month / 12);
      month = ((month % 12) + 12) % 12;
      // No occurrence yielded yet but we've run past the range: stop.
      if (new Date(year, month, 1).getTime() > rangeEnd.getTime()) return;
    }
  }

  if ((rule.freq === "monthly" || rule.freq === "yearly") && rule.nthWeekday) {
    const { week, weekday } = rule.nthWeekday;
    const stepMonths = rule.freq === "monthly" ? interval : 12 * interval;
    let year = start.getFullYear();
    let month = start.getMonth();
    while (true) {
      const day = nthWeekdayOfMonth(year, month, week, weekday);
      if (day) {
        const date = withTimeOf(day, start);
        if (date.getTime() >= start.getTime()) {
          if (!within(date)) return;
          produced += 1;
          yield date;
        }
      }
      month += stepMonths;
      year += Math.floor(month / 12);
      month = ((month % 12) + 12) % 12;
      // No occurrence yielded yet but we've run past the range: stop.
      if (new Date(year, month, 1).getTime() > rangeEnd.getTime()) return;
    }
  }

  let cursor = start;
  while (within(cursor)) {
    produced += 1;
    yield cursor;
    cursor = STEP[rule.freq](cursor, interval);
  }
}

function instanceAt<T>(event: CalendarEvent<T>, start: Date, durationMs: number): CalendarEvent<T> {
  const instance = { ...event, start, end: new Date(start.getTime() + durationMs) };
  // Occurrences aren't themselves recurring.
  delete (instance as { recurrence?: unknown }).recurrence;
  return instance;
}

/**
 * Materialise recurring events into concrete occurrences overlapping
 * `[rangeStart, rangeEnd]`. Non-recurring events pass through untouched, so the
 * result is ready to hand to `<Calendar events={...} />`. Each occurrence keeps
 * the original event's duration and fields (minus `recurrence`).
 */
export function expandRecurringEvents<T>(
  events: CalendarEvent<T>[],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent<T>[] {
  const out: CalendarEvent<T>[] = [];
  for (const event of events) {
    if (!event.recurrence) {
      out.push(event);
      continue;
    }
    const durationMs = event.end.getTime() - event.start.getTime();
    // Exception days (EXDATE): an occurrence landing on one of these is dropped.
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const excluded = new Set((event.recurrence.exdates ?? []).map(dayKey));
    // Union the rule's occurrences with any explicit RDATE additions, keyed by
    // exact start time so a date the rule already produces isn't duplicated.
    const starts = new Map<number, Date>();
    for (const start of occurrenceStarts(event.start, event.recurrence, rangeEnd)) {
      starts.set(start.getTime(), start);
    }
    for (const rdate of event.recurrence.rdates ?? []) {
      if (rdate.getTime() <= rangeEnd.getTime()) starts.set(rdate.getTime(), rdate);
    }
    const ordered = [...starts.values()].sort((a, b) => a.getTime() - b.getTime());
    for (const start of ordered) {
      // Skip occurrences that end before the range opens, but keep iterating.
      if (start.getTime() + durationMs < rangeStart.getTime()) continue;
      if (excluded.has(dayKey(start))) continue;
      out.push(instanceAt(event, start, durationMs));
    }
  }
  return out;
}
