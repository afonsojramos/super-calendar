import { LegendList } from "@legendapp/list/react";
import { addMonths, type Locale, startOfMonth } from "date-fns";
import { type CSSProperties, useMemo } from "react";
import {
  buildMonthGrid,
  type DateRange,
  type DateSelectionConstraints,
  type WeekStartsOn,
} from "@super-calendar/core";
import { MonthView } from "./MonthView";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

export interface MonthListProps extends DateSelectionConstraints {
  /** Anchor month; the list spans `pastMonths` before to `futureMonths` after. */
  date: Date;
  /** Months to render before the anchor (default 1). */
  pastMonths?: number;
  /** Months to render after the anchor (default 12). */
  futureMonths?: number;
  weekStartsOn?: WeekStartsOn;
  selectedRange?: DateRange;
  selectedDates?: Date[];
  /** Fill the whole cell on selection instead of the default rounded pill band. */
  fillCellOnSelection?: boolean;
  locale?: Locale;
  theme?: Partial<DomCalendarTheme>;
  /** Height of the scroll viewport, in px (default 480). */
  height?: number | string;
  onPressDay?: (date: Date) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * A vertically scrolling, virtualized list of months: the date picker. Built on
 * Legend List's DOM renderer and the library's headless grid logic. Selection is
 * controlled, pass `selectedRange` (or `selectedDates`) and handle `onPressDay`.
 */
export function MonthList({
  date,
  pastMonths = 1,
  futureMonths = 12,
  weekStartsOn = 0,
  selectedRange,
  selectedDates,
  fillCellOnSelection = false,
  locale,
  theme: themeOverrides,
  height = 480,
  minDate,
  maxDate,
  isDateDisabled,
  onPressDay,
  className,
  style,
}: MonthListProps) {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);

  const months = useMemo(() => {
    const first = startOfMonth(addMonths(date, -pastMonths));
    const count = pastMonths + futureMonths + 1;
    return Array.from({ length: count }, (_, i) => addMonths(first, i));
  }, [date, pastMonths, futureMonths]);

  const weekdays = useMemo(
    () => buildMonthGrid(months[0], { weekStartsOn, locale }).weekdays,
    [months, weekStartsOn, locale],
  );

  return (
    <div
      className={className}
      style={{ fontFamily: theme.fontFamily, color: theme.text, ...style }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: `1px solid ${theme.gridLine}`,
          padding: "8px 0",
        }}
      >
        {weekdays.map((wd) => (
          <span
            key={wd.label}
            style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: theme.textMuted }}
          >
            {wd.label}
          </span>
        ))}
      </div>
      <LegendList
        data={months}
        extraData={selectedRange ?? selectedDates}
        keyExtractor={(m: Date) => m.toISOString()}
        recycleItems={false}
        estimatedItemSize={theme.cellHeight * 7 + 40}
        style={{ height, overflowY: "auto" }}
        renderItem={({ item }: { item: Date }) => (
          <MonthView
            date={item}
            weekStartsOn={weekStartsOn}
            selectedRange={selectedRange}
            selectedDates={selectedDates}
            fillCellOnSelection={fillCellOnSelection}
            showAdjacentMonths={false}
            showWeekdays={false}
            locale={locale}
            theme={themeOverrides}
            minDate={minDate}
            maxDate={maxDate}
            isDateDisabled={isDateDisabled}
            onPressDay={onPressDay}
          />
        )}
      />
    </div>
  );
}
