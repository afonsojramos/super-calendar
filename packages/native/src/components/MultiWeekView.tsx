import { type ReactElement, useMemo } from "react";
import { type WeekStartsOn } from "@super-calendar/core";
import { DateRows, type DateRowsSource, type MonthViewProps } from "./MonthView";

/** Props for the consecutive full-week event grid. */
export type MultiWeekViewProps<T = unknown> = Omit<
  MonthViewProps<T>,
  "date" | "weekStartsOn" | "showSixWeeks" | "showAdjacentMonths"
> & {
  /** Any day in the first displayed week. */
  date: Date;
  /** Positive whole number of week rows (default 2). Invalid values throw RangeError. */
  numberOfWeeks?: number;
  /** First weekday, Sunday = 0 (default). */
  weekStartsOn?: WeekStartsOn;
};

/**
 * Consecutive full weeks with event bars and no hourly slots. Rows scroll
 * vertically when they cannot fit. Expand recurring events before passing them,
 * or use Calendar with mode="multiweek" for recurrence and swipe paging.
 */
export function MultiWeekView<T = unknown>({
  date,
  numberOfWeeks = 2,
  weekStartsOn = 0,
  ...rest
}: MultiWeekViewProps<T>): ReactElement {
  const source = useMemo<DateRowsSource>(
    () => ({ kind: "multiweek", date, numberOfWeeks }),
    [date, numberOfWeeks],
  );
  return <DateRows {...rest} source={source} weekStartsOn={weekStartsOn} />;
}
