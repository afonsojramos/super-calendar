import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";
import { addMonths, differenceInCalendarMonths, format, type Locale, startOfMonth } from "date-fns";
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useCalendarTheme } from "../theme";
import type {
  CalendarEvent,
  EventDragHandler,
  EventDragStartHandler,
  EventKeyExtractor,
  RenderEvent,
  WeekStartsOn,
} from "../types";
import {
  type CalendarSelection,
  CalendarSelectionProvider,
  type DateRange,
  type WeekdayFormat,
  filterHiddenDays,
  getWeekDays,
  weekdayFormatToken,
} from "@super-calendar/core";
import type { CalendarLabels } from "@super-calendar/core";
import { createSlots, type SlotStyleProps } from "../utils/slots";
import { useWebPagerKeys } from "../utils/useWebPagerKeys";
import { MonthView, type MonthViewSlot } from "./MonthView";

// Horizontal swipe paging doesn't translate to web; there we disable it and page
// with the arrow keys instead.
const isWeb = Platform.OS === "web";

// Months rendered either side of the current page. LegendList virtualises, so
// only a few mount at once; a wide window (5 years each way) means the user
// effectively never runs out of months to swipe. Items are keyed by month and
// never recycled.
const PAGE_WINDOW = 60;
// A page must be ~fully on screen before it becomes the committed month, so
// paging commits once per settle rather than mid-swipe.
const PAGE_VIEWABILITY = { itemVisiblePercentThreshold: 90 };

/** Props for {@link MonthPager}, the horizontally swipeable month carousel. */
export type MonthPagerProps<T> = {
  date: Date;
  events: CalendarEvent<T>[];
  maxVisibleEventCount?: number;
  weekStartsOn: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  weekdayFormat?: WeekdayFormat;
  locale?: Locale;
  sortedMonthView?: boolean;
  moreLabel?: string;
  /** Translations for the screen-reader words and gutter text; omitted keys use English. */
  labels?: Partial<CalendarLabels>;
  showAdjacentMonths?: boolean;
  highlightWeekends?: boolean;
  disableMonthEventCellPress?: boolean;
  isRTL?: boolean;
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressDay?: (date: Date) => void;
  onLongPressDay?: (date: Date) => void;
  /** Tap an empty day cell; receives the day at midnight. */
  onPressCell?: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Drag across empty day cells to sweep out an all-day span for a new event. */
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Drag-to-select: reports the swept `[start, end]` days live. */
  onSelectDrag?: (start: Date, end: Date) => void;
  /** Days drawn as selected (a filled badge). */
  selectedDates?: Date[];
  /** A selected span: endpoints get a filled badge, the span gets the range band. */
  selectedRange?: DateRange;
  /** Fill the whole cell on selection instead of the default rounded pill band. */
  fillCellOnSelection?: boolean;
  /** Earliest selectable day (inclusive); earlier days render disabled. */
  minDate?: Date;
  /** Latest selectable day (inclusive); later days render disabled. */
  maxDate?: Date;
  /** Return true to render a specific day disabled (dimmed, taps ignored). */
  isDateDisabled?: (date: Date) => boolean;
  /** Drag an event bar onto another day to reschedule it. */
  onDragEvent?: EventDragHandler<T>;
  /** Fired when a month drag picks an event up, before anything is committed. */
  onDragStart?: EventDragStartHandler<T>;
  /** Allow moving events by default (per-event `startEditable` overrides). Default true. */
  eventStartEditable?: boolean;
  /** Reject a drop that would overlap another event (default true = allowed). */
  eventOverlap?: boolean;
  onChangeDate: (date: Date) => void;
  freeSwipe?: boolean;
  swipeEnabled?: boolean;
  showSixWeeks?: boolean;
  /** Render the "MMMM yyyy" title above the weekday header. Default true. */
  showTitle?: boolean;
  activeDate?: Date;
  /** Replace the weekday-label header above the month grid. Receives the week's days. */
  renderHeaderForMonthView?: (weekDays: Date[]) => React.ReactNode;
  /** Replace the default date badge in each day cell. Receives the day. */
  renderCustomDateForMonth?: (date: Date) => React.ReactNode;
} & SlotStyleProps<MonthViewSlot>;

function MonthPagerInner<T>({
  date,
  events,
  maxVisibleEventCount,
  weekStartsOn,
  hiddenDays,
  weekdayFormat = "short",
  locale,
  sortedMonthView,
  moreLabel,
  labels,
  showAdjacentMonths,
  highlightWeekends,
  disableMonthEventCellPress,
  isRTL,
  calendarCellStyle,
  renderEvent,
  keyExtractor,
  onPressDay,
  onLongPressDay,
  onPressCell,
  onPressEvent,
  onLongPressEvent,
  onPressMore,
  onCreateEvent,
  onSelectDrag,
  selectedDates,
  selectedRange,
  fillCellOnSelection,
  minDate,
  maxDate,
  isDateDisabled,
  onDragEvent,
  onDragStart,
  eventStartEditable,
  eventOverlap,
  onChangeDate,
  freeSwipe = false,
  swipeEnabled = true,
  showSixWeeks = false,
  showTitle = true,
  activeDate,
  renderHeaderForMonthView,
  renderCustomDateForMonth,
  classNames,
  styles: styleOverrides,
}: MonthPagerProps<T>): ReactElement {
  const theme = useCalendarTheme();
  // Stable across renders (it feeds the memoized renderItem below).
  const slot = useMemo(
    () => createSlots<MonthViewSlot>({ classNames, styles: styleOverrides }),
    [classNames, styleOverrides],
  );
  const { width, height } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  const containerRef = useRef<View>(null);

  // Web: LegendList's horizontal scroll container is `overflow-x: auto`, so a
  // trackpad swipe or horizontal wheel would page between months. Paging should be
  // arrow-keys/toolbar only, so disable user horizontal scrolling (programmatic
  // scrollToIndex still works through `overflow: hidden`).
  useEffect(() => {
    if (!isWeb) return;
    const root = containerRef.current as unknown as HTMLElement | null;
    if (!root) return;
    const raf = requestAnimationFrame(() => {
      for (const el of root.querySelectorAll<HTMLElement>("*")) {
        if (el.scrollWidth <= el.clientWidth + 20 || el.clientWidth <= 100) continue;
        const overflowX = getComputedStyle(el).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          el.style.overflowX = "hidden";
          el.style.touchAction = "pan-y";
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  // Horizontal list items need an explicit cross-axis height; seed it with the
  // window height (so it renders immediately and in tests) and refine to the
  // exact area on layout. Without this the grid collapses to 0px.
  const [pageHeight, setPageHeight] = useState(height);
  // Each month page sizes to the container width, not the window, so it fits a
  // constrained layout on the web (e.g. a max-width card). On native the pager
  // fills the window, so this equals the window width and behaviour is unchanged.
  const [containerWidth, setContainerWidth] = useState(width);

  // A fixed window of months, anchored once and aligned to the month start. The
  // array never shifts as the date changes, so paging never re-renders a page's
  // content — LegendList virtualises and keys by month.
  const [anchorDate] = useState(date);
  const anchor = useMemo(() => startOfMonth(anchorDate), [anchorDate]);
  const monthDates = useMemo(
    () => Array.from({ length: PAGE_WINDOW * 2 + 1 }, (_, i) => addMonths(anchor, i - PAGE_WINDOW)),
    [anchor],
  );
  const indexOfMonth = useCallback(
    (target: Date) => differenceInCalendarMonths(startOfMonth(target), anchor) + PAGE_WINDOW,
    [anchor],
  );

  // The committed month's page is the centred/active one. Derived (not stored)
  // so it always reflects the date. `viewedIndexRef` tracks where the list
  // actually sits, letting us tell swipe-driven month changes from external ones.
  const activeIndex = indexOfMonth(date);
  const viewedIndexRef = useRef(activeIndex);
  // While a programmatic scroll (a "today" button, prev/next, or any date set from
  // outside) is settling, this holds its target index. Viewability ticks for the
  // months it crosses are ignored until it lands, so they can't report a month in
  // between back as the new date — which made jumps land one month short.
  const pendingScrollIndexRef = useRef<number | null>(null);

  const handleViewableItemsChanged = useCallback(
    (info: OnViewableItemsChangedInfo<Date>) => {
      // On the web the pager can't be swiped (overflow is hidden); every page change
      // is a programmatic scroll driven by `date` (prev/next/today/keys). Viewability
      // there only echoes that scroll back, and can report an intermediate month that
      // fights it (a multi-month "today" jump landing one month short), so ignore it.
      if (isWeb) return;
      const settled = info.viewableItems.find((token) => token.isViewable);
      if (settled?.index == null) return;
      // A programmatic scroll is settling: ignore the months it crosses, and clear
      // the pending target (without reporting a date) once it reaches the target.
      if (pendingScrollIndexRef.current != null) {
        if (settled.index === pendingScrollIndexRef.current) {
          pendingScrollIndexRef.current = null;
          viewedIndexRef.current = settled.index;
        }
        return;
      }
      if (settled.index === viewedIndexRef.current) return;
      viewedIndexRef.current = settled.index;
      if (settled.item) onChangeDate(settled.item);
    },
    [onChangeDate],
  );

  // Realign the list when the month changes from outside a swipe (e.g. a "today"
  // button). Swipe-driven changes already match.
  useEffect(() => {
    if (activeIndex === viewedIndexRef.current) return;
    viewedIndexRef.current = activeIndex;
    pendingScrollIndexRef.current = activeIndex;
    void listRef.current?.scrollToIndex({ index: activeIndex, animated: false });
  }, [activeIndex]);

  // Web arrow-key paging (swipe is disabled there); the effect above scrolls to
  // the new month once `onChangeDate` updates `date`.
  const goToPage = useCallback(
    (delta: number) => {
      const target = monthDates[activeIndex + delta];
      if (target) onChangeDate(target);
    },
    [monthDates, activeIndex, onChangeDate],
  );
  useWebPagerKeys(swipeEnabled, goToPage);

  // The seven weekday labels for the header above the grid. Weekday names depend
  // only on `weekStartsOn`, so any week works; reuse the anchor. Reversed in RTL
  // to line up with the mirrored day cells.
  const weekDays = useMemo(() => {
    const days = filterHiddenDays(getWeekDays(anchor, weekStartsOn), hiddenDays);
    return isRTL ? days.reverse() : days;
  }, [anchor, weekStartsOn, isRTL, hiddenDays]);

  // Pages are keyed by month Dates that never change, so LegendList keeps the
  // pages it has already rendered and only re-renders them when `data` or
  // `extraData` changes — a new `renderItem` identity is not enough. Feed
  // `events` (events that arrive after mount, e.g. from an async fetch, must
  // repaint the mounted page) and `activeDate` (the selected-day highlight must
  // move). Mirrors listExtraData in TimeGrid.
  // `fillCellOnSelection` and `onSelectDrag` ride along because they reach the
  // grids as renderItem props, not through the selection context below: toggling
  // a "pick dates" mode on must reach the pages already rendered.
  const listExtraData = useMemo(
    () => ({ events, activeDate, fillCellOnSelection, dragSelect: onSelectDrag != null }),
    [events, activeDate, fillCellOnSelection, onSelectDrag],
  );

  // Selection reaches the grids through context, not `renderItem`, so a change
  // repaints the pages LegendList has already cached (which `extraData` alone
  // would not, since the pages are keyed by month and never recycled).
  const selection = useMemo<CalendarSelection>(
    () => ({ selectedDates, selectedRange, minDate, maxDate, isDateDisabled }),
    [selectedDates, selectedRange, minDate, maxDate, isDateDisabled],
  );

  const snapToIndices = useMemo(() => monthDates.map((_, index) => index), [monthDates]);
  const keyExtractorList = useCallback((item: Date) => item.toISOString(), []);
  const getFixedItemSize = useCallback(() => containerWidth, [containerWidth]);
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Date>) => (
      <View style={{ width: containerWidth, height: pageHeight }}>
        <MonthView
          date={item}
          events={events}
          // The pager shows one shared weekday header and the month title above it
          // (see below), so each page's grid omits its own title and weekday row.
          showTitle={false}
          showWeekdays={false}
          maxVisibleEventCount={maxVisibleEventCount}
          weekStartsOn={weekStartsOn}
          hiddenDays={hiddenDays}
          locale={locale}
          sortedMonthView={sortedMonthView}
          moreLabel={moreLabel}
          labels={labels}
          showAdjacentMonths={showAdjacentMonths}
          highlightWeekends={highlightWeekends}
          disableMonthEventCellPress={disableMonthEventCellPress}
          isRTL={isRTL}
          showSixWeeks={showSixWeeks}
          activeDate={activeDate}
          calendarCellStyle={calendarCellStyle}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressDay={onPressDay}
          onLongPressDay={onLongPressDay}
          onPressCell={onPressCell}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
          onPressMore={onPressMore}
          onCreateEvent={onCreateEvent}
          onSelectDrag={onSelectDrag}
          fillCellOnSelection={fillCellOnSelection}
          onDragEvent={onDragEvent}
          onDragStart={onDragStart}
          eventStartEditable={eventStartEditable}
          eventOverlap={eventOverlap}
          renderCustomDateForMonth={renderCustomDateForMonth}
          classNames={classNames}
          styles={styleOverrides}
        />
      </View>
    ),
    [
      containerWidth,
      pageHeight,
      events,
      maxVisibleEventCount,
      weekStartsOn,
      hiddenDays,
      locale,
      sortedMonthView,
      moreLabel,
      labels,
      showAdjacentMonths,
      highlightWeekends,
      disableMonthEventCellPress,
      isRTL,
      showSixWeeks,
      activeDate,
      calendarCellStyle,
      renderEvent,
      keyExtractor,
      onPressDay,
      onLongPressDay,
      onPressCell,
      onPressEvent,
      onLongPressEvent,
      onPressMore,
      onCreateEvent,
      onSelectDrag,
      fillCellOnSelection,
      onDragEvent,
      onDragStart,
      eventStartEditable,
      eventOverlap,
      renderCustomDateForMonth,
      classNames,
      styleOverrides,
    ],
  );

  return (
    <CalendarSelectionProvider value={selection}>
      <View ref={containerRef} style={[styles.container, theme.containers.monthContainer]}>
        {/* The active month's title, above the (shared) weekday header — mirrors the
          dom MonthView's title. The grids below omit their own title/weekdays. */}
        {showTitle ? (
          <Text
            {...slot<TextStyle>("title", {
              base: styles.monthTitle,
              themed: [theme.text.monthTitle, { color: theme.colors.text }],
            })}
            allowFontScaling={false}
          >
            {format(date, "MMMM yyyy", locale ? { locale } : undefined)}
          </Text>
        ) : null}
        {renderHeaderForMonthView ? (
          renderHeaderForMonthView(weekDays)
        ) : (
          <MonthWeekdayHeader
            weekDays={weekDays}
            weekdayFormat={weekdayFormat}
            locale={locale}
            slot={slot}
          />
        )}
        <View
          style={styles.pager}
          onLayout={(event) => {
            setPageHeight(event.nativeEvent.layout.height);
            setContainerWidth(event.nativeEvent.layout.width);
          }}
        >
          <LegendList
            // Remount when the measured page height changes so the list adopts the
            // corrected item height. Without this the list can keep the oversized
            // initial (window-height) seed and clip the last week row.
            key={pageHeight}
            ref={listRef}
            style={isWeb ? [styles.pagerList, styles.webNoScroll] : styles.pagerList}
            data={monthDates}
            extraData={listExtraData}
            horizontal
            recycleItems={false}
            keyExtractor={keyExtractorList}
            getFixedItemSize={getFixedItemSize}
            // On web LegendList ignores these RN scroll props (it leaks them to the
            // DOM as unknown attributes), so omit them there and disable horizontal
            // scroll via `webNoScroll`; paging is driven by the arrow keys instead.
            // Native: paging makes each swipe hard-stop at the adjacent month, while
            // `freeSwipe` lets momentum carry across months and snap to a boundary.
            {...(isWeb
              ? null
              : {
                  scrollEnabled: swipeEnabled,
                  pagingEnabled: !freeSwipe,
                  snapToIndices: freeSwipe ? snapToIndices : undefined,
                })}
            initialScrollIndex={activeIndex}
            showsHorizontalScrollIndicator={false}
            viewabilityConfig={PAGE_VIEWABILITY}
            onViewableItemsChanged={handleViewableItemsChanged}
            renderItem={renderItem}
          />
        </View>
      </View>
    </CalendarSelectionProvider>
  );
}

/**
 * A horizontally swipeable month carousel. Swipe left/right to page between
 * months; the committed month is reported through `onChangeDate`. It is the
 * Reanimated-driven month view that `Calendar` uses in month mode.
 *
 * @example
 * ```tsx
 * import { MonthPager } from "@super-calendar/native";
 *
 * <MonthPager
 *   date={date}
 *   events={events}
 *   weekStartsOn={0}
 *   onChangeDate={setDate}
 *   onPressEvent={(e) => console.log(e.title)}
 * />
 * ```
 */
export const MonthPager = memo(MonthPagerInner) as typeof MonthPagerInner;

type MonthWeekdayHeaderProps = {
  weekDays: Date[];
  weekdayFormat?: WeekdayFormat;
  locale?: Locale;
  slot: ReturnType<typeof createSlots<MonthViewSlot>>;
};

// The default weekday-label row above the month grid (e.g. "Mon Tue Wed…"),
// one flex column per day to line up with the grid cells below.
const MonthWeekdayHeader = ({
  weekDays,
  weekdayFormat = "short",
  locale,
  slot,
}: MonthWeekdayHeaderProps) => {
  const theme = useCalendarTheme();
  return (
    <View
      {...slot("weekdays", {
        base: styles.weekdayHeader,
        themed: theme.containers.weekdayHeader,
      })}
    >
      {weekDays.map((day) => (
        <Text
          key={day.toISOString()}
          {...slot<TextStyle>("weekday", {
            base: styles.weekdayLabel,
            themed: [theme.text.weekday, { color: theme.colors.textMuted }],
          })}
          allowFontScaling={false}
        >
          {format(day, weekdayFormatToken(weekdayFormat), { locale })}
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  pagerList: {
    flex: 1,
  },
  // Disable user-driven horizontal scroll on web; programmatic paging still works.
  webNoScroll: {
    overflow: "hidden",
  },
  // Layout only; the font is themeable via `theme.text.monthTitle`.
  monthTitle: {
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  weekdayHeader: {
    flexDirection: "row",
    paddingBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
  },
});
