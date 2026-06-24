import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  type Locale,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useCallback, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { CalendarThemeProvider, mergeTheme, type PartialCalendarTheme } from "../theme";
import type { DateRange } from "../utils/dateRange";
import type {
  CalendarEvent,
  CalendarMode,
  EventKeyExtractor,
  RenderEvent,
  RenderEventArgs,
  WeekStartsOn,
} from "../types";
import { getViewDays } from "../utils/dates";
import { Agenda } from "./Agenda";
import { DefaultEvent } from "./DefaultEvent";
import { MonthPager } from "./MonthPager";
import {
  type BusinessHours,
  DEFAULT_HOUR_HEIGHT,
  type EventDragHandler,
  type EventDragStartHandler,
  type HourRenderer,
  TimeGrid,
} from "./TimeGrid";

export type CalendarProps<T> = {
  events: CalendarEvent<T>[];
  mode: CalendarMode;
  date: Date;
  onChangeDate: (date: Date) => void;
  /** Fired alongside `onChangeDate` with the `[start, end]` of the newly-visible range. */
  onChangeDateRange?: (range: [Date, Date]) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  /** Long-press an event (month/week/day). */
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  /**
   * Enable drag-to-move and drag-to-resize on the week/day grid. Called with the
   * dragged event and its new start/end (snapped to `dragStepMinutes`); update
   * your own event state in response. Long-press an event to move it (drag
   * horizontally to change the day too); drag its bottom grip to resize. Return
   * `false` to reject the drop (e.g. an overlap) and snap the event back.
   */
  onDragEvent?: EventDragHandler<T>;
  /**
   * Fired when a move or resize gesture begins on the week/day grid, before any
   * change is committed: on grab for a move (after the long-press), and when a
   * resize drag starts. Use it to trigger haptic feedback, e.g.
   * `Haptics.impactAsync()` from `expo-haptics`. Native-only and inert unless
   * `onDragEvent` is also set.
   */
  onDragStart?: EventDragStartHandler<T>;
  /** Minutes a drag-to-move/resize snaps to. Default 15. */
  dragStepMinutes?: number;
  /** Tap a day cell (month mode) — e.g. drill into the day view. */
  onPressDay?: (date: Date) => void;
  /** Long-press a day cell (month mode). */
  onLongPressDay?: (date: Date) => void;
  /** Tap the "+N more" overflow label in a month cell. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Tap empty space on the week/day grid; receives the date+time pressed. */
  onPressCell?: (date: Date) => void;
  /** After an empty-cell press, snap the pager back to the active page. Default false. */
  resetPageOnPressCell?: boolean;
  /** Long-press empty space on the week/day grid; receives the date+time. */
  onLongPressCell?: (date: Date) => void;
  /**
   * Enable drag-to-create on the week/day grid: long-press empty space and drag
   * to sweep out a new event's time range. Called on release with the snapped
   * `start`/`end` (to `dragStepMinutes`); create your own event in response. A
   * stationary press yields a one-step range. Native-only; supersedes
   * `onLongPressCell` on empty space when set.
   */
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Tap a day's column header on the week/day grid (default header only). */
  onPressDateHeader?: (date: Date) => void;
  /**
   * Max event chips per month cell before they collapse into "+N more". Omit to
   * auto-fit as many as the cell height allows (default); set a number for a
   * fixed cap. Pass an explicit value when using a custom `renderEvent`.
   */
  maxVisibleEventCount?: number;
  /** Sort each month day's events by start. Default true. */
  sortedMonthView?: boolean;
  /** Month overflow label template; `{moreCount}` is replaced. Default "{moreCount} More". */
  moreLabel?: string;
  /** Show dimmed adjacent-month days in the month grid. Default true. */
  showAdjacentMonths?: boolean;
  /** Ignore taps on month-cell events (day taps still fire). Default false. */
  disableMonthEventCellPress?: boolean;
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Number of day columns when `mode="custom"`. Ignored by other modes. Default 1. */
  numberOfDays?: number;
  /**
   * Last weekday of a `custom` partial-week view (0–6). When set, `custom` shows
   * `weekStartsOn`…`weekEndsOn` of the visible week and pages by week, taking
   * precedence over `numberOfDays`. Ignored by other modes.
   */
  weekEndsOn?: WeekStartsOn;
  /** Replace the built-in event box. Return a `flex: 1` element. */
  renderEvent?: RenderEvent<T>;
  /** Per-event style merged onto the built-in event box (static or a function of the event). */
  eventCellStyle?: StyleProp<ViewStyle> | ((event: CalendarEvent<T>) => StyleProp<ViewStyle>);
  /** Per-date style for month cells and week/day columns (e.g. shade specific dates). */
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  /**
   * Week/day grid only: open hours per day for business-hours shading. Hours
   * outside the returned `{ start, end }` are tinted; return `null` to shade the
   * whole day (closed). Omit for no shading.
   */
  businessHours?: BusinessHours;
  /** Stable key per event. Defaults to start-time + index. */
  keyExtractor?: EventKeyExtractor<T>;
  /** Partial theme merged over the defaults. */
  theme?: PartialCalendarTheme;
  /** Externally-owned per-hour row height (week/day). Created internally if omitted. */
  cellHeight?: ReturnType<typeof useSharedValue<number>>;
  /** Initial per-hour row height in px (week/day). Default 64. */
  hourHeight?: number;
  minHourHeight?: number;
  maxHourHeight?: number;
  hourColumnWidth?: number;
  /** Hide the left hour-axis column on the week/day grid. Default false. */
  hideHours?: boolean;
  /** Sub-hour divider lines per hour on the week/day grid (e.g. 2 = half-hours). Default 1. */
  timeslots?: number;
  /** Show the ISO week number in the week/day header gutter. Default false. */
  showWeekNumber?: boolean;
  /** Prefix for the week-number label (e.g. "W"). Default "W". */
  weekNumberPrefix?: string;
  /** Replace the hour-axis label on the week/day grid. Receives the hour (0–23) and `ampm`. */
  hourComponent?: HourRenderer;
  /** Always render six week rows in month view, for a fixed-height grid. Default false. */
  showSixWeeks?: boolean;
  /** Allow swiping between pages (all modes). Default true. */
  swipeEnabled?: boolean;
  /** Show the vertical scroll indicator on the week/day grid. Default true. */
  showVerticalScrollIndicator?: boolean;
  /** Allow vertical scrolling of the week/day grid. Default true. */
  verticalScrollEnabled?: boolean;
  /** Element rendered between the day header and the week/day grid. */
  headerComponent?: React.ReactNode;
  /** First hour shown on the week/day grid (0–23). Default 0. */
  minHour?: number;
  /** Last hour shown on the week/day grid, exclusive (1–24). Default 24. */
  maxHour?: number;
  /** Show hour labels (and built-in event times) in 12-hour AM/PM form. Default false (24h). */
  ampm?: boolean;
  /** Show the time range in the built-in event renderer (day/week/schedule). Default true. */
  showTime?: boolean;
  /** Add a trailing ellipsis (…) when an event title overflows in the built-in renderer; otherwise the text is clipped. Default false. */
  ellipsizeTitle?: boolean;
  /** Initial vertical scroll, in minutes from midnight (week/day). */
  scrollOffsetMinutes?: number;
  /** Show the current-time line on the week/day grid. Default true. */
  showNowIndicator?: boolean;
  /** A date-fns `Locale` for weekday/date labels. Defaults to English. */
  locale?: Locale;
  /** Highlight this date (header/cell/agenda) instead of the real "today". */
  activeDate?: Date;
  /** Month mode only: mark a single day as selected. Wire `onPressDay` to update it. */
  selectedDate?: Date | null;
  /** Month mode only: mark several days as selected (multi-select). */
  selectedDates?: Date[];
  /** Month mode only: a selected span; pair with the `useDateRange` hook for range picking. */
  selectedRange?: DateRange;
  /** Month mode only: earliest selectable day (inclusive); earlier days render disabled. */
  minDate?: Date;
  /** Month mode only: latest selectable day (inclusive); later days render disabled. */
  maxDate?: Date;
  /** Month mode only: return true to render a day disabled (dimmed, taps ignored). */
  isDateDisabled?: (date: Date) => boolean;
  /**
   * Lay the day columns out right-to-left (month, week/day grid and all-day lane).
   * Cosmetic only: the hour gutter stays on the left and paging still advances
   * with the system scroll direction. Default false. For full RTL (including
   * scroll direction), also enable React Native's `I18nManager`.
   */
  isRTL?: boolean;
  /**
   * Allow a fling to carry across several pages before snapping. Default false:
   * one day/week/month per swipe.
   */
  freeSwipe?: boolean;
  /** Custom header above the week/day grid. Receives the visible days. */
  renderTimeGridHeader?: (days: Date[]) => React.ReactNode;
  /** Replace the weekday-label header above the month grid. Return `null` to hide it. */
  renderHeaderForMonthView?: (weekDays: Date[]) => React.ReactNode;
  /** Drawn between rows of the `schedule` (agenda) list. */
  itemSeparatorComponent?: React.ComponentType<unknown> | null;
};

// Derive a key purely from event data so identity is stable across reorders and
// list mutations. Supply your own `keyExtractor` returning a real id when events
// can share an identical start/end/title.
const defaultKeyExtractor: EventKeyExtractor<unknown> = (event) =>
  `${event.start.toISOString()}|${event.end.toISOString()}|${event.title ?? ""}`;

// The [start, end] of the dates a given mode shows around `date`. Month spans the
// padded grid (whole weeks); time-grid modes span their day columns.
function visibleRange(
  mode: CalendarMode,
  date: Date,
  weekStartsOn: WeekStartsOn,
  numberOfDays: number,
  weekEndsOn?: WeekStartsOn,
): [Date, Date] {
  if (mode === "month") {
    return [
      startOfWeek(startOfMonth(date), { weekStartsOn }),
      endOfWeek(endOfMonth(date), { weekStartsOn }),
    ];
  }
  const days = getViewDays(mode, date, weekStartsOn, numberOfDays, false, weekEndsOn);
  return [startOfDay(days[0]), endOfDay(days[days.length - 1])];
}

export function Calendar<T>({
  events,
  mode,
  date,
  onChangeDate,
  onChangeDateRange,
  onPressEvent,
  onLongPressEvent,
  onDragEvent,
  onDragStart,
  dragStepMinutes,
  onPressDay,
  onLongPressDay,
  onPressMore,
  onPressCell,
  resetPageOnPressCell,
  onLongPressCell,
  onCreateEvent,
  onPressDateHeader,
  maxVisibleEventCount,
  sortedMonthView,
  moreLabel,
  showAdjacentMonths,
  disableMonthEventCellPress,
  weekStartsOn = 0,
  numberOfDays,
  weekEndsOn,
  renderEvent = DefaultEvent,
  eventCellStyle,
  calendarCellStyle,
  businessHours,
  keyExtractor = defaultKeyExtractor as EventKeyExtractor<T>,
  theme,
  cellHeight: cellHeightProp,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  minHourHeight,
  maxHourHeight,
  hourColumnWidth,
  hideHours,
  timeslots,
  showWeekNumber,
  weekNumberPrefix,
  hourComponent,
  showSixWeeks,
  swipeEnabled,
  showVerticalScrollIndicator,
  verticalScrollEnabled,
  headerComponent,
  minHour,
  maxHour,
  ampm,
  showTime,
  ellipsizeTitle,
  scrollOffsetMinutes,
  showNowIndicator,
  locale,
  activeDate,
  selectedDate,
  selectedDates,
  selectedRange,
  minDate,
  maxDate,
  isDateDisabled,
  isRTL,
  freeSwipe,
  renderTimeGridHeader,
  renderHeaderForMonthView,
  itemSeparatorComponent,
}: CalendarProps<T>) {
  const mergedTheme = useMemo(() => mergeTheme(theme), [theme]);
  const internalCellHeight = useSharedValue(hourHeight);
  const cellHeight = cellHeightProp ?? internalCellHeight;

  // Swallow presses on disabled events once, so every view inherits the guard.
  const handlePressEvent = useCallback(
    (event: CalendarEvent<T>) => {
      if (!event.disabled) onPressEvent(event);
    },
    [onPressEvent],
  );
  const handleLongPressEvent = useMemo(
    () =>
      onLongPressEvent
        ? (event: CalendarEvent<T>) => {
            if (!event.disabled) onLongPressEvent(event);
          }
        : undefined,
    [onLongPressEvent],
  );

  // Echo every date change and, when asked, the full visible range derived from it.
  const handleChangeDate = useCallback(
    (next: Date) => {
      onChangeDate(next);
      onChangeDateRange?.(visibleRange(mode, next, weekStartsOn, numberOfDays ?? 1, weekEndsOn));
    },
    [onChangeDate, onChangeDateRange, mode, weekStartsOn, numberOfDays, weekEndsOn],
  );

  // Inject `eventCellStyle`, `ampm`, `showTime` and `ellipsizeTitle` into the
  // renderer once, so every view gets them for free without threading the props
  // through each component. Skip the wrapper entirely when none are set.
  const resolvedRenderEvent = useMemo<RenderEvent<T>>(() => {
    if (eventCellStyle == null && ampm == null && showTime == null && ellipsizeTitle == null)
      return renderEvent;
    const Base = renderEvent;
    return function StyledEvent(props: RenderEventArgs<T>) {
      const cellStyle =
        typeof eventCellStyle === "function" ? eventCellStyle(props.event) : eventCellStyle;
      return (
        <Base
          {...props}
          cellStyle={cellStyle}
          ampm={ampm}
          showTime={showTime}
          ellipsizeTitle={ellipsizeTitle}
        />
      );
    };
  }, [renderEvent, eventCellStyle, ampm, showTime, ellipsizeTitle]);

  // Fold the single-date convenience prop into the multi-select list the month
  // view consumes, so callers can use whichever shape fits their selection mode.
  const monthSelectedDates = useMemo(() => {
    if (selectedDate == null) return selectedDates;
    return selectedDates ? [...selectedDates, selectedDate] : [selectedDate];
  }, [selectedDate, selectedDates]);

  return (
    <CalendarThemeProvider value={mergedTheme}>
      {mode === "month" ? (
        <MonthPager
          date={date}
          events={events}
          maxVisibleEventCount={maxVisibleEventCount}
          weekStartsOn={weekStartsOn}
          locale={locale}
          sortedMonthView={sortedMonthView}
          moreLabel={moreLabel}
          showAdjacentMonths={showAdjacentMonths}
          disableMonthEventCellPress={disableMonthEventCellPress}
          isRTL={isRTL}
          showSixWeeks={showSixWeeks}
          activeDate={activeDate}
          selectedDates={monthSelectedDates}
          selectedRange={selectedRange}
          minDate={minDate}
          maxDate={maxDate}
          isDateDisabled={isDateDisabled}
          renderHeaderForMonthView={renderHeaderForMonthView}
          calendarCellStyle={calendarCellStyle}
          renderEvent={resolvedRenderEvent}
          keyExtractor={keyExtractor}
          onPressDay={onPressDay}
          onLongPressDay={onLongPressDay}
          onPressEvent={handlePressEvent}
          onLongPressEvent={handleLongPressEvent}
          onPressMore={onPressMore}
          onChangeDate={handleChangeDate}
          freeSwipe={freeSwipe}
          swipeEnabled={swipeEnabled}
        />
      ) : mode === "schedule" ? (
        <Agenda
          events={events}
          locale={locale}
          renderEvent={resolvedRenderEvent}
          keyExtractor={keyExtractor}
          onPressEvent={handlePressEvent}
          onLongPressEvent={handleLongPressEvent}
          onPressDay={onPressDay}
          activeDate={activeDate}
          itemSeparatorComponent={itemSeparatorComponent}
        />
      ) : (
        <TimeGrid
          mode={mode}
          numberOfDays={numberOfDays}
          weekEndsOn={weekEndsOn}
          date={date}
          events={events}
          cellHeight={cellHeight}
          hourHeight={hourHeight}
          weekStartsOn={weekStartsOn}
          renderEvent={resolvedRenderEvent}
          keyExtractor={keyExtractor}
          scrollOffsetMinutes={scrollOffsetMinutes}
          hourColumnWidth={hourColumnWidth}
          hideHours={hideHours}
          timeslots={timeslots}
          calendarCellStyle={calendarCellStyle}
          businessHours={businessHours}
          showWeekNumber={showWeekNumber}
          weekNumberPrefix={weekNumberPrefix}
          hourComponent={hourComponent}
          showVerticalScrollIndicator={showVerticalScrollIndicator}
          verticalScrollEnabled={verticalScrollEnabled}
          headerComponent={headerComponent}
          minHour={minHour}
          maxHour={maxHour}
          ampm={ampm}
          minHourHeight={minHourHeight}
          maxHourHeight={maxHourHeight}
          showNowIndicator={showNowIndicator}
          locale={locale}
          activeDate={activeDate}
          isRTL={isRTL}
          freeSwipe={freeSwipe}
          swipeEnabled={swipeEnabled}
          onPressEvent={handlePressEvent}
          onLongPressEvent={handleLongPressEvent}
          onDragEvent={onDragEvent}
          onDragStart={onDragStart}
          dragStepMinutes={dragStepMinutes}
          onPressCell={onPressCell}
          resetPageOnPressCell={resetPageOnPressCell}
          onLongPressCell={onLongPressCell}
          onCreateEvent={onCreateEvent}
          onPressDateHeader={onPressDateHeader}
          onChangeDate={handleChangeDate}
          renderHeader={renderTimeGridHeader}
        />
      )}
    </CalendarThemeProvider>
  );
}
