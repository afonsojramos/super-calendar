import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";
import {
  addMonths,
  differenceInCalendarMonths,
  format,
  isSameMonth,
  type Locale,
  startOfMonth,
} from "date-fns";
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, EventKeyExtractor, RenderEvent, WeekStartsOn } from "../types";
import {
  type CalendarSelection,
  CalendarSelectionProvider,
  type DateRange,
  type EventAccessibilityLabeler,
  isDateSelectable,
} from "@super-calendar/core";
import { buildMonthWeeks, getWeekDays } from "@super-calendar/core";
import { DefaultMonthEvent } from "./DefaultMonthEvent";
import { MonthView } from "./MonthView";

const isWeb = Platform.OS === "web";

// Months rendered either side of the anchor. LegendList virtualises, so only a
// few mount at once; a wide window means the user effectively never runs out.
const PAGE_WINDOW = 60;
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };
// Each month block is the title plus its own week rows. Sizing per month (rather
// than a fixed height) keeps row heights consistent and avoids a blank padding
// row, since months show only their own days (no adjacent-month fill). The
// header height is a single source of truth: it sets the title's box, the block
// height, and the drag hit-test, so the rendered layout and the mapping agree.
const DEFAULT_MONTH_HEADER_HEIGHT = 44;
const DEFAULT_WEEK_ROW_HEIGHT = 56;
// When events are shown, give each week row enough height for the day cell to
// auto-fit about three event chips (or two plus a "+N more" row) instead of a
// single clipped event: the date badge (24) + top padding (4) + three ~22px chip
// rows ≈ 94, rounded up for headroom. The events-free picker keeps the compact
// default above.
const DEFAULT_EVENT_WEEK_ROW_HEIGHT = 96;
// Drag-to-select: native holds to start (so a scroll/tap isn't hijacked) then
// pans across months; nearing an edge auto-scrolls the list.
const LONG_PRESS_MS = 500;
const AUTOSCROLL_EDGE_PX = 64;
const AUTOSCROLL_STEP_PX = 14;
const AUTOSCROLL_INTERVAL_MS = 16;

// Stable empty events array, so a picker (no events) doesn't churn memoised props.
const NO_EVENTS: CalendarEvent<unknown>[] = [];
const noop = () => {};
const defaultKeyExtractor: EventKeyExtractor<unknown> = (event) =>
  `${event.start.toISOString()}|${event.end.toISOString()}|${event.title ?? ""}`;

/** Props for {@link MonthList}, the vertically scrolling list of months. */
export type MonthListProps<T> = {
  /** The month scrolled to on mount. */
  date: Date;
  /** Events to render in the grids. Omit for an events-free date picker. */
  events?: CalendarEvent<T>[];
  weekStartsOn: WeekStartsOn;
  /**
   * Height of each week row (px). The month block sizes to its row count. Defaults
   * to a taller row when `events` are shown (so a day fits ~3 chips) and a compact
   * row for the events-free picker.
   */
  weekRowHeight?: number;
  /**
   * Height of each month's title row (px). Default 44. A custom `renderMonthHeader`
   * must fit this height, since it also anchors the drag hit-test.
   */
  monthHeaderHeight?: number;
  maxVisibleEventCount?: number;
  locale?: Locale;
  sortedMonthView?: boolean;
  moreLabel?: string;
  /** Show dimmed adjacent-month days. Default false (each month shows only its own days). */
  showAdjacentMonths?: boolean;
  disableMonthEventCellPress?: boolean;
  isRTL?: boolean;
  activeDate?: Date;
  selectedDates?: Date[];
  selectedRange?: DateRange;
  /** Fill the whole cell on selection instead of the default rounded pill band. */
  fillCellOnSelection?: boolean;
  minDate?: Date;
  maxDate?: Date;
  isDateDisabled?: (date: Date) => boolean;
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  /** Replace the built-in event box. Defaults to `DefaultEvent`. */
  renderEvent?: RenderEvent<T>;
  /**
   * Override the screen-reader label for each event chip. Receives the event and a
   * `{ mode: "month", isAllDay, ampm: false }` context; return the full text to
   * announce. Defaults to the built-in title-and-time label.
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;
  /** Stable key per event. Defaults to start-time + index. */
  keyExtractor?: EventKeyExtractor<T>;
  onPressDay?: (date: Date) => void;
  onLongPressDay?: (date: Date) => void;
  onPressEvent?: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /**
   * Enable drag-to-select. Long-press a day and drag to sweep out a range,
   * continuing across months (the list auto-scrolls at the edges). Fired with
   * the ordered `[start, end]`; pair with `useDateRange`'s `selectRange`.
   */
  onSelectDrag?: (start: Date, end: Date) => void;
  /** Fired with the month that scrolls into view. */
  onChangeVisibleMonth?: (month: Date) => void;
  /** Replace the per-month title (default "LLLL yyyy"). */
  renderMonthHeader?: (month: Date) => React.ReactNode;
};

function MonthListInner<T>({
  date,
  events = NO_EVENTS as CalendarEvent<T>[],
  weekStartsOn,
  weekRowHeight: weekRowHeightProp,
  monthHeaderHeight = DEFAULT_MONTH_HEADER_HEIGHT,
  maxVisibleEventCount,
  locale,
  sortedMonthView,
  moreLabel,
  showAdjacentMonths = false,
  disableMonthEventCellPress,
  isRTL,
  activeDate,
  selectedDates,
  selectedRange,
  fillCellOnSelection,
  minDate,
  maxDate,
  isDateDisabled,
  calendarCellStyle,
  renderEvent = DefaultMonthEvent,
  eventAccessibilityLabel,
  keyExtractor = defaultKeyExtractor as EventKeyExtractor<T>,
  onPressDay,
  onLongPressDay,
  onPressEvent = noop,
  onLongPressEvent,
  onPressMore,
  onSelectDrag,
  onChangeVisibleMonth,
  renderMonthHeader,
}: MonthListProps<T>): ReactElement {
  const theme = useCalendarTheme();
  const listRef = useRef<LegendListRef>(null);

  // Compact rows for the picker; taller rows once events are shown, so a day cell
  // fits about three chips. An explicit prop always wins.
  const weekRowHeight =
    weekRowHeightProp ??
    (events.length > 0 ? DEFAULT_EVENT_WEEK_ROW_HEIGHT : DEFAULT_WEEK_ROW_HEIGHT);

  // Web focus containment: the index of the topmost month at least partly in the
  // viewport. Months above it are marked `inert` (see MonthBlock) so Tab doesn't
  // land on an off-screen month and scroll the list backwards.
  const [firstViewableIndex, setFirstViewableIndex] = useState(0);

  // A fixed window of months anchored once, aligned to the month start.
  const [anchorDate] = useState(date);
  const anchor = useMemo(() => startOfMonth(anchorDate), [anchorDate]);
  const monthDates = useMemo(
    () => Array.from({ length: PAGE_WINDOW * 2 + 1 }, (_, i) => addMonths(anchor, i - PAGE_WINDOW)),
    [anchor],
  );
  const initialIndex = useMemo(
    () => differenceInCalendarMonths(startOfMonth(date), anchor) + PAGE_WINDOW,
    [date, anchor],
  );

  // The constant weekday labels shown once above the scrolling months.
  const weekDays = useMemo(() => {
    const days = getWeekDays(anchor, weekStartsOn);
    return isRTL ? days.reverse() : days;
  }, [anchor, weekStartsOn, isRTL]);

  const selection = useMemo<CalendarSelection>(
    () => ({ selectedDates, selectedRange, minDate, maxDate, isDateDisabled }),
    [selectedDates, selectedRange, minDate, maxDate, isDateDisabled],
  );

  const keyExtractorList = useCallback((item: Date) => item.toISOString(), []);
  // Build every window month's week rows once (honouring isRTL, so drag hit-tests
  // match the rendered column order). Reused for sizing and the drag mapping
  // instead of rebuilding per frame.
  const monthWeeks = useMemo(
    () => monthDates.map((month) => buildMonthWeeks(month, weekStartsOn, { isRTL })),
    [monthDates, weekStartsOn, isRTL],
  );
  // Each month is as tall as its own week rows (4–6) plus the title; no padding
  // row, since adjacent-month days aren't filled in.
  const blockHeightAt = useCallback(
    (index: number) => monthHeaderHeight + monthWeeks[index].length * weekRowHeight,
    [monthWeeks, weekRowHeight, monthHeaderHeight],
  );
  const getFixedItemSize = useCallback(
    (_item: Date, index: number) => blockHeightAt(index),
    [blockHeightAt],
  );

  // Content-Y of each month's top (prefix sums), plus the total content height,
  // so a drag's absolute position maps to a month and day.
  const offsets = useMemo(() => {
    const out: number[] = [0];
    for (let i = 0; i < monthWeeks.length; i++) out.push(out[i] + blockHeightAt(i));
    return out;
  }, [monthWeeks, blockHeightAt]);

  // ---- drag-to-select -------------------------------------------------------
  const dragStartRef = useRef<Date | null>(null);
  const dragMovedRef = useRef(false);
  const pointerDownRef = useRef(false); // web
  const scrollYRef = useRef(0);
  const viewportRef = useRef({ width: 0, height: 0 });
  const lastPanRef = useRef({ x: 0, y: 0 }); // native, viewport-relative
  const autoScrollRef = useRef<{ id: ReturnType<typeof setInterval>; dir: number } | null>(null);

  // isDateSelectable already returns true when no constraints are set, so no
  // separate short-circuit guard is needed.
  const isSelectable = useCallback(
    (day: Date) => isDateSelectable(day, { minDate, maxDate, isDateDisabled }),
    [minDate, maxDate, isDateDisabled],
  );

  // Map an absolute content position to a selectable day, or null on a title,
  // a blanked adjacent-month cell, or a disabled day.
  const dayAtContent = useCallback(
    (x: number, contentY: number): Date | null => {
      const width = viewportRef.current.width;
      if (width <= 0) return null;
      const clampedY = Math.min(Math.max(contentY, 0), offsets[offsets.length - 1] - 1);
      let index = 0;
      while (index < monthWeeks.length - 1 && offsets[index + 1] <= clampedY) index++;
      const localY = clampedY - offsets[index] - monthHeaderHeight;
      if (localY < 0) return null; // on the month title
      const weeks = monthWeeks[index];
      const row = Math.min(weeks.length - 1, Math.max(0, Math.floor(localY / weekRowHeight)));
      const col = Math.min(6, Math.max(0, Math.floor(x / (width / 7))));
      const day = weeks[row]?.[col];
      if (!day) return null;
      if (!showAdjacentMonths && !isSameMonth(day, monthDates[index])) return null;
      return isSelectable(day) ? day : null;
    },
    [
      offsets,
      monthWeeks,
      monthDates,
      weekRowHeight,
      monthHeaderHeight,
      showAdjacentMonths,
      isSelectable,
    ],
  );

  const extendTo = useCallback(
    (day: Date | null) => {
      const start = dragStartRef.current;
      if (!start || !day) return;
      if (day.getTime() !== start.getTime()) dragMovedRef.current = true;
      onSelectDrag?.(start, day);
    },
    [onSelectDrag],
  );

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current.id);
      autoScrollRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(
    (dir: number) => {
      if (autoScrollRef.current?.dir === dir) return;
      stopAutoScroll();
      const max = Math.max(0, offsets[offsets.length - 1] - viewportRef.current.height);
      const id = setInterval(() => {
        const next = Math.min(max, Math.max(0, scrollYRef.current + dir * AUTOSCROLL_STEP_PX));
        scrollYRef.current = next;
        void listRef.current?.scrollToOffset({ offset: next, animated: false });
        extendTo(dayAtContent(lastPanRef.current.x, next + lastPanRef.current.y));
      }, AUTOSCROLL_INTERVAL_MS);
      autoScrollRef.current = { id, dir };
    },
    [offsets, stopAutoScroll, extendTo, dayAtContent],
  );

  // Native: a list-level pan, so one drag spans every month.
  const dragGesture = useMemo(() => {
    if (!onSelectDrag) return undefined;
    return Gesture.Pan()
      .activateAfterLongPress(LONG_PRESS_MS)
      .runOnJS(true)
      .onStart((event) => {
        lastPanRef.current = { x: event.x, y: event.y };
        dragMovedRef.current = false;
        dragStartRef.current = dayAtContent(event.x, scrollYRef.current + event.y);
      })
      .onUpdate((event) => {
        lastPanRef.current = { x: event.x, y: event.y };
        const height = viewportRef.current.height;
        if (event.y < AUTOSCROLL_EDGE_PX) startAutoScroll(-1);
        else if (height > 0 && event.y > height - AUTOSCROLL_EDGE_PX) startAutoScroll(1);
        else stopAutoScroll();
        extendTo(dayAtContent(event.x, scrollYRef.current + event.y));
      })
      .onFinalize(() => {
        stopAutoScroll();
        dragStartRef.current = null;
      });
  }, [onSelectDrag, dayAtContent, extendTo, startAutoScroll, stopAutoScroll]);

  // Web: cells relay pointer enter/leave (the pan above is swallowed by the cell
  // touchables on web). A pressed pointer entering a cell extends the range;
  // cross-month works because every visible cell relays independently.
  const onDayPointerDown = useCallback(
    (day: Date) => {
      pointerDownRef.current = true;
      dragMovedRef.current = false;
      dragStartRef.current = isSelectable(day) ? day : null;
    },
    [isSelectable],
  );
  const onDayPointerEnter = useCallback(
    (day: Date) => {
      if (pointerDownRef.current && dragStartRef.current && isSelectable(day)) extendTo(day);
    },
    [extendTo, isSelectable],
  );
  useEffect(() => {
    if (!isWeb || !onSelectDrag) return;
    const end = () => {
      pointerDownRef.current = false;
      dragStartRef.current = null;
    };
    const target = globalThis as unknown as {
      addEventListener?: (t: string, cb: () => void) => void;
      removeEventListener?: (t: string, cb: () => void) => void;
    };
    target.addEventListener?.("pointerup", end);
    return () => target.removeEventListener?.("pointerup", end);
  }, [onSelectDrag]);

  // Swallow the tap that follows a drag so it doesn't reset the just-swept range.
  const handlePressDay = useCallback(
    (day: Date) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      onPressDay?.(day);
    },
    [onPressDay],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);
  const handleViewableItemsChanged = useCallback(
    (info: OnViewableItemsChangedInfo<Date>) => {
      // Report the topmost month that's at least ~60% visible (the viewability
      // threshold), i.e. the one anchored at the top of the viewport.
      const settled = info.viewableItems.find((token) => token.isViewable);
      if (settled?.item && onChangeVisibleMonth) onChangeVisibleMonth(settled.item);
      // Track the topmost viewable index so months above it can be made inert on
      // web (see MonthBlock). Only the web path consumes this.
      const topIndex = settled?.index;
      if (isWeb && typeof topIndex === "number") {
        setFirstViewableIndex((prev) => (prev === topIndex ? prev : topIndex));
      }
    },
    [onChangeVisibleMonth],
  );

  const dragEnabled = onSelectDrag != null;
  const renderItem = useCallback(
    ({ item, index }: LegendListRenderItemProps<Date>) => (
      <MonthBlock
        height={blockHeightAt(index)}
        // Above-viewport months are inert on web so Tab can't jump backwards into
        // them. Only meaningful for the events list; the picker stays navigable.
        inert={isWeb && events.length > 0 && index < firstViewableIndex}
      >
        {/* Pin the header to monthHeaderHeight so the grid below is exactly
            weeks * weekRowHeight, keeping the drag hit-test aligned. */}
        <View style={[styles.monthHeader, { height: monthHeaderHeight }]}>
          {renderMonthHeader ? (
            renderMonthHeader(item)
          ) : (
            <Text style={[styles.monthTitle, { color: theme.colors.text }]}>
              {format(item, "LLLL yyyy", { locale })}
            </Text>
          )}
        </View>
        <View style={styles.grid}>
          {/* Each mounted month re-groups the full events array (cheap for the
              empty-events picker; with large event sets, group once upstream
              and pass a per-month slice if it ever profiles as hot). */}
          <MonthView
            date={item}
            events={events}
            // The list renders its own per-month header and a shared weekday row,
            // so the grid itself omits the title and weekday labels.
            showTitle={false}
            showWeekdays={false}
            maxVisibleEventCount={maxVisibleEventCount}
            weekStartsOn={weekStartsOn}
            locale={locale}
            sortedMonthView={sortedMonthView}
            moreLabel={moreLabel}
            showAdjacentMonths={showAdjacentMonths}
            disableMonthEventCellPress={disableMonthEventCellPress}
            isRTL={isRTL}
            activeDate={activeDate}
            fillCellOnSelection={fillCellOnSelection}
            calendarCellStyle={calendarCellStyle}
            renderEvent={renderEvent}
            eventAccessibilityLabel={eventAccessibilityLabel}
            keyExtractor={keyExtractor}
            onPressDay={dragEnabled ? handlePressDay : onPressDay}
            onLongPressDay={onLongPressDay}
            onPressEvent={onPressEvent}
            onLongPressEvent={onLongPressEvent}
            onPressMore={onPressMore}
            onDayPointerDown={isWeb && dragEnabled ? onDayPointerDown : undefined}
            onDayPointerEnter={isWeb && dragEnabled ? onDayPointerEnter : undefined}
          />
        </View>
      </MonthBlock>
    ),
    [
      blockHeightAt,
      firstViewableIndex,
      monthHeaderHeight,
      renderMonthHeader,
      theme,
      locale,
      events,
      maxVisibleEventCount,
      weekStartsOn,
      sortedMonthView,
      moreLabel,
      showAdjacentMonths,
      disableMonthEventCellPress,
      isRTL,
      activeDate,
      fillCellOnSelection,
      calendarCellStyle,
      renderEvent,
      keyExtractor,
      dragEnabled,
      handlePressDay,
      onPressDay,
      onLongPressDay,
      onPressEvent,
      onLongPressEvent,
      onPressMore,
      onDayPointerDown,
      onDayPointerEnter,
    ],
  );

  const list = (
    <LegendList
      ref={listRef}
      style={styles.list}
      data={monthDates}
      recycleItems={false}
      // Re-render mounted months when the viewport cutoff changes, so the inert
      // flag on above-viewport months (web focus containment) stays current.
      extraData={firstViewableIndex}
      keyExtractor={keyExtractorList}
      getFixedItemSize={getFixedItemSize}
      initialScrollIndex={initialIndex}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={handleScroll}
      viewabilityConfig={VIEWABILITY}
      onViewableItemsChanged={handleViewableItemsChanged}
      onLayout={(event: LayoutChangeEvent) => {
        viewportRef.current = {
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        };
      }}
      renderItem={renderItem}
    />
  );

  return (
    <CalendarSelectionProvider value={selection}>
      <View style={styles.container}>
        <View style={[styles.weekdayHeader, { borderBottomColor: theme.colors.gridLine }]}>
          {weekDays.map((day) => (
            <Text
              key={day.toISOString()}
              style={[styles.weekdayLabel, { color: theme.colors.textMuted }]}
              allowFontScaling={false}
            >
              {format(day, "EEE", { locale })}
            </Text>
          ))}
        </View>
        {dragGesture && !isWeb ? (
          <GestureDetector gesture={dragGesture}>{list}</GestureDetector>
        ) : (
          list
        )}
      </View>
    </CalendarSelectionProvider>
  );
}

// A virtualized list keeps a band of rendered months just outside the viewport.
// On web their event chips are real tab stops, so tabbing in from outside would
// land on a month above the viewport and the browser would scroll it into view,
// jumping the visible month. Marking off-screen-above months `inert` keeps them
// out of the tab order (and pointer/AT), so Tab enters at the first visible month
// without a jump. Months below stay tabbable, so forward Tab scrolls down as
// expected. `inert` is web-only and a no-op on native.
function MonthBlock({
  height,
  inert,
  children,
}: {
  height: number;
  inert: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!isWeb) return;
    const node = ref.current as unknown as { inert?: boolean } | null;
    if (node) node.inert = inert;
  }, [inert]);
  return (
    <View ref={ref} style={{ height }}>
      {children}
    </View>
  );
}

/**
 * A vertically scrolling, virtualized list of month grids. It doubles as the
 * date picker: pass `selectedRange`/`selectedDates` and selection handlers to
 * turn it into a single-date or range picker. Free of Reanimated, so the
 * `/picker` entry point can ship it without the timetable views.
 *
 * @example
 * ```tsx
 * import { MonthList } from "@super-calendar/native/picker";
 *
 * <MonthList
 *   date={new Date()}
 *   weekStartsOn={0}
 *   selectedRange={range}
 *   onPressDay={handlePressDay}
 * />
 * ```
 */
export const MonthList = memo(MonthListInner) as typeof MonthListInner;

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  monthHeader: { justifyContent: "center" },
  monthTitle: { paddingHorizontal: 8, fontSize: 17, fontWeight: "700" },
  grid: { flex: 1 },
  weekdayHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekdayLabel: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600" },
});
