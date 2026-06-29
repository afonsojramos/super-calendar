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
import { type DateRange, daySelectionState, useCalendarSelection } from "@super-calendar/core";
import { dayBadgeKind, rangeBandKind } from "@super-calendar/core";
import {
  buildMonthWeeks,
  getIsToday,
  getWeekDays,
  isSameCalendarDay,
  isWeekend,
} from "@super-calendar/core";
import { monthEventCapacity, monthVisibleCount } from "@super-calendar/core";
import { compareDayEvents, groupEventsByDay, isAllDayEvent } from "@super-calendar/core";

// Day-cell metrics, mirrored from the styles below, used to estimate how many
// event chips fit when auto-fitting `maxVisibleEventCount`.
const DAY_CELL_PADDING_TOP = 4;
const DATE_BADGE_HEIGHT = 24;
// Vertical centre of the date badge, where the range band is centered.
const BAND_CENTER_Y = DAY_CELL_PADDING_TOP + DATE_BADGE_HEIGHT / 2;
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
  /** Render the "MMMM yyyy" title above the grid. Default true. */
  showTitle?: boolean;
  /** Render the weekday-label header row above the grid. Default true. */
  showWeekdays?: boolean;
  /** Highlight this date instead of the real "today". */
  activeDate?: Date;
  /** Days drawn as selected (a filled badge), in the month grid. */
  selectedDates?: Date[];
  /** A selected span: endpoints get a filled badge, the span gets the range band. */
  selectedRange?: DateRange;
  /**
   * Fill the whole cell with the range band instead of the default centered
   * rounded "pill" strip. Default false.
   */
  fillCellOnSelection?: boolean;
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
  showTitle = true,
  showWeekdays = true,
  activeDate,
  selectedDates: selectedDatesProp,
  selectedRange: selectedRangeProp,
  fillCellOnSelection = false,
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
  // Web-only hover highlight on the day badge (mouse pointers); stays null on
  // touch/native, so it never re-renders there. Mirrors the dom renderer.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const weeks = useMemo(
    () => buildMonthWeeks(date, weekStartsOn, { showSixWeeks, isRTL }),
    [date, weekStartsOn, isRTL, showSixWeeks],
  );

  // Weekday labels for the header row (any week works; reuse this month). Reversed
  // in RTL so they line up with the mirrored day columns.
  const weekdayLabels = useMemo(() => {
    const days = getWeekDays(date, weekStartsOn);
    return isRTL ? days.reverse() : days;
  }, [date, weekStartsOn, isRTL]);

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

  // Group events by calendar day once per `events` change (shared with the dom
  // renderer via core's `groupEventsByDay`), rather than scanning the whole list
  // inside every one of the (up to) 42 day cells on each render. Multi-day events
  // are indexed under every day they span.
  const eventsByDay = useMemo(() => {
    const map = groupEventsByDay(events);
    if (sortedMonthView) {
      // All-day events head the day, then timed events by start (shared with dom).
      for (const list of map.values()) list.sort(compareDayEvents);
    }
    return map;
  }, [events, sortedMonthView]);

  // Draw the day-cell grid only for an events calendar; the events-free date
  // picker reads cleaner without it (matching the dom renderer).
  const showGrid = events.length > 0;

  const renderDay = (day: Date) => {
    const isCurrentMonth = isSameMonth(day, date);

    // Blank out adjacent-month days when they're hidden, keeping the grid shape.
    if (!isCurrentMonth && !showAdjacentMonths) {
      return (
        <View
          key={day.toISOString()}
          style={[
            styles.dayCell,
            showGrid && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderRightWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.gridLine,
            },
            // No weekend tint on blank placeholders, so the shading doesn't bleed
            // into the empty cells of non-existent days.
          ]}
        />
      );
    }

    const dayEvents = eventsByDay.get(startOfDay(day).toISOString()) ?? [];
    const isToday = getIsToday(day);
    // Highlight the chosen `activeDate` when supplied, else the real today.
    const isHighlighted = activeDate ? isSameCalendarDay(day, activeDate) : isToday;
    // Selection band wins over the weekend tint; the today badge shows unless the
    // day is selected. Shared with the headless grid so they never diverge.
    const { isDisabled, isSelected, isInRange, isRangeStart, isRangeEnd } = daySelectionState(
      day,
      { selectedDates, selectedRange },
      { minDate, maxDate, isDateDisabled },
    );
    const visibleCount = monthVisibleCount(dayEvents.length, capacity);
    const hiddenCount = dayEvents.length - visibleCount;

    // The range shows as a band behind the days; endpoints and discrete selected
    // days get a filled badge on top. Today's badge wins when it coincides. The
    // band/badge decisions come from core so both renderers can't disagree.
    const isFilledBadge = dayBadgeKind({ isSelected }, isHighlighted) !== "none";
    const hasBand =
      rangeBandKind({ isInRange, isRangeStart, isRangeEnd }, fillCellOnSelection) !== "none";
    const dayKey = day.toISOString();
    // A hovered, non-filled day gets the subtle badge highlight on the web, but only
    // in the events-free picker. The events calendar (month and list views) has no
    // hover, matching the dom renderer (its events-mode cell omits it).
    const isHovered = isWeb && !isDisabled && !showGrid && hoveredKey === dayKey;
    const dateColor = isDisabled
      ? theme.colors.textDisabled
      : isFilledBadge
        ? isHighlighted
          ? theme.colors.todayText
          : theme.colors.selectedText
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
          // Events mode mirrors the dom renderer: left-aligned cell content with
          // the date badge in the top-right. The picker (no grid) stays centered
          // so the selection range band lines up with the centered badge.
          showGrid && styles.dayCellEvents,
          showGrid && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderColor: theme.colors.gridLine,
          },
          isWeekend(day) && { backgroundColor: theme.colors.weekendBackground },
          calendarCellStyle?.(day),
        ]}
        onPress={handlePressDay}
        onLongPress={handleLongPressDay}
        disabled={isDisabled || (!onPressDay && !onLongPressDay)}
        // Web only: track hover for the badge highlight, and (when drag-select is
        // wired) relay pointer down/enter so MonthList can extend a range as the
        // pressed pointer sweeps across cells. Native uses a pan, no hover.
        {...(isWeb && !isDisabled
          ? {
              onPointerEnter: () => {
                // Hover highlight is picker-only; the events calendar matches dom (none).
                if (!showGrid) setHoveredKey(dayKey);
                if (onDayPointerDown) onDayPointerEnter?.(day);
              },
              onPointerLeave: () => {
                if (!showGrid) setHoveredKey((k) => (k === dayKey ? null : k));
              },
              ...(onDayPointerDown ? { onPointerDown: () => onDayPointerDown(day) } : {}),
            }
          : null)}
        // A cell, not a button — it contains the event-chip buttons, and a nested
        // <button> is invalid HTML on web. `cell` is also closer to the correct
        // semantics for a calendar day than `button`.
        role="cell"
        // On web, the events calendar's day cells are not tab stops, so keyboard
        // focus moves through the event chips (real buttons) only, not every empty
        // day — matching the dom renderer. A pointer tap still opens the day. The
        // events-free picker layout (no grid) stays keyboard-navigable for selection.
        {...(isWeb && showGrid ? { focusable: false } : null)}
        accessibilityLabel={accessibilityLabel}
      >
        {hasBand ? (
          <View
            testID="month-range-band"
            pointerEvents="none"
            style={[
              styles.rangeBand,
              { backgroundColor: theme.colors.rangeBackground },
              fillCellOnSelection
                ? { top: 0, bottom: 0 }
                : { top: BAND_CENTER_Y - theme.rangeBandHeight / 2, height: theme.rangeBandHeight },
              // Cap the pill at the endpoint circle (half a badge in from centre)
              // instead of spilling to the cell edge, so no band shows beside it.
              !fillCellOnSelection &&
                isRangeStart && {
                  left: "50%",
                  marginLeft: -DATE_BADGE_HEIGHT / 2,
                  borderTopLeftRadius: theme.rangeBandHeight / 2,
                  borderBottomLeftRadius: theme.rangeBandHeight / 2,
                },
              !fillCellOnSelection &&
                isRangeEnd && {
                  right: "50%",
                  marginRight: -DATE_BADGE_HEIGHT / 2,
                  borderTopRightRadius: theme.rangeBandHeight / 2,
                  borderBottomRightRadius: theme.rangeBandHeight / 2,
                },
            ]}
          />
        ) : null}
        {renderCustomDateForMonth ? (
          renderCustomDateForMonth(day)
        ) : (
          <View
            style={[
              styles.dateBadge,
              showGrid && styles.dateBadgeEvents,
              isFilledBadge && {
                backgroundColor: isHighlighted
                  ? theme.colors.todayBackground
                  : theme.colors.selectedBackground,
                borderRadius: theme.todayBadgeRadius,
              },
              isHovered &&
                !isFilledBadge && {
                  backgroundColor: theme.colors.hoverBackground,
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
    <View style={styles.root}>
      {showTitle ? (
        <Text style={[styles.title, { color: theme.colors.text }]} allowFontScaling={false}>
          {format(date, "MMMM yyyy", locale ? { locale } : undefined)}
        </Text>
      ) : null}
      {showWeekdays ? (
        <View style={styles.weekdayHeader}>
          {weekdayLabels.map((day) => (
            <Text
              key={day.toISOString()}
              style={[theme.text.weekday, styles.weekdayLabel, { color: theme.colors.textMuted }]}
              allowFontScaling={false}
            >
              {format(day, "EEE", { locale })}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.container} onLayout={handleLayout}>
        {weeks.map((week) => (
          <View style={styles.weekRow} key={week[0].toISOString()}>
            {week.map((day) => renderDay(day))}
          </View>
        ))}
      </View>
    </View>
  );
}

export const MonthView = memo(MonthViewInner) as typeof MonthViewInner;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Matches the dom MonthView title: "MMMM yyyy" above the grid.
  title: {
    fontSize: 17,
    fontWeight: "700",
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
  },
  dayCellEvents: {
    alignItems: "stretch",
  },
  dateBadge: {
    justifyContent: "center",
    alignItems: "center",
    height: 24,
    width: 24,
  },
  dateBadgeEvents: {
    alignSelf: "flex-end",
    marginRight: 4,
  },
  rangeBand: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  monthEvent: {
    marginHorizontal: 4,
  },
  moreLabel: {
    marginTop: 2,
    marginHorizontal: 4,
  },
});
