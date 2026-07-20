import { format, startOfDay, type Locale } from "date-fns";
import { memo, type ReactElement, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, WeekStartsOn } from "../types";
import { createSlots, type SlotStyleProps } from "../utils/slots";
import {
  buildMonthWeeks,
  getIsToday,
  getWeekDays,
  getYearMonths,
  groupEventsByDay,
  isSameCalendarDay,
  weekdayFormatToken,
} from "@super-calendar/core";

/**
 * The styleable parts of {@link YearView}. `dayText` and `eventDot` are the
 * text/marker inside a day cell (React Native text colour doesn't inherit).
 */
export type YearViewSlot =
  | "grid"
  | "month"
  | "monthTitle"
  | "weekdays"
  | "weekday"
  | "week"
  | "day"
  | "dayText"
  | "eventDot";

/** Props for {@link YearView}, the twelve mini-month year grid. */
export type YearViewProps<T = unknown> = SlotStyleProps<YearViewSlot> & {
  /** Any date inside the year to render. */
  date: Date;
  /** Days holding at least one event get a dot. Omit for a plain year. */
  events?: CalendarEvent<T>[];
  weekStartsOn: WeekStartsOn;
  locale?: Locale;
  /** Highlight this date instead of the real "today". */
  activeDate?: Date;
  /**
   * Smallest width a mini month may take before the grid drops a column
   * (default 150). The grid fits 2–4 columns from the measured width.
   */
  minMonthWidth?: number;
  /** Tap a day cell (e.g. to drill into the day or month view). */
  onPressDay?: (date: Date) => void;
  /** Tap a month's title (e.g. to jump to that month's view). */
  onPressMonth?: (month: Date) => void;
};

// Seed before the first layout pass so the grid renders immediately (and in
// tests, where onLayout never fires).
const FALLBACK_COLUMNS = 3;

function YearViewInner<T>({
  date,
  events,
  weekStartsOn,
  locale,
  activeDate,
  minMonthWidth = 150,
  onPressDay,
  onPressMonth,
  classNames,
  styles: styleOverrides,
}: YearViewProps<T>): ReactElement {
  const theme = useCalendarTheme();
  const slot = createSlots<YearViewSlot>({ classNames, styles: styleOverrides });

  const [columns, setColumns] = useState(FALLBACK_COLUMNS);
  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    setColumns(Math.max(2, Math.min(4, Math.floor(width / minMonthWidth))));
  };

  const months = useMemo(() => getYearMonths(date), [date]);
  // Weekday initials for one shared header per mini month.
  const weekdayLabels = useMemo(
    () =>
      getWeekDays(date, weekStartsOn).map((d) =>
        format(d, weekdayFormatToken("narrow"), { locale }),
      ),
    [date, weekStartsOn, locale],
  );
  // Days that hold at least one event, keyed like `groupEventsByDay`.
  const eventDays = useMemo(
    () => new Set(events && events.length > 0 ? groupEventsByDay(events).keys() : []),
    [events],
  );

  return (
    <ScrollView onLayout={handleLayout} showsVerticalScrollIndicator>
      <View {...slot("grid", { base: styles.grid })}>
        {months.map((month) => {
          const weeks = buildMonthWeeks(month, weekStartsOn);
          const title = format(month, "MMMM", { locale });
          const monthLabel = format(month, "MMMM yyyy", { locale });
          const titleText = (
            <Text
              {...slot("monthTitle", {
                base: styles.monthTitle,
                themed: [styles.monthTitleText, { color: theme.colors.todayBackground }],
              })}
              allowFontScaling={false}
            >
              {title}
            </Text>
          );
          return (
            <View
              key={month.toISOString()}
              {...slot("month", { base: [styles.month, { width: `${100 / columns}%` }] })}
            >
              {onPressMonth ? (
                <Pressable
                  onPress={() => onPressMonth(month)}
                  accessibilityRole="button"
                  accessibilityLabel={monthLabel}
                >
                  {titleText}
                </Pressable>
              ) : (
                <View accessible accessibilityRole="header" accessibilityLabel={monthLabel}>
                  {titleText}
                </View>
              )}
              {/* Decorative initials: repeating 84 single letters across the twelve
                  mini months would drown a screen reader, so hide the rows (the
                  day cells carry full date labels). */}
              <View
                {...slot("weekdays", { base: styles.weekdays })}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {weekdayLabels.map((label, i) => (
                  <Text
                    key={i}
                    {...slot("weekday", {
                      base: styles.weekday,
                      themed: [styles.weekdayText, { color: theme.colors.textMuted }],
                    })}
                    allowFontScaling={false}
                  >
                    {label}
                  </Text>
                ))}
              </View>
              {weeks.map((week) => (
                <View key={week[0].toISOString()} {...slot("week", { base: styles.week })}>
                  {week.map((day) => {
                    // Adjacent-month days keep the grid shape but stay blank,
                    // like the mini months of other year views.
                    if (day.getMonth() !== month.getMonth()) {
                      return <View key={day.toISOString()} style={styles.day} />;
                    }
                    const isHighlighted = activeDate
                      ? isSameCalendarDay(day, activeDate)
                      : getIsToday(day);
                    const hasEvents = eventDays.has(startOfDay(day).toISOString());
                    const label = `${format(day, "EEEE, d LLLL yyyy", { locale })}${
                      getIsToday(day) ? ", today" : ""
                    }${hasEvents ? ", has events" : ""}`;
                    const daySlot = slot("day", {
                      base: styles.day,
                      themed: isHighlighted
                        ? {
                            backgroundColor: theme.colors.todayBackground,
                            borderRadius: theme.todayBadgeRadius,
                          }
                        : undefined,
                    });
                    const content = (
                      <>
                        <Text
                          {...slot("dayText", {
                            themed: [
                              styles.dayText,
                              {
                                color: isHighlighted ? theme.colors.todayText : theme.colors.text,
                              },
                            ],
                          })}
                          allowFontScaling={false}
                        >
                          {day.getDate()}
                        </Text>
                        {hasEvents ? (
                          <View
                            {...slot("eventDot", {
                              base: styles.eventDot,
                              themed: {
                                backgroundColor: isHighlighted
                                  ? theme.colors.todayText
                                  : theme.colors.todayBackground,
                              },
                            })}
                          />
                        ) : null}
                      </>
                    );
                    return onPressDay ? (
                      <Pressable
                        key={day.toISOString()}
                        onPress={() => onPressDay(day)}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        {...daySlot}
                      >
                        {content}
                      </Pressable>
                    ) : (
                      <View
                        key={day.toISOString()}
                        accessible
                        accessibilityLabel={label}
                        {...daySlot}
                      >
                        {content}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * A year at a glance: the twelve months as compact mini grids, with today
 * highlighted and a dot under days that hold events. Tap a day or a month
 * title to drill into a denser view. It's the view `Calendar` renders for
 * `mode="year"`.
 *
 * @example
 * ```tsx
 * import { YearView } from "@super-calendar/native";
 *
 * <YearView
 *   date={new Date()}
 *   events={events}
 *   weekStartsOn={1}
 *   onPressDay={(day) => console.log(day)}
 * />
 * ```
 */
export const YearView = memo(YearViewInner) as typeof YearViewInner;

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap" },
  month: { padding: 8 },
  // Structural layout / themed typography split per slot, so a slot class can
  // replace the look without breaking the layout.
  monthTitle: { paddingBottom: 4 },
  monthTitleText: { fontSize: 13, fontWeight: "700" },
  weekdays: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center" },
  weekdayText: { fontSize: 9, fontWeight: "600" },
  week: { flexDirection: "row" },
  day: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 11 },
  eventDot: { position: "absolute", bottom: 1, width: 3, height: 3, borderRadius: 2 },
});
