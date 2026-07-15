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
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, EventKeyExtractor, RenderEvent, WeekStartsOn } from "../types";
import { type WeekdayFormat, getWeekDays, weekdayFormatToken } from "@super-calendar/core";
import { useWebPagerKeys } from "../utils/useWebPagerKeys";
import { MonthView } from "./MonthView";

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
  weekdayFormat?: WeekdayFormat;
  locale?: Locale;
  sortedMonthView?: boolean;
  moreLabel?: string;
  showAdjacentMonths?: boolean;
  disableMonthEventCellPress?: boolean;
  isRTL?: boolean;
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressDay?: (date: Date) => void;
  onLongPressDay?: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  onChangeDate: (date: Date) => void;
  freeSwipe?: boolean;
  swipeEnabled?: boolean;
  showSixWeeks?: boolean;
  activeDate?: Date;
  /** Replace the weekday-label header above the month grid. Receives the week's days. */
  renderHeaderForMonthView?: (weekDays: Date[]) => React.ReactNode;
  /** Replace the default date badge in each day cell. Receives the day. */
  renderCustomDateForMonth?: (date: Date) => React.ReactNode;
};

function MonthPagerInner<T>({
  date,
  events,
  maxVisibleEventCount,
  weekStartsOn,
  weekdayFormat = "short",
  locale,
  sortedMonthView,
  moreLabel,
  showAdjacentMonths,
  disableMonthEventCellPress,
  isRTL,
  calendarCellStyle,
  renderEvent,
  keyExtractor,
  onPressDay,
  onLongPressDay,
  onPressEvent,
  onLongPressEvent,
  onPressMore,
  onChangeDate,
  freeSwipe = false,
  swipeEnabled = true,
  showSixWeeks = false,
  activeDate,
  renderHeaderForMonthView,
  renderCustomDateForMonth,
}: MonthPagerProps<T>): ReactElement {
  const theme = useCalendarTheme();
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
    const days = getWeekDays(anchor, weekStartsOn);
    return isRTL ? days.reverse() : days;
  }, [anchor, weekStartsOn, isRTL]);

  // Pages are keyed by month Dates that never change, so LegendList keeps the
  // pages it has already rendered and only re-renders them when `data` or
  // `extraData` changes — a new `renderItem` identity is not enough. Feed
  // `events` (events that arrive after mount, e.g. from an async fetch, must
  // repaint the mounted page) and `activeDate` (the selected-day highlight must
  // move). Mirrors listExtraData in TimeGrid.
  const listExtraData = useMemo(() => ({ events, activeDate }), [events, activeDate]);

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
          locale={locale}
          sortedMonthView={sortedMonthView}
          moreLabel={moreLabel}
          showAdjacentMonths={showAdjacentMonths}
          disableMonthEventCellPress={disableMonthEventCellPress}
          isRTL={isRTL}
          showSixWeeks={showSixWeeks}
          activeDate={activeDate}
          calendarCellStyle={calendarCellStyle}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressDay={onPressDay}
          onLongPressDay={onLongPressDay}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
          onPressMore={onPressMore}
          renderCustomDateForMonth={renderCustomDateForMonth}
        />
      </View>
    ),
    [
      containerWidth,
      pageHeight,
      events,
      maxVisibleEventCount,
      weekStartsOn,
      locale,
      sortedMonthView,
      moreLabel,
      showAdjacentMonths,
      disableMonthEventCellPress,
      isRTL,
      showSixWeeks,
      activeDate,
      calendarCellStyle,
      renderEvent,
      keyExtractor,
      onPressDay,
      onLongPressDay,
      onPressEvent,
      onLongPressEvent,
      onPressMore,
      renderCustomDateForMonth,
    ],
  );

  return (
    <View ref={containerRef} style={[styles.container, theme.containers.monthContainer]}>
      {/* The active month's title, above the (shared) weekday header — mirrors the
          dom MonthView's title. The grids below omit their own title/weekdays. */}
      <Text
        style={[styles.monthTitle, theme.text.monthTitle, { color: theme.colors.text }]}
        allowFontScaling={false}
      >
        {format(date, "MMMM yyyy", locale ? { locale } : undefined)}
      </Text>
      {renderHeaderForMonthView ? (
        renderHeaderForMonthView(weekDays)
      ) : (
        <MonthWeekdayHeader weekDays={weekDays} weekdayFormat={weekdayFormat} locale={locale} />
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
};

// The default weekday-label row above the month grid (e.g. "Mon Tue Wed…"),
// one flex column per day to line up with the grid cells below.
const MonthWeekdayHeader = ({
  weekDays,
  weekdayFormat = "short",
  locale,
}: MonthWeekdayHeaderProps) => {
  const theme = useCalendarTheme();
  return (
    <View style={[styles.weekdayHeader, theme.containers.weekdayHeader]}>
      {weekDays.map((day) => (
        <Text
          key={day.toISOString()}
          style={[theme.text.weekday, styles.weekdayLabel, { color: theme.colors.textMuted }]}
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
