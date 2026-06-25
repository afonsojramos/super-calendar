import { format, type Locale, isSameMonth } from "date-fns";
import { useMemo } from "react";
import type { WeekStartsOn } from "../types";
import { type DateRange, type DateSelectionConstraints, daySelectionState } from "./dateRange";
import { buildMonthWeeks, getIsToday, isWeekend } from "./dates";

/** A single day in the grid, with all the state a custom cell needs to render. */
export interface MonthGridDay {
  date: Date;
  /** Stable `yyyy-MM-dd` id, handy as a React key. */
  id: string;
  /** Day-of-month, e.g. "1". */
  label: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isDisabled: boolean;
  isSelected: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
  /** Inside a complete range (endpoints included). */
  isInRange: boolean;
}

/** One week row. */
export interface MonthGridWeek {
  id: string;
  days: MonthGridDay[];
}

/** A weekday header cell (e.g. "Mon"). */
export interface MonthGridWeekday {
  date: Date;
  label: string;
}

export interface MonthGrid {
  weeks: MonthGridWeek[];
  weekdays: MonthGridWeekday[];
}

export interface UseMonthGridOptions extends DateSelectionConstraints {
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
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
    showSixWeeks = false,
    isRTL = false,
    selectedDates,
    selectedRange,
    minDate,
    maxDate,
    isDateDisabled,
    locale,
  } = options;

  const rows = buildMonthWeeks(month, weekStartsOn, { showSixWeeks, isRTL });

  const weeks: MonthGridWeek[] = rows.map((days) => ({
    id: days[0].toISOString(),
    days: days.map(
      (date): MonthGridDay => ({
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
      }),
    ),
  }));

  // Weekday labels depend only on the first row's dates (already ordered).
  const weekdays: MonthGridWeekday[] = rows[0].map((date) => ({
    date,
    label: format(date, "EEE", { locale }),
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
