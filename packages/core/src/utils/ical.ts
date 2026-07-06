// iCalendar (RFC 5545) import/export. Converts between `.ics` text and the
// library's `CalendarEvent` shape so events interoperate with Google Calendar,
// Apple Calendar, Outlook, and anything else that speaks iCal. This is a
// pragmatic subset: VEVENT with SUMMARY / DESCRIPTION / LOCATION / UID,
// DTSTART / DTEND (date, UTC, or floating local), all-day events, and a
// round-trippable RRULE that maps onto the library's `RecurrenceRule`.

import type { ICalendarEvent, RecurrenceFrequency, RecurrenceRule, WeekStartsOn } from "../types";
import { zonedTimeToUtc } from "./timezone";

/** An event parsed from iCal, carrying the standard fields it also round-trips. */
export interface ICalEvent extends ICalendarEvent {
  /** The VEVENT `UID`, if present. */
  uid?: string;
  /** The VEVENT `DESCRIPTION`, if present. */
  description?: string;
  /** The VEVENT `LOCATION`, if present. */
  location?: string;
}

/** Options for {@link toICalendar}. */
export interface ToICalendarOptions {
  /** `PRODID` written to the calendar header. Default `-//super-calendar//EN`. */
  prodId?: string;
  /** The `DTSTAMP` stamped on every event (when it was written). Default: now. */
  now?: Date;
}

const RRULE_FREQ: Record<string, RecurrenceFrequency> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
};
const FREQ_RRULE: Record<RecurrenceFrequency, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  yearly: "YEARLY",
};
// BYDAY tokens are Sunday-first, matching the library's 0=Sunday weekday index.
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

// --- Text escaping (RFC 5545 §3.3.11) ------------------------------------

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function unescapeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && i + 1 < value.length) {
      const next = value[++i];
      out += next === "n" || next === "N" ? "\n" : next;
    } else {
      out += ch;
    }
  }
  return out;
}

// --- Line folding (RFC 5545 §3.1) ----------------------------------------

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  parts.push(` ${rest}`);
  return parts.join("\r\n");
}

// Undo folding: a physical line beginning with a space or tab continues the one
// before it (with that leading whitespace removed).
function unfoldLines(text: string): string[] {
  const raw = text.split(/\r\n|\r|\n/);
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

// --- Dates ---------------------------------------------------------------

/** Serialize a Date as a UTC iCal date-time (`YYYYMMDDTHHMMSSZ`). */
function formatUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Serialize a Date as an iCal date-only value (`YYYYMMDD`) from its local parts. */
function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/**
 * Parse an iCal DATE / DATE-TIME value. `dateOnly` marks all-day (`VALUE=DATE`);
 * `tzid` is the IANA zone from a `TZID=` param, used to resolve the local time to
 * the correct UTC instant.
 */
function parseIcalDate(value: string, dateOnly: boolean, tzid?: string): Date {
  const y = Number(value.slice(0, 4));
  const mo = Number(value.slice(4, 6)) - 1;
  const d = Number(value.slice(6, 8));
  if (dateOnly || !value.includes("T")) return new Date(y, mo, d);
  const h = Number(value.slice(9, 11));
  const mi = Number(value.slice(11, 13));
  const s = Number(value.slice(13, 15));
  // Trailing Z → UTC.
  if (value.endsWith("Z")) return new Date(Date.UTC(y, mo, d, h, mi, s));
  // TZID → resolve the wall-clock time in that IANA zone to a real instant.
  if (tzid) {
    try {
      return zonedTimeToUtc(new Date(Date.UTC(y, mo, d, h, mi, s)), tzid);
    } catch {
      // Unknown zone id: fall through to a floating/local time.
    }
  }
  // No zone → a floating/local time.
  return new Date(y, mo, d, h, mi, s);
}

/** Parse an iCal/ISO-8601 DURATION (e.g. `PT1H30M`, `P1D`, `P1W`) to milliseconds. */
function parseDuration(value: string): number | null {
  const m = /^([+-]?)P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim(),
  );
  if (!m || (!m[2] && !m[3] && !m[4] && !m[5] && !m[6])) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const [w, d, h, mi, s] = [m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0));
  return sign * ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
}

// --- RRULE ---------------------------------------------------------------

function parseRRule(value: string): RecurrenceRule | undefined {
  const parts = new Map<string, string>();
  for (const pair of value.split(";")) {
    const [k, v] = pair.split("=");
    if (k && v) parts.set(k.toUpperCase(), v);
  }
  const freq = parts.get("FREQ");
  if (!freq || !RRULE_FREQ[freq]) return undefined;
  const rule: RecurrenceRule = { freq: RRULE_FREQ[freq] };
  const interval = parts.get("INTERVAL");
  if (interval) rule.interval = Number(interval);
  const count = parts.get("COUNT");
  if (count) rule.count = Number(count);
  const until = parts.get("UNTIL");
  if (until) rule.until = parseIcalDate(until, !until.includes("T"));
  const byday = parts.get("BYDAY");
  if (byday) {
    const days = byday
      .split(",")
      // Keep only plain weekday tokens (ignore ordinals like 2MO for now).
      .map((token) => BYDAY.indexOf(token.trim().toUpperCase() as (typeof BYDAY)[number]))
      .filter((index): index is WeekStartsOn => index >= 0);
    if (days.length) rule.weekdays = days;
  }
  return rule;
}

function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${FREQ_RRULE[rule.freq]}`];
  if (rule.interval && rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.count != null) parts.push(`COUNT=${rule.count}`);
  if (rule.until) parts.push(`UNTIL=${formatUtc(rule.until)}`);
  if (rule.weekdays?.length) parts.push(`BYDAY=${rule.weekdays.map((d) => BYDAY[d]).join(",")}`);
  return parts.join(";");
}

// --- Parse ---------------------------------------------------------------

interface RawLine {
  name: string;
  params: Map<string, string>;
  value: string;
}

function parseLine(line: string): RawLine {
  const colon = line.indexOf(":");
  const head = colon === -1 ? line : line.slice(0, colon);
  const value = colon === -1 ? "" : line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params = new Map<string, string>();
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq !== -1) params.set(p.slice(0, eq).toUpperCase(), p.slice(eq + 1));
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * Parse an iCalendar (`.ics`) string into events. Reads every `VEVENT`; ignores
 * VTODO/VJOURNAL/VTIMEZONE and unknown properties. Events without a usable
 * `DTSTART` are skipped. All-day events (`VALUE=DATE`) with no `DTEND` get a
 * one-day span.
 *
 * @example
 * ```ts
 * const events = parseICalendar(await file.text());
 * ```
 */
export function parseICalendar(ics: string): ICalEvent[] {
  const lines = unfoldLines(ics);
  const events: ICalEvent[] = [];
  let current: Partial<ICalEvent> | null = null;
  let allDay = false;
  // A VEVENT may carry DURATION instead of DTEND; resolve it once DTSTART is known.
  let durationMs: number | null = null;
  // EXDATE(s) may appear before or after RRULE; collect, then attach at END.
  let exdates: Date[] = [];

  for (const raw of lines) {
    const line = parseLine(raw);
    if (line.name === "BEGIN" && line.value === "VEVENT") {
      current = {};
      allDay = false;
      durationMs = null;
      exdates = [];
      continue;
    }
    if (line.name === "END" && line.value === "VEVENT") {
      if (current?.start) {
        if (!current.end && durationMs != null) {
          current.end = new Date(current.start.getTime() + durationMs);
        }
        if (current.recurrence && exdates.length) current.recurrence.exdates = exdates;
        if (allDay) {
          current.allDay = true;
          // iCal all-day DTEND is exclusive; default to a one-day span.
          if (!current.end) current.end = new Date(current.start.getTime() + 86_400_000);
        } else if (!current.end) {
          current.end = current.start;
        }
        events.push(current as ICalEvent);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const dateOnly = line.params.get("VALUE") === "DATE";
    const tzid = line.params.get("TZID");
    switch (line.name) {
      case "SUMMARY":
        current.title = unescapeText(line.value);
        break;
      case "DESCRIPTION":
        current.description = unescapeText(line.value);
        break;
      case "LOCATION":
        current.location = unescapeText(line.value);
        break;
      case "UID":
        current.uid = line.value;
        break;
      case "DTSTART":
        current.start = parseIcalDate(line.value, dateOnly, tzid);
        if (dateOnly) allDay = true;
        break;
      case "DTEND":
        current.end = parseIcalDate(line.value, dateOnly, tzid);
        break;
      case "DURATION":
        durationMs = parseDuration(line.value);
        break;
      case "EXDATE":
        for (const v of line.value.split(",")) {
          if (v) exdates.push(parseIcalDate(v, dateOnly || !v.includes("T"), tzid));
        }
        break;
      case "RRULE": {
        const rule = parseRRule(line.value);
        if (rule) current.recurrence = rule;
        break;
      }
    }
  }
  return events;
}

// --- Serialize -----------------------------------------------------------

function line(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function stableUid(event: ICalEvent): string {
  if (event.uid) return event.uid;
  const title = (event.title ?? "event").replace(/\s+/g, "-");
  return `${formatUtc(event.start)}-${title}@super-calendar`;
}

/**
 * Serialize events to an iCalendar (`.ics`) string. Timed events are written in
 * UTC (`...Z`); all-day events (`allDay: true`) use `VALUE=DATE`. A `recurrence`
 * becomes an `RRULE`, and `uid` / `description` / `location` round-trip.
 *
 * @example
 * ```ts
 * const ics = toICalendar(events);
 * ```
 */
export function toICalendar(events: ICalEvent[], options: ToICalendarOptions = {}): string {
  const stamp = formatUtc(options.now ?? new Date());
  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    line("PRODID", options.prodId ?? "-//super-calendar//EN"),
    "CALSCALE:GREGORIAN",
  ];

  for (const event of events) {
    out.push("BEGIN:VEVENT");
    out.push(line("UID", stableUid(event)));
    out.push(line("DTSTAMP", stamp));
    if (event.allDay) {
      out.push(line("DTSTART;VALUE=DATE", formatDateOnly(event.start)));
      out.push(line("DTEND;VALUE=DATE", formatDateOnly(event.end)));
    } else {
      out.push(line("DTSTART", formatUtc(event.start)));
      out.push(line("DTEND", formatUtc(event.end)));
    }
    if (event.title) out.push(line("SUMMARY", escapeText(event.title)));
    if (event.description) out.push(line("DESCRIPTION", escapeText(event.description)));
    if (event.location) out.push(line("LOCATION", escapeText(event.location)));
    if (event.recurrence) out.push(line("RRULE", formatRRule(event.recurrence)));
    if (event.recurrence?.exdates?.length) {
      out.push(
        event.allDay
          ? line("EXDATE;VALUE=DATE", event.recurrence.exdates.map(formatDateOnly).join(","))
          : line("EXDATE", event.recurrence.exdates.map(formatUtc).join(",")),
      );
    }
    out.push("END:VEVENT");
  }

  out.push("END:VCALENDAR");
  return out.join("\r\n");
}
