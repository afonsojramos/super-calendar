import { type JSX } from "@solidjs/web";
import type { CalendarHandle, CalendarLabels } from "@super-calendar/core/vanilla";
import {
  buildMultiWeekGrid,
  type BusinessHours,
  type BusinessHoursBand,
  type CalendarEvent,
  type CalendarMode,
  type CreateGhostArgs,
  type DateRange,
  type DateSelectionConstraints,
  type EventAccessibilityLabeler,
  eventsInTimeZone,
  expandRecurringEvents,
  getViewDays,
  type WeekdayFormat,
  type WeekStartsOn,
} from "@super-calendar/core/vanilla";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  type Locale,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { type Component, createMemo, onSettled } from "solid-js";
import { Agenda, type AgendaSlot, type SolidAgendaEvent } from "./Agenda";
import { MonthView, type MonthViewSlot, type SolidMonthEvent } from "./MonthView";
import { MultiWeekView } from "./MultiWeekView";
import { withDefaults } from "./props";
import type { SlotStyleProps } from "./slots";
import { css, type CSSProperties, type DomKeyboardEvent, type ElementRef } from "./styles";
import type { SolidCalendarTheme } from "./theme";
import { type SolidRenderEvent, TimeGrid, type TimeGridSlot } from "./TimeGrid";
import { YearView, type YearViewSlot } from "./YearView";

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
  /**
   * Controlled anchor date, read in the device's local time zone; change it
   * (e.g. from your own header) to navigate. Construct it as a local date
   * (`new Date(2026, 7, 24)`), not a UTC instant:
   * `new Date("2026-08-24T00:00:00Z")` is still Aug 23 on devices west of UTC
   * and anchors the previous week.
   */
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
  /** Consecutive full week rows for `mode="multiweek"` (default 2). */
  numberOfWeeks?: number;
  /** date-fns locale for titles, headers, and time labels. */
  locale?: Locale;
  /**
   * Display events in this IANA time zone (e.g. `"America/New_York"`), DST-correct
   * and independent of the device zone. Display-only: it shifts the wall-clock the
   * grid lays out from, it doesn't change your `Date`s. Uses `eventsInTimeZone`.
   */
  timeZone?: string;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<SolidCalendarTheme>;
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
  /**
   * Minimum pixel height of a timed event box, so short events stay legible and
   * clickable. Also the floor of the `boxHeight` handed to `renderTimeEvent`.
   * Default 14; pass 0 to size every box strictly by its duration.
   */
  minEventHeight?: number;
  /**
   * Inset in pixels between a timed event box and its column edges (each side).
   * Default 1; pass 0 to let events fill their column.
   */
  eventGap?: number;
  /** Vertical scroll, in minutes from midnight. Applied on mount and whenever it changes. */
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
   * and your output fills the band instead. Decorative only: the
   * band stays non-interactive and hidden from assistive tech.
   */
  renderBusinessHours?: (band: BusinessHoursBand) => JSX.Element;
  /**
   * A component that draws a `display: "background"` event's band in place of
   * the themed shade; see `TimeGrid`'s prop of the same name.
   */
  renderBackgroundEvent?: SolidRenderEvent<T>;
  /** Show the current-time indicator (default true). */
  showNowIndicator?: boolean;
  /** Show the all-day lane (default true). */
  showAllDayEventCell?: boolean;
  /** Show the "all-day" text beside the lane (default false). */
  showAllDayLabel?: boolean;
  /** Tint weekend columns (default true). Set false to treat weekends normally. */
  highlightWeekends?: boolean;
  /** Allow moving events by default (per-event `startEditable` overrides). Default true. */
  eventStartEditable?: boolean;
  /** Allow resizing events by default (per-event `durationEditable` overrides). Default true. */
  eventDurationEditable?: boolean;
  /** Reject drags/resizes that would overlap another event (default true = allowed). */
  eventOverlap?: boolean;
  /** Snap dragged/created events to this many minutes. */
  dragStepMinutes?: number;
  /** DOM touch/pen hold duration in ms (default 300). */
  touchDragDelay?: number;
  /** DOM touch/pen movement tolerance in px (default 8). */
  touchDragThreshold?: number;
  /**
   * Tap empty space: the date+time pressed on the week/day grid, or the tapped
   * day at midnight in `month` mode (where it fires alongside `onPressDay`).
   */
  onPressCell?: (date: Date) => void;
  /**
   * Drag empty space to create. On the week/day grid that sweeps out a time
   * range; in `month` mode it sweeps out an **all-day** span across the days
   * dragged (`start` at midnight of the first, `end` at midnight after the last).
   */
  onCreateEvent?: (start: Date, end: Date) => void;
  /**
   * A component that draws content inside a creation preview in time-grid, month
   * and multi-week modes. Month rows receive the full all-day range with an
   * exclusive end, once per covered row. Requires onCreateEvent.
   */
  renderCreateGhost?: Component<CreateGhostArgs>;
  /** Fires when an event drag begins. */
  onDragStart?: (event: CalendarEvent<T>) => void;
  /**
   * Enables drag-to-move/resize; return `false` to reject the drop. In `month`
   * mode an event chip can be dragged onto another day, shifting both ends by the
   * days dragged so the time of day and duration are kept.
   */
  onDragEvent?: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  /** Stable, unique event identity for the web editing dialog across data refreshes. */
  getEventId?: (event: CalendarEvent<T>) => string | number;
  /** Tap a day's column header. */
  onPressDateHeader?: (day: Date) => void;
  /** Custom time-grid event renderer. */
  renderTimeEvent?: SolidRenderEvent<T>;
  /** Replace the hour-axis label. Receives the hour (0–23) and the `ampm` flag. */
  hourComponent?: (hour: number, ampm: boolean) => JSX.Element;
  /**
   * Add arrow-key navigation between time-grid events (a convenience for sighted
   * keyboard users; every event stays individually tabbable). Time-grid modes only.
   */
  keyboardEventNavigation?: boolean;

  // --- Month mode ---
  /** Max chips per day before a "+N more" row. */
  maxVisibleEventCount?: number;
  /** Month chip height in pixels; omit to keep the renderer default. */
  chipHeight?: number;
  /** Gap between month chip rows in pixels (default 2). */
  chipGap?: number;
  /** Overflow row template; `{moreCount}` is replaced. */
  moreLabel?: string;
  /** Translations for the screen-reader words and gutter text; omitted keys use English. */
  labels?: Partial<CalendarLabels>;
  /** Render neighbouring months' days in the leading/trailing cells (default true). */
  showAdjacentMonths?: boolean;
  /**
   * Render the built-in "Month yyyy" title above the month grid. Default true. Set
   * false when your own header already shows the month and year. Month mode only.
   */
  showTitle?: boolean;
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
  /**
   * Month and year modes: reports a create sweep's day span as it happens, as the
   * ordered inclusive `[start, end]` days, so a selection highlight can follow the
   * drag. Pair it with `createDateRange`'s `selectRange`. Enables the sweep on its
   * own, so it works without `onCreateEvent`.
   */
  onSelectDrag?: (start: Date, end: Date) => void;
  /** Tap a month's title in the year view, e.g. jump to that month. */
  onPressMonth?: (month: Date) => void;
  /** Tap the "+N more" overflow row. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Custom month chip renderer. */
  renderMonthEvent?: SolidMonthEvent<T>;

  // --- Schedule mode ---
  /** Custom agenda row renderer (`mode="schedule"`). */
  renderScheduleEvent?: SolidAgendaEvent<T>;
}

// Stable empty array so a missing `events` prop doesn't churn `displayEvents`
// identity when another input changes.
const EMPTY_EVENTS: CalendarEvent<never>[] = [];

// Recurrence is expanded over the range a mode renders: the month grid for
// `month`, the day columns for the time-grid modes, and a forward window for the
// `schedule` agenda (which has no bounded viewport of its own).
function expansionRange(
  mode: CalendarMode,
  date: Date,
  weekStartsOn: WeekStartsOn,
  numberOfDays: number | undefined,
  numberOfWeeks: number,
): [Date, Date] {
  if (mode === "multiweek") {
    const { period } = buildMultiWeekGrid(date, { weekStartsOn, numberOfWeeks });
    return [period.start, endOfDay(addDays(period.endExclusive, -1))];
  }
  if (mode === "month") {
    return [
      startOfWeek(startOfMonth(date), {
        weekStartsOn,
      }),
      endOfWeek(endOfMonth(date), {
        weekStartsOn,
      }),
    ];
  }
  if (mode === "year") {
    return [
      startOfWeek(startOfYear(date), {
        weekStartsOn,
      }),
      endOfWeek(endOfYear(date), {
        weekStartsOn,
      }),
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
  numberOfWeeks: number,
): Date {
  if (mode === "multiweek") return addWeeks(date, direction * numberOfWeeks);
  if (mode === "year") return addYears(date, direction);
  if (mode === "month") return addMonths(date, direction);
  if (mode === "schedule") return addDays(date, direction * 7);
  return addDays(date, direction * getViewDays(mode, date, weekStartsOn, numberOfDays ?? 1).length);
}

/**
 * Main entry point for the Solid renderer: it picks the right
 * view for `mode`. `month` renders a single {@link MonthView}; `schedule` renders
 * an {@link Agenda}; the time-grid modes render a {@link TimeGrid}. For a
 * scrolling month picker, use {@link MonthList} directly.
 *
 * @example
 * ```tsx
 * <Calendar mode="week" date={new Date()} events={events} />
 * ```
 */

export function Calendar<T = unknown>(
  incoming: CalendarProps<T> & {
    ref?: (handle: CalendarHandle) => void;
  },
): JSX.Element {
  const props = withDefaults(
    {
      mode: "week",
      weekStartsOn: 0,
      numberOfWeeks: 2,
    } satisfies Partial<
      CalendarProps<T> & {
        ref?: (handle: CalendarHandle) => void;
      }
    >,
    incoming,
  );
  const timeGridRef: ElementRef<CalendarHandle | null> = {
    current: null,
  };
  onSettled(() => {
    props.ref?.({
      scrollToTime: (minutes, options) => timeGridRef.current?.scrollToTime(minutes, options),
    });
  });
  // Materialise recurring events over the range this mode renders, then apply the
  // display zone. Non-recurring and already-expanded events pass through
  // untouched, so identity is preserved for the common (no-recurrence) case.
  const displayEvents = createMemo(() => {
    let out: CalendarEvent<T>[] = props.events ?? EMPTY_EVENTS;
    if (out.some((e) => e.recurrence)) {
      let [start, end] = expansionRange(
        props.mode,
        props.date,
        props.weekStartsOn,
        props.numberOfDays,
        props.numberOfWeeks,
      );
      // A display zone shifts each occurrence's wall-clock by up to ~a day, which
      // can move an edge occurrence into a visible column; widen so it's generated.
      if (props.timeZone) {
        start = addDays(start, -1);
        end = addDays(end, 1);
      }
      out = expandRecurringEvents(out, start, end);
    }
    if (props.timeZone) out = eventsInTimeZone(out, props.timeZone);
    return out;
    // `date.getTime()`: recompute on the instant, not a re-created Date identity.
  });

  // PageDown / PageUp page the calendar when the consumer opts in with
  // `onChangeDate`; keydowns bubble up from the focused grid to this handler.
  const handlePageKeys = (e: DomKeyboardEvent) => {
    if (!props.onChangeDate) return;
    if (e.key === "PageDown")
      props.onChangeDate(
        pageStep(
          props.mode,
          props.date,
          1,
          props.weekStartsOn,
          props.numberOfDays,
          props.numberOfWeeks,
        ),
      );
    else if (e.key === "PageUp")
      props.onChangeDate(
        pageStep(
          props.mode,
          props.date,
          -1,
          props.weekStartsOn,
          props.numberOfDays,
          props.numberOfWeeks,
        ),
      );
    else return;
    e.preventDefault();
  };
  const currentMode = createMemo(() => props.mode);
  const view = () => {
    const mode = currentMode();
    if (mode === "year") {
      return (
        <YearView<T>
          date={props.date}
          events={displayEvents()}
          weekStartsOn={props.weekStartsOn}
          hiddenDays={props.hiddenDays}
          locale={props.locale}
          labels={props.labels}
          theme={props.theme}
          className={props.className}
          style={
            props.height != null
              ? {
                  height: props.height,
                  ...props.style,
                }
              : props.style
          }
          classNames={props.classNames}
          styles={props.styles}
          selectedRange={props.selectedRange}
          selectedDates={props.selectedDates}
          minDate={props.minDate}
          maxDate={props.maxDate}
          isDateDisabled={props.isDateDisabled}
          onPressDay={props.onPressDay}
          onPressMonth={props.onPressMonth}
          onSelectDrag={props.onSelectDrag}
          onCreateEvent={props.onCreateEvent}
        />
      );
    } else if (mode === "schedule") {
      return (
        <Agenda<T>
          events={displayEvents()}
          locale={props.locale}
          ampm={props.ampm}
          theme={props.theme}
          height={props.height}
          activeDate={props.date}
          className={props.className}
          style={props.style}
          classNames={props.classNames}
          styles={props.styles}
          renderEvent={props.renderScheduleEvent}
          eventAccessibilityLabel={props.eventAccessibilityLabel}
          onPressEvent={props.onPressEvent}
          onPressDay={props.onPressDay}
        />
      );
    } else if (mode === "month") {
      return (
        <MonthView<T>
          date={props.date}
          events={displayEvents()}
          weekStartsOn={props.weekStartsOn}
          hiddenDays={props.hiddenDays}
          weekdayFormat={props.weekdayFormat}
          highlightWeekends={props.highlightWeekends}
          locale={props.locale}
          labels={props.labels}
          theme={props.theme}
          className={props.className}
          style={props.style}
          classNames={props.classNames}
          styles={props.styles}
          maxVisibleEventCount={props.maxVisibleEventCount}
          chipHeight={props.chipHeight}
          chipGap={props.chipGap}
          moreLabel={props.moreLabel}
          showAdjacentMonths={props.showAdjacentMonths}
          showTitle={props.showTitle}
          fillCellOnSelection={props.fillCellOnSelection}
          selectedRange={props.selectedRange}
          selectedDates={props.selectedDates}
          minDate={props.minDate}
          maxDate={props.maxDate}
          isDateDisabled={props.isDateDisabled}
          keyboardDayNavigation={props.keyboardDayNavigation}
          onPressDay={props.onPressDay}
          onPressCell={props.onPressCell}
          onCreateEvent={props.onCreateEvent}
          renderCreateGhost={props.renderCreateGhost}
          onSelectDrag={props.onSelectDrag}
          onDragEvent={props.onDragEvent}
          onDragStart={props.onDragStart}
          eventStartEditable={props.eventStartEditable}
          eventOverlap={props.eventOverlap}
          onPressEvent={props.onPressEvent}
          onPressMore={props.onPressMore}
          renderEvent={props.renderMonthEvent}
          eventAccessibilityLabel={props.eventAccessibilityLabel}
        />
      );
    } else if (mode === "multiweek") {
      return (
        <MultiWeekView<T>
          date={props.date}
          numberOfWeeks={props.numberOfWeeks}
          events={displayEvents()}
          weekStartsOn={props.weekStartsOn}
          hiddenDays={props.hiddenDays}
          weekdayFormat={props.weekdayFormat}
          highlightWeekends={props.highlightWeekends}
          locale={props.locale}
          labels={props.labels}
          theme={props.theme}
          className={props.className}
          style={{ height: props.height, ...props.style }}
          classNames={props.classNames}
          styles={props.styles}
          maxVisibleEventCount={props.maxVisibleEventCount}
          chipHeight={props.chipHeight}
          chipGap={props.chipGap}
          moreLabel={props.moreLabel}
          showTitle={props.showTitle}
          fillCellOnSelection={props.fillCellOnSelection}
          selectedRange={props.selectedRange}
          selectedDates={props.selectedDates}
          minDate={props.minDate}
          maxDate={props.maxDate}
          isDateDisabled={props.isDateDisabled}
          keyboardDayNavigation={props.keyboardDayNavigation}
          onPressDay={props.onPressDay}
          onPressCell={props.onPressCell}
          onCreateEvent={props.onCreateEvent}
          renderCreateGhost={props.renderCreateGhost}
          onSelectDrag={props.onSelectDrag}
          onDragEvent={props.onDragEvent}
          onDragStart={props.onDragStart}
          eventStartEditable={props.eventStartEditable}
          eventOverlap={props.eventOverlap}
          onPressEvent={props.onPressEvent}
          onPressMore={props.onPressMore}
          renderEvent={props.renderMonthEvent}
          eventAccessibilityLabel={props.eventAccessibilityLabel}
        />
      );
    } else {
      return (
        <TimeGrid<T>
          ref={(el) => (timeGridRef.current = el)}
          date={props.date}
          mode={mode}
          events={displayEvents()}
          weekStartsOn={props.weekStartsOn}
          hiddenDays={props.hiddenDays}
          now={props.now}
          timeZone={props.timeZone}
          weekdayFormat={props.weekdayFormat}
          numberOfDays={props.numberOfDays}
          locale={props.locale}
          labels={props.labels}
          theme={props.theme}
          height={props.height}
          className={props.className}
          style={props.style}
          classNames={props.classNames}
          styles={props.styles}
          ampm={props.ampm}
          hourHeight={props.hourHeight}
          minEventHeight={props.minEventHeight}
          eventGap={props.eventGap}
          scrollOffsetMinutes={props.scrollOffsetMinutes}
          timeslots={props.timeslots}
          minHour={props.minHour}
          maxHour={props.maxHour}
          hideHours={props.hideHours}
          showWeekNumber={props.showWeekNumber}
          weekNumberPrefix={props.weekNumberPrefix}
          businessHours={props.businessHours}
          renderBusinessHours={props.renderBusinessHours}
          renderBackgroundEvent={props.renderBackgroundEvent}
          showNowIndicator={props.showNowIndicator}
          showAllDayEventCell={props.showAllDayEventCell}
          showAllDayLabel={props.showAllDayLabel}
          highlightWeekends={props.highlightWeekends}
          eventStartEditable={props.eventStartEditable}
          eventDurationEditable={props.eventDurationEditable}
          eventOverlap={props.eventOverlap}
          dragStepMinutes={props.dragStepMinutes}
          touchDragDelay={props.touchDragDelay}
          touchDragThreshold={props.touchDragThreshold}
          onPressEvent={props.onPressEvent}
          onPressCell={props.onPressCell}
          onCreateEvent={props.onCreateEvent}
          renderCreateGhost={props.renderCreateGhost}
          onDragStart={props.onDragStart}
          onDragEvent={props.onDragEvent}
          getEventId={props.getEventId}
          onChangeDate={props.onChangeDate}
          onPressDateHeader={props.onPressDateHeader}
          renderEvent={props.renderTimeEvent}
          eventAccessibilityLabel={props.eventAccessibilityLabel}
          hourComponent={props.hourComponent}
          keyboardEventNavigation={props.keyboardEventNavigation}
        />
      );
    }

    // `display: contents` adds no layout box, so the view renders exactly as before
    // while keydowns from the focused grid still bubble to the paging handler (a
    // no-op when `onChangeDate` is unset). Rendered unconditionally so toggling the
    // handler never remounts the view subtree.
  };
  return (
    <div
      style={css({
        display: "contents",
      })}
      onKeyDown={handlePageKeys}
    >
      {view()}
    </div>
  );
}
