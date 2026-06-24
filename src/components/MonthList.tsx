import {
  LegendList,
  type LegendListRenderItemProps,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";
import { addMonths, differenceInCalendarMonths, format, type Locale, startOfMonth } from "date-fns";
import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from "react-native";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, EventKeyExtractor, RenderEvent, WeekStartsOn } from "../types";
import {
  type CalendarSelection,
  CalendarSelectionProvider,
  type DateRange,
} from "../utils/dateRange";
import { getWeekDays } from "../utils/dates";
import { MonthView } from "./MonthView";

// Months rendered either side of the anchor. LegendList virtualises, so only a
// few mount at once; a wide window means the user effectively never runs out.
const PAGE_WINDOW = 60;
const VIEWABILITY = { itemVisiblePercentThreshold: 60 };
// Default fixed height per month block (title + six week rows). Override via prop.
const DEFAULT_MONTH_HEIGHT = 360;

export type MonthListProps<T> = {
  /** The month scrolled to on mount. */
  date: Date;
  events: CalendarEvent<T>[];
  weekStartsOn: WeekStartsOn;
  /** Fixed height of each month block (px). Default 360. */
  monthHeight?: number;
  maxVisibleEventCount?: number;
  locale?: Locale;
  sortedMonthView?: boolean;
  moreLabel?: string;
  showAdjacentMonths?: boolean;
  disableMonthEventCellPress?: boolean;
  isRTL?: boolean;
  activeDate?: Date;
  selectedDates?: Date[];
  selectedRange?: DateRange;
  minDate?: Date;
  maxDate?: Date;
  isDateDisabled?: (date: Date) => boolean;
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressDay?: (date: Date) => void;
  onLongPressDay?: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Fired with the month that scrolls into view. */
  onChangeVisibleMonth?: (month: Date) => void;
  /** Replace the per-month title (default "LLLL yyyy"). */
  renderMonthHeader?: (month: Date) => React.ReactNode;
};

function MonthListInner<T>({
  date,
  events,
  weekStartsOn,
  monthHeight = DEFAULT_MONTH_HEIGHT,
  maxVisibleEventCount,
  locale,
  sortedMonthView,
  moreLabel,
  showAdjacentMonths,
  disableMonthEventCellPress,
  isRTL,
  activeDate,
  selectedDates,
  selectedRange,
  minDate,
  maxDate,
  isDateDisabled,
  calendarCellStyle,
  renderEvent,
  keyExtractor,
  onPressDay,
  onLongPressDay,
  onPressEvent,
  onLongPressEvent,
  onPressMore,
  onChangeVisibleMonth,
  renderMonthHeader,
}: MonthListProps<T>) {
  const theme = useCalendarTheme();

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
  const getFixedItemSize = useCallback(() => monthHeight, [monthHeight]);

  const handleViewableItemsChanged = useCallback(
    (info: OnViewableItemsChangedInfo<Date>) => {
      const settled = info.viewableItems.find((token) => token.isViewable);
      if (settled?.item && onChangeVisibleMonth) onChangeVisibleMonth(settled.item);
    },
    [onChangeVisibleMonth],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Date>) => (
      <View style={{ height: monthHeight }}>
        {renderMonthHeader ? (
          renderMonthHeader(item)
        ) : (
          <Text style={[theme.text.dayNumber, styles.monthTitle, { color: theme.colors.text }]}>
            {format(item, "LLLL yyyy", { locale })}
          </Text>
        )}
        <View style={styles.grid}>
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
            showSixWeeks
            activeDate={activeDate}
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
      </View>
    ),
    [
      monthHeight,
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
    <CalendarSelectionProvider value={selection}>
      <View style={styles.container}>
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
        <LegendList
          style={styles.list}
          data={monthDates}
          recycleItems={false}
          keyExtractor={keyExtractorList}
          getFixedItemSize={getFixedItemSize}
          initialScrollIndex={initialIndex}
          showsVerticalScrollIndicator={false}
          viewabilityConfig={VIEWABILITY}
          onViewableItemsChanged={handleViewableItemsChanged}
          renderItem={renderItem}
        />
      </View>
    </CalendarSelectionProvider>
  );
}

export const MonthList = memo(MonthListInner) as typeof MonthListInner;

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  monthTitle: { paddingHorizontal: 8, paddingVertical: 8 },
  grid: { flex: 1 },
  weekdayHeader: { flexDirection: "row", paddingBottom: 4 },
  weekdayLabel: { flex: 1, textAlign: "center" },
});
