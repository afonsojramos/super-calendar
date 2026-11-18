import { addDays, format, type Locale, isSameMonth, startOfDay } from "date-fns";
import {
  type ComponentRef,
  type ComponentType,
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DimensionValue,
  type LayoutChangeEvent,
  Modal,
  Platform,
  type PointerEvent as RNPointerEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// Web drag-to-select relays cell pointer events up to MonthList; native drag is
// driven by a list-level pan there instead.
const isWeb = Platform.OS === "web";
// React 18 forwards the canonical string; React 19 treats it as a boolean attribute.
const webPreviewProps = isWeb ? { "aria-hidden": true, inert: "inert" } : {};
import { useCalendarTheme } from "../theme";
import { MonthCellProbe, MonthGridSpacingProbe, type MonthCellGeometry } from "./MonthCellProbe";
import type {
  CalendarEvent,
  EventDragHandler,
  EventDragStartHandler,
  EventKeyExtractor,
  MonthDateInfo,
  RenderEvent,
  WeekStartsOn,
} from "../types";
import { createSlots, type SlotStyleProps } from "../utils/slots";
import { withEventAccessibilityLabel } from "../utils/withEventAccessibilityLabel";
import { holdWebDateDrag } from "../utils/holdWebDateDrag";
import { CalendarLabelsContext } from "../utils/labels";
import {
  type CalendarLabels,
  type CreateGhostArgs,
  type DateRange,
  type EventAccessibilityLabeler,
  dayAccessibilityLabel,
  resolveCalendarLabels,
  type WeekdayFormat,
  daySelectionState,
  isDateSelectable,
  useCalendarSelection,
  weekdayFormatToken,
  dayBadgeKind,
  rangeBandKind,
  buildMonthWeeks,
  buildMultiWeekGrid,
  getIsToday,
  nowInTimeZone,
  filterHiddenDays,
  getWeekDays,
  isSameCalendarDay,
  isWeekend,
  monthEventCapacity,
  monthVisibleCount,
  monthExtraLaneColumns,
  monthVisibleBars,
  keepMonthDraftVisible,
  withDraftEventDays,
  layoutMonthWeek,
  type MonthWeekEvents,
  monthCreateRange,
  monthDropBounds,
  overlapsOtherEvents,
  compareDayEvents,
  groupEventsByDay,
  isAllDayEvent,
  isBackgroundEvent,
} from "@super-calendar/core";

// Day-cell metrics, mirrored from the styles below, used to estimate how many
// event chips fit when auto-fitting `maxVisibleEventCount`.
const DAY_CELL_PADDING_TOP = 4;
const DATE_BADGE_HEIGHT = 24;
// Vertical centre of the date badge, where the range band is centered.
const BAND_CENTER_Y = DAY_CELL_PADDING_TOP + DATE_BADGE_HEIGHT / 2;
const CELL_ROW_GAP = 2;
const CHIP_PADDING_V = 2;
const MORE_LABEL_MARGIN_TOP = 2;
// Stable empty layout for the events-free picker (avoids a fresh object per render).
const EMPTY_LAYOUT = { segments: [], laneCount: 0 } as const;
// Horizontal inset of a chip within its cell (mirrors `styles.monthEvent`).
const CHIP_INSET_H = 4;
// Pre-measure fallback so the first paint isn't empty or overflowing.
const FALLBACK_VISIBLE_COUNT = 3;
// Hold this long to start a month drag. Shorter than TouchableOpacity's own
// 500ms long-press so the pan wins the race and the cell's `onLongPressDay`
// doesn't also fire.
const DRAG_LONG_PRESS_MS = 400;
// Opacity of an event bar while it is being dragged to another day.
const DRAGGED_BAR_OPACITY = 0.4;

const numericStyle = (value: number | string | undefined, fallback: number) =>
  typeof value === "number" ? value : fallback;

// The distinct events touching a week row, in the per-day index's sorted order.
// A multi-day event lives in each covered day's bucket, so dedupe by reference.
function collectRowEvents<T>(
  week: Date[],
  eventsByDay: ReadonlyMap<string, CalendarEvent<T>[]>,
): CalendarEvent<T>[] {
  const seen = new Set<CalendarEvent<T>>();
  const out: CalendarEvent<T>[] = [];
  for (const day of week) {
    const list = eventsByDay.get(startOfDay(day).toISOString());
    if (!list) continue;
    for (const event of list) {
      if (!seen.has(event)) {
        seen.add(event);
        out.push(event);
      }
    }
  }
  return out;
}

const pct = (n: number): DimensionValue => `${n}%` as DimensionValue;

// An in-progress month drag: either a day span being swept out for a new event,
// or an existing event being carried to another day.
type MonthDrag<T> =
  | { kind: "create"; anchor: Date; hover: Date }
  | { kind: "move"; event: CalendarEvent<T>; from: Date; to: Date };

// True when `day` falls inside the span swept out so far (either direction).
function isInCreateSpan<T>(drag: MonthDrag<T> | null, day: Date): boolean {
  if (drag?.kind !== "create") return false;
  const time = startOfDay(day).getTime();
  const a = startOfDay(drag.anchor).getTime();
  const b = startOfDay(drag.hover).getTime();
  return time >= Math.min(a, b) && time <= Math.max(a, b);
}

/**
 * The styleable parts of {@link MonthView}. Mirrors the dom renderer's slot
 * names where the structure matches; `dayBadgeText` is native-only (React
 * Native text colour doesn't inherit from the badge). Event chips are styled
 * by `renderEvent` (or the theme), not a slot.
 */
export type MonthViewSlot =
  | "title"
  | "weekdays"
  | "weekday"
  | "grid"
  | "week"
  | "day"
  | "dayBadge"
  | "dayBadgeText"
  | "rangeBand"
  | "createGhost"
  | "more"
  | "morePopover";

/** Props for {@link MonthView}, the single-month grid. */
export type MonthViewProps<T> = SlotStyleProps<MonthViewSlot> & {
  date: Date;
  events: CalendarEvent<T>[];
  /**
   * Max event lanes (stacked rows) shown per week before the rest of a day's
   * events collapse into a "+N more" label. Because multi-day events draw as one
   * bar spanning a lane across the week, this caps lanes per row, not chips per
   * day, so a long bar can push a lightly-booked day's own events into "+N more".
   * Omit to auto-fit as many lanes as the cell height allows (the default); set a
   * number for a fixed cap. Auto-fit assumes the built-in chip size — pass an
   * explicit value when using a custom `renderEvent`.
   */
  maxVisibleEventCount?: number;
  /** Chip and overflow height in pixels; defaults to the theme title height plus padding. */
  chipHeight?: number;
  /** Vertical gap between chip rows in pixels (default 2). */
  chipGap?: number;
  weekStartsOn: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  /** Weekday header label width: `narrow` ("M"), `short` ("Mon", default), or `long` ("Monday"). */
  weekdayFormat?: WeekdayFormat;
  locale?: Locale;
  /**
   * The instant whose calendar day is highlighted as today. Defaults to the
   * device clock, and is read in `timeZone` when one is set.
   */
  now?: Date;
  /** Highlight today as it is in this IANA time zone (default: the device's). */
  timeZone?: string;
  /** Sort each day's events by start time before slicing. Default true. */
  sortedMonthView?: boolean;
  /** Template for the overflow label; `{moreCount}` is replaced. Default "{moreCount} More". */
  moreLabel?: string;
  /** Translations for the screen-reader words and gutter text; omitted keys use English. */
  labels?: Partial<CalendarLabels>;
  /** Show dimmed days from adjacent months in the grid. Default true. */
  showAdjacentMonths?: boolean;
  /** Tint weekend day cells with the theme's weekend background. Default true. */
  highlightWeekends?: boolean;
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
  /**
   * Override the screen-reader label for each event chip. Receives the event and a
   * `{ mode: "month", isAllDay, ampm: false }` context; return the full text to
   * announce. Defaults to the built-in title-and-time label.
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressDay?: (date: Date) => void;
  onLongPressDay?: (date: Date) => void;
  /**
   * Tap an empty day cell. Fires alongside `onPressDay` with the same day at
   * midnight, so one handler can create events across month and week/day modes.
   */
  onPressCell?: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /**
   * Enable drag-to-create: **long-press an empty day** and sweep across others
   * (**press and drag** on the web), then release to fire this with the **all-day**
   * range — `start` at midnight of the first day, `end` at midnight after the last
   * (exclusive). A sweep that never leaves its day still yields that one day. A
   * plain tap fires `onPressDay`/`onPressCell` instead.
   */
  onCreateEvent?: (start: Date, end: Date) => void;
  /**
   * Content inside the drag-to-create preview. Receives the full all-day range,
   * with an exclusive end, that `onCreateEvent` would receive on release. A span
   * crossing rows renders the component once per row with the same range.
   * Requires `onCreateEvent`; content is clipped, noninteractive, and hidden
   * from screen readers. Omit to keep the day highlight without preview content.
   */
  renderCreateGhost?: ComponentType<CreateGhostArgs>;
  /**
   * Reports the day span of a create sweep **as it happens**, as the ordered
   * inclusive `[start, end]` days (both at midnight), so a selection highlight can
   * follow the drag instead of appearing only on release. Pair it with
   * `useDateRange`'s `selectRange` to drive `selectedRange`. Enables the sweep on
   * its own, so it works without `onCreateEvent`.
   */
  onSelectDrag?: (start: Date, end: Date) => void;
  /**
   * Enable drag-to-reschedule: **long-press an event bar** and drag it onto
   * another day (**press and drag** on the web). Called on release with the event
   * and its new `start`/`end`, both shifted by the whole days dragged, so the time
   * of day and duration are preserved. Return `false` to reject the drop. Update
   * your own event state in response.
   */
  onDragEvent?: EventDragHandler<T>;
  /**
   * Fired the instant an event is picked up for a month drag, before anything is
   * committed. Use it for haptic feedback. Inert unless `onDragEvent` is also set.
   */
  onDragStart?: EventDragStartHandler<T>;
  /** Allow moving events by default (per-event `startEditable` overrides). Default true. */
  eventStartEditable?: boolean;
  /** Reject a drop that would overlap another event (default true = allowed). */
  eventOverlap?: boolean;
  /**
   * Replace the default date badge in each day cell. Receives the day and its
   * state (`isCurrentMonth`, `isToday`, `isSelected`, `isDisabled`); return your
   * own date label. Event chips and the "+N more" label still render below.
   */
  renderCustomDateForMonth?: (date: Date, info: MonthDateInfo) => React.ReactNode;
};

/**
 * Which rows a {@link DateRows} grid shows. Internal to the package: the public
 * views and pagers adapt their own props to it.
 */
export type DateRowsSource =
  | {
      kind: "month";
      /** Any day within the month to render. */
      date: Date;
      showAdjacentMonths: boolean;
      showSixWeeks: boolean;
    }
  | { kind: "multiweek"; date: Date; numberOfWeeks: number };

/** Props for the private {@link DateRows} grid shared by the public row views. */
export type DateRowsProps<T> = Omit<
  MonthViewProps<T>,
  "date" | "showAdjacentMonths" | "showSixWeeks"
> & { source: DateRowsSource };

function MonthViewInner<T>({
  date,
  showAdjacentMonths = true,
  showSixWeeks = false,
  ...rest
}: MonthViewProps<T>): ReactElement {
  const source = useMemo<DateRowsSource>(
    () => ({ kind: "month", date, showAdjacentMonths, showSixWeeks }),
    [date, showAdjacentMonths, showSixWeeks],
  );
  return <DateRows<T> {...rest} source={source} />;
}

function DateRowsInner<T>({
  source,
  events,
  maxVisibleEventCount,
  chipHeight,
  chipGap: chipGapProp,
  weekStartsOn,
  hiddenDays,
  weekdayFormat = "short",
  locale,
  now,
  timeZone,
  sortedMonthView = true,
  moreLabel = "{moreCount} More",
  labels: labelsProp,
  highlightWeekends = true,
  disableMonthEventCellPress = false,
  isRTL = false,
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
  eventAccessibilityLabel,
  keyExtractor,
  onPressDay,
  onLongPressDay,
  onPressCell,
  onPressEvent,
  onLongPressEvent,
  onPressMore,
  onCreateEvent,
  renderCreateGhost: RenderCreateGhost,
  onSelectDrag,
  onDragEvent,
  onDragStart,
  eventStartEditable = true,
  eventOverlap = true,
  renderCustomDateForMonth,
  onDayPointerDown,
  onDayPointerEnter,
  classNames,
  styles: styleOverrides,
}: DateRowsProps<T>): ReactElement {
  const { date } = source;
  const multiWeek = source.kind === "multiweek";
  const chipGap = chipGapProp ?? CELL_ROW_GAP;
  const defaultCellSpacing = !multiWeek || !classNames?.day;
  // A custom create preview needs lanes even before the first event exists.
  const createContentEnabled = onCreateEvent != null && RenderCreateGhost != null;
  const showGrid = multiWeek || events.length > 0 || createContentEnabled;
  const showAdjacentMonths = source.kind === "month" ? source.showAdjacentMonths : true;
  const showSixWeeks = source.kind === "month" ? source.showSixWeeks : false;
  const numberOfWeeks = source.kind === "multiweek" ? source.numberOfWeeks : undefined;
  const theme = useCalendarTheme();
  const slot = useMemo(
    () => createSlots<MonthViewSlot>({ classNames, styles: styleOverrides }),
    [classNames, styleOverrides],
  );
  const labels = useMemo(() => resolveCalendarLabels(labelsProp), [labelsProp]);
  // Selection comes from context (so cached pages still repaint), but explicit
  // props win for direct/standalone use of MonthView.
  const selection = useCalendarSelection();
  const selectedDates = selectedDatesProp ?? selection.selectedDates;
  const selectedRange = selectedRangeProp ?? selection.selectedRange;
  const minDate = minDateProp ?? selection.minDate;
  const maxDate = maxDateProp ?? selection.maxDate;
  const isDateDisabled = isDateDisabledProp ?? selection.isDateDisabled;
  // Month cells never show a time, so the override context reports 24h (ampm:false).
  const RenderEventComponent = useMemo(
    () => withEventAccessibilityLabel(renderEvent, eventAccessibilityLabel, false),
    [renderEvent, eventAccessibilityLabel],
  );
  // Measured grid box: the height auto-fits the event chips per cell, and both
  // dimensions map a drag's position onto a day cell.
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const gridHeight = gridSize.height;
  const weekTops = useRef<number[]>([]);
  const [drawnWeek, setDrawnWeek] = useState({ width: 0, height: 0 });
  // Web-only hover highlight on the day badge (mouse pointers); stays null on
  // touch/native, so it never re-renders there. Mirrors the dom renderer.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  // Picker: which day is being pressed, so the tap dims only its badge (the circle),
  // not the whole cell background. Stays null in the events calendar.
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  // Built-in "+N more" popover: opens when the consumer doesn't handle
  // `onPressMore` themselves; lists the day's events in a modal card.
  const [moreOpenFor, setMoreOpenFor] = useState<{
    day: Date;
    events: CalendarEvent<T>[];
  } | null>(null);

  const today = nowInTimeZone(now, timeZone);
  const multiWeekGrid = useMemo(
    () =>
      numberOfWeeks === undefined
        ? null
        : buildMultiWeekGrid(date, { numberOfWeeks, weekStartsOn, isRTL, hiddenDays }),
    [date, numberOfWeeks, weekStartsOn, isRTL, hiddenDays],
  );
  const weeks = useMemo(
    () =>
      multiWeekGrid
        ? multiWeekGrid.weeks.map((week) => week.days.map((day) => day.date))
        : buildMonthWeeks(date, weekStartsOn, { showSixWeeks, isRTL, hiddenDays }),
    [multiWeekGrid, date, weekStartsOn, isRTL, showSixWeeks, hiddenDays],
  );
  const title = multiWeekGrid
    ? `${format(multiWeekGrid.visibleRange.start, "PP", { locale })} – ${format(addDays(multiWeekGrid.visibleRange.endExclusive, -1), "PP", { locale })}`
    : format(date, "MMMM yyyy", { locale });
  const windowKey = multiWeekGrid
    ? `${multiWeekGrid.period.start.getTime()}:${numberOfWeeks}:${hiddenDays?.join(",")}:${isRTL}`
    : null;

  // Weekday labels for the header row (any week works; reuse this month). Reversed
  // in RTL so they line up with the mirrored day columns.
  const weekdayLabels = useMemo(() => {
    const days = filterHiddenDays(getWeekDays(date, weekStartsOn), hiddenDays);
    return isRTL ? days.reverse() : days;
  }, [date, weekStartsOn, isRTL, hiddenDays]);

  // The built-in chip's height, from the theme's title type. Shared by the
  // capacity estimate, the cells' lane spacers and the spanning-bar overlay so the
  // bars line up exactly with the rows the cells reserve for them.
  const laneChipHeight = useMemo(() => {
    const fontSize = numericStyle(theme.text.eventTitle.fontSize, 12);
    const lineHeight = numericStyle(theme.text.eventTitle.lineHeight, Math.ceil(fontSize * 1.3));
    return chipHeight ?? lineHeight + CHIP_PADDING_V * 2;
  }, [theme, chipHeight]);
  // The one-line "+N more" label, resolved once so the cells draw it with the same
  // style the row height is measured from: theme, chip height and `styles.more`.
  const moreSlot = slot<TextStyle>("more", {
    base: [styles.moreLabel, chipHeight != null && { height: chipHeight }],
    themed: [theme.text.more, { color: theme.colors.textMuted }],
  });
  // The label's vertical extent below the last lane, margins included. A hidden
  // copy of the label is measured once laid out (see `moreProbe`), which covers
  // borders, minimum heights and class names; until then, estimate it from the
  // style: margins, then a set height, else one line plus padding.
  const [measuredMoreArea, setMeasuredMoreArea] = useState(0);
  const moreLabelArea =
    measuredMoreArea ||
    (() => {
      const style = StyleSheet.flatten(moreSlot.style) ?? {};
      const edge = (value: unknown) => (typeof value === "number" ? value : 0);
      const margin =
        edge(style.marginTop ?? style.marginVertical ?? style.margin) +
        edge(style.marginBottom ?? style.marginVertical ?? style.margin);
      const padding =
        edge(style.paddingTop ?? style.paddingVertical ?? style.padding) +
        edge(style.paddingBottom ?? style.paddingVertical ?? style.padding);
      const line = numericStyle(
        style.lineHeight,
        Math.ceil(numericStyle(style.fontSize, 11) * 1.3),
      );
      return margin + (typeof style.height === "number" ? style.height : line + padding);
    })();
  // A row draws its date, then each lane with the gap after it, then the label when
  // events overflow. A fixed cap shows all its lanes and the label; the auto-fit
  // capacity gives up lanes for the label but always keeps one.
  // The tallest date (built-in badge or custom) among the shown days, measured as
  // multi-week cells lay out, so a fixed row never clips a date restyled or
  // rendered taller than the 24pt badge. Kept per day and read for the shown days
  // only, so it shrinks when a date does or leaves the view.
  const [daySizes, setDaySizes] = useState<Record<string, { width?: number; dateHeight?: number }>>(
    {},
  );
  const shownDayKeys = useMemo(
    () => new Set(weeks.flat().map((day) => day.toISOString())),
    [weeks],
  );
  const recordDaySize = (dayKey: string, dimension: "width" | "dateHeight", size: number) =>
    setDaySizes((previous) => {
      if (previous[dayKey]?.[dimension] === size) return previous;
      const next: typeof previous = { [dayKey]: { ...previous[dayKey], [dimension]: size } };
      for (const key in previous) {
        if (key !== dayKey && shownDayKeys.has(key)) next[key] = previous[key];
      }
      return next;
    });
  const dateHeight = useMemo(() => {
    if (!multiWeek) return DATE_BADGE_HEIGHT;
    let tallest = DATE_BADGE_HEIGHT;
    for (const key of shownDayKeys) tallest = Math.max(tallest, daySizes[key]?.dateHeight ?? 0);
    return tallest;
  }, [multiWeek, daySizes, shownDayKeys]);
  const dayCellBase = useMemo(
    () => [
      styles.dayCell,
      defaultCellSpacing && styles.dayCellPadding,
      (defaultCellSpacing || chipGapProp != null) && { gap: chipGap },
      showGrid && styles.dayCellEvents,
    ],
    [defaultCellSpacing, chipGapProp, chipGap, showGrid],
  );
  const dayCellLines = useMemo(
    () =>
      showGrid && {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.gridLine,
      },
    [showGrid, theme.colors.gridLine],
  );
  const probeDay = useMemo(
    () => slot("day", { base: dayCellBase, themed: [dayCellLines, theme.containers.dayCell] }),
    [slot, dayCellBase, dayCellLines, theme.containers.dayCell],
  );
  const probeWeek = useMemo(
    () => slot("week", { base: styles.weekRowFixed, themed: theme.containers.weekRow }),
    [slot, theme.containers.weekRow],
  );
  const cellStyles = useMemo(() => {
    const probes = new Map<string, { style: StyleProp<ViewStyle>; width: number }>();
    const byDay = new Map<string, string>();
    if (multiWeek) {
      const ids = new Map<StyleProp<ViewStyle>, string>();
      for (const week of weeks) {
        for (const day of week) {
          const dayKey = day.toISOString();
          const style = calendarCellStyle?.(day) ?? undefined;
          const styleId = ids.get(style) ?? (style ? dayKey : "default");
          ids.set(style, styleId);
          const width = daySizes[dayKey]?.width ?? 0;
          const id = `${styleId}:${width}`;
          probes.set(id, { style, width });
          byDay.set(dayKey, id);
        }
      }
    }
    return { probes, byDay };
  }, [multiWeek, weeks, calendarCellStyle, daySizes]);
  const [measuredCells, setMeasuredCells] = useState<Record<string, MonthCellGeometry>>({});
  const recordCell = useCallback(
    (id: string, measured: MonthCellGeometry) => {
      setMeasuredCells((previous) => {
        const old = previous[id];
        if (
          old &&
          old.minimumHeight === measured.minimumHeight &&
          old.top === measured.top &&
          old.bottom === measured.bottom &&
          old.gap === measured.gap &&
          old.overlayTop === measured.overlayTop &&
          old.weekMargin === measured.weekMargin &&
          old.weekMarginTop === measured.weekMarginTop
        )
          return previous;
        const next: Record<string, MonthCellGeometry> = { [id]: measured };
        for (const key of cellStyles.probes.keys()) {
          if (key !== id && previous[key]) next[key] = previous[key];
        }
        return next;
      });
    },
    [cellStyles],
  );
  const estimatedCell = useMemo(
    () => ({
      minimumHeight: 0,
      top: defaultCellSpacing
        ? DAY_CELL_PADDING_TOP + (multiWeek ? StyleSheet.hairlineWidth : 0)
        : 0,
      bottom: 0,
      gap: defaultCellSpacing ? chipGap : (chipGapProp ?? 0),
      overlayTop: 0,
      weekMargin: 0,
      weekMarginTop: 0,
    }),
    [multiWeek, defaultCellSpacing, chipGap, chipGapProp],
  );
  const cellGeometry = useMemo(() => {
    let common: MonthCellGeometry | undefined;
    for (const id of cellStyles.probes.keys()) {
      const cell = measuredCells[id] ?? estimatedCell;
      if (!common) common = { ...cell };
      else {
        common.minimumHeight = Math.max(common.minimumHeight, cell.minimumHeight);
        common.top = Math.max(common.top, cell.top);
        common.bottom = Math.max(common.bottom, cell.bottom);
        common.gap = Math.max(common.gap, cell.gap);
      }
    }
    return common ?? estimatedCell;
  }, [cellStyles, measuredCells, estimatedCell]);
  // Hit testing uses the top of the row including its margin. The overlay
  // positions bars from inside the row's border instead.
  const dateArea = cellGeometry.top + dateHeight;
  const cellLaneHeight = laneChipHeight + cellGeometry.gap;
  const laneTop = dateArea + cellGeometry.gap;
  const barTop = laneTop - cellGeometry.overlayTop;
  const contentHeight =
    dateArea +
    cellGeometry.gap +
    cellGeometry.bottom +
    (maxVisibleEventCount != null
      ? Math.max(1, maxVisibleEventCount) * cellLaneHeight + moreLabelArea
      : Math.max(FALLBACK_VISIBLE_COUNT * cellLaneHeight, cellLaneHeight + moreLabelArea));
  const minimumRowHeight = Math.max(contentHeight, cellGeometry.minimumHeight);
  // In a scroll view, rows with an automatic basis can grow with their events.
  // Start each week at the same height and let the grid share the available space.
  const [viewportHeight, setViewportHeight] = useState(0);
  const gridProbe = useMemo(
    () => (multiWeek && (classNames?.grid || styleOverrides?.grid) ? slot("grid") : null),
    [multiWeek, classNames?.grid, styleOverrides?.grid, slot],
  );
  const [gridInnerSpacing, setGridInnerSpacing] = useState(0);
  const [gridOuterSpacing, setGridOuterSpacing] = useState(0);
  const heightForWeeks = viewportHeight - (gridProbe ? gridOuterSpacing : 0);
  const multiWeekRowHeight =
    multiWeek && viewportHeight > 0
      ? Math.max(minimumRowHeight, heightForWeeks / weeks.length) - cellGeometry.weekMargin
      : undefined;
  const rowHeight =
    multiWeek && drawnWeek.height > 0
      ? drawnWeek.height + cellGeometry.weekMargin
      : gridHeight / weeks.length;

  // How many chips fit per cell: a fixed cap when `maxVisibleEventCount` is set,
  // else derived from the measured cell height and the (default) chip metrics.
  const capacity = useMemo(() => {
    if (maxVisibleEventCount != null) {
      return { full: maxVisibleEventCount, withMore: maxVisibleEventCount };
    }
    if (gridHeight <= 0 || weeks.length === 0) {
      return { full: FALLBACK_VISIBLE_COUNT, withMore: FALLBACK_VISIBLE_COUNT };
    }
    // Lanes start below the date (the built-in badge, or a taller custom date) and
    // end above the cell's bottom inset.
    const available = rowHeight - dateArea - cellGeometry.bottom;
    return monthEventCapacity(available, cellLaneHeight, moreLabelArea + cellGeometry.gap);
  }, [
    maxVisibleEventCount,
    gridHeight,
    weeks.length,
    rowHeight,
    dateArea,
    cellGeometry,
    cellLaneHeight,
    moreLabelArea,
  ]);

  // The lanes a week row shows. When the auto-fit capacity leaves room for one lane
  // more than the row shows, a day whose only hidden event sits on that lane draws
  // it in place of a "+1 more" label (see monthExtraLaneColumns).
  const rowLanes = useCallback(
    (rowLayout: MonthWeekEvents<T>, columns: number) => {
      const visibleLanes = monthVisibleCount(rowLayout.laneCount, capacity);
      const extraLane =
        capacity.full > visibleLanes
          ? monthExtraLaneColumns(rowLayout, visibleLanes, columns)
          : Array.from({ length: columns }, () => false);
      return { visibleLanes, extraLane };
    },
    [capacity],
  );

  // Group events by calendar day once per `events` change (shared with the dom
  // renderer via core's `groupEventsByDay`), rather than scanning the whole list
  // inside every one of the (up to) 42 day cells on each render. Multi-day events
  // are indexed under every day they span.
  const eventsByDay = useMemo(() => {
    // Background events shade the time grid; the month grid ignores them.
    const map = groupEventsByDay(events.filter((event) => !isBackgroundEvent(event)));
    if (sortedMonthView) {
      // All-day events head the day, then timed events by start (shared with dom).
      for (const list of map.values()) list.sort(compareDayEvents);
    }
    return map;
  }, [events, sortedMonthView]);

  // Lay out each week row's spanning bars once per data change, not per render.
  const weekLayouts = useMemo(
    () =>
      showGrid
        ? weeks.map((week) => layoutMonthWeek(week, collectRowEvents(week, eventsByDay)))
        : [],
    [showGrid, weeks, eventsByDay],
  );

  // ---- drag to create a day span / reschedule an event ----------------------
  const dragEnabled = onCreateEvent != null || onSelectDrag != null || onDragEvent != null;
  const gridRef = useRef<ComponentRef<typeof View>>(null);
  const heldTouch = useRef<(() => void) | null>(null);
  const heldOrigin = useRef<{ day: Date; event: CalendarEvent<T> | null } | null>(null);
  // The live drag drives the preview; the ref is what the gesture and the web
  // pointer listeners read, so neither has to be rebuilt as the hover day moves
  // (rebuilding the gesture mid-drag would cancel it).
  const [drag, setDrag] = useState<MonthDrag<T> | null>(null);
  const createRange = useMemo(
    () =>
      createContentEnabled && drag?.kind === "create"
        ? monthCreateRange(drag.anchor, drag.hover)
        : null,
    [createContentEnabled, drag],
  );
  // While a create sweep draws its content, lay the rows it covers out with the
  // draft as an all-day event, so it takes the lane the created event will land on
  // and the other bars move aside the same way.
  const draftEvent = useMemo(
    () =>
      createRange
        ? ({
            title: "",
            start: createRange.start,
            end: createRange.end,
            allDay: true,
          } as CalendarEvent<T>)
        : null,
    [createRange],
  );
  const rowLayouts = useMemo(() => {
    if (!draftEvent) return weekLayouts;
    const days = withDraftEventDays(eventsByDay, draftEvent, sortedMonthView);
    return weeks.map((week, index) => {
      const base = weekLayouts[index] ?? EMPTY_LAYOUT;
      if (!week.some((day) => day >= draftEvent.start && day < draftEvent.end)) return base;
      return keepMonthDraftVisible(
        layoutMonthWeek(week, collectRowEvents(week, days)),
        base,
        draftEvent,
        {
          visibleLanes: (laneCount) => monthVisibleCount(laneCount, capacity),
          extraLaneFits: (visibleLanes) => capacity.full > visibleLanes,
        },
      );
    });
  }, [draftEvent, weekLayouts, eventsByDay, sortedMonthView, weeks, capacity]);
  const dragRef = useRef<MonthDrag<T> | null>(null);
  const interactionWindow = useRef(windowKey);
  interactionWindow.current = windowKey;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dragRef.current = null;
    };
  }, []);
  // Whether the pointer has reached a different day than it started on. The web
  // has no long-press to disambiguate, so a create only commits once it moves.
  const movedRef = useRef(false);
  // Web only: a committed drag has to swallow the click the browser fires next,
  // so a reschedule doesn't also open the day (or the event) it landed on.
  const suppressPressRef = useRef(false);

  const applyDrag = useCallback((next: MonthDrag<T> | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);
  useEffect(() => {
    if (windowKey === null) return;
    applyDrag(null);
    setMoreOpenFor(null);
    return () => {
      dragRef.current = null;
    };
  }, [windowKey, applyDrag]);
  useEffect(
    () => () => {
      heldTouch.current?.();
    },
    [windowKey],
  );

  // True when this press is the click trailing a just-committed web drag, which
  // the caller should swallow. Clears the flag so only that one press is eaten.
  const consumeSuppressedPress = useCallback(() => {
    if (!suppressPressRef.current) return false;
    suppressPressRef.current = false;
    return true;
  }, []);

  // `disabled` and `draggable: false` lock an event outright; `startEditable`
  // (per event, falling back to the grid default) allows or blocks a move.
  const canMoveEvent = useCallback(
    (event: CalendarEvent<T>) =>
      !event.disabled && event.draggable !== false && (event.startEditable ?? eventStartEditable),
    [eventStartEditable],
  );
  // Live selection can rerender its parent during a held web gesture. Callback
  // identity changes do not invalidate a still-selectable day or movable event.
  useEffect(() => {
    const origin = heldOrigin.current;
    if (!origin) return;
    const current = dragRef.current;
    const destination = current
      ? current.kind === "create"
        ? current.hover
        : current.to
      : origin.day;
    const constraints = { minDate, maxDate, isDateDisabled };
    if (
      !isDateSelectable(origin.day, constraints) ||
      !isDateSelectable(destination, constraints) ||
      (origin.event
        ? !onDragEvent || !events.includes(origin.event) || !canMoveEvent(origin.event)
        : !onCreateEvent && !onSelectDrag)
    ) {
      heldTouch.current?.();
    }
  });

  // The day under a grid-relative point, plus the event bar drawn there (if any).
  // Returns null for a point on a blanked adjacent-month cell or an unselectable
  // day, so neither can be a drag's origin or its drop target.
  const hitTest = useCallback(
    (x: number, y: number): { day: Date; event: CalendarEvent<T> | null } | null => {
      const { width, height } = gridSize;
      if (width <= 0 || height <= 0 || weeks.length === 0) return null;
      let row = Math.min(weeks.length - 1, Math.max(0, Math.floor(y / rowHeight)));
      let rowTop = row * rowHeight;
      if (multiWeek) {
        // A styled grid can have padding, space between weeks, or overflowing rows.
        // Web layout notifications can miss a move that does not resize the row.
        const grid =
          isWeb && typeof Element !== "undefined" && gridRef.current instanceof Element
            ? gridRef.current
            : null;
        const gridTop = grid?.getBoundingClientRect().top ?? 0;
        const topOf = (index: number) => {
          const node = grid?.children[index];
          const borderTop = node
            ? node.getBoundingClientRect().top - gridTop
            : weekTops.current[index];
          return borderTop == null ? index * rowHeight : borderTop - cellGeometry.weekMarginTop;
        };
        row = weekAtOffset(y, weeks.length, topOf);
        rowTop = topOf(row);
      }
      const cols = weeks[row].length;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(x / (width / cols))));
      const day = weeks[row][col];
      if (!day) return null;
      if (!showAdjacentMonths && !isSameMonth(day, date)) return null;
      if (!isDateSelectable(day, { minDate, maxDate, isDateDisabled })) return null;
      // Which lane row the point lands on, mirroring the bar overlay's geometry.
      const rowLayout = weekLayouts[row] ?? EMPTY_LAYOUT;
      const laneOffset = y - rowTop - laneTop;
      const lane = Math.floor(laneOffset / cellLaneHeight);
      const insideBar = !multiWeek || laneOffset - lane * cellLaneHeight < laneChipHeight;
      const { visibleLanes, extraLane } = rowLanes(rowLayout, cols);
      const segment =
        insideBar && lane >= 0 && lane < visibleLanes + (extraLane[col] ? 1 : 0)
          ? rowLayout.segments.find((s) => s.lane === lane && s.startCol <= col && s.endCol >= col)
          : undefined;
      return { day, event: segment?.event ?? null };
    },
    [
      gridSize,
      weeks,
      weekLayouts,
      rowLanes,
      multiWeek,
      rowHeight,
      cellGeometry.weekMarginTop,
      laneChipHeight,
      laneTop,
      cellLaneHeight,
      showAdjacentMonths,
      date,
      minDate,
      maxDate,
      isDateDisabled,
    ],
  );

  const beginDrag = useCallback(
    (x: number, y: number, origin?: { day: Date; event: CalendarEvent<T> | null }) => {
      if (!mounted.current || (multiWeek && interactionWindow.current !== windowKey)) return;
      if (
        origin &&
        (!isDateSelectable(origin.day, { minDate, maxDate, isDateDisabled }) ||
          (origin.event && !events.includes(origin.event)))
      )
        return;
      // A fresh press starts a new interaction, so any guard left over from the
      // previous one (a drag whose trailing click never reached a cell) is stale.
      suppressPressRef.current = false;
      movedRef.current = false;
      const hit = origin ?? hitTest(x, y);
      if (!hit) return;
      if (hit.event) {
        if (!onDragEvent || !canMoveEvent(hit.event)) return;
        applyDrag({ kind: "move", event: hit.event, from: hit.day, to: hit.day });
        onDragStart?.(hit.event);
        return;
      }
      if (onCreateEvent || onSelectDrag) {
        applyDrag({ kind: "create", anchor: hit.day, hover: hit.day });
      }
    },
    [
      hitTest,
      onDragEvent,
      onCreateEvent,
      onSelectDrag,
      onDragStart,
      canMoveEvent,
      applyDrag,
      multiWeek,
      windowKey,
      minDate,
      maxDate,
      isDateDisabled,
      events,
    ],
  );

  const extendDrag = useCallback(
    (x: number, y: number) => {
      const current = dragRef.current;
      if (!current) return;
      const hit = hitTest(x, y);
      if (!hit) return;
      const previous = current.kind === "create" ? current.hover : current.to;
      if (startOfDay(hit.day).getTime() === startOfDay(previous).getTime()) return;
      movedRef.current = true;
      applyDrag(
        current.kind === "create" ? { ...current, hover: hit.day } : { ...current, to: hit.day },
      );
      // A sweep reports its span live, so a selection can track the drag; a move
      // has nothing to report until it is dropped.
      if (current.kind === "create") {
        const a = startOfDay(current.anchor);
        const b = startOfDay(hit.day);
        const [lo, hi] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
        onSelectDrag?.(lo, hi);
      }
    },
    [hitTest, applyDrag, onSelectDrag],
  );

  const endDrag = useCallback(() => {
    const current = dragRef.current;
    applyDrag(null);
    if (!current) return;
    if (isWeb) suppressPressRef.current = movedRef.current;
    if (current.kind === "create") {
      // A stationary hold is a deliberate one-day create on native, where the
      // gesture only starts after a long press; on the web it is just a click.
      if (isWeb && !movedRef.current) return;
      const range = monthCreateRange(current.anchor, current.hover);
      onCreateEvent?.(range.start, range.end);
      return;
    }
    const next = monthDropBounds(current.event, current.from, current.to);
    if (!next) return;
    // Reject a drop that would land the event on top of another when
    // `eventOverlap` is off, before the consumer's handler ever sees it.
    if (
      eventOverlap === false &&
      overlapsOtherEvents(events, current.event, next.start, next.end)
    ) {
      return;
    }
    onDragEvent?.(current.event, next.start, next.end);
  }, [applyDrag, onCreateEvent, onDragEvent, eventOverlap, events]);

  // Native: a pan over the grid, held first so it doesn't hijack a tap or the
  // pager's own horizontal swipe.
  const dragGesture = useMemo(() => {
    if (!dragEnabled || isWeb) return undefined;
    return Gesture.Pan()
      .activateAfterLongPress(DRAG_LONG_PRESS_MS)
      .runOnJS(true)
      .onStart((event) => beginDrag(event.x, event.y))
      .onUpdate((event) => extendDrag(event.x, event.y))
      .onEnd((_event, success) => {
        if (success) endDrag();
      })
      .onFinalize(() => {
        if (dragRef.current) applyDrag(null);
      });
  }, [dragEnabled, beginDrag, extendDrag, endDrag, applyDrag]);

  // Web: the cell touchables swallow the pan above, so drive the same three steps
  // from pointer events on the grid instead. Positions come from the grid's own
  // box, so they line up with the hit test's grid-relative coordinates.
  const gridPoint = useCallback((clientX: number, clientY: number) => {
    const node = gridRef.current as unknown as {
      getBoundingClientRect?: () => { left: number; top: number };
    } | null;
    const rect = node?.getBoundingClientRect?.();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : null;
  }, []);
  useEffect(() => {
    if (!isWeb || !dragEnabled) return;
    // A drag can be released anywhere, so commit on the window rather than the grid.
    const up = () => {
      if (dragRef.current) endDrag();
    };
    const target = globalThis as unknown as {
      addEventListener?: (type: string, cb: () => void) => void;
      removeEventListener?: (type: string, cb: () => void) => void;
    };
    target.addEventListener?.("pointerup", up);
    // Multi-week touch input scrolls until a hold takes ownership of the drag.
    const node = gridRef.current as unknown as {
      style?: { touchAction?: string; userSelect?: string };
    } | null;
    if (node?.style) {
      node.style.touchAction = multiWeek ? "pan-y" : "none";
      node.style.userSelect = "none";
    }
    return () => target.removeEventListener?.("pointerup", up);
  }, [dragEnabled, endDrag, multiWeek]);

  const webDragHandlers = useRef({ beginDrag, extendDrag });
  webDragHandlers.current = { beginDrag, extendDrag };
  const pressWebGrid = (event: RNPointerEvent) => {
    const pointer = event.nativeEvent;
    if (multiWeek && (pointer.button !== 0 || pointer.isPrimary === false || heldTouch.current))
      return;
    if (multiWeek) suppressPressRef.current = false;
    const start = () => {
      const point = gridPoint(pointer.clientX, pointer.clientY);
      if (point) webDragHandlers.current.beginDrag(point.x, point.y);
    };
    if (!multiWeek || !pointer.pointerType || pointer.pointerType === "mouse") {
      start();
      return;
    }
    // A native View ref is the host HTMLElement only on react-native-web.
    const node = gridRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const point = gridPoint(pointer.clientX, pointer.clientY);
    if (!point) return;
    const origin = hitTest(point.x, point.y);
    if (!origin) return;
    heldOrigin.current = origin;
    heldTouch.current = holdWebDateDrag(
      node,
      pointer,
      () => {
        // Lane layout can change during the delay without removing the pressed
        // event. Keep the original day/event instead of hit-testing again.
        if (interactionWindow.current === windowKey)
          webDragHandlers.current.beginDrag(point.x, point.y, origin);
      },
      (x, y) => {
        const point = gridPoint(x, y);
        if (point) webDragHandlers.current.extendDrag(point.x, point.y);
      },
      () => {
        applyDrag(null);
        movedRef.current = false;
      },
      () => {
        heldTouch.current = null;
        heldOrigin.current = null;
      },
    );
  };

  const renderDay = (
    day: Date,
    dayCol: number,
    rowLayout: MonthWeekEvents<T>,
    dayLanes: number,
  ) => {
    const isCurrentMonth = multiWeek || isSameMonth(day, date);

    // Blank out adjacent-month days when they're hidden, keeping the grid shape.
    if (!isCurrentMonth && !showAdjacentMonths) {
      return (
        <View
          key={day.toISOString()}
          {...slot("day", {
            base: [styles.dayCell, styles.dayCellPadding, { gap: chipGap }],
            themed: [
              showGrid && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderRightWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.gridLine,
              },
              // No weekend tint on blank placeholders, so the shading doesn't bleed
              // into the empty cells of non-existent days.
              theme.containers.dayCell,
            ],
          })}
        />
      );
    }

    const dayEvents = eventsByDay.get(startOfDay(day).toISOString()) ?? [];
    const isToday = getIsToday(day, today);
    // Highlight the chosen `activeDate` when supplied, else the real today.
    const isHighlighted = activeDate ? isSameCalendarDay(day, activeDate) : isToday;
    // Selection band wins over the weekend tint; the today badge shows unless the
    // day is selected. Shared with the headless grid so they never diverge.
    const { isDisabled, isSelected, isInRange, isRangeStart, isRangeEnd } = daySelectionState(
      day,
      { selectedDates, selectedRange },
      { minDate, maxDate, isDateDisabled },
    );
    // Events past the visible lanes (this day's segments the row can't show)
    // collapse into "+N more"; the popover still lists the whole day.
    const hiddenEvents = rowLayout.segments
      .filter(
        (s) =>
          s.startCol <= dayCol &&
          s.endCol >= dayCol &&
          s.lane >= dayLanes &&
          s.event !== draftEvent,
      )
      .map((s) => s.event);
    const hiddenCount = hiddenEvents.length;

    // The range shows as a band behind the days; endpoints and discrete selected
    // days get a filled badge on top. Today's badge wins when it coincides. The
    // band/badge decisions come from core so both renderers can't disagree.
    const isFilledBadge = dayBadgeKind({ isSelected }, isHighlighted) !== "none";
    const hasBand =
      rangeBandKind({ isInRange, isRangeStart, isRangeEnd }, fillCellOnSelection) !== "none";
    const dayKey = day.toISOString();
    const probeId = cellStyles.byDay.get(dayKey) ?? "default";
    const cellStyle = multiWeek ? cellStyles.probes.get(probeId)?.style : calendarCellStyle?.(day);
    const cell = measuredCells[probeId] ?? estimatedCell;
    // Reserve the common lane stack beneath this date. The next child starts
    // after the cell's own gap, which may differ from its neighbor's.
    const dateMargin =
      laneTop - cell.top - (daySizes[dayKey]?.dateHeight ?? DATE_BADGE_HEIGHT) - cell.gap;
    // Tint the days a drag is currently over: every day of a create sweep, or the
    // one an event would land on.
    const isDragPreview =
      isInCreateSpan(drag, day) ||
      (drag?.kind === "move" &&
        isSameCalendarDay(day, drag.to) &&
        !isSameCalendarDay(day, drag.from));
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
    // `onPressCell` receives the same day at midnight, so one handler covers both
    // the month grid and the week/day grid's empty slots.
    const handlePressDay =
      isDisabled || (!onPressDay && !onPressCell)
        ? undefined
        : () => {
            if (consumeSuppressedPress()) return;
            onPressDay?.(day);
            onPressCell?.(startOfDay(day));
          };
    const handleLongPressDay =
      isDisabled || !onLongPressDay ? undefined : () => onLongPressDay(day);

    // Summarise the cell for screen readers: full date, today marker, and how
    // many events it holds (the chips inside are grouped under this cell).
    const eventCount = dayEvents.length;
    const accessibilityLabel = dayAccessibilityLabel({
      dateLabel: format(day, "EEEE, d LLLL yyyy", { locale }),
      isToday,
      isSelected,
      isDisabled,
      eventCount,
      labels,
    });

    const dateElement = renderCustomDateForMonth ? (
      renderCustomDateForMonth(day, { isCurrentMonth, isToday, isSelected, isDisabled })
    ) : (
      <View
        {...slot("dayBadge", {
          base: [
            styles.dateBadge,
            showGrid && styles.dateBadgeEvents,
            // Tap feedback lives on the badge, not the cell (picker only);
            // kept even under a class so the press still reads.
            !showGrid && pressedKey === dayKey && { opacity: 0.2 },
          ],
          themed: [
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
            theme.containers.dayBadge,
          ],
        })}
      >
        <Text
          {...slot<TextStyle>("dayBadgeText", {
            themed: [theme.text.dateCell, { color: dateColor }],
          })}
          allowFontScaling={false}
        >
          {format(day, "d")}
        </Text>
      </View>
    );

    const daySlot = slot("day", {
      base: dayCellBase,
      themed: [
        dayCellLines,
        highlightWeekends && isWeekend(day) && { backgroundColor: theme.colors.weekendBackground },
        // The drag preview sits on top of the weekend tint: the span being swept
        // out, or the day an event is about to land on.
        isDragPreview && { backgroundColor: theme.colors.rangeBackground },
        theme.containers.dayCell,
      ],
    });

    return (
      <TouchableOpacity
        key={day.toISOString()}
        {...daySlot}
        // Multi-week dates stay above the bars even when the day slot uses flex-end.
        style={[daySlot.style, cellStyle, multiWeek && styles.dayCellStacked]}
        onLayout={
          multiWeek
            ? (event) => recordDaySize(dayKey, "width", event.nativeEvent.layout.width)
            : undefined
        }
        // In the picker, don't dim the whole cell on press: the tap should show on
        // the badge (the circle) only, not the cell background. `onPressIn/Out` drive
        // the badge's own opacity below. The events calendar keeps the default
        // whole-cell press feedback (a tap there opens the day).
        activeOpacity={showGrid ? 0.2 : 1}
        {...(showGrid
          ? null
          : {
              onPressIn: () => setPressedKey(dayKey),
              onPressOut: () => setPressedKey((k) => (k === dayKey ? null : k)),
            })}
        onPress={handlePressDay}
        onLongPress={handleLongPressDay}
        disabled={isDisabled || (!onPressDay && !onLongPressDay && !onPressCell)}
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
            {...slot("rangeBand", {
              base: [
                styles.rangeBand,
                { pointerEvents: "none" },
                fillCellOnSelection
                  ? { top: 0, bottom: 0 }
                  : {
                      top: BAND_CENTER_Y - theme.rangeBandHeight / 2,
                      height: theme.rangeBandHeight,
                    },
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
              ],
              themed: { backgroundColor: theme.colors.rangeBackground },
            })}
          />
        ) : null}
        {multiWeek ? (
          <View
            style={[
              renderCustomDateForMonth ? undefined : styles.dateWrapperStretch,
              hiddenCount > 0 && {
                marginBottom: Math.max(0, dateMargin) + dayLanes * cellLaneHeight,
              },
            ]}
            onLayout={(event) =>
              recordDaySize(dayKey, "dateHeight", event.nativeEvent.layout.height)
            }
          >
            {dateElement}
          </View>
        ) : (
          dateElement
        )}
        {/* Reserve one row per visible lane so the overlay bars have space and
            "+more" sits below them; the bars themselves render in the row overlay
            (they span cells). */}
        {!multiWeek &&
          Array.from({ length: dayLanes }, (_, i) => (
            <View key={`lane-${i}`} style={{ height: laneChipHeight, pointerEvents: "none" }} />
          ))}
        {hiddenCount > 0 ? (
          <Text
            {...moreSlot}
            onPress={
              onPressMore
                ? () => onPressMore(dayEvents, day)
                : () => setMoreOpenFor({ day, events: dayEvents })
            }
            accessibilityRole="button"
            accessibilityLabel={`${labels.moreEvents(hiddenCount)}, ${format(day, "d MMMM", { locale })}`}
            allowFontScaling={false}
            numberOfLines={1}
          >
            {moreLabel.replace("{moreCount}", String(hiddenCount))}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setGridSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  return (
    <CalendarLabelsContext.Provider value={labels}>
      <View style={styles.root}>
        {showGrid ? (
          <View
            testID="month-more-probe"
            style={styles.moreProbe}
            {...webPreviewProps}
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onLayout={(event) => {
              const { height } = event.nativeEvent.layout;
              setMeasuredMoreArea((previous) => (previous === height ? previous : height));
            }}
          >
            <Text {...moreSlot} allowFontScaling={false} numberOfLines={1}>
              {moreLabel.replace("{moreCount}", "99")}
            </Text>
          </View>
        ) : null}
        {gridProbe && (
          <MonthGridSpacingProbe
            grid={gridProbe}
            weeks={weeks.length}
            onInnerHeight={setGridInnerSpacing}
            onOuterHeight={setGridOuterSpacing}
          />
        )}
        {Array.from(
          cellStyles.probes,
          ([id, cell]) =>
            cell.width > 0 &&
            drawnWeek.width > 0 && (
              <MonthCellProbe
                key={id}
                id={id}
                week={probeWeek}
                day={probeDay}
                cellStyle={cell.style}
                dayWidth={cell.width}
                weekWidth={drawnWeek.width}
                onMeasure={recordCell}
              />
            ),
        )}
        {showTitle ? (
          <Text
            {...slot<TextStyle>("title", {
              base: styles.title,
              themed: [theme.text.monthTitle, { color: theme.colors.text }],
            })}
            allowFontScaling={false}
          >
            {title}
          </Text>
        ) : null}
        {showWeekdays ? (
          <View
            {...slot("weekdays", {
              base: styles.weekdayHeader,
              themed: theme.containers.weekdayHeader,
            })}
          >
            {weekdayLabels.map((day) => (
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
        ) : null}
        {moreOpenFor ? (
          <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={() => setMoreOpenFor(null)}
          >
            <Pressable
              style={styles.moreBackdrop}
              accessibilityLabel={labels.close}
              onPress={() => setMoreOpenFor(null)}
            >
              <Pressable
                // Swallow taps on the card so only the backdrop dismisses.
                onPress={() => {}}
                {...slot("morePopover", {
                  base: styles.moreCard,
                  themed: {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.gridLine,
                  },
                })}
              >
                <Text
                  accessibilityRole="header"
                  style={[styles.moreCardTitle, { color: theme.colors.text }]}
                  allowFontScaling={false}
                >
                  {format(moreOpenFor.day, "EEEE, d LLLL yyyy", { locale })}
                </Text>
                <ScrollView>
                  {moreOpenFor.events.map((event, index) => (
                    <View key={keyExtractor(event, index)} style={styles.moreCardRow}>
                      <RenderEventComponent
                        event={event}
                        mode={multiWeek ? "multiweek" : "month"}
                        isAllDay={isAllDayEvent(event)}
                        onPress={() => {
                          setMoreOpenFor(null);
                          onPressEvent(event);
                        }}
                      />
                    </View>
                  ))}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
        <DateRowsViewport scrollable={multiWeek} onHeight={setViewportHeight}>
          <MonthGridSurface gesture={dragGesture}>
            <View
              ref={gridRef}
              testID={multiWeek ? "multiweek-grid" : "month-grid"}
              accessibilityLabel={multiWeek ? title : undefined}
              {...slot("grid", {
                base: [
                  !multiWeekRowHeight && styles.container,
                  multiWeek && {
                    minHeight: minimumRowHeight * weeks.length + (gridProbe ? gridInnerSpacing : 0),
                  },
                ],
              })}
              onLayout={handleLayout}
              {...(isWeb && dragEnabled
                ? {
                    onPointerDown: pressWebGrid,
                    onPointerMove: (event: RNPointerEvent) => {
                      if (heldTouch.current) return;
                      if (!dragRef.current) return;
                      const point = gridPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);
                      if (point) extendDrag(point.x, point.y);
                    },
                  }
                : null)}
            >
              {weeks.map((week, weekIndex) => {
                // Spanning bars for this row (laid out once in `weekLayouts`). A multi-day
                // event is one bar across its columns, stacked into lanes; the bars render
                // in an overlay so they can span cells, and the cells reserve the lane rows
                // so "+more" sits below them. `visibleLanes` mirrors the per-day cap.
                const rowLayout = rowLayouts[weekIndex] ?? EMPTY_LAYOUT;
                const cols = week.length;
                const { visibleLanes, extraLane } = rowLanes(rowLayout, cols);
                // With adjacent months hidden, clamp bars to the current-month columns so
                // none draw over the blank leading/trailing cells.
                let firstVisCol = 0;
                let lastVisCol = cols - 1;
                if (showGrid && !showAdjacentMonths) {
                  const first = week.findIndex((d) => isSameMonth(d, date));
                  if (first !== -1) {
                    firstVisCol = first;
                    lastVisCol =
                      cols - 1 - [...week].reverse().findIndex((d) => isSameMonth(d, date));
                  }
                }
                // The draft's own lane and columns, clamped like the bars.
                const draftSegment = rowLayout.segments.find((s) => s.event === draftEvent);
                const draftStart = draftSegment ? Math.max(draftSegment.startCol, firstVisCol) : -1;
                const draftEnd = draftSegment ? Math.min(draftSegment.endCol, lastVisCol) : -1;
                const draftTop = barTop + (draftSegment?.lane ?? 0) * cellLaneHeight;
                const draftHeight = Math.min(laneChipHeight, Math.max(0, rowHeight - draftTop));
                return (
                  <View
                    {...slot("week", {
                      // The grid slot can be larger or smaller than the viewport.
                      // Size from the same basis, stopping where the contents fit.
                      base: multiWeekRowHeight
                        ? [
                            styles.weekRowFixed,
                            {
                              height: multiWeekRowHeight,
                              minHeight: minimumRowHeight - cellGeometry.weekMargin,
                              flexGrow: 1,
                              flexShrink: 1,
                            },
                          ]
                        : styles.weekRow,
                      themed: theme.containers.weekRow,
                    })}
                    key={multiWeekGrid?.weeks[weekIndex].id ?? week[0].toISOString()}
                    onLayout={
                      multiWeek
                        ? (event) => {
                            const { y, height, width } = event.nativeEvent.layout;
                            weekTops.current[weekIndex] = y;
                            if (weekIndex === 0)
                              setDrawnWeek((previous) =>
                                previous.width === width && previous.height === height
                                  ? previous
                                  : { width, height },
                              );
                          }
                        : undefined
                    }
                  >
                    {week.map((day, dayCol) =>
                      renderDay(day, dayCol, rowLayout, visibleLanes + (extraLane[dayCol] ? 1 : 0)),
                    )}
                    {showGrid ? (
                      <View
                        style={[
                          StyleSheet.absoluteFill,
                          multiWeek
                            ? styles.childrenOnlyPointerEvents
                            : { pointerEvents: "box-none" },
                        ]}
                      >
                        {monthVisibleBars(rowLayout, visibleLanes, extraLane)
                          .filter((seg) => seg.event !== draftEvent)
                          .map((seg) => {
                            const startCol = Math.max(seg.startCol, firstVisCol);
                            const endCol = Math.min(seg.endCol, lastVisCol);
                            if (startCol > endCol) return null;
                            // Fade the bar being carried, so the tinted drop target reads
                            // as where it is going and this as where it came from.
                            const isDragged = drag?.kind === "move" && drag.event === seg.event;
                            return (
                              <View
                                key={`bar-${seg.event.start.toISOString()}:${seg.event.title}:${seg.lane}:${seg.startCol}`}
                                style={[
                                  {
                                    position: "absolute",
                                    left: pct((startCol / cols) * 100),
                                    width: pct(((endCol - startCol + 1) / cols) * 100),
                                    top: barTop + seg.lane * cellLaneHeight,
                                    height: laneChipHeight,
                                    paddingHorizontal: CHIP_INSET_H,
                                    // Let a sweep in progress reach the cells underneath.
                                    opacity: isDragged ? DRAGGED_BAR_OPACITY : 1,
                                  },
                                  multiWeek
                                    ? drag
                                      ? styles.noPointerEvents
                                      : styles.childrenOnlyPointerEvents
                                    : { pointerEvents: drag ? "none" : "box-none" },
                                ]}
                              >
                                <RenderEventComponent
                                  event={seg.event}
                                  mode={multiWeek ? "multiweek" : "month"}
                                  isAllDay={isAllDayEvent(seg.event)}
                                  onPress={
                                    disableMonthEventCellPress
                                      ? () => {}
                                      : () => {
                                          if (consumeSuppressedPress()) return;
                                          onPressEvent(seg.event);
                                        }
                                  }
                                  onLongPress={
                                    disableMonthEventCellPress || !onLongPressEvent
                                      ? undefined
                                      : () => onLongPressEvent(seg.event)
                                  }
                                />
                              </View>
                            );
                          })}
                        {RenderCreateGhost &&
                        createRange &&
                        draftStart >= 0 &&
                        draftEnd >= draftStart &&
                        draftHeight > 0 ? (
                          <View
                            testID="month-create-ghost"
                            {...slot("createGhost", {
                              base: {
                                position: "absolute",
                                left: pct((draftStart / cols) * 100),
                                right: pct(((cols - 1 - draftEnd) / cols) * 100),
                                top: draftTop,
                                height: draftHeight,
                                marginHorizontal: CHIP_INSET_H,
                                overflow: "hidden",
                                zIndex: 1,
                              },
                              themed: {
                                backgroundColor: theme.colors.rangeBackground,
                                borderColor: theme.colors.selectedBackground,
                                borderWidth: 1,
                                borderRadius: 4,
                              },
                            })}
                            {...webPreviewProps}
                            pointerEvents="none"
                            accessible={false}
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                          >
                            <RenderCreateGhost start={createRange.start} end={createRange.end} />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </MonthGridSurface>
        </DateRowsViewport>
      </View>
    </CalendarLabelsContext.Provider>
  );
}

// Find the last week whose top is at or above the pointer, clamping to the first
// or last week when a drag crosses the grid boundary.
function weekAtOffset(y: number, count: number, topOf: (index: number) => number): number {
  let first = 0;
  let end = count;
  while (first + 1 < end) {
    const middle = Math.floor((first + end) / 2);
    if (topOf(middle) <= y) first = middle;
    else end = middle;
  }
  return first;
}

function DateRowsViewport({
  scrollable,
  onHeight,
  children,
}: {
  scrollable: boolean;
  onHeight: (height: number) => void;
  children: ReactElement;
}): ReactElement {
  return scrollable ? (
    <ScrollView
      testID="multiweek-viewport"
      style={styles.container}
      contentContainerStyle={{ flexGrow: 1 }}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );
}

// The grid, wrapped in a GestureDetector only when a month drag is wired up, so
// the picker (and any month without drag handlers) mounts no gesture at all.
function MonthGridSurface({
  gesture,
  children,
}: {
  gesture?: ReturnType<typeof Gesture.Pan>;
  children: ReactElement;
}): ReactElement {
  if (!gesture) return children;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

/**
 * A single month rendered as a 7-column grid of day cells, each showing its
 * event chips with a "+N more" overflow. Render it on its own for a static
 * month, or let `MonthList`/`Calendar` page through months for you.
 *
 * @example
 * ```tsx
 * import { MonthView, type CalendarEvent } from "@super-calendar/native";
 *
 * <MonthView
 *   date={new Date()}
 *   events={events}
 *   onPressDay={(day) => console.log(day)}
 * />
 * ```
 */
export const MonthView = memo(MonthViewInner) as typeof MonthViewInner;

/**
 * The day-row grid behind the public row views: week rows of day cells with
 * spanning event bars, overflow, selection, and drag handling.
 */
export const DateRows = memo(DateRowsInner) as typeof DateRowsInner;

const styles = StyleSheet.create({
  // Invisible, out of the flow: lays out one "+N more" label to measure its height.
  moreProbe: { position: "absolute", left: 0, top: 0, opacity: 0 },
  dateWrapperStretch: { alignSelf: "stretch" },
  dayCellStacked: { justifyContent: "flex-start", alignSelf: "stretch" },
  root: {
    flex: 1,
  },
  // Layout only; the font is themeable via `theme.text.monthTitle`.
  title: {
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
  // react-native-web needs registered styles to expand the child rules for box-none.
  childrenOnlyPointerEvents: { pointerEvents: "box-none" },
  noPointerEvents: { pointerEvents: "none" },
  weekRow: {
    flex: 1,
    flexDirection: "row",
  },
  // A multi-week row at a set height: no `flex`, which would override the height.
  weekRowFixed: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    overflow: "hidden",
  },
  dayCellPadding: { paddingTop: DAY_CELL_PADDING_TOP },
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
    marginTop: MORE_LABEL_MARGIN_TOP,
    marginHorizontal: 4,
  },
  // The built-in "+N more" popover card.
  moreBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  moreCard: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "60%",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 6,
  },
  moreCardTitle: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  moreCardRow: { marginBottom: 4 },
});
