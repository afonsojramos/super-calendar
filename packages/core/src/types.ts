/** The view the calendar renders: a day-column grid (`day`, `3days`, `week`, `custom`), the `month` grid, or the `schedule` list. */
export type CalendarMode = "day" | "3days" | "week" | "custom" | "month" | "schedule" | "year";

/** The time-grid modes (day-column views, excluding month and schedule). */
export type TimeGridMode = Exclude<CalendarMode, "month" | "schedule" | "year">;

/**
 * The minimal shape every calendar event must have. Layout (positioning,
 * overlap resolution, paging) only ever reads `start`/`end`; `title` is used by
 * the built-in default renderer. Anything else lives in your own type and is
 * threaded through untouched via the `T` generic.
 */
export interface ICalendarEvent {
  /** When the event begins. */
  start: Date;
  /** When the event ends. */
  end: Date;
  /** Display label, shown by the built-in default renderer. */
  title?: string;
  /**
   * Force this event into the all-day lane (above the time grid) instead of the
   * timed columns. When omitted, an event is treated as all-day only if it spans
   * whole days (both `start` and `end` land on midnight).
   */
  allDay?: boolean;
  /** Ignore taps/long-presses on this event (the built-in renderer also dims it). */
  disabled?: boolean;
  /**
   * How the event renders. `"auto"` (default) is a normal event box/chip;
   * `"background"` paints the event's time range as a non-interactive shaded
   * band behind the grid instead (blocked time, holidays). Background events
   * are excluded from chips, the agenda, and year-view dots.
   */
  display?: "auto" | "background";
  /**
   * Repeat rule. Pass the event to `expandRecurringEvents(events, start, end)` to
   * materialise its occurrences within a range; the calendar itself doesn't
   * expand recurrences.
   */
  recurrence?: RecurrenceRule;
}

/** How often a recurring event repeats. */
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** A simple, RRULE-inspired repeat rule expanded by `expandRecurringEvents`. */
export interface RecurrenceRule {
  /** How often the event repeats. */
  freq: RecurrenceFrequency;
  /** Repeat every N periods. Default 1. */
  interval?: number;
  /** Stop after this many occurrences (including the first). */
  count?: number;
  /** Stop on/after this date (inclusive). */
  until?: Date;
  /**
   * For `weekly`: the weekdays to repeat on (0 = Sunday … 6 = Saturday), keeping
   * the event's time of day. Omit to repeat on the start date's own weekday.
   */
  weekdays?: WeekStartsOn[];
  /**
   * For `monthly`/`yearly`: repeat on the Nth weekday of the period instead of the
   * start date's day-of-month — e.g. `{ week: 3, weekday: 1 }` is the 3rd Monday.
   * `week` is 1–5, or -1 for the last such weekday. Maps to an ordinal iCal `BYDAY`
   * (e.g. `3MO`, `-1FR`).
   */
  nthWeekday?: { week: number; weekday: WeekStartsOn };
  /**
   * For `monthly`: the day(s) of the month to repeat on — 1–31, or negative to
   * count from the month's end (-1 is the last day, -2 the second-to-last). Days
   * that don't exist in a given month (e.g. the 31st in February) are skipped.
   * Takes precedence over the start date's own day-of-month. Maps to iCal
   * `BYMONTHDAY`.
   */
  monthDays?: number[];
  /**
   * For `yearly`: the month(s) to repeat in (1 = January … 12 = December), keeping
   * the start date's day-of-month. Years where a listed month lacks that day are
   * skipped. Maps to iCal `BYMONTH`.
   */
  months?: number[];
  /**
   * Dates to skip (exceptions), dropped by `expandRecurringEvents`. A date at
   * local midnight drops every occurrence on that calendar day (iCal
   * `EXDATE;VALUE=DATE`); a date with a time drops only the occurrence starting
   * at that exact instant. Maps to iCal `EXDATE`.
   */
  exdates?: Date[];
  /**
   * Extra one-off start dates added to the set, even ones the rule wouldn't
   * produce. Merged in chronological order and de-duplicated against rule
   * occurrences; `exdates` still apply. Maps to iCal `RDATE`.
   */
  rdates?: Date[];
}

/**
 * An event carrying arbitrary extra fields `T` alongside the required shape.
 * `ICalendarEvent` is authoritative: keys it reserves (`start`/`end`/`title`)
 * cannot be re-typed by `T`.
 */
export type CalendarEvent<T = unknown> = ICalendarEvent & Omit<T, keyof ICalendarEvent>;

/** Build a stable key for an event. Defaults to start-time + index. */
export type EventKeyExtractor<T = unknown> = (event: CalendarEvent<T>, index: number) => string;

/** Sunday = 0 … Saturday = 6, matching `Date.prototype.getDay()`. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A day's open hours for `businessHours` shading on the time grid: `{ start, end }`
 * in hours (fractions allowed, e.g. 9.5), or `null` when the day is closed (fully
 * shaded). `undefined` from the callback means "no business-hours shading". Shared
 * by both renderers; pair with `closedHourBands` to get the spans to shade.
 */
export type BusinessHours = (date: Date) => { start: number; end: number } | null;
