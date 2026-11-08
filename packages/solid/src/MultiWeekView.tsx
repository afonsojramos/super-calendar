import type { JSX } from "@solidjs/web";
import type { WeekStartsOn } from "@super-calendar/core/vanilla";
import { DateRows, type MonthViewProps } from "./MonthView";

/** Props for {@link MultiWeekView}. */
export interface MultiWeekViewProps<T = unknown> extends Omit<
  MonthViewProps<T>,
  "date" | "weekStartsOn" | "showAdjacentMonths"
> {
  /**
   * Any day in the first week to show. The rows start on the `weekStartsOn` day
   * on or before it, in the device's local calendar.
   */
  date: Date;
  /**
   * How many consecutive full weeks to show, as stacked rows. A positive whole
   * number; default 2. Other values throw a `RangeError`.
   */
  numberOfWeeks?: number;
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Event chip and overflow-button height in pixels (default 24). */
  chipHeight?: number;
}

/**
 * Consecutive full weeks as stacked seven-day rows, with event chips and no hour
 * slots. It has the month grid's event bars, overflow, selection, and drag
 * interactions, and the month slots, `renderEvent`, and theme style it. Every
 * row is kept at full height; when the view is given less room, the rows scroll
 * under the title and weekday header.
 *
 * Standalone, it shows `events` as given; expand recurring events first with
 * `expandRecurringEvents`, or use `Calendar` with `mode="multiweek"`.
 *
 * @example
 * ```tsx
 * <MultiWeekView date={new Date()} numberOfWeeks={3} events={events} />
 * ```
 */
export function MultiWeekView<T = unknown>(props: MultiWeekViewProps<T>): JSX.Element {
  return (
    <DateRows<T>
      {...props}
      chipHeight={props.chipHeight ?? 24}
      source={{ kind: "multiweek", date: props.date, numberOfWeeks: props.numberOfWeeks ?? 2 }}
    />
  );
}
