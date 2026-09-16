import { format, type Locale, isSameMonth, startOfDay } from "date-fns";
import { useMemo } from "react";
import type { CalendarEvent, WeekStartsOn } from "../types";
import { type DateRange, type DateSelectionConstraints, daySelectionState } from "./dateRange";
import { buildMonthWeeks, getIsToday, isWeekend } from "./dates";

/**
 * One event's placement within a single week row of the month grid: the column
 * span it covers and the lane (stacked row) it sits in, plus whether it continues
 * past this row's edges (so the renderer can draw a "continues" affordance and
 * square off the clipped end). Columns index into the row's `days` array, so with
 * `hiddenDays` a bar spans the visible columns it touches.
 */
export interface MonthEventSegment<T = unknown> {
  event: CalendarEvent<T>;
  /** First covered column in the row (0-based, inclusive). */
  startCol: number;
  /** Last covered column in the row (inclusive). */
  endCol: number;
  /** Stacking row within the day cells; 0 is the topmost. */
  lane: number;
  /** The event started before this row's first day. */
  continuesBefore: boolean;
  /** The event ends after this row's last day. */
  continuesAfter: boolean;
}

/** The laid-out event segments for one week row, with the number of lanes used. */
export interface MonthWeekEvents<T = unknown> {
  segments: MonthEventSegment<T>[];
  /** Highest lane index used + 1 (0 when the row has no events). */
  laneCount: number;
}

/** The last calendar day an event visibly covers (a midnight end ends the day before). */
function lastCoveredDay(event: CalendarEvent<unknown>): number {
  const endMs = event.end.getTime();
  // Clamp to the start so a zero/negative-length event still covers its start day.
  return startOfDay(new Date(Math.max(event.start.getTime(), endMs - 1))).getTime();
}

/**
 * Lay out one week row's events as continuous horizontal bars: each event becomes
 * a single segment spanning the columns it covers (not a chip repeated per day),
 * stacked into lanes so overlapping events sit on separate rows. Multi-day events
 * that cross the row edges are marked `continuesBefore`/`continuesAfter`. Shared by
 * both renderers so the month grid draws identical spanning bars.
 *
 * Column indices map into the given `days` array in whatever display order it uses,
 * so this is order-independent: a right-to-left (reversed) week lays out correctly,
 * and `continuesBefore`/`continuesAfter` track the array's first/last column edge
 * (not chronology), so the clipped end is squared on the right visual side.
 *
 * Lanes are packed greedily after sorting by start column then longest span first,
 * matching how calendars keep long events on the upper lanes.
 */
export function layoutMonthWeek<T>(
  days: Date[],
  events: readonly CalendarEvent<T>[],
): MonthWeekEvents<T> {
  if (days.length === 0) return { segments: [], laneCount: 0 };
  const dayStarts = days.map((d) => startOfDay(d).getTime());
  // Chronological bounds, independent of the array's direction (RTL reverses it).
  const rowStart = Math.min(...dayStarts);
  const rowEnd = Math.max(...dayStarts);
  const ascending = dayStarts[0] <= dayStarts[dayStarts.length - 1];

  const placed: MonthEventSegment<T>[] = [];
  for (const event of events) {
    const evStart = startOfDay(event.start).getTime();
    const evLast = lastCoveredDay(event);
    // Skip events entirely outside this row.
    if (evLast < rowStart || evStart > rowEnd) continue;
    // Columns this event covers, found by membership so it works in any day order.
    let startCol = -1;
    let endCol = -1;
    for (let i = 0; i < dayStarts.length; i++) {
      if (dayStarts[i] >= evStart && dayStarts[i] <= evLast) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    }
    // No column in this row covers the event (e.g. it only falls on a hidden
    // interior day), so it draws no bar here.
    if (startCol === -1) continue;
    const startsBefore = evStart < rowStart;
    const endsAfter = evLast > rowEnd;
    placed.push({
      event,
      startCol,
      endCol,
      lane: 0,
      // Map the chronological overflow to the array's first/last column edge.
      continuesBefore: ascending ? startsBefore : endsAfter,
      continuesAfter: ascending ? endsAfter : startsBefore,
    });
  }

  // Longest, earliest segments claim the upper lanes first.
  placed.sort((a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol));
  const laneEnds: number[] = [];
  for (const seg of placed) {
    let lane = laneEnds.findIndex((end) => end < seg.startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.endCol);
    } else {
      laneEnds[lane] = seg.endCol;
    }
    seg.lane = lane;
  }

  return { segments: placed, laneCount: laneEnds.length };
}

/** A single day in the grid, with all the state a custom cell needs to render. */
export interface MonthGridDay {
  /** The day this cell represents. */
  date: Date;
  /** Stable `yyyy-MM-dd` id, handy as a React key. */
  id: string;
  /** Day-of-month, e.g. "1". */
  label: string;
  /** False for days bleeding in from the previous or next month. */
  isCurrentMonth: boolean;
  /** The day is today. */
  isToday: boolean;
  /** The day is a Saturday or Sunday. */
  isWeekend: boolean;
  /** The day fails the min/max/disabled constraints. */
  isDisabled: boolean;
  /** The day is a `selectedDates` day or a range endpoint (and not disabled). */
  isSelected: boolean;
  /** The day is the range's start endpoint. */
  isRangeStart: boolean;
  /** The day is the range's end endpoint. */
  isRangeEnd: boolean;
  /** Inside a complete range (endpoints included). */
  isInRange: boolean;
}

/** One week row. */
export interface MonthGridWeek {
  /** Stable id for the week row, handy as a React key. */
  id: string;
  /** The seven days of the row, in display order. */
  days: MonthGridDay[];
}

/** A weekday header cell (e.g. "Mon"). */
export interface MonthGridWeekday {
  /** A representative date for the column, used to derive the label. */
  date: Date;
  /** The short weekday name (e.g. "Mon"), localised via `locale`. */
  label: string;
}

/** The full grid for one month: the week rows and the weekday header cells. */
export interface MonthGrid {
  /** The week rows, padded to whole weeks. */
  weeks: MonthGridWeek[];
  /** The weekday header cells, in display order. */
  weekdays: MonthGridWeekday[];
}

/**
 * Weekday header label width: `narrow` ("M"), `short` ("Mon", the default), or
 * `long` ("Monday").
 */
export type WeekdayFormat = "narrow" | "short" | "long";

/** date-fns tokens for each {@link WeekdayFormat}. */
const WEEKDAY_TOKENS: Record<WeekdayFormat, string> = {
  narrow: "EEEEE",
  short: "EEE",
  long: "EEEE",
};

/**
 * The date-fns format token for a {@link WeekdayFormat}. Exposed so a renderer
 * that formats its own weekday header (rather than reading {@link buildMonthGrid})
 * keeps the same mapping.
 */
export function weekdayFormatToken(format: WeekdayFormat): string {
  return WEEKDAY_TOKENS[format];
}

/** Options for {@link buildMonthGrid} and {@link useMonthGrid}. */
export interface UseMonthGridOptions extends DateSelectionConstraints {
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) to drop from the grid and header. */
  hiddenDays?: number[];
  /** Weekday header label width. Default `short` ("Mon"). */
  weekdayFormat?: WeekdayFormat;
  /** Always return six week rows for a fixed-height grid. Default false. */
  showSixWeeks?: boolean;
  /** Reverse each week's day order (right-to-left). Default false. */
  isRTL?: boolean;
  /** Selected discrete days (single/multiple). */
  selectedDates?: Date[];
  /** Selected span. */
  selectedRange?: DateRange;
  /** A date-fns locale for the weekday labels. */
  locale?: Locale;
}

/**
 * Pure month-grid builder: the weeks and weekday headers for `month`, each day
 * annotated with selection/disabled/today state. Use this when you need the
 * data outside React; inside a component prefer {@link useMonthGrid}.
 */
export function buildMonthGrid(month: Date, options: UseMonthGridOptions = {}): MonthGrid {
  const {
    weekStartsOn = 0,
    weekdayFormat = "short",
    showSixWeeks = false,
    isRTL = false,
    hiddenDays,
    selectedDates,
    selectedRange,
    minDate,
    maxDate,
    isDateDisabled,
    locale,
  } = options;

  const rows = buildMonthWeeks(month, weekStartsOn, { showSixWeeks, isRTL, hiddenDays });

  const weeks: MonthGridWeek[] = rows.map((days) => ({
    id: days[0].toISOString(),
    days: days.map((date): MonthGridDay => ({
      date,
      id: format(date, "yyyy-MM-dd"),
      label: format(date, "d"),
      isCurrentMonth: isSameMonth(date, month),
      isToday: getIsToday(date),
      isWeekend: isWeekend(date),
      // Shared with MonthView, so the headless grid matches the built-in view.
      ...daySelectionState(
        date,
        { selectedDates, selectedRange },
        { minDate, maxDate, isDateDisabled },
      ),
    })),
  }));

  // Weekday labels depend only on the first row's dates (already ordered).
  // `hiddenDays` covering every weekday leaves no rows; return an empty grid
  // rather than dereferencing a missing first row.
  if (rows.length === 0) return { weeks: [], weekdays: [] };
  const weekdays: MonthGridWeekday[] = rows[0].map((date) => ({
    date,
    label: format(date, WEEKDAY_TOKENS[weekdayFormat], { locale }),
  }));

  return { weeks, weekdays };
}

/**
 * Headless month-grid hook. Returns the weeks and weekday headers for `month`,
 * each day annotated with selection/disabled/today state, so you can render a
 * fully custom calendar without reimplementing the date maths.
 *
 * ```tsx
 * const { weeks, weekdays } = useMonthGrid(month, { selectedRange: range });
 * // map weekdays -> header cells, weeks -> rows, days -> your own <DayCell />
 * ```
 */
export function useMonthGrid(month: Date, options: UseMonthGridOptions = {}): MonthGrid {
  const {
    weekStartsOn,
    showSixWeeks,
    isRTL,
    selectedDates,
    selectedRange,
    minDate,
    maxDate,
    isDateDisabled,
    locale,
  } = options;
  return useMemo(
    () => buildMonthGrid(month, options),
    // Deps are the destructured option fields, not the (unstable) options object.
    [
      month,
      weekStartsOn,
      showSixWeeks,
      isRTL,
      selectedDates,
      selectedRange,
      minDate,
      maxDate,
      isDateDisabled,
      locale,
    ],
  );
}
