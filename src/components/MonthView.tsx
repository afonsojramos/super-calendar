import { format, type Locale, isSameMonth, startOfDay } from "date-fns";
import { memo, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  type StyleProp,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

// Web drag-to-select relays cell pointer events up to MonthList; native drag is
// driven by a list-level pan there instead.
const isWeb = Platform.OS === "web";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, EventKeyExtractor, RenderEvent, WeekStartsOn } from "../types";
import {
  type DateRange,
  isDateSelectable,
  isRangeEndpoint,
  isWithinDateRange,
  useCalendarSelection,
} from "../utils/dateRange";
import { buildMonthWeeks, getIsToday, isSameCalendarDay, isWeekend } from "../utils/dates";
import { monthEventCapacity, monthVisibleCount } from "../utils/eventDisplay";
import { eventDayKeys, isAllDayEvent } from "../utils/layout";

// Day-cell metrics, mirrored from the styles below, used to estimate how many
// event chips fit when auto-fitting `maxVisibleEventCount`.
const DAY_CELL_PADDING_TOP = 4;
const DATE_BADGE_HEIGHT = 24;
const CELL_ROW_GAP = 2;
const CHIP_PADDING_V = 2;
// Pre-measure fallback so the first paint isn't empty or overflowing.
const FALLBACK_VISIBLE_COUNT = 3;

const numericStyle = (value: number | string | undefined, fallback: number) =>
  typeof value === "number" ? value : fallback;

export type MonthViewProps<T> = {
  date: Date;
  events: CalendarEvent<T>[];
  /**
   * Max event chips per day cell. Omit to auto-fit as many as the cell height
   * allows (the default); set a number for a fixed cap. Extra events collapse
   * into a "+N more" label. Auto-fit assumes the built-in chip size — pass an
   * explicit value when using a custom `renderEvent`.
   */
  maxVisibleEventCount?: number;
  weekStartsOn: WeekStartsOn;
  locale?: Locale;
  /** Sort each day's events by start time before slicing. Default true. */
  sortedMonthView?: boolean;
  /** Template for the overflow label; `{moreCount}` is replaced. Default "{moreCount} More". */
  moreLabel?: string;
  /** Show dimmed days from adjacent months in the grid. Default true. */
  showAdjacentMonths?: boolean;
  /** Ignore taps on month-cell events (day-cell taps still fire). Default false. */
  disableMonthEventCellPress?: boolean;
  /** Reverse the day order within each week (right-to-left). Default false. */
  isRTL?: boolean;
  /** Always render six week rows, for a fixed-height grid. Default false. */
  showSixWeeks?: boolean;
  /** Highlight this date instead of the real "today". */
  activeDate?: Date;
  /** Days drawn as selected, filled with the `rangeBackground` band (no badge). */
  selectedDates?: Date[];
  /** A selected span, filled edge-to-edge with the `rangeBackground` band. */
  selectedRange?: DateRange;
  /** Earliest selectable day (inclusive); earlier days render disabled. */
  minDate?: Date;
  /** Latest selectable day (inclusive); later days render disabled. */
  maxDate?: Date;
  /** Return true to render a specific day disabled (dimmed, taps ignored). */
  isDateDisabled?: (date: Date) => boolean;
  /** Web drag-to-select relay: a pointer pressed down on this day's cell. */
  onDayPointerDown?: (date: Date) => void;
  /** Web drag-to-select relay: a pressed pointer entered this day's cell. */
  onDayPointerEnter?: (date: Date) => void;
  /** Per-date style merged onto the day cell. */
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressDay?: (date: Date) => void;
  onLongPressDay?: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /**
   * Replace the default date badge in each day cell. Receives the day; return
   * your own date label. Event chips and the "+N more" label still render below.
   */
  renderCustomDateForMonth?: (date: Date) => React.ReactNode;
};

function MonthViewInner<T>({
  date,
  events,
  maxVisibleEventCount,
  weekStartsOn,
  locale,
  sortedMonthView = true,
  moreLabel = "{moreCount} More",
  showAdjacentMonths = true,
  disableMonthEventCellPress = false,
  isRTL = false,
  showSixWeeks = false,
  activeDate,
  selectedDates: selectedDatesProp,
  selectedRange: selectedRangeProp,
  minDate: minDateProp,
  maxDate: maxDateProp,
  isDateDisabled: isDateDisabledProp,
  calendarCellStyle,
  renderEvent,
  keyExtractor,
  onPressDay,
  onLongPressDay,
  onPressEvent,
  onLongPressEvent,
  onPressMore,
  renderCustomDateForMonth,
  onDayPointerDown,
  onDayPointerEnter,
}: MonthViewProps<T>) {
  const theme = useCalendarTheme();
  // Selection comes from context (so cached pages still repaint), but explicit
  // props win for direct/standalone use of MonthView.
  const selection = useCalendarSelection();
  const selectedDates = selectedDatesProp ?? selection.selectedDates;
  const selectedRange = selectedRangeProp ?? selection.selectedRange;
  const minDate = minDateProp ?? selection.minDate;
  const maxDate = maxDateProp ?? selection.maxDate;
  const isDateDisabled = isDateDisabledProp ?? selection.isDateDisabled;
  const RenderEventComponent = renderEvent;
  // Measured grid height, used to auto-fit the event chips per cell.
  const [gridHeight, setGridHeight] = useState(0);

  const weeks = useMemo(
    () => buildMonthWeeks(date, weekStartsOn, { showSixWeeks, isRTL }),
    [date, weekStartsOn, isRTL, showSixWeeks],
  );

  // How many chips fit per cell: a fixed cap when `maxVisibleEventCount` is set,
  // else derived from the measured cell height and the (default) chip metrics.
  const capacity = useMemo(() => {
    if (maxVisibleEventCount != null) {
      return { full: maxVisibleEventCount, withMore: maxVisibleEventCount };
    }
    if (gridHeight <= 0 || weeks.length === 0) {
      return { full: FALLBACK_VISIBLE_COUNT, withMore: FALLBACK_VISIBLE_COUNT };
    }
    const rowHeight = gridHeight / weeks.length;
    const fontSize = numericStyle(theme.text.eventTitle.fontSize, 12);
    const lineHeight = numericStyle(theme.text.eventTitle.lineHeight, Math.ceil(fontSize * 1.3));
    const chipRowHeight = lineHeight + CHIP_PADDING_V * 2 + CELL_ROW_GAP;
    const moreFontSize = numericStyle(theme.text.more.fontSize, 11);
    const moreRowHeight = Math.ceil(moreFontSize * 1.3) + CELL_ROW_GAP;
    const available = rowHeight - DAY_CELL_PADDING_TOP - DATE_BADGE_HEIGHT;
    return monthEventCapacity(available, chipRowHeight, moreRowHeight);
  }, [maxVisibleEventCount, gridHeight, weeks.length, theme]);

  // Group events by calendar day once per `events` change, rather than scanning
  // the whole list inside every one of the (up to) 42 day cells on each render.
  // Multi-day events are indexed under every day they span.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent<T>[]>();
    for (const event of events) {
      for (const key of eventDayKeys(event)) {
        const existing = map.get(key);
        if (existing) existing.push(event);
        else map.set(key, [event]);
      }
    }
    if (sortedMonthView) {
      for (const list of map.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
    }
    return map;
  }, [events, sortedMonthView]);

  const renderDay = (day: Date) => {
    const isCurrentMonth = isSameMonth(day, date);

    // Blank out adjacent-month days when they're hidden, keeping the grid shape.
    if (!isCurrentMonth && !showAdjacentMonths) {
      return (
        <View
          key={day.toISOString()}
          style={[
            styles.dayCell,
            { borderColor: theme.colors.gridLine },
            isWeekend(day) && { backgroundColor: theme.colors.weekendBackground },
          ]}
        />
      );
    }

    const dayEvents = eventsByDay.get(startOfDay(day).toISOString()) ?? [];
    const isToday = getIsToday(day);
    // Highlight the chosen `activeDate` when supplied, else the real today.
    const isHighlighted = activeDate ? isSameCalendarDay(day, activeDate) : isToday;
    // Selection (single/multiple dates or a range endpoint) wins over the today
    // badge; interior range days get a band behind the cell instead of a badge.
    const isDisabled = !isDateSelectable(day, { minDate, maxDate, isDateDisabled });
    const isSelected =
      !isDisabled &&
      ((selectedDates?.some((selected) => isSameCalendarDay(selected, day)) ?? false) ||
        isRangeEndpoint(day, selectedRange ?? null));
    const isInRange = !isDisabled && isWithinDateRange(day, selectedRange ?? null);
    const visibleCount = monthVisibleCount(dayEvents.length, capacity);
    const hiddenCount = dayEvents.length - visibleCount;

    // Selection is shown as a background band over the span (no per-day badge),
    // so selected days keep their normal number colour; today keeps its badge.
    const dateColor = isDisabled
      ? theme.colors.textDisabled
      : isHighlighted
        ? theme.colors.todayText
        : isCurrentMonth
          ? theme.colors.text
          : theme.colors.textDisabled;

    // Disabled days ignore taps; pass the guards through so a press never fires.
    const handlePressDay = isDisabled || !onPressDay ? undefined : () => onPressDay(day);
    const handleLongPressDay =
      isDisabled || !onLongPressDay ? undefined : () => onLongPressDay(day);

    // Summarise the cell for screen readers: full date, today marker, and how
    // many events it holds (the chips inside are grouped under this cell).
    const eventCount = dayEvents.length;
    const accessibilityLabel = `${format(day, "EEEE, d LLLL yyyy", { locale })}${isToday ? ", today" : ""}${isSelected ? ", selected" : ""}${isDisabled ? ", unavailable" : ""}, ${eventCount} ${eventCount === 1 ? "event" : "events"}`;

    return (
      <TouchableOpacity
        key={day.toISOString()}
        style={[
          styles.dayCell,
          { borderColor: theme.colors.gridLine },
          isWeekend(day) && { backgroundColor: theme.colors.weekendBackground },
          // Selection band fills the whole span (endpoints + interior + discrete
          // days); placed after weekend so it wins.
          (isInRange || isSelected) && { backgroundColor: theme.colors.rangeBackground },
          calendarCellStyle?.(day),
        ]}
        onPress={handlePressDay}
        onLongPress={handleLongPressDay}
        disabled={isDisabled || (!onPressDay && !onLongPressDay)}
        // Web drag-to-select: relay pointer down/enter so MonthList can extend a
        // range as the pressed pointer sweeps across cells (native uses a pan).
        {...(isWeb && !isDisabled && onDayPointerDown
          ? {
              onPointerDown: () => onDayPointerDown(day),
              onPointerEnter: () => onDayPointerEnter?.(day),
            }
          : null)}
        // A cell, not a button — it contains the event-chip buttons, and a nested
        // <button> is invalid HTML on web. `cell` is also closer to the correct
        // semantics for a calendar day than `button`.
        role="cell"
        accessibilityLabel={accessibilityLabel}
      >
        {renderCustomDateForMonth ? (
          renderCustomDateForMonth(day)
        ) : (
          <View
            style={[
              styles.dateBadge,
              isHighlighted && {
                backgroundColor: theme.colors.todayBackground,
                borderRadius: theme.todayBadgeRadius,
              },
            ]}
          >
            <Text style={[theme.text.dateCell, { color: dateColor }]} allowFontScaling={false}>
              {format(day, "d")}
            </Text>
          </View>
        )}
        {dayEvents.slice(0, visibleCount).map((event, index) => (
          <View key={keyExtractor(event, index)} style={styles.monthEvent}>
            <RenderEventComponent
              event={event}
              mode="month"
              isAllDay={isAllDayEvent(event)}
              onPress={disableMonthEventCellPress ? () => {} : () => onPressEvent(event)}
              onLongPress={
                disableMonthEventCellPress || !onLongPressEvent
                  ? undefined
                  : () => onLongPressEvent(event)
              }
            />
          </View>
        ))}
        {hiddenCount > 0 ? (
          <Text
            style={[theme.text.more, styles.moreLabel, { color: theme.colors.textMuted }]}
            onPress={onPressMore ? () => onPressMore(dayEvents, day) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Show ${hiddenCount} more events`}
            allowFontScaling={false}
          >
            {moreLabel.replace("{moreCount}", String(hiddenCount))}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setGridHeight((prev) => (prev === next ? prev : next));
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {weeks.map((week) => (
        <View style={styles.weekRow} key={week[0].toISOString()}>
          {week.map((day) => renderDay(day))}
        </View>
      ))}
    </View>
  );
}

export const MonthView = memo(MonthViewInner) as typeof MonthViewInner;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekRow: {
    flex: 1,
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 4,
    gap: 2,
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dateBadge: {
    justifyContent: "center",
    alignItems: "center",
    height: 24,
    width: 24,
  },
  monthEvent: {
    width: "92%",
  },
  moreLabel: {
    marginTop: 2,
  },
});
