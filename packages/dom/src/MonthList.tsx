import { LegendList } from "@legendapp/list/react";
import { addMonths, type Locale, startOfMonth } from "date-fns";
import { type CSSProperties, useMemo } from "react";
import {
  buildMonthGrid,
  type CalendarEvent,
  compareDayEvents,
  type DateRange,
  type DateSelectionConstraints,
  groupEventsByDay,
  type WeekStartsOn,
} from "@super-calendar/core";
import { type DomMonthEvent, MonthView } from "./MonthView";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

export interface MonthListProps<T = unknown> extends DateSelectionConstraints {
  /** Anchor month; the list spans `pastMonths` before to `futureMonths` after. */
  date: Date;
  /** Months to render before the anchor (default 1). */
  pastMonths?: number;
  /** Months to render after the anchor (default 12). */
  futureMonths?: number;
  weekStartsOn?: WeekStartsOn;
  /** Events to render as chips in each day cell (calendar layout when provided). */
  events?: CalendarEvent<T>[];
  /** Custom chip renderer; falls back to the built-in titled chip. */
  renderEvent?: DomMonthEvent<T>;
  /** Max chips shown per day before a "+N more" row (default 3). */
  maxVisibleEventCount?: number;
  /** Template for the overflow row; `{moreCount}` is replaced. */
  moreLabel?: string;
  /** Tap an event chip. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /** Tap the "+N more" overflow row. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  selectedRange?: DateRange;
  selectedDates?: Date[];
  /** Fill the whole cell on selection instead of the default rounded pill band. */
  fillCellOnSelection?: boolean;
  locale?: Locale;
  theme?: Partial<DomCalendarTheme>;
  /** Height of the scroll viewport, in px (default 480). */
  height?: number | string;
  /**
   * When events are shown, make each month's day cells keyboard-navigable (roving
   * tab stop, arrow keys, Enter to open the day). Default false. The picker
   * layout (no `events`) is always navigable regardless.
   */
  keyboardDayNavigation?: boolean;
  onPressDay?: (date: Date) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * A vertically scrolling, virtualized list of months: the date picker. Built on
 * Legend List's DOM renderer and the library's headless grid logic. Selection is
 * controlled, pass `selectedRange` (or `selectedDates`) and handle `onPressDay`.
 */
export function MonthList<T = unknown>({
  date,
  pastMonths = 1,
  futureMonths = 12,
  weekStartsOn = 0,
  events,
  renderEvent,
  maxVisibleEventCount,
  moreLabel,
  onPressEvent,
  onPressMore,
  selectedRange,
  selectedDates,
  fillCellOnSelection = false,
  locale,
  theme: themeOverrides,
  height = 480,
  minDate,
  maxDate,
  isDateDisabled,
  keyboardDayNavigation,
  onPressDay,
  className,
  style,
}: MonthListProps<T>) {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);

  const months = useMemo(() => {
    const first = startOfMonth(addMonths(date, -pastMonths));
    const count = pastMonths + futureMonths + 1;
    return Array.from({ length: count }, (_, i) => addMonths(first, i));
  }, [date, pastMonths, futureMonths]);

  // The weekday header only depends on the week start and locale, not the
  // rendered month window.
  const weekdays = useMemo(
    () => buildMonthGrid(date, { weekStartsOn, locale }).weekdays,
    [date, weekStartsOn, locale],
  );

  // Build the day→events index once for the whole list rather than per month.
  const eventsByDay = useMemo(() => {
    if (!events) return undefined;
    const map = groupEventsByDay(events);
    // Each day reads all-day events first, then timed events by start.
    for (const list of map.values()) list.sort(compareDayEvents);
    return map;
  }, [events]);

  // Stable reference so LegendList only re-renders rows when selection or events
  // actually change, not on every parent render.
  const extraData = useMemo(
    () => [selectedRange, selectedDates, events] as const,
    [selectedRange, selectedDates, events],
  );

  return (
    <div
      className={className}
      style={{ fontFamily: theme.fontFamily, color: theme.text, ...style }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
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
        extraData={extraData}
        keyExtractor={(m: Date) => m.toISOString()}
        recycleItems={false}
        estimatedItemSize={theme.cellHeight * 7 + 40}
        style={{ height, overflowY: "auto" }}
        renderItem={({ item }: { item: Date }) => (
          <MonthView<T>
            date={item}
            weekStartsOn={weekStartsOn}
            events={events}
            eventsByDay={eventsByDay}
            renderEvent={renderEvent}
            maxVisibleEventCount={maxVisibleEventCount}
            moreLabel={moreLabel}
            onPressEvent={onPressEvent}
            onPressMore={onPressMore}
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
            keyboardDayNavigation={keyboardDayNavigation}
            onPressDay={onPressDay}
          />
        )}
      />
    </div>
  );
}
