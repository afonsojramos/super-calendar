import type { Locale } from 'date-fns';
import { useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { CalendarThemeProvider, mergeTheme, type PartialCalendarTheme } from '../theme';
import type {
  CalendarEvent,
  CalendarMode,
  EventKeyExtractor,
  RenderEvent,
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
  /** First hour shown on the week/day grid (0–23). Default 0. */
  minHour?: number;
  /** Last hour shown on the week/day grid, exclusive (1–24). Default 24. */
  maxHour?: number;
  /** Show hour labels in 12-hour AM/PM form. Default false (24h). */
  ampm?: boolean;
  /** Initial vertical scroll, in minutes from midnight (week/day). */
  scrollOffsetMinutes?: number;
  /** Show the current-time line on the week/day grid. Default true. */
  showNowIndicator?: boolean;
  /** A date-fns `Locale` for weekday/date labels. Defaults to English. */
  locale?: Locale;
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
  keyExtractor = defaultKeyExtractor as EventKeyExtractor<T>,
  theme,
  cellHeight: cellHeightProp,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  minHourHeight,
  maxHourHeight,
  hourColumnWidth,
  minHour,
  maxHour,
  ampm,
  scrollOffsetMinutes,
  showNowIndicator,
  locale,
  freeSwipe,
  renderTimeGridHeader,
}: CalendarProps<T>) {
  const mergedTheme = useMemo(() => mergeTheme(theme), [theme]);
  const internalCellHeight = useSharedValue(hourHeight);
  const cellHeight = cellHeightProp ?? internalCellHeight;

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
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressDay={onPressDay}
          onLongPressDay={onLongPressDay}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
          onPressMore={onPressMore}
          onChangeDate={onChangeDate}
          freeSwipe={freeSwipe}
        />
      ) : mode === 'schedule' ? (
        <Agenda
          events={events}
          locale={locale}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
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
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          scrollOffsetMinutes={scrollOffsetMinutes}
          hourColumnWidth={hourColumnWidth}
          minHour={minHour}
          maxHour={maxHour}
          ampm={ampm}
          minHourHeight={minHourHeight}
          maxHourHeight={maxHourHeight}
          showNowIndicator={showNowIndicator}
          locale={locale}
          freeSwipe={freeSwipe}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
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
