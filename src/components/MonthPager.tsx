import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";
import { addMonths, differenceInCalendarMonths, format, type Locale, startOfMonth } from "date-fns";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { DateRange } from "../utils/dateRange";
import { getWeekDays } from "../utils/dates";
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

export type MonthPagerProps<T> = {
  date: Date;
  events: CalendarEvent<T>[];
  maxVisibleEventCount?: number;
  weekStartsOn: WeekStartsOn;
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
  selectedDates?: Date[];
  selectedRange?: DateRange;
  /** Replace the weekday-label header above the month grid. Receives the week's days. */
  renderHeaderForMonthView?: (weekDays: Date[]) => React.ReactNode;
};

function MonthPagerInner<T>({
  date,
  events,
  maxVisibleEventCount,
  weekStartsOn,
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
  selectedDates,
  selectedRange,
  renderHeaderForMonthView,
}: MonthPagerProps<T>) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  // Horizontal list items need an explicit cross-axis height; seed it with the
  // window height (so it renders immediately and in tests) and refine to the
  // exact area on layout. Without this the grid collapses to 0px.
  const [pageHeight, setPageHeight] = useState(height);

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

  const handleViewableItemsChanged = useCallback(
    (info: OnViewableItemsChangedInfo<Date>) => {
      const settled = info.viewableItems.find((token) => token.isViewable);
      if (settled?.index == null || settled.index === viewedIndexRef.current) return;
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

  const snapToIndices = useMemo(() => monthDates.map((_, index) => index), [monthDates]);
  const keyExtractorList = useCallback((item: Date) => item.toISOString(), []);
  const getFixedItemSize = useCallback(() => width, [width]);
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Date>) => (
      <View style={{ width, height: pageHeight }}>
        <MonthView
          date={item}
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
          selectedDates={selectedDates}
          selectedRange={selectedRange}
          calendarCellStyle={calendarCellStyle}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressDay={onPressDay}
          onLongPressDay={onLongPressDay}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
          onPressMore={onPressMore}
        />
      </View>
    ),
    [
      width,
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
      selectedDates,
      selectedRange,
      calendarCellStyle,
      renderEvent,
      keyExtractor,
      onPressDay,
      onLongPressDay,
      onPressEvent,
      onLongPressEvent,
      onPressMore,
    ],
  );

  return (
    <View style={styles.container}>
      {renderHeaderForMonthView ? (
        renderHeaderForMonthView(weekDays)
      ) : (
        <MonthWeekdayHeader weekDays={weekDays} locale={locale} />
      )}
      <View
        style={styles.pager}
        onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}
      >
        <LegendList
          // Remount when the measured page height changes so the list adopts the
          // corrected item height. Without this the list can keep the oversized
          // initial (window-height) seed and clip the last week row.
          key={pageHeight}
          ref={listRef}
          style={isWeb ? [styles.pagerList, styles.webNoScroll] : styles.pagerList}
          data={monthDates}
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

export const MonthPager = memo(MonthPagerInner) as typeof MonthPagerInner;

type MonthWeekdayHeaderProps = {
  weekDays: Date[];
  locale?: Locale;
};

// The default weekday-label row above the month grid (e.g. "Mon Tue Wed…"),
// one flex column per day to line up with the grid cells below.
const MonthWeekdayHeader = ({ weekDays, locale }: MonthWeekdayHeaderProps) => {
  const theme = useCalendarTheme();
  return (
    <View style={styles.weekdayHeader}>
      {weekDays.map((day) => (
        <Text
          key={day.toISOString()}
          style={[theme.text.weekday, styles.weekdayLabel, { color: theme.colors.textMuted }]}
          allowFontScaling={false}
        >
          {format(day, "EEE", { locale })}
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
  weekdayHeader: {
    flexDirection: "row",
    paddingBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
  },
});
