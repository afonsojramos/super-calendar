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
import { DefaultEvent } from './DefaultEvent';
import { MonthPager } from './MonthPager';
import { DEFAULT_HOUR_HEIGHT, TimeGrid } from './TimeGrid';

export type CalendarProps<T> = {
  events: CalendarEvent<T>[];
  mode: CalendarMode;
  date: Date;
  onChangeDate: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  /** Tap a day cell (month mode) — e.g. drill into the day view. */
  onPressDay?: (date: Date) => void;
  /** Tap the "+N more" overflow label in a month cell. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Tap empty space on the week/day grid; receives the date+time pressed. */
  onPressCell?: (date: Date) => void;
  /** Max events shown per month cell before they collapse into "+N more". */
  maxVisibleEventCount?: number;
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
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
  /** Initial vertical scroll, in minutes from midnight (week/day). */
  scrollOffsetMinutes?: number;
  /** Show the current-time line on the week/day grid. Default true. */
  showNowIndicator?: boolean;
  /** BCP-47 locale for weekday labels. Defaults to the device locale. */
  locale?: string;
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
  onPressDay,
  onPressMore,
  onPressCell,
  maxVisibleEventCount = 2,
  weekStartsOn = 0,
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
  scrollOffsetMinutes,
  showNowIndicator,
  locale,
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
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressDay={onPressDay}
          onPressEvent={onPressEvent}
          onPressMore={onPressMore}
          onChangeDate={onChangeDate}
        />
      ) : (
        <TimeGrid
          mode={mode}
          date={date}
          events={events}
          cellHeight={cellHeight}
          weekStartsOn={weekStartsOn}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          scrollOffsetMinutes={scrollOffsetMinutes}
          hourColumnWidth={hourColumnWidth}
          minHour={minHour}
          maxHour={maxHour}
          minHourHeight={minHourHeight}
          maxHourHeight={maxHourHeight}
          showNowIndicator={showNowIndicator}
          locale={locale}
          onPressEvent={onPressEvent}
          onPressCell={onPressCell}
          onChangeDate={onChangeDate}
          renderHeader={renderTimeGridHeader}
        />
      )}
    </CalendarThemeProvider>
  );
}
