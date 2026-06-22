import type { Locale } from 'date-fns';
import { useCallback, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { CalendarThemeProvider, mergeTheme, type PartialCalendarTheme } from '../theme';
import type {
  CalendarEvent,
  CalendarMode,
  EventKeyExtractor,
  RenderEvent,
  RenderEventArgs,
  WeekStartsOn,
} from '../types';
import { Agenda } from './Agenda';
import { DefaultEvent } from './DefaultEvent';
import { MonthPager } from './MonthPager';
import { DEFAULT_HOUR_HEIGHT, TimeGrid } from './TimeGrid';

export type CalendarProps<T> = {
  events: CalendarEvent<T>[];
  mode: CalendarMode;
  date: Date;
  onChangeDate: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  /** Long-press an event (month/week/day). */
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  /** Tap a day cell (month mode) — e.g. drill into the day view. */
  onPressDay?: (date: Date) => void;
  /** Long-press a day cell (month mode). */
  onLongPressDay?: (date: Date) => void;
  /** Tap the "+N more" overflow label in a month cell. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Tap empty space on the week/day grid; receives the date+time pressed. */
  onPressCell?: (date: Date) => void;
  /** Long-press empty space on the week/day grid; receives the date+time. */
  onLongPressCell?: (date: Date) => void;
  /** Tap a day's column header on the week/day grid (default header only). */
  onPressDateHeader?: (date: Date) => void;
  /** Max events shown per month cell before they collapse into "+N more". */
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
  /** Replace the built-in event box. Return a `flex: 1` element. */
  renderEvent?: RenderEvent<T>;
  /** Per-event style merged onto the built-in event box (static or a function of the event). */
  eventCellStyle?: StyleProp<ViewStyle> | ((event: CalendarEvent<T>) => StyleProp<ViewStyle>);
  /** Per-date style for month cells and week/day columns (e.g. shade specific dates). */
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
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
  /** Initial vertical scroll, in minutes from midnight (week/day). */
  scrollOffsetMinutes?: number;
  /** Show the current-time line on the week/day grid. Default true. */
  showNowIndicator?: boolean;
  /** A date-fns `Locale` for weekday/date labels. Defaults to English. */
  locale?: Locale;
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
};

// Derive a key purely from event data so identity is stable across reorders and
// list mutations. Supply your own `keyExtractor` returning a real id when events
// can share an identical start/end/title.
const defaultKeyExtractor: EventKeyExtractor<unknown> = (event) =>
  `${event.start.toISOString()}|${event.end.toISOString()}|${event.title ?? ''}`;

export function Calendar<T>({
  events,
  mode,
  date,
  onChangeDate,
  onPressEvent,
  onLongPressEvent,
  onPressDay,
  onLongPressDay,
  onPressMore,
  onPressCell,
  onLongPressCell,
  onPressDateHeader,
  maxVisibleEventCount = 2,
  sortedMonthView,
  moreLabel,
  showAdjacentMonths,
  disableMonthEventCellPress,
  weekStartsOn = 0,
  numberOfDays,
  renderEvent = DefaultEvent,
  eventCellStyle,
  calendarCellStyle,
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
  showSixWeeks,
  swipeEnabled,
  showVerticalScrollIndicator,
  verticalScrollEnabled,
  headerComponent,
  minHour,
  maxHour,
  ampm,
  showTime,
  scrollOffsetMinutes,
  showNowIndicator,
  locale,
  isRTL,
  freeSwipe,
  renderTimeGridHeader,
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

  // Inject `eventCellStyle`, `ampm` and `showTime` into the renderer once, so
  // every view gets them for free without threading the props through each
  // component. Skip the wrapper entirely when none are set.
  const resolvedRenderEvent = useMemo<RenderEvent<T>>(() => {
    if (eventCellStyle == null && ampm == null && showTime == null) return renderEvent;
    const Base = renderEvent;
    return function StyledEvent(props: RenderEventArgs<T>) {
      const cellStyle =
        typeof eventCellStyle === 'function' ? eventCellStyle(props.event) : eventCellStyle;
      return <Base {...props} cellStyle={cellStyle} ampm={ampm} showTime={showTime} />;
    };
  }, [renderEvent, eventCellStyle, ampm, showTime]);

  return (
    <CalendarThemeProvider value={mergedTheme}>
      {mode === 'month' ? (
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
          calendarCellStyle={calendarCellStyle}
          renderEvent={resolvedRenderEvent}
          keyExtractor={keyExtractor}
          onPressDay={onPressDay}
          onLongPressDay={onLongPressDay}
          onPressEvent={handlePressEvent}
          onLongPressEvent={handleLongPressEvent}
          onPressMore={onPressMore}
          onChangeDate={onChangeDate}
          freeSwipe={freeSwipe}
          swipeEnabled={swipeEnabled}
        />
      ) : mode === 'schedule' ? (
        <Agenda
          events={events}
          locale={locale}
          renderEvent={resolvedRenderEvent}
          keyExtractor={keyExtractor}
          onPressEvent={handlePressEvent}
          onLongPressEvent={handleLongPressEvent}
          onPressDay={onPressDay}
        />
      ) : (
        <TimeGrid
          mode={mode}
          numberOfDays={numberOfDays}
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
          showWeekNumber={showWeekNumber}
          weekNumberPrefix={weekNumberPrefix}
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
          isRTL={isRTL}
          freeSwipe={freeSwipe}
          swipeEnabled={swipeEnabled}
          onPressEvent={handlePressEvent}
          onLongPressEvent={handleLongPressEvent}
          onPressCell={onPressCell}
          onLongPressCell={onLongPressCell}
          onPressDateHeader={onPressDateHeader}
          onChangeDate={onChangeDate}
          renderHeader={renderTimeGridHeader}
        />
      )}
    </CalendarThemeProvider>
  );
}
