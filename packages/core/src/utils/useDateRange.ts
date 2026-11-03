import { startOfDay } from "date-fns";
import {
  type Context,
  createContext,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  type CalendarSelection,
  type DateRange,
  type DateSelectionConstraints,
  type UseDateRangeOptions,
  isDateSelectable,
  nextDateRange,
} from "./dateRange";

const CalendarSelectionContext: Context<CalendarSelection> = createContext<CalendarSelection>({});

/**
 * Provides the active selection to the month grid. Day cells read it via
 * {@link useCalendarSelection} so they repaint on selection changes even when
 * the virtualized list has cached (and so won't re-render) their page.
 */
export const CalendarSelectionProvider = CalendarSelectionContext.Provider;

/** Reads the active selection provided by {@link CalendarSelectionProvider}. */
export const useCalendarSelection = (): CalendarSelection => useContext(CalendarSelectionContext);

/** The state and handlers returned by {@link useDateRange}. */
export interface UseDateRangeResult {
  /** The current selection; `null` until the first endpoint is picked. */
  range: DateRange | null;
  /** Wire to `onPressDay`: advances the range (start, then end, then restarts). */
  onPressDate: (date: Date) => void;
  /** Set both endpoints at once (ordered); ignored if either isn't selectable. */
  selectRange: (a: Date, b: Date) => void;
  /** Clear the selection. */
  reset: () => void;
  /** The raw state setter, for full control. */
  setRange: Dispatch<SetStateAction<DateRange | null>>;
}

/**
 * Controlled-ish range selection state for the month view. Returns the current
 * `range` plus an `onPressDate` handler to wire to `Calendar`'s `onPressDay`, a
 * `reset`, and the raw `setRange` for full control.
 *
 * ```tsx
 * const { range, onPressDate } = useDateRange({ minDate: new Date() });
 * <Calendar mode="month" selectedRange={range ?? undefined} onPressDay={onPressDate} … />
 * ```
 */
export function useDateRange(options: UseDateRangeOptions = {}): UseDateRangeResult {
  const { initialRange = null, minDate, maxDate, isDateDisabled } = options;
  const [range, setRange] = useState<DateRange | null>(initialRange);
  const constraints = useMemo<DateSelectionConstraints>(
    () => ({ minDate, maxDate, isDateDisabled }),
    [minDate, maxDate, isDateDisabled],
  );
  const onPressDate = useCallback(
    (date: Date) => setRange((previous) => nextDateRange(previous, date, constraints)),
    [constraints],
  );
  // Set both endpoints at once (ordered), for drag-to-select. Ignores the update
  // if either endpoint isn't selectable.
  const selectRange = useCallback(
    (a: Date, b: Date) => {
      if (!isDateSelectable(a, constraints) || !isDateSelectable(b, constraints)) return;
      const [start, end] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
      setRange({ start: startOfDay(start), end: startOfDay(end) });
    },
    [constraints],
  );
  const reset = useCallback(() => setRange(null), []);
  return { range, onPressDate, selectRange, reset, setRange };
}
