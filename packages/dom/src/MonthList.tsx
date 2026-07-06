import { LegendList } from "@legendapp/list/react";
import { addMonths, type Locale, startOfMonth } from "date-fns";
import { type CSSProperties, type ReactElement, useMemo } from "react";
import {
  buildMonthGrid,
  type CalendarEvent,
  compareDayEvents,
  type DateRange,
  type DateSelectionConstraints,
  type EventAccessibilityLabeler,
  groupEventsByDay,
  type WeekStartsOn,
} from "@super-calendar/core";
import { type DomMonthEvent, MonthView, type MonthViewSlot } from "./MonthView";
import { createSlots, type SlotStyleProps } from "./slots";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/**
 * Styleable parts of {@link MonthList}. The shared weekday header uses `weekdays`
 * / `weekday`; every other slot is forwarded to each month's {@link MonthView}
 * (e.g. `title`, `day`, `chip`). See {@link MonthViewSlot}.
 */
export type MonthListSlot = MonthViewSlot;

/** Props for {@link MonthList}. */
export interface MonthListProps<T = unknown>
  extends DateSelectionConstraints, SlotStyleProps<MonthListSlot> {
  /** Anchor month; the list spans `pastMonths` before to `futureMonths` after. */
  date: Date;
  /** Months to render before the anchor (default 1). */
  pastMonths?: number;
  /** Months to render after the anchor (default 12). */
  futureMonths?: number;
  /** First day of the week. Sunday = 0 (default) ... Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Events to render as chips in each day cell (calendar layout when provided). */
  events?: CalendarEvent<T>[];
  /** Custom chip renderer; falls back to the built-in titled chip. */
  renderEvent?: DomMonthEvent<T>;
  /**
   * Override the screen-reader label for each event chip. Receives the event and a
   * `{ mode: "month", isAllDay, ampm: false }` context; return the full text to
   * announce. Defaults to the event title and day (e.g. "Standup, 15 July").
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;
  /** Max chips shown per day before a "+N more" row (default 3). */
  maxVisibleEventCount?: number;
  /** Template for the overflow row; `{moreCount}` is replaced. */
  moreLabel?: string;
  /** Tap an event chip. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /** Tap the "+N more" overflow row. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Selected span; days between the endpoints get the range band. */
  selectedRange?: DateRange;
  /** Discrete selected days (single / multiple). */
  selectedDates?: Date[];
  /** Fill the whole cell on selection instead of the default rounded pill band. */
  fillCellOnSelection?: boolean;
  /** date-fns locale for the month titles and weekday labels. */
  locale?: Locale;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<DomCalendarTheme>;
  /** Height of the scroll viewport, in px (default 480). */
  height?: number | string;
  /**
   * When events are shown, make each month's day cells keyboard-navigable (roving
   * tab stop, arrow keys, Enter to open the day). Default false. The picker
   * layout (no `events`) is always navigable regardless.
   */
  keyboardDayNavigation?: boolean;
  /** Fired when a selectable day is clicked. */
  onPressDay?: (date: Date) => void;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
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
  eventAccessibilityLabel,
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
  classNames,
  styles,
}: MonthListProps<T>): ReactElement {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const slot = createSlots<MonthListSlot>({ classNames, styles });

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
        {...slot("weekdays", {
          base: { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" },
          themed: { borderBottom: `1px solid ${theme.gridLine}`, padding: "8px 0" },
        })}
      >
        {weekdays.map((wd) => (
          <span
            key={wd.label}
            {...slot("weekday", {
              themed: {
                textAlign: "center",
                fontSize: 12,
                fontWeight: 600,
                color: theme.textMuted,
              },
            })}
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
        // Open on the anchor month (today by default), not the first past month.
        // `months` starts `pastMonths` before the anchor, so it sits at that index.
        initialScrollIndex={pastMonths}
        style={{ height, overflowY: "auto" }}
        renderItem={({ item }: { item: Date }) => (
          <MonthView<T>
            date={item}
            weekStartsOn={weekStartsOn}
            events={events}
            eventsByDay={eventsByDay}
            renderEvent={renderEvent}
            eventAccessibilityLabel={eventAccessibilityLabel}
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
            classNames={classNames}
            styles={styles}
          />
        )}
      />
    </div>
  );
}
