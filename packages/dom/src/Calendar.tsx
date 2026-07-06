import type { Locale } from "date-fns";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import type {
  BusinessHours,
  CalendarEvent,
  DateRange,
  DateSelectionConstraints,
  EventAccessibilityLabeler,
  TimeGridMode,
  WeekStartsOn,
} from "@super-calendar/core";
import { Agenda, type AgendaSlot, type DomAgendaEvent } from "./Agenda";
import { type DomMonthEvent, MonthView, type MonthViewSlot } from "./MonthView";
import type { SlotStyleProps } from "./slots";
import { type DomRenderEvent, TimeGrid, type TimeGridSlot } from "./TimeGrid";
import type { DomCalendarTheme } from "./theme";

/**
 * Styleable parts across every view {@link Calendar} can render. Only the slots
 * for the active `mode` apply; the rest are ignored. See {@link MonthViewSlot},
 * {@link TimeGridSlot}, and {@link AgendaSlot}.
 */
export type CalendarSlot = MonthViewSlot | TimeGridSlot | AgendaSlot;

/** Props for {@link Calendar}. */
export interface CalendarProps<T = unknown>
  extends DateSelectionConstraints, SlotStyleProps<CalendarSlot> {
  /**
   * The view to render (default "week"). `month` renders a month grid, `schedule`
   * a day-grouped agenda list, and the others a time grid.
   */
  mode?: "month" | "schedule" | TimeGridMode;
  /** Controlled anchor date. Change it (e.g. from your own header) to navigate. */
  date: Date;
  /** Your events. */
  events?: CalendarEvent<T>[];
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Column count for `mode="custom"`. */
  numberOfDays?: number;
  /** date-fns locale for titles, headers, and time labels. */
  locale?: Locale;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<DomCalendarTheme>;
  /** Height of the scroll viewport, in px. */
  height?: number | string;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;

  /** Tap an event (both layouts). */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /**
   * Override the screen-reader label for each event. Receives the event and a
   * `{ mode, isAllDay, ampm }` context; return the full text to announce. Defaults
   * to each view's built-in label.
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;

  // --- Time-grid modes (week / day / 3days / custom) ---
  /** 12-hour AM/PM time labels (default false). */
  ampm?: boolean;
  /** Initial pixels per hour. */
  hourHeight?: number;
  /** Initial scroll position, in minutes from midnight. */
  scrollOffsetMinutes?: number;
  /** Sub-divisions per hour for the grid lines. */
  timeslots?: number;
  /** Shade the hours outside business hours. */
  businessHours?: BusinessHours;
  /** Show the current-time indicator (default true). */
  showNowIndicator?: boolean;
  /** Show the all-day lane (default true). */
  showAllDayEventCell?: boolean;
  /** Snap dragged/created events to this many minutes. */
  dragStepMinutes?: number;
  /** Tap empty grid space. */
  onPressCell?: (date: Date) => void;
  /** Drag empty grid space to create. */
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Fires when an event drag begins. */
  onDragStart?: (event: CalendarEvent<T>) => void;
  /** Enables drag-to-move/resize; return `false` to reject the drop. */
  onDragEvent?: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  /** Tap a day's column header. */
  onPressDateHeader?: (day: Date) => void;
  /** Custom time-grid event renderer. */
  renderTimeEvent?: DomRenderEvent<T>;
  /** Replace the hour-axis label. Receives the hour (0–23) and the `ampm` flag. */
  hourComponent?: (hour: number, ampm: boolean) => ReactNode;

  // --- Month mode ---
  /** Max chips per day before a "+N more" row. */
  maxVisibleEventCount?: number;
  /** Overflow row template; `{moreCount}` is replaced. */
  moreLabel?: string;
  /** Render neighbouring months' days in the leading/trailing cells (default true). */
  showAdjacentMonths?: boolean;
  /** Fill the cell with the range background instead of the pill band. */
  fillCellOnSelection?: boolean;
  /** Selected span. */
  selectedRange?: DateRange;
  /** Discrete selected days. */
  selectedDates?: Date[];
  /**
   * In month mode, make day cells keyboard-navigable (one roving tab stop, arrow
   * keys, Enter to open the day). Default false: keyboard focus moves through
   * events only. Has no effect on the time-grid modes.
   */
  keyboardDayNavigation?: boolean;
  /** Tap a day cell. */
  onPressDay?: (date: Date) => void;
  /** Tap the "+N more" overflow row. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Custom month chip renderer. */
  renderMonthEvent?: DomMonthEvent<T>;

  // --- Schedule mode ---
  /** Custom agenda row renderer (`mode="schedule"`). */
  renderScheduleEvent?: DomAgendaEvent<T>;
}

/**
 * Batteries-included entry point for the react-dom renderer: it picks the right
 * view for `mode`. `month` renders a single {@link MonthView}; `schedule` renders
 * an {@link Agenda}; the time-grid modes render a {@link TimeGrid}. For a
 * scrolling month picker, use {@link MonthList} directly.
 *
 * @example
 * ```tsx
 * <Calendar mode="week" date={new Date()} events={events} />
 * ```
 */
export function Calendar<T = unknown>({
  mode = "week",
  date,
  events,
  weekStartsOn = 0,
  numberOfDays,
  locale,
  theme,
  height,
  className,
  style,
  onPressEvent,
  eventAccessibilityLabel,
  // time grid
  ampm,
  hourHeight,
  scrollOffsetMinutes,
  timeslots,
  businessHours,
  showNowIndicator,
  showAllDayEventCell,
  dragStepMinutes,
  onPressCell,
  onCreateEvent,
  onDragStart,
  onDragEvent,
  onPressDateHeader,
  renderTimeEvent,
  hourComponent,
  // month
  maxVisibleEventCount,
  moreLabel,
  showAdjacentMonths,
  fillCellOnSelection,
  selectedRange,
  selectedDates,
  minDate,
  maxDate,
  isDateDisabled,
  keyboardDayNavigation,
  onPressDay,
  onPressMore,
  renderMonthEvent,
  // schedule
  renderScheduleEvent,
  // styling
  classNames,
  styles,
}: CalendarProps<T>): ReactElement {
  if (mode === "schedule") {
    return (
      <Agenda<T>
        events={events ?? []}
        locale={locale}
        ampm={ampm}
        theme={theme}
        height={height}
        activeDate={date}
        className={className}
        style={style}
        classNames={classNames}
        styles={styles}
        renderEvent={renderScheduleEvent}
        eventAccessibilityLabel={eventAccessibilityLabel}
        onPressEvent={onPressEvent}
        onPressDay={onPressDay}
      />
    );
  }

  if (mode === "month") {
    return (
      <MonthView<T>
        date={date}
        events={events ?? []}
        weekStartsOn={weekStartsOn}
        locale={locale}
        theme={theme}
        className={className}
        style={style}
        classNames={classNames}
        styles={styles}
        maxVisibleEventCount={maxVisibleEventCount}
        moreLabel={moreLabel}
        showAdjacentMonths={showAdjacentMonths}
        fillCellOnSelection={fillCellOnSelection}
        selectedRange={selectedRange}
        selectedDates={selectedDates}
        minDate={minDate}
        maxDate={maxDate}
        isDateDisabled={isDateDisabled}
        keyboardDayNavigation={keyboardDayNavigation}
        onPressDay={onPressDay}
        onPressEvent={onPressEvent}
        onPressMore={onPressMore}
        renderEvent={renderMonthEvent}
        eventAccessibilityLabel={eventAccessibilityLabel}
      />
    );
  }

  return (
    <TimeGrid<T>
      date={date}
      mode={mode}
      events={events}
      weekStartsOn={weekStartsOn}
      numberOfDays={numberOfDays}
      locale={locale}
      theme={theme}
      height={height}
      className={className}
      style={style}
      classNames={classNames}
      styles={styles}
      ampm={ampm}
      hourHeight={hourHeight}
      scrollOffsetMinutes={scrollOffsetMinutes}
      timeslots={timeslots}
      businessHours={businessHours}
      showNowIndicator={showNowIndicator}
      showAllDayEventCell={showAllDayEventCell}
      dragStepMinutes={dragStepMinutes}
      onPressEvent={onPressEvent}
      onPressCell={onPressCell}
      onCreateEvent={onCreateEvent}
      onDragStart={onDragStart}
      onDragEvent={onDragEvent}
      onPressDateHeader={onPressDateHeader}
      renderEvent={renderTimeEvent}
      eventAccessibilityLabel={eventAccessibilityLabel}
      hourComponent={hourComponent}
    />
  );
}
