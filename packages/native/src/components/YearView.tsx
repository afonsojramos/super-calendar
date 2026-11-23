import { format, startOfDay, type Locale } from "date-fns";
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ScrollViewProps,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS, type SharedValue, useSharedValue } from "react-native-reanimated";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, WeekStartsOn } from "../types";
import { createSlots, type SlotStyleProps } from "../utils/slots";
import {
  bandRounding,
  buildMonthWeeks,
  type DateRange,
  dayBadgeKind,
  monthCreateRange,
  daySelectionState,
  getIsToday,
  nowInTimeZone,
  filterHiddenDays,
  getWeekDays,
  getYearMonths,
  groupEventsByDay,
  isBackgroundEvent,
  isDateSelectable,
  isSameCalendarDay,
  rangeBandKind,
  weekdayFormatToken,
  type CalendarLabels,
  dayAccessibilityLabel,
  resolveCalendarLabels,
} from "@super-calendar/core";

const isWeb = Platform.OS === "web";
// Hold before a year-grid drag takes over, so a tap still opens the day.
const DRAG_HOLD_MS = 400;

/**
 * The styleable parts of {@link YearView}. `dayText` and `eventDot` are the
 * text/marker inside a day cell (React Native text colour doesn't inherit);
 * `dayBadge` is the round highlight behind the number and `rangeBand` the
 * selection strip behind it.
 */
export type YearViewSlot =
  | "grid"
  | "month"
  | "monthTitle"
  | "weekdays"
  | "weekday"
  | "week"
  | "day"
  | "dayBadge"
  | "dayText"
  | "rangeBand"
  | "eventDot";

/** Props for {@link YearView}, the twelve mini-month year grid. */
export type YearViewProps<T = unknown> = SlotStyleProps<YearViewSlot> & {
  /** Any date inside the year to render. */
  date: Date;
  /** Days holding at least one event get a dot. Omit for a plain year. */
  events?: CalendarEvent<T>[];
  weekStartsOn: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  locale?: Locale;
  /**
   * The instant whose calendar day is highlighted as today. Defaults to the
   * device clock, and is read in `timeZone` when one is set.
   */
  now?: Date;
  /** Highlight today as it is in this IANA time zone (default: the device's). */
  timeZone?: string;
  /** Translations for the screen-reader words; omitted keys use English. */
  labels?: Partial<CalendarLabels>;
  /** Highlight this date instead of the real "today". */
  activeDate?: Date;
  /** A selected span: endpoints get a filled badge, the days between get the range band. */
  selectedRange?: DateRange;
  /** Discrete selected days, drawn with a filled badge. */
  selectedDates?: Date[];
  /** Earliest selectable day (inclusive); earlier days render disabled. */
  minDate?: Date;
  /** Latest selectable day (inclusive); later days render disabled. */
  maxDate?: Date;
  /** Return true to render a specific day disabled (dimmed, taps ignored). */
  isDateDisabled?: (date: Date) => boolean;
  /**
   * Smallest width a mini month may take before the grid drops a column
   * (default 150). The grid fits 2–4 columns from the measured width.
   */
  minMonthWidth?: number;
  /** Tap a day cell (e.g. to drill into the day or month view). */
  onPressDay?: (date: Date) => void;
  /** Tap a month's title (e.g. to jump to that month's view). */
  onPressMonth?: (month: Date) => void;
  /**
   * Enables drag-to-select and reports the swept span live, as the ordered
   * inclusive `[start, end]` days (both at midnight). Pair it with
   * `useDateRange`'s `selectRange` to drive `selectedRange`. Fires on every day the
   * drag crosses, so the highlight follows it; `onCreateEvent` (when also set)
   * fires once on release. Either handler enables the same sweep: hold a day and
   * drag on a device, press and drag on the web. A sweep can run across mini
   * months.
   */
  onSelectDrag?: (start: Date, end: Date) => void;
  /**
   * Enables drag-to-create: sweep across days and release to fire this with the
   * all-day range (`start` at midnight of the first day, `end` at midnight after
   * the last, exclusive). A plain tap still fires `onPressDay`, not this.
   */
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Pull-to-refresh control, mounted on the year's scroll view. */
  refreshControl?: ScrollViewProps["refreshControl"];
};

// Seed before the first layout pass so the grid renders immediately (and in
// tests, where onLayout never fires).
const FALLBACK_COLUMNS = 3;

// A mini month's week rows, in the year grid's coordinates.
type GridBox = { x: number; y: number; width: number; height: number };
// Per mini month, its cells row by row: the day's midnight timestamp, or -1 for
// a blank adjacent-month cell or an unselectable day, which a sweep skips.
type DayTable = { cols: number; days: number[] }[];

// The day under a year-grid point, or -1 over a gap, a title, a skipped cell or
// a month not yet measured. Declared before the components whose worklets
// capture it.
function sweepDayAt(boxes: (GridBox | null)[], table: DayTable, x: number, y: number): number {
  "worklet";
  for (let month = 0; month < table.length; month++) {
    const box = boxes[month];
    const { cols, days } = table[month];
    if (!box || box.width <= 0 || box.height <= 0 || cols === 0) continue;
    if (x < box.x || x >= box.x + box.width || y < box.y || y >= box.y + box.height) continue;
    const rows = days.length / cols;
    const row = Math.min(rows - 1, Math.floor((y - box.y) / (box.height / rows)));
    const col = Math.min(cols - 1, Math.floor((x - box.x) / (box.width / cols)));
    return days[row * cols + col];
  }
  return -1;
}

function YearViewInner<T>({
  date,
  events,
  weekStartsOn,
  hiddenDays,
  locale,
  now,
  timeZone,
  labels: labelsProp,
  activeDate,
  selectedRange,
  selectedDates,
  minDate,
  maxDate,
  isDateDisabled,
  minMonthWidth = 150,
  onPressDay,
  onPressMonth,
  onSelectDrag,
  onCreateEvent,
  refreshControl,
  classNames,
  styles: styleOverrides,
}: YearViewProps<T>): ReactElement {
  const theme = useCalendarTheme();
  const labels = useMemo(() => resolveCalendarLabels(labelsProp), [labelsProp]);
  const slot = createSlots<YearViewSlot>({ classNames, styles: styleOverrides });

  const [columns, setColumns] = useState(FALLBACK_COLUMNS);
  const handleLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) return;
    setColumns(Math.max(2, Math.min(4, Math.floor(width / minMonthWidth))));
  };

  const today = nowInTimeZone(now, timeZone);
  const months = useMemo(() => getYearMonths(date), [date]);
  // Each mini month's week rows, built once per year rather than per render, so
  // the drag hit-test (and the pan it is built into) keeps a stable identity.
  const monthWeeks = useMemo(
    () => months.map((month) => buildMonthWeeks(month, weekStartsOn, { hiddenDays })),
    [months, weekStartsOn, hiddenDays],
  );
  // Weekday initials for one shared header per mini month.
  const weekdayLabels = useMemo(
    () =>
      filterHiddenDays(getWeekDays(date, weekStartsOn), hiddenDays).map((d) =>
        format(d, weekdayFormatToken("narrow"), { locale }),
      ),
    [date, weekStartsOn, locale, hiddenDays],
  );
  // Days that hold at least one event, keyed like `groupEventsByDay`.
  const eventDays = useMemo(
    () =>
      new Set(
        events && events.length > 0
          ? groupEventsByDay(events.filter((e) => !isBackgroundEvent(e))).keys()
          : [],
      ),
    [events],
  );

  // ---- drag-to-select / create ---------------------------------------------
  // One sweep gesture, reported live through `onSelectDrag` and committed to
  // `onCreateEvent`, which can run across mini months. Native holds a day through
  // a pan over its mini month's grid, then hit-tests the finger against every
  // mini month's measured box; the web drives it from the cells' own pointer events.
  const sweepEnabled = onSelectDrag != null || onCreateEvent != null;
  const [sweep, setSweep] = useState<{ anchor: number; hover: number } | null>(null);
  const sweepRef = useRef(sweep);
  sweepRef.current = sweep;
  const movedRef = useRef(false);
  // Web only: a committed sweep has to swallow the click the browser fires next,
  // so it doesn't also open the day it landed on. A pan never leaves a press
  // behind, so the flag would otherwise outlive its interaction and eat the next
  // unrelated tap; every fresh sweep clears it. Mirrors MonthView.
  const suppressPressRef = useRef(false);

  const isSelectable = useCallback(
    (day: Date) => isDateSelectable(day, { minDate, maxDate, isDateDisabled }),
    [minDate, maxDate, isDateDisabled],
  );
  const beginSweep = useCallback((day: Date) => {
    const time = startOfDay(day).getTime();
    suppressPressRef.current = false;
    movedRef.current = false;
    setSweep({ anchor: time, hover: time });
  }, []);
  const extendSweep = useCallback(
    (day: Date) => {
      const current = sweepRef.current;
      if (!current || !isSelectable(day)) return;
      const time = startOfDay(day).getTime();
      if (time === current.hover) return;
      movedRef.current = true;
      setSweep((c) => (c ? { ...c, hover: time } : c));
      const [lo, hi] = current.anchor <= time ? [current.anchor, time] : [time, current.anchor];
      onSelectDrag?.(new Date(lo), new Date(hi));
    },
    [isSelectable, onSelectDrag],
  );
  const finishSweep = useCallback(() => {
    const current = sweepRef.current;
    setSweep(null);
    if (!current || !movedRef.current) return;
    if (isWeb) suppressPressRef.current = true;
    const range = monthCreateRange(new Date(current.anchor), new Date(current.hover));
    onCreateEvent?.(range.start, range.end);
  }, [onCreateEvent]);

  // Native: what the sweep worklets hit-test against, kept on the UI thread so a
  // drag only crosses to JavaScript when the day under the finger changes.
  const nativeSweep = sweepEnabled && !isWeb;
  const sweepTable = useSharedValue<DayTable>([]);
  const sweepBoxes = useSharedValue<(GridBox | null)[]>([]);
  const dayTable = useMemo<DayTable>(
    () =>
      nativeSweep
        ? months.map((month, i) => {
            const weeks = monthWeeks[i];
            return {
              cols: weeks[0]?.length ?? 0,
              days: weeks
                .flat()
                .map((day) =>
                  day.getMonth() === month.getMonth() && isSelectable(day)
                    ? startOfDay(day).getTime()
                    : -1,
                ),
            };
          })
        : [],
    [nativeSweep, months, monthWeeks, isSelectable],
  );
  useEffect(() => {
    sweepTable.value = dayTable;
  }, [sweepTable, dayTable]);
  // Each mini month's box inside the year grid, and its week rows' box inside
  // that; their sum places the rows in the year grid's coordinates. Measured on
  // native even before a sweep handler arrives, since a view that has already
  // laid out reports no layout to a newly attached `onLayout`.
  const monthBoxes = useRef<(GridBox | null)[]>([]);
  const rowBoxes = useRef<(GridBox | null)[]>([]);
  const measure = useCallback(
    (store: "month" | "rows", index: number, layout: GridBox) => {
      (store === "month" ? monthBoxes : rowBoxes).current[index] = layout;
      sweepBoxes.value = months.map((_, i) => {
        const outer = monthBoxes.current[i];
        const inner = rowBoxes.current[i];
        return outer && inner
          ? { x: outer.x + inner.x, y: outer.y + inner.y, width: inner.width, height: inner.height }
          : null;
      });
    },
    [sweepBoxes, months],
  );
  const measureMonth = isWeb ? undefined : measure;
  // The worklets call JavaScript through these stable functions, so a re-render
  // (one per swept day) never rebuilds a pan and cancels the drag running in it.
  const sweepHandlers = useRef({ beginSweep, extendSweep, finishSweep });
  sweepHandlers.current = { beginSweep, extendSweep, finishSweep };
  const sweepCallbacks = useMemo(
    () => ({
      begin: (time: number) => sweepHandlers.current.beginSweep(new Date(time)),
      extend: (time: number) => sweepHandlers.current.extendSweep(new Date(time)),
      finish: () => sweepHandlers.current.finishSweep(),
    }),
    [],
  );
  const sweepActive = useSharedValue(0);
  const sweepHover = useSharedValue(-1);

  // Web: a released pointer ends the sweep wherever it lands.
  useEffect(() => {
    if (!isWeb || !sweepEnabled) return;
    const target = globalThis as unknown as {
      addEventListener?: (type: string, cb: () => void) => void;
      removeEventListener?: (type: string, cb: () => void) => void;
    };
    target.addEventListener?.("pointerup", finishSweep);
    return () => target.removeEventListener?.("pointerup", finishSweep);
  }, [sweepEnabled, finishSweep]);

  // Swallow the click trailing a committed web sweep, so it doesn't open a day too.
  const pressDay = useCallback(
    (day: Date) => {
      if (suppressPressRef.current) {
        suppressPressRef.current = false;
        return;
      }
      onPressDay?.(day);
    },
    [onPressDay],
  );

  return (
    <ScrollView
      onLayout={handleLayout}
      showsVerticalScrollIndicator
      // Native only: once the hold has armed a sweep, stop the list scrolling
      // under the finger. On the web a press arms it immediately, so freezing
      // there would cost every touch scroll; the browser arbitrates instead.
      scrollEnabled={isWeb || sweep == null}
      refreshControl={refreshControl}
    >
      <View {...slot("grid", { base: styles.grid })}>
        {months.map((month, monthIndex) => {
          const weeks = monthWeeks[monthIndex];
          const title = format(month, "MMMM", { locale });
          const monthLabel = format(month, "MMMM yyyy", { locale });
          const titleText = (
            <Text
              {...slot<TextStyle>("monthTitle", {
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
              onLayout={
                measureMonth
                  ? (event) => measureMonth("month", monthIndex, event.nativeEvent.layout)
                  : undefined
              }
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
                    {...slot<TextStyle>("weekday", {
                      base: styles.weekday,
                      themed: [styles.weekdayText, { color: theme.colors.textMuted }],
                    })}
                    allowFontScaling={false}
                  >
                    {label}
                  </Text>
                ))}
              </View>
              <MiniMonthGrid
                testID={`year-month-grid-${month.getMonth()}`}
                monthIndex={monthIndex}
                sweepEnabled={nativeSweep}
                table={sweepTable}
                boxes={sweepBoxes}
                active={sweepActive}
                hover={sweepHover}
                callbacks={sweepCallbacks}
                onMeasure={measureMonth}
              >
                {weeks.map((week) => (
                  <View key={week[0].toISOString()} {...slot("week", { base: styles.week })}>
                    {week.map((day) => {
                      // Adjacent-month days keep the grid shape but stay blank,
                      // like the mini months of other year views.
                      if (day.getMonth() !== month.getMonth()) {
                        return <View key={day.toISOString()} style={styles.day} />;
                      }
                      const isToday = getIsToday(day, today);
                      const isHighlighted = activeDate
                        ? isSameCalendarDay(day, activeDate)
                        : isToday;
                      const hasEvents = eventDays.has(startOfDay(day).toISOString());
                      // Selection/disabled flags come from core, so the year grid
                      // can't disagree with the month grid about a day's state.
                      const state = daySelectionState(
                        day,
                        { selectedDates, selectedRange },
                        { minDate, maxDate, isDateDisabled },
                      );
                      const dayTime = startOfDay(day).getTime();
                      const inSweep =
                        sweep != null &&
                        dayTime >= Math.min(sweep.anchor, sweep.hover) &&
                        dayTime <= Math.max(sweep.anchor, sweep.hover);
                      const label = dayAccessibilityLabel({
                        dateLabel: format(day, "EEEE, d LLLL yyyy", { locale }),
                        isToday,
                        isSelected: state.isSelected,
                        isDisabled: state.isDisabled,
                        hasEvents,
                        labels,
                      });
                      // Today wins over a selection, matching the month grid.
                      const badge = dayBadgeKind(state, isHighlighted);
                      const daySlot = slot("day", { base: styles.day });
                      // The range draws as a band behind the badges. The mini cells
                      // sit flush in the row, so per-cell segments read as one strip;
                      // only the endpoints round their outer edge.
                      const showBand = rangeBandKind(state, true) !== "none";
                      const rounding = bandRounding(rangeBandKind(state, false));
                      const content = (
                        <>
                          {showBand || inSweep ? (
                            <View
                              {...slot("rangeBand", {
                                base: [
                                  styles.rangeBand,
                                  rounding.start && styles.rangeBandStart,
                                  rounding.end && styles.rangeBandEnd,
                                ],
                                themed: { backgroundColor: theme.colors.rangeBackground },
                              })}
                            />
                          ) : null}
                          <View
                            {...slot("dayBadge", {
                              base: styles.dayBadge,
                              themed:
                                badge === "none"
                                  ? undefined
                                  : {
                                      backgroundColor:
                                        badge === "today"
                                          ? theme.colors.todayBackground
                                          : theme.colors.selectedBackground,
                                      borderRadius: theme.todayBadgeRadius,
                                    },
                            })}
                          >
                            <Text
                              {...slot<TextStyle>("dayText", {
                                themed: [
                                  styles.dayText,
                                  {
                                    color: state.isDisabled
                                      ? theme.colors.textDisabled
                                      : badge === "today"
                                        ? theme.colors.todayText
                                        : badge === "selected"
                                          ? theme.colors.selectedText
                                          : theme.colors.text,
                                  },
                                ],
                              })}
                              allowFontScaling={false}
                            >
                              {day.getDate()}
                            </Text>
                          </View>
                          {hasEvents ? (
                            <View
                              {...slot("eventDot", {
                                base: styles.eventDot,
                                themed: {
                                  backgroundColor:
                                    badge === "none"
                                      ? theme.colors.todayBackground
                                      : theme.colors.todayText,
                                },
                              })}
                            />
                          ) : null}
                        </>
                      );
                      return onPressDay || sweepEnabled ? (
                        <Pressable
                          key={day.toISOString()}
                          onPress={() => pressDay(day)}
                          disabled={state.isDisabled}
                          accessibilityRole="button"
                          accessibilityLabel={label}
                          // Web only: the cells drive the sweep themselves, since a
                          // pan can't reach past the pressables there.
                          {...(isWeb && sweepEnabled
                            ? {
                                onPointerDown: () => {
                                  if (isSelectable(day)) beginSweep(day);
                                },
                                onPointerEnter: () => extendSweep(day),
                              }
                            : null)}
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
              </MiniMonthGrid>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// One mini month's week rows, wrapped in a pan when drag-to-select is on. The
// pan arms on a hold over this month's days, then hit-tests the finger against
// every mini month, so the sweep carries across them. Each month keeps its own
// pan so a hold off the day cells (a title, a gap) never arms one.
function MiniMonthGrid({
  testID,
  monthIndex,
  sweepEnabled,
  table,
  boxes,
  active,
  hover,
  callbacks,
  onMeasure,
  children,
}: {
  testID: string;
  monthIndex: number;
  sweepEnabled: boolean;
  table: SharedValue<DayTable>;
  boxes: SharedValue<(GridBox | null)[]>;
  active: SharedValue<number>;
  hover: SharedValue<number>;
  callbacks: { begin: (time: number) => void; extend: (time: number) => void; finish: () => void };
  onMeasure: ((store: "month" | "rows", index: number, layout: GridBox) => void) | undefined;
  children: React.ReactNode;
}) {
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => onMeasure?.("rows", monthIndex, event.nativeEvent.layout),
    [onMeasure, monthIndex],
  );
  const gesture = useMemo(() => {
    if (!sweepEnabled) return undefined;
    const { begin, extend, finish } = callbacks;
    // The pan reports points relative to this month's rows; the hit-test takes
    // the year grid's coordinates.
    const dayAt = (x: number, y: number) => {
      "worklet";
      const own = boxes.value[monthIndex];
      return own ? sweepDayAt(boxes.value, table.value, own.x + x, own.y + y) : -1;
    };
    return Gesture.Pan()
      .activateAfterLongPress(DRAG_HOLD_MS)
      .onStart((event) => {
        const day = dayAt(event.x, event.y);
        if (day < 0) return;
        active.value = 1;
        hover.value = day;
        runOnJS(begin)(day);
      })
      .onUpdate((event) => {
        if (!active.value) return;
        // Over a gap, a blank cell or a disabled day the sweep keeps its last day.
        const day = dayAt(event.x, event.y);
        if (day < 0 || day === hover.value) return;
        hover.value = day;
        runOnJS(extend)(day);
      })
      .onFinalize(() => {
        if (!active.value) return;
        active.value = 0;
        hover.value = -1;
        runOnJS(finish)();
      });
  }, [sweepEnabled, monthIndex, table, boxes, active, hover, callbacks]);
  const grid = (
    <View testID={testID} onLayout={onMeasure ? onLayout : undefined}>
      {children}
    </View>
  );
  return gesture ? <GestureDetector gesture={gesture}>{grid}</GestureDetector> : grid;
}

/**
 * A year at a glance: the twelve months as compact mini grids, with today
 * highlighted and a dot under days that hold events. Tap a day or a month
 * title to drill into a denser view, or hold and drag to sweep out a date
 * range. It's the view `Calendar` renders for `mode="year"`.
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
  dayBadge: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { fontSize: 11 },
  rangeBand: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  rangeBandStart: { borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  rangeBandEnd: { borderTopRightRadius: 999, borderBottomRightRadius: 999 },
  eventDot: { position: "absolute", bottom: 1, width: 3, height: 3, borderRadius: 2 },
});
