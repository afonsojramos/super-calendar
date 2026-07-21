import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  type Locale,
  startOfDay,
  startOfMonth,
  startOfWeek,
  addYears,
  endOfYear,
  startOfYear,
} from "date-fns";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  useMemo,
} from "react";
import {
  type CalendarMode,
  type BusinessHours,
  type BusinessHoursBand,
  type CalendarEvent,
  type DateRange,
  type DateSelectionConstraints,
  type EventAccessibilityLabeler,
  eventsInTimeZone,
  expandRecurringEvents,
  getViewDays,
  type WeekdayFormat,
  type WeekStartsOn,
} from "@super-calendar/core";
import { Agenda, type AgendaSlot, type DomAgendaEvent } from "./Agenda";
import { YearView, type YearViewSlot } from "./YearView";
import { type DomMonthEvent, MonthView, type MonthViewSlot } from "./MonthView";
import type { SlotStyleProps } from "./slots";
import { type DomRenderEvent, TimeGrid, type TimeGridSlot } from "./TimeGrid";
import type { DomCalendarTheme } from "./theme";

/**
 * Styleable parts across every view {@link Calendar} can render. Only the slots
 * for the active `mode` apply; the rest are ignored. See {@link MonthViewSlot},
 * {@link TimeGridSlot}, and {@link AgendaSlot}.
 */
export type CalendarSlot = MonthViewSlot | TimeGridSlot | AgendaSlot | YearViewSlot;

/** Props for {@link Calendar}. */
export interface CalendarProps<T = unknown>
  extends DateSelectionConstraints, SlotStyleProps<CalendarSlot> {
  /**
   * The view to render (default "week"). `month` renders a month grid, `schedule`
   * a day-grouped agenda list, and the others a time grid.
   */
  mode?: CalendarMode;
  /** Controlled anchor date. Change it (e.g. from your own header) to navigate. */
  date: Date;
  /**
   * Fires with the next/previous period's date when the user pages the focused
   * calendar with **PageDown** / **PageUp** (a month in `month`, a week in
   * `schedule`, else the view's day span). It's controlled, so update `date` in
   * response. Omit it to leave paging to your own controls.
   */
  onChangeDate?: (date: Date) => void;
  /** Your events. */
  events?: CalendarEvent<T>[];
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  /**
   * Fixed "now" instant for the current-time indicator (doesn't tick), e.g. a
   * server-synced clock. Defaults to the device clock, shifted into `timeZone`
   * when one is set so the line matches the displayed events.
   */
  now?: Date;
  /** Column count for `mode="custom"`. */
  numberOfDays?: number;
  /** date-fns locale for titles, headers, and time labels. */
  locale?: Locale;
  /**
   * Display events in this IANA time zone (e.g. `"America/New_York"`), DST-correct
   * and independent of the device zone. Display-only: it shifts the wall-clock the
   * grid lays out from, it doesn't change your `Date`s. Uses `eventsInTimeZone`.
   */
  timeZone?: string;
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
  /** First hour shown (0–23). Default 0. */
  minHour?: number;
  /** Last hour shown, exclusive (1–24). Default 24. */
  maxHour?: number;
  /** Hide the left hour-axis column (lines stay, labels/gutter go). Default false. */
  hideHours?: boolean;
  /** Show the ISO week number in the header gutter. Default false. */
  showWeekNumber?: boolean;
  /** Prefix for the week number, e.g. "W" → "W28". Default "W". */
  weekNumberPrefix?: string;
  /** Shade the hours outside business hours. */
  businessHours?: BusinessHours;
  /**
   * Render a closed-hours band's content yourself (a label, icon, pattern).
   * The grid keeps positioning the band; when set, the themed tint is dropped
   * and your output fills the band instead.
   */
  renderBusinessHours?: (band: BusinessHoursBand) => ReactNode;
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
  /**
   * Add arrow-key navigation between time-grid events (a convenience for sighted
   * keyboard users; every event stays individually tabbable). Time-grid modes only.
   */
  keyboardEventNavigation?: boolean;

  // --- Month mode ---
  /** Max chips per day before a "+N more" row. */
  maxVisibleEventCount?: number;
  /** Overflow row template; `{moreCount}` is replaced. */
  moreLabel?: string;
  /** Render neighbouring months' days in the leading/trailing cells (default true). */
  showAdjacentMonths?: boolean;
  /** Weekday header label width: `narrow` ("M"), `short` ("Mon", default), or `long` ("Monday"). */
  weekdayFormat?: WeekdayFormat;
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
  /** Tap a month's title in the year view — e.g. jump to that month. */
  onPressMonth?: (month: Date) => void;
  /** Tap the "+N more" overflow row. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Custom month chip renderer. */
  renderMonthEvent?: DomMonthEvent<T>;

  // --- Schedule mode ---
  /** Custom agenda row renderer (`mode="schedule"`). */
  renderScheduleEvent?: DomAgendaEvent<T>;
}

// Stable empty array so a missing `events` prop doesn't churn `displayEvents`
// identity (and bust child memoization) on every re-render.
const EMPTY_EVENTS: CalendarEvent<never>[] = [];

// Recurrence is expanded over the range a mode renders: the month grid for
// `month`, the day columns for the time-grid modes, and a forward window for the
// `schedule` agenda (which has no bounded viewport of its own).
function expansionRange(
  mode: CalendarMode,
  date: Date,
  weekStartsOn: WeekStartsOn,
  numberOfDays: number | undefined,
): [Date, Date] {
  if (mode === "month") {
    return [
      startOfWeek(startOfMonth(date), { weekStartsOn }),
      endOfWeek(endOfMonth(date), { weekStartsOn }),
    ];
  }
  if (mode === "year") {
    return [
      startOfWeek(startOfYear(date), { weekStartsOn }),
      endOfWeek(endOfYear(date), { weekStartsOn }),
    ];
  }
  if (mode === "schedule") {
    // The agenda lists forward from the anchor date; three months is a sensible
    // default look-ahead. Pre-expand for a different window.
    return [startOfDay(date), endOfDay(addMonths(date, 3))];
  }
  const days = getViewDays(mode, date, weekStartsOn, numberOfDays ?? 1);
  return [startOfDay(days[0]), endOfDay(days[days.length - 1])];
}

// The date one page away in `direction` (+1 next, −1 previous): a year for
// `year`, a month for `month`, a week for `schedule`, else the view's day span.
function pageStep(
  mode: CalendarMode,
  date: Date,
  direction: number,
  weekStartsOn: WeekStartsOn,
  numberOfDays: number | undefined,
): Date {
  if (mode === "year") return addYears(date, direction);
  if (mode === "month") return addMonths(date, direction);
  if (mode === "schedule") return addDays(date, direction * 7);
  return addDays(date, direction * getViewDays(mode, date, weekStartsOn, numberOfDays ?? 1).length);
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
  onChangeDate,
  weekStartsOn = 0,
  hiddenDays,
  now,
  numberOfDays,
  locale,
  timeZone,
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
  minHour,
  maxHour,
  hideHours,
  showWeekNumber,
  weekNumberPrefix,
  businessHours,
  renderBusinessHours,
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
  keyboardEventNavigation,
  // month
  maxVisibleEventCount,
  moreLabel,
  showAdjacentMonths,
  weekdayFormat,
  fillCellOnSelection,
  selectedRange,
  selectedDates,
  minDate,
  maxDate,
  isDateDisabled,
  keyboardDayNavigation,
  onPressDay,
  onPressMonth,
  onPressMore,
  renderMonthEvent,
  // schedule
  renderScheduleEvent,
  // styling
  classNames,
  styles,
}: CalendarProps<T>): ReactElement {
  // Materialise recurring events over the range this mode renders, then apply the
  // display zone. Non-recurring and already-expanded events pass through
  // untouched, so identity is preserved for the common (no-recurrence) case.
  const displayEvents = useMemo(() => {
    let out: CalendarEvent<T>[] = events ?? EMPTY_EVENTS;
    if (out.some((e) => e.recurrence)) {
      let [start, end] = expansionRange(mode, date, weekStartsOn, numberOfDays);
      // A display zone shifts each occurrence's wall-clock by up to ~a day, which
      // can move an edge occurrence into a visible column; widen so it's generated.
      if (timeZone) {
        start = addDays(start, -1);
        end = addDays(end, 1);
      }
      out = expandRecurringEvents(out, start, end);
    }
    if (timeZone) out = eventsInTimeZone(out, timeZone);
    return out;
    // `date.getTime()`: recompute on the instant, not a re-created Date identity.
  }, [events, mode, date.getTime(), weekStartsOn, numberOfDays, timeZone]);

  // PageDown / PageUp page the calendar when the consumer opts in with
  // `onChangeDate`; keydowns bubble up from the focused grid to this handler.
  const handlePageKeys = (e: ReactKeyboardEvent) => {
    if (!onChangeDate) return;
    if (e.key === "PageDown") onChangeDate(pageStep(mode, date, 1, weekStartsOn, numberOfDays));
    else if (e.key === "PageUp") onChangeDate(pageStep(mode, date, -1, weekStartsOn, numberOfDays));
    else return;
    e.preventDefault();
  };

  let view: ReactElement;
  if (mode === "year") {
    view = (
      <YearView<T>
        date={date}
        events={displayEvents}
        weekStartsOn={weekStartsOn}
        hiddenDays={hiddenDays}
        locale={locale}
        theme={theme}
        className={className}
        style={height != null ? { height, ...style } : style}
        classNames={classNames}
        styles={styles}
        onPressDay={onPressDay}
        onPressMonth={onPressMonth}
      />
    );
  } else if (mode === "schedule") {
    view = (
      <Agenda<T>
        events={displayEvents}
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
  } else if (mode === "month") {
    view = (
      <MonthView<T>
        date={date}
        events={displayEvents}
        weekStartsOn={weekStartsOn}
        hiddenDays={hiddenDays}
        weekdayFormat={weekdayFormat}
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
        onCreateEvent={onCreateEvent}
        onPressEvent={onPressEvent}
        onPressMore={onPressMore}
        renderEvent={renderMonthEvent}
        eventAccessibilityLabel={eventAccessibilityLabel}
      />
    );
  } else {
    view = (
      <TimeGrid<T>
        date={date}
        mode={mode}
        events={displayEvents}
        weekStartsOn={weekStartsOn}
        hiddenDays={hiddenDays}
        now={now}
        timeZone={timeZone}
        weekdayFormat={weekdayFormat}
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
        minHour={minHour}
        maxHour={maxHour}
        hideHours={hideHours}
        showWeekNumber={showWeekNumber}
        weekNumberPrefix={weekNumberPrefix}
        businessHours={businessHours}
        renderBusinessHours={renderBusinessHours}
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
        keyboardEventNavigation={keyboardEventNavigation}
      />
    );
  }

  // `display: contents` adds no layout box, so the view renders exactly as before
  // while keydowns from the focused grid still bubble to the paging handler (a
  // no-op when `onChangeDate` is unset). Rendered unconditionally so toggling the
  // handler never remounts the view subtree.
  return (
    <div style={{ display: "contents" }} onKeyDown={handlePageKeys}>
      {view}
    </div>
  );
}
