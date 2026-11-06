import { addDays, format, startOfWeek } from "date-fns";
import { daySelectionState } from "./dateRange";
import { filterHiddenDays, getIsToday, isWeekend } from "./dates";
import {
  type MonthGridDay,
  type MonthGridWeekday,
  type UseMonthGridOptions,
  weekdayFormatToken,
} from "./monthGrid";

/** Options for {@link buildMultiWeekGrid}. */
export interface MultiWeekGridOptions extends Omit<UseMonthGridOptions, "showSixWeeks"> {
  /**
   * How many consecutive full weeks to show. A positive whole number; default 2.
   * Other values throw a `RangeError`.
   */
  numberOfWeeks?: number;
}

/**
 * A day in a multi-week grid. Every day of the grid belongs to the requested
 * period, so it carries no month-membership flag.
 */
export type MultiWeekGridDay = Omit<MonthGridDay, "isCurrentMonth">;

/** One week row of a {@link MultiWeekGrid}. */
export interface MultiWeekGridWeek {
  /** The week's first calendar day as `yyyy-MM-dd`, before hidden days are removed. */
  id: string;
  /** The row's days in display order, without hidden weekdays. */
  days: MultiWeekGridDay[];
}

/** A half-open local calendar interval, `[start, endExclusive)`. */
export interface MultiWeekGridInterval {
  /** Midnight of the first day. */
  start: Date;
  /** Midnight after the last day. */
  endExclusive: Date;
}

/** The rows, weekday headers, and date bounds of a multi-week grid. */
export interface MultiWeekGrid {
  /** Every calendar day of the requested weeks, independent of hidden weekdays and RTL. */
  period: MultiWeekGridInterval;
  /** From the earliest to the latest displayed day; hidden days inside it stay hidden. */
  visibleRange: MultiWeekGridInterval;
  /** The week rows, oldest first. */
  weeks: MultiWeekGridWeek[];
  /** The weekday header cells, in display order. */
  weekdays: MonthGridWeekday[];
}

/**
 * Pure multi-week builder: `numberOfWeeks` consecutive full calendar weeks,
 * starting with the week that contains `date` (aligned back to `weekStartsOn`).
 * Each day carries the same selection, disabled, today, and weekend state as
 * {@link buildMonthGrid}. Hidden weekdays shrink the rows without changing the
 * period; `isRTL` reverses each row's display order.
 *
 * The result is fully materialized, so its size grows with `numberOfWeeks`.
 *
 * @throws RangeError when `date` is invalid, `numberOfWeeks` is not a positive
 * safe integer, or the last week falls outside the range `Date` can represent.
 */
export function buildMultiWeekGrid(date: Date, options: MultiWeekGridOptions = {}): MultiWeekGrid {
  const {
    numberOfWeeks = 2,
    weekStartsOn = 0,
    weekdayFormat = "short",
    isRTL = false,
    hiddenDays,
    selectedDates,
    selectedRange,
    minDate,
    maxDate,
    isDateDisabled,
    locale,
  } = options;

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("buildMultiWeekGrid: date must be a valid Date.");
  }
  if (!Number.isSafeInteger(numberOfWeeks) || numberOfWeeks < 1) {
    throw new RangeError(
      `buildMultiWeekGrid: numberOfWeeks must be a positive whole number, received ${String(numberOfWeeks)}.`,
    );
  }
  const start = startOfWeek(date, { weekStartsOn });
  const endExclusive = addDays(start, numberOfWeeks * 7);
  if (Number.isNaN(endExclusive.getTime())) {
    throw new RangeError(
      `buildMultiWeekGrid: ${numberOfWeeks} weeks from ${format(start, "yyyy-MM-dd")} cannot be represented as a Date.`,
    );
  }

  const constraints = { minDate, maxDate, isDateDisabled };
  const selection = { selectedDates, selectedRange };
  let first: Date | null = null;
  let last: Date | null = null;
  const weeks: MultiWeekGridWeek[] = [];
  for (let row = 0; row < numberOfWeeks; row++) {
    const weekStart = addDays(start, row * 7);
    const all = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const visible = filterHiddenDays(all, hiddenDays);
    if (visible.length > 0) {
      if (first === null) first = visible[0];
      last = visible[visible.length - 1];
    }
    const ordered = isRTL ? [...visible].reverse() : visible;
    weeks.push({
      id: format(weekStart, "yyyy-MM-dd"),
      days: ordered.map((day): MultiWeekGridDay => ({
        date: day,
        id: format(day, "yyyy-MM-dd"),
        label: format(day, "d"),
        isToday: getIsToday(day),
        isWeekend: isWeekend(day),
        ...daySelectionState(day, selection, constraints),
      })),
    });
  }

  const token = weekdayFormatToken(weekdayFormat);
  const weekdays: MonthGridWeekday[] = weeks[0].days.map((day) => ({
    date: day.date,
    label: format(day.date, token, { locale }),
  }));

  return {
    period: { start, endExclusive },
    visibleRange: {
      start: first ?? start,
      endExclusive: last ? addDays(last, 1) : endExclusive,
    },
    weeks,
    weekdays,
  };
}
