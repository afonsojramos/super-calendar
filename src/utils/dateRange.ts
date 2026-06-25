import { isAfter, isBefore, startOfDay } from "date-fns";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { isSameCalendarDay } from "./dates";

/** A selected span. `end` is `null` while only the first endpoint has been picked. */
export interface DateRange {
  start: Date;
  end: Date | null;
}

/** Limits applied before a date can be selected. */
export interface DateSelectionConstraints {
  /** Earliest selectable day (inclusive). */
  minDate?: Date;
  /** Latest selectable day (inclusive). */
  maxDate?: Date;
  /** Return true to forbid selecting a specific day. */
  isDateDisabled?: (date: Date) => boolean;
}

/** Whether `date` passes the min/max/disabled constraints (compared by calendar day). */
export function isDateSelectable(date: Date, constraints: DateSelectionConstraints = {}): boolean {
  const day = startOfDay(date);
  if (constraints.minDate && isBefore(day, startOfDay(constraints.minDate))) return false;
  if (constraints.maxDate && isAfter(day, startOfDay(constraints.maxDate))) return false;
  if (constraints.isDateDisabled?.(day)) return false;
  return true;
}

/**
 * The range after pressing `pressed`, mirroring the familiar date-picker model:
 * - no range yet, or a complete range exists → start fresh (`{ start: pressed, end: null }`),
 *   so a third press resets the selection.
 * - an open range (a start but no end) → close it, auto-swapping when the press
 *   precedes the start so `start <= end` always holds.
 *
 * Returns `current` unchanged when `pressed` isn't selectable.
 */
export function nextDateRange(
  current: DateRange | null,
  pressed: Date,
  constraints: DateSelectionConstraints = {},
): DateRange | null {
  if (!isDateSelectable(pressed, constraints)) return current;
  const day = startOfDay(pressed);
  if (!current || current.end) return { start: day, end: null };
  if (isBefore(day, current.start)) return { start: day, end: current.start };
  return { start: current.start, end: day };
}

/** True when `date` is one of the range's two endpoints. */
export function isRangeEndpoint(date: Date, range: DateRange | null): boolean {
  if (!range) return false;
  if (isSameCalendarDay(date, range.start)) return true;
  return range.end ? isSameCalendarDay(date, range.end) : false;
}

/** True when `date` falls within a complete range (endpoints included). */
export function isWithinDateRange(date: Date, range: DateRange | null): boolean {
  if (!range || !range.end) return false;
  const day = startOfDay(date).getTime();
  const a = startOfDay(range.start).getTime();
  const b = startOfDay(range.end).getTime();
  return day >= Math.min(a, b) && day <= Math.max(a, b);
}

/** The selection/disabled flags for one day. */
export interface DaySelectionState {
  /** Fails the min/max/disabled constraints. */
  isDisabled: boolean;
  /** A `selectedDates` day or a range endpoint (and not disabled). */
  isSelected: boolean;
  /** Inside a complete range, endpoints included (and not disabled). */
  isInRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
}

/**
 * The canonical per-day selection state, shared by `MonthView` (rendering) and
 * `buildMonthGrid` (the headless grid) so the built-in views and a custom
 * calendar can never disagree on what a day's state is.
 */
export function daySelectionState(
  date: Date,
  selection: { selectedDates?: Date[]; selectedRange?: DateRange | null },
  constraints: DateSelectionConstraints = {},
): DaySelectionState {
  const isDisabled = !isDateSelectable(date, constraints);
  const range = selection.selectedRange ?? null;
  return {
    isDisabled,
    isSelected:
      !isDisabled &&
      ((selection.selectedDates?.some((selected) => isSameCalendarDay(selected, date)) ?? false) ||
        isRangeEndpoint(date, range)),
    isInRange: !isDisabled && isWithinDateRange(date, range),
    isRangeStart: !isDisabled && range != null && isSameCalendarDay(date, range.start),
    isRangeEnd: !isDisabled && range?.end != null && isSameCalendarDay(date, range.end),
  };
}

/**
 * Per-day state shared with the month grid via context: the current selection
 * plus the selectability constraints. Threaded through context (not props) so
 * cached/virtualized day cells still repaint when any of it changes.
 */
export interface CalendarSelection extends DateSelectionConstraints {
  selectedDates?: Date[];
  selectedRange?: DateRange;
}

const CalendarSelectionContext = createContext<CalendarSelection>({});

/**
 * Provides the active selection to the month grid. Day cells read it via
 * {@link useCalendarSelection} so they repaint on selection changes even when
 * the virtualized list has cached (and so won't re-render) their page.
 */
export const CalendarSelectionProvider = CalendarSelectionContext.Provider;

export const useCalendarSelection = () => useContext(CalendarSelectionContext);

/** Options for {@link useDateRange}. */
export interface UseDateRangeOptions extends DateSelectionConstraints {
  /** Pre-select a range on mount. */
  initialRange?: DateRange | null;
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
export function useDateRange(options: UseDateRangeOptions = {}) {
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
