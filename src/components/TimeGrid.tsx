import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type OnViewableItemsChangedInfo,
} from '@legendapp/list/react-native';
import {
  addDays,
  differenceInCalendarDays,
  getHours,
  getMinutes,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  WeekStartsOn,
} from '../types';
import { getIsToday, getWeekDays, isWeekend } from '../utils/dates';
import { layoutDayEvents, type PositionedEvent } from '../utils/layout';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES_PER_HOUR = 60;
// Days (day view) or weeks (week view) to step when paging to an adjacent page.
const DAY_VIEW_STEP = 1;
const WEEK_VIEW_STEP = 7;
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

type AnimatedEventBoxProps<T> = {
  positioned: PositionedEvent<T>;
  cellHeight: SharedValue<number>;
  left: number;
  width: number;
  mode: CalendarMode;
  renderEvent: RenderEvent<T>;
  onPress: (event: CalendarEvent<T>) => void;
};

function AnimatedEventBox<T>({
  positioned,
  cellHeight,
  left,
  width,
  mode,
  renderEvent,
  onPress,
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
      top: positioned.startHours * cellHeight.value,
      height: boxHeight.value,
    }),
    [positioned.startHours, positioned.durationHours],
  );

  const handlePress = () => onPress(positioned.event);

  return (
    <Animated.View style={[styles.eventBox, { left, width }, boxStyle]}>
      <RenderEventComponent
        event={positioned.event}
        mode={mode}
        boxHeight={boxHeight}
        continuesBefore={positioned.continuesBefore}
        continuesAfter={positioned.continuesAfter}
        onPress={handlePress}
      />
    </Animated.View>
  );
}

type HourRowProps = {
  hour: number;
  cellHeight: SharedValue<number>;
  hourColumnWidth: number;
};

const HourRow = ({ hour, cellHeight, hourColumnWidth }: HourRowProps) => {
  const theme = useCalendarTheme();
  // Position via `top` (a layout prop), not a transform. The per-row layout pass
  // as cellHeight animates keeps the ScrollView's content size in sync while
  // zooming; a transform is composited and leaves the scroll range stale.
  const animatedStyle = useAnimatedStyle(() => ({ top: hour * cellHeight.value }));

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
        {hour}
      </Text>
      <View style={[styles.hourLine, { backgroundColor: theme.colors.gridLine }]} />
    </Animated.View>
  );
};

type NowIndicatorProps = {
  cellHeight: SharedValue<number>;
  nowHours: number;
  left: number;
  color: string;
};

const NowIndicator = ({ cellHeight, nowHours, left, color }: NowIndicatorProps) => {
  const animatedStyle = useAnimatedStyle(() => ({ top: nowHours * cellHeight.value }));

  return (
    <Animated.View
      style={[styles.nowIndicator, { left, backgroundColor: color }, animatedStyle]}
      pointerEvents="none"
    />
  );
};

type TimetablePageProps<T> = {
  mode: 'day' | 'week';
  date: Date;
  events: CalendarEvent<T>[];
  cellHeight: SharedValue<number>;
  // The zoom committed at the end of the last pinch. Off-screen pages animate off
  // this (it changes once per gesture) instead of the live cellHeight (which
  // changes every frame), so a pinch only re-runs the visible page's worklets.
  committedCellHeight: SharedValue<number>;
  scrollY: SharedValue<number>;
  isActive: boolean;
  scrollOffsetMinutes: number;
  weekStartsOn: WeekStartsOn;
  hourColumnWidth: number;
  minHourHeight: number;
  maxHourHeight: number;
  showNowIndicator: boolean;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressEvent: (event: CalendarEvent<T>) => void;
};

// A single date's grid: the pinch-zoomable, vertically-scrolling time column.
// Three of these are mounted side by side inside the pager so the previous and
// next dates are ready to drag into view.
function TimetablePageInner<T>({
  mode,
  date,
  events,
  cellHeight,
  committedCellHeight,
  scrollY,
  isActive,
  scrollOffsetMinutes,
  weekStartsOn,
  hourColumnWidth,
  minHourHeight,
  maxHourHeight,
  showNowIndicator,
  renderEvent,
  keyExtractor,
  onPressEvent,
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
    () => (mode === 'week' ? getWeekDays(date, weekStartsOn) : [date]),
    [mode, date, weekStartsOn],
  );

  const dayWidth = (width - hourColumnWidth) / days.length;
  const dayLeft = (dayIndex: number) => hourColumnWidth + dayIndex * dayWidth;

  const dayLayouts = useMemo(
    () => days.map((day) => layoutDayEvents(events, day)),
    [days, events],
  );

  const now = useNow(showNowIndicator && isActive);
  const nowDayIndex = days.findIndex((day) => getIsToday(day));
  const nowHours = (getHours(now) * MINUTES_PER_HOUR + getMinutes(now)) / MINUTES_PER_HOUR;

  const fullHeightStyle = useAnimatedStyle(() => ({ height: 24 * heightSource.value }));

  // Capture the row height when the pinch starts and apply `event.scale`
  // (relative to that start) rather than multiplying per-frame deltas — deltas
  // compound float error and the zoom never settles on a clean level.
  const pinchStartCellHeight = useSharedValue(cellHeight.value);
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
      <GestureDetector gesture={zoomGesture}>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: HOUR_LABEL_TOP_INSET }}
          contentOffset={{
            x: 0,
            y: (scrollOffsetMinutes / MINUTES_PER_HOUR) * cellHeight.value,
          }}
        >
          <Animated.View style={[styles.content, fullHeightStyle]}>
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

            {HOURS.map((hour) => (
              <HourRow
                key={hour}
                hour={hour}
                cellHeight={heightSource}
                hourColumnWidth={hourColumnWidth}
              />
            ))}

            {dayLayouts.flatMap((layout, dayIndex) =>
              layout.map((positioned, eventIndex) => {
                const columnWidth = dayWidth / positioned.columns;
                return (
                  <AnimatedEventBox
                    key={keyExtractor(positioned.event, eventIndex)}
                    positioned={positioned}
                    cellHeight={heightSource}
                    left={dayLeft(dayIndex) + positioned.column * columnWidth}
                    width={columnWidth}
                    mode={mode}
                    renderEvent={renderEvent}
                    onPress={onPressEvent}
                  />
                );
              }),
            )}

            {showNowIndicator && nowDayIndex >= 0 ? (
              <NowIndicator
                cellHeight={heightSource}
                nowHours={nowHours}
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
  mode: 'day' | 'week';
  date: Date;
  events: CalendarEvent<T>[];
  cellHeight: SharedValue<number>;
  weekStartsOn: WeekStartsOn;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  scrollOffsetMinutes?: number;
  hourColumnWidth?: number;
  minHourHeight?: number;
  maxHourHeight?: number;
  showNowIndicator?: boolean;
  locale?: string;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onChangeDate: (date: Date) => void;
  /** Optional header above the grid (e.g. weekday labels). Rendered full-width. */
  renderHeader?: (days: Date[]) => React.ReactNode;
};

function TimeGridInner<T>({
  mode,
  date,
  events,
  cellHeight,
  weekStartsOn,
  renderEvent,
  keyExtractor,
  scrollOffsetMinutes = 0,
  hourColumnWidth = DEFAULT_HOUR_COLUMN_WIDTH,
  minHourHeight = DEFAULT_MIN_HOUR_HEIGHT,
  maxHourHeight = DEFAULT_MAX_HOUR_HEIGHT,
  showNowIndicator = true,
  locale,
  onPressEvent,
  onChangeDate,
  renderHeader,
}: TimeGridProps<T>) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  // Horizontal list items need an explicit cross-axis height; seed it with the
  // window height (so it renders immediately and in tests) and refine on layout.
  const [pageHeight, setPageHeight] = useState(height);
  const step = mode === 'week' ? WEEK_VIEW_STEP : DAY_VIEW_STEP;
  // Shared vertical scroll offset so every mounted page stays aligned.
  const scrollY = useSharedValue((scrollOffsetMinutes / MINUTES_PER_HOUR) * cellHeight.value);
  // Zoom committed at the end of the last pinch; off-screen pages animate off
  // this so they don't re-run their worklets every frame while the visible page
  // zooms.
  const committedCellHeight = useSharedValue(cellHeight.value);

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
      return Math.round(differenceInCalendarDays(aligned, anchor) / step) + PAGE_WINDOW;
    },
    [anchor, mode, step, weekStartsOn],
  );

  // The committed date's page is the centred/active one. `viewedIndexRef` tracks
  // where the list actually sits, telling swipe-driven changes from external ones.
  const activeIndex = indexOfDate(date);
  const viewedIndexRef = useRef(activeIndex);

  // Header days track the committed date and render outside the list, so a swipe
  // never flashes another day's label.
  const headerDays = useMemo(
    () => (mode === 'week' ? getWeekDays(date, weekStartsOn) : [date]),
    [mode, date, weekStartsOn],
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
          date={item}
          events={events}
          cellHeight={cellHeight}
          committedCellHeight={committedCellHeight}
          scrollY={scrollY}
          isActive={index === activeIndex}
          scrollOffsetMinutes={scrollOffsetMinutes}
          weekStartsOn={weekStartsOn}
          hourColumnWidth={hourColumnWidth}
          minHourHeight={minHourHeight}
          maxHourHeight={maxHourHeight}
          showNowIndicator={showNowIndicator}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressEvent={onPressEvent}
        />
      </View>
    ),
    [
      width,
      pageHeight,
      mode,
      events,
      cellHeight,
      committedCellHeight,
      scrollY,
      activeIndex,
      scrollOffsetMinutes,
      weekStartsOn,
      hourColumnWidth,
      minHourHeight,
      maxHourHeight,
      showNowIndicator,
      renderEvent,
      keyExtractor,
      onPressEvent,
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
          locale={locale}
        />
      )}

      <View
        style={styles.pager}
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
      >
        <LegendList
          ref={listRef}
          style={styles.pagerList}
          data={pageDates}
          horizontal
          recycleItems={false}
          keyExtractor={keyExtractorList}
          getFixedItemSize={getFixedItemSize}
          snapToIndices={snapToIndices}
          // One page per swipe: a fast fling stops at the adjacent date instead
          // of skipping several.
          disableIntervalMomentum
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
  locale?: string;
};

const DefaultHeader = ({ days, mode, width, hourColumnWidth, locale }: DefaultHeaderProps) => {
  const dayWidth = mode === 'week' ? (width - hourColumnWidth) / days.length : width;

  return (
    <View style={styles.headerRow}>
      {mode === 'week' ? <View style={{ width: hourColumnWidth }} /> : null}
      {days.map((day) => (
        <DayHeader key={day.toISOString()} day={day} mode={mode} width={dayWidth} locale={locale} />
      ))}
    </View>
  );
};

type DayHeaderProps = {
  day: Date;
  mode: CalendarMode;
  width: number;
  locale?: string;
};

const DayHeader = ({ day, mode, width, locale }: DayHeaderProps) => {
  const theme = useCalendarTheme();
  const isToday = getIsToday(day);
  const badgeSize = mode === 'day' ? 44 : 32;

  return (
    <View style={[styles.dayHeader, { width, gap: mode === 'day' ? 4 : 2 }]}>
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
        {day.toLocaleDateString(locale, { weekday: 'short' })}
      </Text>
    </View>
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
