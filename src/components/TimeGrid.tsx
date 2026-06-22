import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type OnViewableItemsChangedInfo,
} from '@legendapp/list/react-native';
import {
  addDays,
  differenceInCalendarDays,
  format,
  getHours,
  getISOWeek,
  getMinutes,
  type Locale,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useCalendarTheme } from '../theme';
import type {
  CalendarEvent,
  CalendarMode,
  EventKeyExtractor,
  RenderEvent,
  TimeGridMode,
  WeekStartsOn,
} from '../types';
import { getIsToday, getViewDays, isWeekend, viewDayCount } from '../utils/dates';
import { layoutDayEvents, type PositionedEvent } from '../utils/layout';
import { AllDayLane } from './AllDayLane';

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
// Steps rendered either side of the current page. LegendList virtualises, so
// only a few mount at once; a wide window means the user effectively never runs
// out of pages to swipe. Items are keyed by date and never recycled.
const PAGE_WINDOW = 180;
// A page must be ~fully on screen before it becomes the committed date.
const PAGE_VIEWABILITY = { itemVisiblePercentThreshold: 90 };

export const DEFAULT_HOUR_HEIGHT = 64;
const DEFAULT_MIN_HOUR_HEIGHT = 32;
const DEFAULT_MAX_HOUR_HEIGHT = 160;
const DEFAULT_HOUR_COLUMN_WIDTH = 50;
// Short events would otherwise render only a few pixels tall and clip their
// content; keep them tall enough to stay legible and tappable.
const MIN_EVENT_HEIGHT = 32;
// Hour labels are nudged up so the number sits centred on its grid line. Pad the
// scroll content by the same amount so the top-most label is never clipped.
const HOUR_LABEL_TOP_INSET = 12;
const HOUR_LABEL_NUDGE = 8;
const NOW_TICK_MS = 60_000;

// A `Date` that advances every minute while `enabled`, so the now-indicator
// tracks the wall clock instead of freezing at mount. Off-screen pages pass
// `enabled = false` and re-read the time when they become active.
function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

// "13" in 24h, or "1 PM" in 12h. Midnight/noon read as 12 AM / 12 PM.
function formatHourLabel(hour: number, ampm: boolean): string {
  if (!ampm) return String(hour);
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12} ${period}`;
}

type AnimatedEventBoxProps<T> = {
  positioned: PositionedEvent<T>;
  cellHeight: SharedValue<number>;
  minHour: number;
  left: number;
  width: number;
  mode: CalendarMode;
  renderEvent: RenderEvent<T>;
  onPress: (event: CalendarEvent<T>) => void;
  onLongPress?: (event: CalendarEvent<T>) => void;
};

function AnimatedEventBox<T>({
  positioned,
  cellHeight,
  minHour,
  left,
  width,
  mode,
  renderEvent,
  onPress,
  onLongPress,
}: AnimatedEventBoxProps<T>) {
  const RenderEventComponent = renderEvent;
  // Live pixel height of the box, driven on the UI thread by the shared
  // cellHeight. Handed to renderEvent so custom renderers can reveal detail
  // progressively as the grid zooms, without re-rendering. Explicit deps so the
  // worklet re-captures the event's geometry when its time/duration changes.
  const boxHeight = useDerivedValue(
    () => Math.max(positioned.durationHours * cellHeight.value, MIN_EVENT_HEIGHT),
    [positioned.durationHours],
  );

  const boxStyle = useAnimatedStyle(
    () => ({
      top: (positioned.startHours - minHour) * cellHeight.value,
      height: boxHeight.value,
    }),
    [positioned.startHours, positioned.durationHours, minHour],
  );

  const handlePress = () => onPress(positioned.event);
  const handleLongPress = onLongPress ? () => onLongPress(positioned.event) : undefined;

  return (
    <Animated.View style={[styles.eventBox, { left, width }, boxStyle]}>
      <RenderEventComponent
        event={positioned.event}
        mode={mode}
        boxHeight={boxHeight}
        continuesBefore={positioned.continuesBefore}
        continuesAfter={positioned.continuesAfter}
        onPress={handlePress}
        onLongPress={handleLongPress}
      />
    </Animated.View>
  );
}

type HourRowProps = {
  hour: number;
  minHour: number;
  cellHeight: SharedValue<number>;
  hourColumnWidth: number;
  label: string;
};

const HourRow = ({ hour, minHour, cellHeight, hourColumnWidth, label }: HourRowProps) => {
  const theme = useCalendarTheme();
  // Position via `top` (a layout prop), not a transform. The per-row layout pass
  // as cellHeight animates keeps the ScrollView's content size in sync while
  // zooming; a transform is composited and leaves the scroll range stale.
  const animatedStyle = useAnimatedStyle(
    () => ({ top: (hour - minHour) * cellHeight.value }),
    [hour, minHour],
  );

  return (
    <Animated.View style={[styles.hourRow, animatedStyle]} pointerEvents="none">
      <Text
        style={[
          theme.text.hourLabel,
          styles.hourLabel,
          { width: hourColumnWidth, color: theme.colors.textMuted },
        ]}
        allowFontScaling={false}
      >
        {label}
      </Text>
      <View style={[styles.hourLine, { backgroundColor: theme.colors.gridLine }]} />
    </Animated.View>
  );
};

type TimeslotLineProps = {
  hour: number;
  minHour: number;
  fraction: number;
  cellHeight: SharedValue<number>;
  hourColumnWidth: number;
};

// A faint divider inside an hour row, marking a sub-hour slot (e.g. half hours).
const TimeslotLine = ({ hour, minHour, fraction, cellHeight, hourColumnWidth }: TimeslotLineProps) => {
  const theme = useCalendarTheme();
  const animatedStyle = useAnimatedStyle(
    () => ({ top: (hour - minHour + fraction) * cellHeight.value }),
    [hour, minHour, fraction],
  );
  return (
    <Animated.View
      style={[styles.timeslotLine, { left: hourColumnWidth, backgroundColor: theme.colors.gridLine }, animatedStyle]}
      pointerEvents="none"
    />
  );
};

type NowIndicatorProps = {
  cellHeight: SharedValue<number>;
  nowHours: number;
  minHour: number;
  left: number;
  color: string;
};

const NowIndicator = ({ cellHeight, nowHours, minHour, left, color }: NowIndicatorProps) => {
  const animatedStyle = useAnimatedStyle(
    () => ({ top: (nowHours - minHour) * cellHeight.value }),
    [nowHours, minHour],
  );

  return (
    <Animated.View
      style={[styles.nowIndicator, { left, backgroundColor: color }, animatedStyle]}
      pointerEvents="none"
    />
  );
};

type TimetablePageProps<T> = {
  mode: TimeGridMode;
  numberOfDays: number;
  date: Date;
  events: CalendarEvent<T>[];
  cellHeight: SharedValue<number>;
  hourHeight: number;
  // The zoom committed at the end of the last pinch. Off-screen pages animate off
  // this (it changes once per gesture) instead of the live cellHeight (which
  // changes every frame), so a pinch only re-runs the visible page's worklets.
  committedCellHeight: SharedValue<number>;
  scrollY: SharedValue<number>;
  isActive: boolean;
  scrollOffsetMinutes: number;
  weekStartsOn: WeekStartsOn;
  hourColumnWidth: number;
  minHour: number;
  maxHour: number;
  ampm: boolean;
  timeslots: number;
  isRTL: boolean;
  showVerticalScrollIndicator: boolean;
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  minHourHeight: number;
  maxHourHeight: number;
  showNowIndicator: boolean;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressCell?: (date: Date) => void;
  onLongPressCell?: (date: Date) => void;
};

// A single date's grid: the pinch-zoomable, vertically-scrolling time column.
// Three of these are mounted side by side inside the pager so the previous and
// next dates are ready to drag into view.
function TimetablePageInner<T>({
  mode,
  numberOfDays,
  date,
  events,
  cellHeight,
  hourHeight,
  committedCellHeight,
  scrollY,
  isActive,
  scrollOffsetMinutes,
  weekStartsOn,
  hourColumnWidth,
  minHour,
  maxHour,
  ampm,
  timeslots,
  isRTL,
  showVerticalScrollIndicator,
  calendarCellStyle,
  minHourHeight,
  maxHourHeight,
  showNowIndicator,
  renderEvent,
  keyExtractor,
  onPressEvent,
  onLongPressEvent,
  onPressCell,
  onLongPressCell,
}: TimetablePageProps<T>) {
  const theme = useCalendarTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // The visible page tracks the live cellHeight (animates every pinch frame);
  // off-screen pages track committedCellHeight (settles once per gesture).
  const heightSource = isActive ? cellHeight : committedCellHeight;

  // Keep every page locked to the same vertical scroll position so the prev/next
  // pages are already aligned before they drag into view — no post-swipe jump.
  const scrollHandler = useAnimatedScrollHandler((event) => {
    if (isActive) {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      scrollY.value = event.contentOffset.y;
    }
  });

  useAnimatedReaction(
    () => scrollY.value,
    (current, previous) => {
      if (!isActive && current !== previous) {
        scrollTo(scrollRef, 0, current, false);
      }
    },
  );

  const days = useMemo(
    () => getViewDays(mode, date, weekStartsOn, numberOfDays, isRTL),
    [mode, date, weekStartsOn, numberOfDays, isRTL],
  );

  const dayWidth = (width - hourColumnWidth) / days.length;
  const dayLeft = (dayIndex: number) => hourColumnWidth + dayIndex * dayWidth;

  const dayLayouts = useMemo(
    () => days.map((day) => layoutDayEvents(events, day)),
    [days, events],
  );

  // Map a tap on empty grid space back to the date+time it represents. Reads the
  // live row height on the JS thread to convert the touch Y into minutes.
  const cellDateFromTouch = (event: GestureResponderEvent): Date | null => {
    const { locationX, locationY } = event.nativeEvent;
    const dayIndex = days.length === 1 ? 0 : Math.floor(locationX / dayWidth);
    const day = days[dayIndex];
    if (!day) return null;
    const minutes = Math.round((minHour + locationY / heightSource.value) * MINUTES_PER_HOUR);
    const pressed = new Date(day);
    pressed.setHours(0, 0, 0, 0);
    pressed.setMinutes(minutes);
    return pressed;
  };
  const handleBackgroundPress = (event: GestureResponderEvent) => {
    const date = onPressCell && cellDateFromTouch(event);
    if (date) onPressCell?.(date);
  };
  const handleBackgroundLongPress = (event: GestureResponderEvent) => {
    const date = onLongPressCell && cellDateFromTouch(event);
    if (date) onLongPressCell?.(date);
  };

  // The hours (rows/labels) visible in the window [minHour, maxHour).
  const hoursRange = useMemo(
    () => Array.from({ length: maxHour - minHour }, (_, index) => minHour + index),
    [minHour, maxHour],
  );

  const now = useNow(showNowIndicator && isActive);
  const nowDayIndex = days.findIndex((day) => getIsToday(day));
  const nowHours = (getHours(now) * MINUTES_PER_HOUR + getMinutes(now)) / MINUTES_PER_HOUR;
  const nowInWindow = nowHours >= minHour && nowHours <= maxHour;

  const fullHeightStyle = useAnimatedStyle(
    () => ({ height: (maxHour - minHour) * heightSource.value }),
    [minHour, maxHour, heightSource],
  );

  // Capture the row height when the pinch starts and apply `event.scale`
  // (relative to that start) rather than multiplying per-frame deltas — deltas
  // compound float error and the zoom never settles on a clean level.
  const pinchStartCellHeight = useSharedValue(hourHeight);
  const zoomGesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        pinchStartCellHeight.value = cellHeight.value;
      })
      .onUpdate((event) => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        cellHeight.value = Math.min(
          maxHourHeight,
          Math.max(minHourHeight, pinchStartCellHeight.value * event.scale),
        );
      })
      .onEnd(() => {
        // Publish the final zoom to the off-screen pages in one update.
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        committedCellHeight.value = cellHeight.value;
      });
    // Recognise the pinch and the ScrollView's native scroll together so the
    // scroll never cancels an in-progress zoom.
    return Gesture.Simultaneous(pinch, Gesture.Native());
  }, [cellHeight, committedCellHeight, pinchStartCellHeight, minHourHeight, maxHourHeight]);

  return (
    <View style={styles.container}>
      <AllDayLane
        days={days}
        events={events}
        mode={mode}
        hourColumnWidth={hourColumnWidth}
        dayWidth={dayWidth}
        renderEvent={renderEvent}
        keyExtractor={keyExtractor}
        onPressEvent={onPressEvent}
        onLongPressEvent={onLongPressEvent}
      />
      <GestureDetector gesture={zoomGesture}>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={showVerticalScrollIndicator}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: HOUR_LABEL_TOP_INSET }}
          contentOffset={{
            x: 0,
            y: Math.max(0, scrollOffsetMinutes / MINUTES_PER_HOUR - minHour) * hourHeight,
          }}
        >
          <Animated.View style={[styles.content, fullHeightStyle]}>
            {onPressCell || onLongPressCell ? (
              // Behind the events, so empty-space taps create while event taps
              // still hit their box. Hidden from screen readers (a convenience
              // gesture, not the primary create path).
              <Pressable
                style={[styles.cellPressLayer, { left: hourColumnWidth }]}
                onPress={onPressCell ? handleBackgroundPress : undefined}
                onLongPress={onLongPressCell ? handleBackgroundLongPress : undefined}
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            ) : null}

            {days.map((day, dayIndex) =>
              isWeekend(day) ? (
                <Animated.View
                  key={`weekend-${day.toISOString()}`}
                  style={[
                    styles.weekendColumn,
                    { backgroundColor: theme.colors.weekendBackground },
                    { left: dayLeft(dayIndex), width: dayWidth },
                    fullHeightStyle,
                  ]}
                  pointerEvents="none"
                />
              ) : null,
            )}

            {calendarCellStyle
              ? days.map((day, dayIndex) => {
                  const cellStyle = calendarCellStyle(day);
                  return cellStyle ? (
                    <Animated.View
                      key={`cell-${day.toISOString()}`}
                      style={[
                        styles.weekendColumn,
                        { left: dayLeft(dayIndex), width: dayWidth },
                        cellStyle,
                        fullHeightStyle,
                      ]}
                      pointerEvents="none"
                    />
                  ) : null;
                })
              : null}

            {days.map((day, dayIndex) => (
              <Animated.View
                key={`separator-${day.toISOString()}`}
                style={[
                  styles.daySeparator,
                  { backgroundColor: theme.colors.gridLine },
                  { left: dayLeft(dayIndex) },
                  fullHeightStyle,
                ]}
                pointerEvents="none"
              />
            ))}

            {hoursRange.map((hour) => (
              <HourRow
                key={hour}
                hour={hour}
                minHour={minHour}
                cellHeight={heightSource}
                hourColumnWidth={hourColumnWidth}
                label={formatHourLabel(hour, ampm)}
              />
            ))}

            {timeslots > 1
              ? hoursRange.flatMap((hour) =>
                  Array.from({ length: timeslots - 1 }, (_, i) => (
                    <TimeslotLine
                      key={`slot-${hour}-${i}`}
                      hour={hour}
                      minHour={minHour}
                      fraction={(i + 1) / timeslots}
                      cellHeight={heightSource}
                      hourColumnWidth={hourColumnWidth}
                    />
                  )),
                )
              : null}

            {dayLayouts.flatMap((layout, dayIndex) =>
              layout
                // Skip events that fall entirely outside the [minHour, maxHour) window.
                .filter(
                  (p) => p.startHours < maxHour && p.startHours + p.durationHours > minHour,
                )
                .map((positioned, eventIndex) => {
                  const columnWidth = dayWidth / positioned.columns;
                  return (
                    <AnimatedEventBox
                      key={keyExtractor(positioned.event, eventIndex)}
                      positioned={positioned}
                      cellHeight={heightSource}
                      minHour={minHour}
                      left={dayLeft(dayIndex) + positioned.column * columnWidth}
                      width={columnWidth}
                      mode={mode}
                      renderEvent={renderEvent}
                      onPress={onPressEvent}
                      onLongPress={onLongPressEvent}
                    />
                  );
                }),
            )}

            {showNowIndicator && nowDayIndex >= 0 && nowInWindow ? (
              <NowIndicator
                cellHeight={heightSource}
                nowHours={nowHours}
                minHour={minHour}
                left={dayLeft(nowDayIndex)}
                color={theme.colors.nowIndicator}
              />
            ) : null}
          </Animated.View>
        </Animated.ScrollView>
      </GestureDetector>
    </View>
  );
}

const TimetablePage = memo(TimetablePageInner) as typeof TimetablePageInner;

export type TimeGridProps<T> = {
  mode: TimeGridMode;
  /** Day columns to show in `custom` mode. Ignored by day/3days/week. Default 1. */
  numberOfDays?: number;
  date: Date;
  events: CalendarEvent<T>[];
  cellHeight: SharedValue<number>;
  /** Initial per-hour row height in px; seeds scroll/zoom without reading the shared value during render. */
  hourHeight?: number;
  weekStartsOn: WeekStartsOn;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  scrollOffsetMinutes?: number;
  hourColumnWidth?: number;
  /** Hide the left hour-axis column (lines stay, labels/gutter go). Default false. */
  hideHours?: boolean;
  /** Sub-hour divider lines per hour (e.g. 2 = half-hours). Default 1 (none). */
  timeslots?: number;
  /** Per-date style merged onto each day column. */
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  /** Show the ISO week number in the header gutter. Default false. */
  showWeekNumber?: boolean;
  /** Element rendered between the day header and the grid. */
  headerComponent?: React.ReactNode;
  /** First hour shown (0–23). Default 0. */
  minHour?: number;
  /** Last hour shown, exclusive (1–24). Default 24. */
  maxHour?: number;
  /** Show hour labels in 12-hour AM/PM form. Default false (24h). */
  ampm?: boolean;
  /** Reverse day-column order (right-to-left). Default false. */
  isRTL?: boolean;
  minHourHeight?: number;
  maxHourHeight?: number;
  showNowIndicator?: boolean;
  locale?: Locale;
  freeSwipe?: boolean;
  /** Allow swiping between pages. Default true. */
  swipeEnabled?: boolean;
  /** Show the vertical scroll indicator on the time grid. Default true. */
  showVerticalScrollIndicator?: boolean;
  /** Prefix for the week-number label (e.g. "W"). Default "W". */
  weekNumberPrefix?: string;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressCell?: (date: Date) => void;
  onLongPressCell?: (date: Date) => void;
  /** Tap a day's column header (default header only). */
  onPressDateHeader?: (date: Date) => void;
  onChangeDate: (date: Date) => void;
  /** Optional header above the grid (e.g. weekday labels). Rendered full-width. */
  renderHeader?: (days: Date[]) => React.ReactNode;
};

function TimeGridInner<T>({
  mode,
  numberOfDays = 1,
  date,
  events,
  cellHeight,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  weekStartsOn,
  renderEvent,
  keyExtractor,
  scrollOffsetMinutes = 0,
  hourColumnWidth: hourColumnWidthProp = DEFAULT_HOUR_COLUMN_WIDTH,
  hideHours = false,
  timeslots = 1,
  calendarCellStyle,
  showWeekNumber = false,
  headerComponent,
  minHour = 0,
  maxHour = HOURS_PER_DAY,
  ampm = false,
  isRTL = false,
  minHourHeight = DEFAULT_MIN_HOUR_HEIGHT,
  maxHourHeight = DEFAULT_MAX_HOUR_HEIGHT,
  showNowIndicator = true,
  locale,
  freeSwipe = false,
  swipeEnabled = true,
  showVerticalScrollIndicator = true,
  weekNumberPrefix = 'W',
  onPressEvent,
  onLongPressEvent,
  onPressCell,
  onLongPressCell,
  onPressDateHeader,
  onChangeDate,
  renderHeader,
}: TimeGridProps<T>) {
  // Guard against an inverted/out-of-range window so the grid never collapses.
  const clampedMinHour = Math.max(0, Math.min(minHour, HOURS_PER_DAY - 1));
  const clampedMaxHour = Math.max(clampedMinHour + 1, Math.min(maxHour, HOURS_PER_DAY));
  // Collapse the hour gutter to zero when hours are hidden.
  const hourColumnWidth = hideHours ? 0 : hourColumnWidthProp;

  const { width, height } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  // Horizontal list items need an explicit cross-axis height; seed it with the
  // window height (so it renders immediately and in tests) and refine on layout.
  const [pageHeight, setPageHeight] = useState(height);
  // Days advanced per page = the number of visible columns.
  const step = viewDayCount(mode, numberOfDays);
  // Shared vertical scroll offset so every mounted page stays aligned. Seeded
  // from the numeric hourHeight rather than reading cellHeight.value (which
  // would warn about reading a shared value during render).
  const scrollY = useSharedValue(
    Math.max(0, scrollOffsetMinutes / MINUTES_PER_HOUR - clampedMinHour) * hourHeight,
  );
  // Zoom committed at the end of the last pinch; off-screen pages animate off
  // this so they don't re-run their worklets every frame while the visible page
  // zooms.
  const committedCellHeight = useSharedValue(hourHeight);

  // A fixed window of page dates, anchored once and aligned to the page boundary
  // (day or week start). The array never shifts as the date changes.
  const [anchorDate] = useState(date);
  const anchor = useMemo(
    () =>
      mode === 'week' ? startOfWeek(anchorDate, { weekStartsOn }) : startOfDay(anchorDate),
    [mode, anchorDate, weekStartsOn],
  );
  const pageDates = useMemo(
    () =>
      Array.from({ length: PAGE_WINDOW * 2 + 1 }, (_, i) =>
        addDays(anchor, (i - PAGE_WINDOW) * step),
      ),
    [anchor, step],
  );
  const indexOfDate = useCallback(
    (target: Date) => {
      const aligned =
        mode === 'week' ? startOfWeek(target, { weekStartsOn }) : startOfDay(target);
      // Floor so an arbitrary date lands on the page whose range contains it
      // (exact for day/week, where dates are already page-aligned).
      return Math.floor(differenceInCalendarDays(aligned, anchor) / step) + PAGE_WINDOW;
    },
    [anchor, mode, step, weekStartsOn],
  );

  // The committed date's page is the centred/active one. `viewedIndexRef` tracks
  // where the list actually sits, telling swipe-driven changes from external ones.
  const activeIndex = indexOfDate(date);
  const viewedIndexRef = useRef(activeIndex);

  // Header days track the active page (page-aligned), so they always match the
  // columns below and a swipe never flashes another day's label.
  const headerDays = useMemo(
    () => getViewDays(mode, pageDates[activeIndex] ?? date, weekStartsOn, numberOfDays, isRTL),
    [mode, pageDates, activeIndex, date, weekStartsOn, numberOfDays, isRTL],
  );

  const handleViewableItemsChanged = useCallback(
    (info: OnViewableItemsChangedInfo<Date>) => {
      const settled = info.viewableItems.find((token) => token.isViewable);
      if (settled?.index == null || settled.index === viewedIndexRef.current) return;
      viewedIndexRef.current = settled.index;
      if (settled.item) onChangeDate(settled.item);
    },
    [onChangeDate],
  );

  // Realign the list when the date changes from outside a swipe (e.g. a "today"
  // button or a month-view tap). Swipe-driven changes already match.
  useEffect(() => {
    if (activeIndex === viewedIndexRef.current) return;
    viewedIndexRef.current = activeIndex;
    listRef.current?.scrollToIndex({ index: activeIndex, animated: false });
  }, [activeIndex]);

  const snapToIndices = useMemo(() => pageDates.map((_, index) => index), [pageDates]);
  const keyExtractorList = useCallback((item: Date) => item.toISOString(), []);
  const getFixedItemSize = useCallback(() => width, [width]);
  const renderItem = useCallback(
    ({ item, index }: LegendListRenderItemProps<Date>) => (
      <View style={{ width, height: pageHeight }}>
        <TimetablePage
          mode={mode}
          numberOfDays={numberOfDays}
          date={item}
          events={events}
          cellHeight={cellHeight}
          hourHeight={hourHeight}
          committedCellHeight={committedCellHeight}
          scrollY={scrollY}
          isActive={index === activeIndex}
          scrollOffsetMinutes={scrollOffsetMinutes}
          weekStartsOn={weekStartsOn}
          hourColumnWidth={hourColumnWidth}
          minHour={clampedMinHour}
          maxHour={clampedMaxHour}
          ampm={ampm}
          timeslots={timeslots}
          isRTL={isRTL}
          showVerticalScrollIndicator={showVerticalScrollIndicator}
          calendarCellStyle={calendarCellStyle}
          minHourHeight={minHourHeight}
          maxHourHeight={maxHourHeight}
          showNowIndicator={showNowIndicator}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
          onPressCell={onPressCell}
          onLongPressCell={onLongPressCell}
        />
      </View>
    ),
    [
      width,
      pageHeight,
      mode,
      numberOfDays,
      events,
      cellHeight,
      hourHeight,
      committedCellHeight,
      scrollY,
      activeIndex,
      scrollOffsetMinutes,
      weekStartsOn,
      hourColumnWidth,
      clampedMinHour,
      clampedMaxHour,
      ampm,
      timeslots,
      isRTL,
      showVerticalScrollIndicator,
      calendarCellStyle,
      minHourHeight,
      maxHourHeight,
      showNowIndicator,
      renderEvent,
      keyExtractor,
      onPressEvent,
      onLongPressEvent,
      onPressCell,
      onLongPressCell,
    ],
  );

  return (
    <View style={styles.container}>
      {renderHeader ? (
        renderHeader(headerDays)
      ) : (
        <DefaultHeader
          days={headerDays}
          mode={mode}
          width={width}
          hourColumnWidth={hourColumnWidth}
          showWeekNumber={showWeekNumber}
          weekNumberPrefix={weekNumberPrefix}
          locale={locale}
          onPressDateHeader={onPressDateHeader}
        />
      )}

      {headerComponent}

      <View
        style={styles.pager}
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
      >
        <LegendList
          // Remount when the measured page height changes so the list adopts
          // the corrected item height (avoids keeping the oversized window seed).
          key={pageHeight}
          ref={listRef}
          style={styles.pagerList}
          data={pageDates}
          horizontal
          recycleItems={false}
          keyExtractor={keyExtractorList}
          getFixedItemSize={getFixedItemSize}
          scrollEnabled={swipeEnabled}
          // Default: native paging — each page is the viewport width, so a swipe
          // hard-stops at the adjacent page and can't fling past it. With
          // `freeSwipe`, momentum carries across pages and snaps to a boundary.
          pagingEnabled={!freeSwipe}
          snapToIndices={freeSwipe ? snapToIndices : undefined}
          initialScrollIndex={activeIndex}
          showsHorizontalScrollIndicator={false}
          viewabilityConfig={PAGE_VIEWABILITY}
          onViewableItemsChanged={handleViewableItemsChanged}
          renderItem={renderItem}
        />
      </View>
    </View>
  );
}

export const TimeGrid = memo(TimeGridInner) as typeof TimeGridInner;

type DefaultHeaderProps = {
  days: Date[];
  mode: CalendarMode;
  width: number;
  hourColumnWidth: number;
  showWeekNumber?: boolean;
  weekNumberPrefix?: string;
  locale?: Locale;
  onPressDateHeader?: (date: Date) => void;
};

const DefaultHeader = ({
  days,
  mode,
  width,
  hourColumnWidth,
  showWeekNumber,
  weekNumberPrefix = 'W',
  locale,
  onPressDateHeader,
}: DefaultHeaderProps) => {
  const theme = useCalendarTheme();
  // Match the grid below: an hour-column spacer, then one column per day.
  const dayWidth = (width - hourColumnWidth) / days.length;

  return (
    <View style={styles.headerRow}>
      <View style={[styles.weekNumberGutter, { width: hourColumnWidth }]}>
        {showWeekNumber && hourColumnWidth > 0 && days[0] ? (
          <Text
            style={[theme.text.hourLabel, { color: theme.colors.textMuted }]}
            allowFontScaling={false}
          >
            {`${weekNumberPrefix}${getISOWeek(days[0])}`}
          </Text>
        ) : null}
      </View>
      {days.map((day) => (
        <DayHeader
          key={day.toISOString()}
          day={day}
          mode={mode}
          width={dayWidth}
          locale={locale}
          onPressDateHeader={onPressDateHeader}
        />
      ))}
    </View>
  );
};

type DayHeaderProps = {
  day: Date;
  mode: CalendarMode;
  width: number;
  locale?: Locale;
  onPressDateHeader?: (date: Date) => void;
};

const DayHeader = ({ day, mode, width, locale, onPressDateHeader }: DayHeaderProps) => {
  const theme = useCalendarTheme();
  const isToday = getIsToday(day);
  const badgeSize = mode === 'day' ? 44 : 32;

  return (
    <Pressable
      style={[styles.dayHeader, { width, gap: mode === 'day' ? 4 : 2 }]}
      onPress={onPressDateHeader ? () => onPressDateHeader(day) : undefined}
      disabled={!onPressDateHeader}
      accessibilityRole={onPressDateHeader ? 'button' : undefined}
    >
      <View
        style={[
          styles.dayHeaderBadge,
          isToday && {
            backgroundColor: theme.colors.todayBackground,
            borderRadius: 999,
            width: badgeSize,
            height: badgeSize,
          },
        ]}
      >
        <Text
          style={[
            theme.text.dayNumber,
            { color: isToday ? theme.colors.todayText : theme.colors.text },
          ]}
          allowFontScaling={false}
          {...(isToday && { accessibilityLabel: `Today, ${day.getDate()}` })}
        >
          {day.getDate()}
        </Text>
      </View>
      <Text style={[theme.text.weekday, { color: theme.colors.text }]} allowFontScaling={false}>
        {format(day, 'EEE', { locale })}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  pagerList: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
  },
  weekNumberGutter: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  dayHeader: {
    alignItems: 'center',
  },
  dayHeaderBadge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    position: 'relative',
  },
  cellPressLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
  },
  weekendColumn: {
    position: 'absolute',
    top: 0,
  },
  daySeparator: {
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hourLabel: {
    marginTop: -HOUR_LABEL_NUDGE,
    textAlign: 'center',
  },
  hourLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  timeslotLine: {
    position: 'absolute',
    right: 0,
    height: StyleSheet.hairlineWidth,
    opacity: 0.5,
  },
  eventBox: {
    position: 'absolute',
    overflow: 'hidden',
  },
  nowIndicator: {
    position: 'absolute',
    right: 0,
    height: 2,
  },
});
