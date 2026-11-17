import { startOfDay } from "date-fns";
import { useMemo } from "react";
import { buildMonthGrid, type MonthGrid, type UseMonthGridOptions } from "./monthGrid";

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
    today,
  } = options;
  // The day, not the instant, so a ticking clock rebuilds the grid once a day.
  const todayKey = today ? startOfDay(today).getTime() : undefined;
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
      todayKey,
    ],
  );
}
