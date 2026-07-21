import { addDays, addMonths, addWeeks, addYears, startOfWeek } from "date-fns";
import type { CalendarEvent, RecurrenceFrequency, RecurrenceRule } from "../types";

const STEP: Record<RecurrenceFrequency, (date: Date, amount: number) => Date> = {
  daily: addDays,
  weekly: addWeeks,
  monthly: addMonths,
  yearly: addYears,
};

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
// to `rangeEnd` (and the rule's own `count`/`until`). `earliestStart` is the
// earliest occurrence-start that can still overlap the query window
// (`rangeStart - duration`); the plain fallback rule fast-forwards to it.
function* occurrenceStarts(
  start: Date,
  rule: RecurrenceRule,
  earliestStart: Date,
  rangeEnd: Date,
): Generator<Date> {
  const interval = Math.max(1, Math.trunc(rule.interval ?? 1));
  // `produced` counts occurrences from the origin, honouring `count`; `emitted`
  // counts only in-window yields, so the runaway guard isn't spent on the
  // throwaway occurrences that precede a far-future query window.
  let produced = 0;
  let emitted = 0;
  const consider = (date: Date): "skip" | "stop" | "emit" => {
    if (date.getTime() < start.getTime()) return "skip"; // before the first occurrence
    if (date.getTime() > rangeEnd.getTime()) return "stop";
    if (rule.until != null && date.getTime() > rule.until.getTime()) return "stop";
    if (rule.count != null && produced >= rule.count) return "stop";
    produced += 1;
    if (date.getTime() < earliestStart.getTime()) return "skip"; // before the window
    if (emitted >= MAX_OCCURRENCES) return "stop";
    emitted += 1;
    return "emit";
  };

  if (rule.freq === "weekly" && rule.weekdays?.length) {
    const weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
    let weekStart = startOfWeek(start, { weekStartsOn: 0 });
    while (true) {
      let advanced = false;
      for (const weekday of weekdays) {
        const date = withTimeOf(addDays(weekStart, weekday), start);
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "skip") continue;
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
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "skip") continue;
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
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "emit") yield date;
      }
      month += stepMonths;
      year += Math.floor(month / 12);
      month = ((month % 12) + 12) % 12;
      // No occurrence yielded yet but we've run past the range: stop.
      if (new Date(year, month, 1).getTime() > rangeEnd.getTime()) return;
    }
  }

  if (rule.freq === "yearly" && rule.months?.length) {
    const day = start.getDate();
    const months = [...new Set(rule.months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
    let year = start.getFullYear();
    while (true) {
      for (const m of months) {
        const month = m - 1;
        // Skip a year whose listed month lacks the start's day (e.g. Feb 29).
        if (day > new Date(year, month + 1, 0).getDate()) continue;
        const date = withTimeOf(new Date(year, month, day), start);
        const verdict = consider(date);
        if (verdict === "stop") return;
        if (verdict === "skip") continue;
        yield date;
      }
      year += interval;
      if (new Date(year, 0, 1).getTime() > rangeEnd.getTime()) return;
    }
  }

  // Fallback: plain daily/weekly/monthly/yearly stepping. Each occurrence is
  // computed from the original `start` (never the previous occurrence), so a
  // month-end or Feb-29 start doesn't drift as date-fns clamps shorter months.
  const occAt = (n: number) => STEP[rule.freq](start, n * interval);
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
    if (date.getTime() > rangeEnd.getTime()) return;
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
    // Exceptions (EXDATE): a date-only exception (local midnight) drops every
    // occurrence on that calendar day (RFC 5545 VALUE=DATE); a timed exception
    // drops only the occurrence starting at that exact instant, so two
    // same-day occurrences can be cancelled independently.
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const excludedDays = new Set<string>();
    const excludedInstants = new Set<number>();
    for (const exdate of event.recurrence.exdates ?? []) {
      const isMidnight =
        exdate.getHours() === 0 &&
        exdate.getMinutes() === 0 &&
        exdate.getSeconds() === 0 &&
        exdate.getMilliseconds() === 0;
      if (isMidnight) excludedDays.add(dayKey(exdate));
      else excludedInstants.add(exdate.getTime());
    }
    // Union the rule's occurrences with any explicit RDATE additions, keyed by
    // exact start time so a date the rule already produces isn't duplicated.
    const starts = new Map<number, Date>();
    // Occurrences starting up to one duration before the range can still overlap it.
    const earliestStart = new Date(rangeStart.getTime() - durationMs);
    for (const start of occurrenceStarts(event.start, event.recurrence, earliestStart, rangeEnd)) {
      starts.set(start.getTime(), start);
    }
    for (const rdate of event.recurrence.rdates ?? []) {
      if (rdate.getTime() <= rangeEnd.getTime()) starts.set(rdate.getTime(), rdate);
    }
    const ordered = [...starts.values()].sort((a, b) => a.getTime() - b.getTime());
    for (const start of ordered) {
      // Skip occurrences that end before the range opens, but keep iterating.
      if (start.getTime() + durationMs < rangeStart.getTime()) continue;
      if (excludedDays.has(dayKey(start)) || excludedInstants.has(start.getTime())) continue;
      out.push(instanceAt(event, start, durationMs));
    }
  }
  return out;
}
