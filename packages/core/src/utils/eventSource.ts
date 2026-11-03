import type { CalendarEvent, RecurrenceRule, WeekStartsOn } from "../types";
import { parseICalendar } from "./ical";

/** A JSON or iCalendar URL, or a caller-owned async event loader. */
export type EventSource<T = unknown> = string | (() => Promise<CalendarEvent<T>[]>);

/** Options for loading a calendar event source. */
export interface EventSourceOptions<T> {
  /**
   * Feed format for URL sources: `"json"` (default) expects an array of event
   * objects with ISO `start`/`end` strings; `"ics"` parses an iCalendar feed.
   * URLs ending in `.ics` default to `"ics"`.
   */
  format?: "json" | "ics";
  /**
   * Map the parsed JSON array into events, for feeds whose shape doesn't match
   * `CalendarEvent` (rename fields, attach `resourceId`, filter). The default
   * validates calendar fields and revives event and recurrence date strings.
   */
  map?: (items: unknown[]) => CalendarEvent<T>[];
  /** Re-fetch every N ms. Values outside (0, 2147483647] or non-finite values disable polling. */
  refetchIntervalMs?: number;
}

function dateFromJSON(value: unknown, field: string): Date {
  if (typeof value !== "string") throw new Error(`Event source ${field} must be a date string`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error(`Event source ${field} is not a valid date`);
  return date;
}

function objectFromJSON(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Event source ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function arrayFromJSON(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Event source ${field} must be an array`);
  return value;
}

function integerFromJSON(
  value: unknown,
  field: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Event source ${field} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function weekdayFromJSON(value: unknown, field: string): WeekStartsOn {
  switch (value) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
      return value;
    default:
      throw new Error(`Event source ${field} must be a weekday from 0 to 6`);
  }
}

function recurrenceFromJSON(value: unknown, field: string): RecurrenceRule {
  const input = objectFromJSON(value, field);
  const { freq } = input;
  if (freq !== "daily" && freq !== "weekly" && freq !== "monthly" && freq !== "yearly") {
    throw new Error(`Event source ${field}.freq must be daily, weekly, monthly, or yearly`);
  }
  const rule: RecurrenceRule = { freq };
  if (input.interval !== undefined)
    rule.interval = integerFromJSON(input.interval, `${field}.interval`, 1);
  if (input.count !== undefined) rule.count = integerFromJSON(input.count, `${field}.count`, 0);
  if (input.until !== undefined) rule.until = dateFromJSON(input.until, `${field}.until`);
  for (const key of ["exdates", "rdates"] as const) {
    if (input[key] !== undefined)
      rule[key] = arrayFromJSON(input[key], `${field}.${key}`).map((date, index) =>
        dateFromJSON(date, `${field}.${key}[${index}]`),
      );
  }
  if (input.weekdays !== undefined)
    rule.weekdays = arrayFromJSON(input.weekdays, `${field}.weekdays`).map((day) =>
      weekdayFromJSON(day, `${field}.weekdays`),
    );
  if (input.months !== undefined)
    rule.months = arrayFromJSON(input.months, `${field}.months`).map((month) =>
      integerFromJSON(month, `${field}.months`, 1, 12),
    );
  if (input.monthDays !== undefined)
    rule.monthDays = arrayFromJSON(input.monthDays, `${field}.monthDays`).map((day) => {
      const parsed = integerFromJSON(day, `${field}.monthDays`, -31, 31);
      if (parsed === 0) throw new Error(`Event source ${field}.monthDays cannot contain zero`);
      return parsed;
    });
  if (input.nthWeekday !== undefined) {
    const nth = objectFromJSON(input.nthWeekday, `${field}.nthWeekday`);
    rule.nthWeekday = {
      week: nth.week === -1 ? -1 : integerFromJSON(nth.week, `${field}.nthWeekday.week`, 1, 5),
      weekday: weekdayFromJSON(nth.weekday, `${field}.nthWeekday.weekday`),
    };
  }
  return rule;
}

const defaultMap = (items: unknown[]): CalendarEvent[] =>
  items.map((raw, index) => {
    const field = `item ${index}`;
    const item = objectFromJSON(raw, field);
    for (const key of ["title", "dragHandleColor"] as const) {
      if (item[key] !== undefined && typeof item[key] !== "string")
        throw new Error(`Event source ${field}.${key} must be a string`);
    }
    for (const key of [
      "allDay",
      "disabled",
      "draggable",
      "startEditable",
      "durationEditable",
    ] as const) {
      if (item[key] !== undefined && typeof item[key] !== "boolean")
        throw new Error(`Event source ${field}.${key} must be a boolean`);
    }
    if (item.display !== undefined && item.display !== "auto" && item.display !== "background")
      throw new Error(`Event source ${field}.display must be auto or background`);
    return {
      ...item,
      start: dateFromJSON(item.start, `${field}.start`),
      end: dateFromJSON(item.end, `${field}.end`),
      ...(item.recurrence === undefined
        ? {}
        : { recurrence: recurrenceFromJSON(item.recurrence, `${field}.recurrence`) }),
    };
  });

/** Load one event batch. A caller can abort URL requests with signal. */
export async function loadEventSource<T = unknown>({
  source,
  format,
  map,
  signal,
}: EventSourceOptions<T> & { source: EventSource<T>; signal?: AbortSignal }): Promise<
  CalendarEvent<T>[]
> {
  if (typeof source === "function") {
    return await source();
  } else {
    const response = await fetch(source, signal ? { signal } : undefined);
    if (!response.ok) throw new Error(`Event source responded ${response.status}`);
    const isIcs = format === "ics" || (format == null && /\.ics(\?|$)/.test(source));
    if (isIcs) {
      return parseICalendar(await response.text()) as CalendarEvent<T>[];
    } else {
      const body: unknown = await response.json();
      const items = arrayFromJSON(body, "JSON");
      return map ? map(items) : (defaultMap(items) as CalendarEvent<T>[]);
    }
  }
}
