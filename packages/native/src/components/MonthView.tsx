import { format, type Locale, isSameMonth, startOfDay } from "date-fns";
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useCalendarTheme } from "../theme";
import type {
  CalendarEvent,
  EventDragHandler,
  EventDragStartHandler,
  EventKeyExtractor,
  RenderEvent,
  WeekStartsOn,
} from "../types";
import { createSlots, type SlotStyleProps } from "../utils/slots";
import { withEventAccessibilityLabel } from "../utils/withEventAccessibilityLabel";
import {
  type CalendarLabels,
  type DateRange,
  type EventAccessibilityLabeler,
  dayAccessibilityLabel,
  resolveCalendarLabels,
  type WeekdayFormat,
  daySelectionState,
  isDateSelectable,
  useCalendarSelection,
  weekdayFormatToken,
} from "@super-calendar/core";
import { dayBadgeKind, rangeBandKind } from "@super-calendar/core";
import {
  buildMonthWeeks,
  getIsToday,
  filterHiddenDays,
  getWeekDays,
  isSameCalendarDay,
  isWeekend,
} from "@super-calendar/core";
import { monthEventCapacity, monthVisibleCount } from "@super-calendar/core";
import { layoutMonthWeek, type MonthWeekEvents } from "@super-calendar/core";
import { monthCreateRange, monthDropBounds, overlapsOtherEvents } from "@super-calendar/core";
import {
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
// Where the first event row sits below the date badge (padding + badge + gap).
const BADGE_AREA = DAY_CELL_PADDING_TOP + DATE_BADGE_HEIGHT + CELL_ROW_GAP;
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
  weekStartsOn: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  /** Weekday header label width: `narrow` ("M"), `short` ("Mon", default), or `long` ("Monday"). */
  weekdayFormat?: WeekdayFormat;
  locale?: Locale;
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
  hiddenDays,
  weekdayFormat = "short",
  locale,
  sortedMonthView = true,
  moreLabel = "{moreCount} More",
  labels: labelsProp,
  showAdjacentMonths = true,
  highlightWeekends = true,
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
  eventAccessibilityLabel,
  keyExtractor,
  onPressDay,
  onLongPressDay,
  onPressCell,
  onPressEvent,
  onLongPressEvent,
  onPressMore,
  onCreateEvent,
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
}: MonthViewProps<T>): ReactElement {
  const theme = useCalendarTheme();
  const slot = createSlots<MonthViewSlot>({ classNames, styles: styleOverrides });
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

  const weeks = useMemo(
    () => buildMonthWeeks(date, weekStartsOn, { showSixWeeks, isRTL, hiddenDays }),
    [date, weekStartsOn, isRTL, showSixWeeks, hiddenDays],
  );

  // Weekday labels for the header row (any week works; reuse this month). Reversed
  // in RTL so they line up with the mirrored day columns.
  const weekdayLabels = useMemo(() => {
    const days = filterHiddenDays(getWeekDays(date, weekStartsOn), hiddenDays);
    return isRTL ? days.reverse() : days;
  }, [date, weekStartsOn, isRTL, hiddenDays]);

  // The built-in chip's height and per-row stride, from the theme's title type.
  // Shared by the capacity estimate and the spanning-bar overlay so the bars line
  // up exactly with the rows the cells reserve for them.
  const chipMetrics = useMemo(() => {
    const fontSize = numericStyle(theme.text.eventTitle.fontSize, 12);
    const lineHeight = numericStyle(theme.text.eventTitle.lineHeight, Math.ceil(fontSize * 1.3));
    const chipHeight = lineHeight + CHIP_PADDING_V * 2;
    return { chipHeight, chipRowHeight: chipHeight + CELL_ROW_GAP };
  }, [theme]);

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
    const moreFontSize = numericStyle(theme.text.more.fontSize, 11);
    const moreRowHeight = Math.ceil(moreFontSize * 1.3) + CELL_ROW_GAP;
    const available = rowHeight - DAY_CELL_PADDING_TOP - DATE_BADGE_HEIGHT;
    return monthEventCapacity(available, chipMetrics.chipRowHeight, moreRowHeight);
  }, [maxVisibleEventCount, gridHeight, weeks.length, theme, chipMetrics]);

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

  // Draw the day-cell grid only for an events calendar; the events-free date
  // picker reads cleaner without it (matching the dom renderer).
  const showGrid = events.length > 0;

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
  const gridRef = useRef<View>(null);
  // The live drag drives the preview; the ref is what the gesture and the web
  // pointer listeners read, so neither has to be rebuilt as the hover day moves
  // (rebuilding the gesture mid-drag would cancel it).
  const [drag, setDrag] = useState<MonthDrag<T> | null>(null);
  const dragRef = useRef<MonthDrag<T> | null>(null);
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

  // The day under a grid-relative point, plus the event bar drawn there (if any).
  // Returns null for a point on a blanked adjacent-month cell or an unselectable
  // day, so neither can be a drag's origin or its drop target.
  const hitTest = useCallback(
    (x: number, y: number): { day: Date; event: CalendarEvent<T> | null } | null => {
      const { width, height } = gridSize;
      if (width <= 0 || height <= 0 || weeks.length === 0) return null;
      const rowHeight = height / weeks.length;
      const row = Math.min(weeks.length - 1, Math.max(0, Math.floor(y / rowHeight)));
      const cols = weeks[row].length;
      const col = Math.min(cols - 1, Math.max(0, Math.floor(x / (width / cols))));
      const day = weeks[row][col];
      if (!day) return null;
      if (!showAdjacentMonths && !isSameMonth(day, date)) return null;
      if (!isDateSelectable(day, { minDate, maxDate, isDateDisabled })) return null;
      // Which lane row the point lands on, mirroring the bar overlay's geometry.
      const rowLayout = weekLayouts[row] ?? EMPTY_LAYOUT;
      const lane = Math.floor((y - row * rowHeight - BADGE_AREA) / chipMetrics.chipRowHeight);
      const visibleLanes = monthVisibleCount(rowLayout.laneCount, capacity);
      const segment =
        lane >= 0 && lane < visibleLanes
          ? rowLayout.segments.find((s) => s.lane === lane && s.startCol <= col && s.endCol >= col)
          : undefined;
      return { day, event: segment?.event ?? null };
    },
    [
      gridSize,
      weeks,
      weekLayouts,
      capacity,
      chipMetrics,
      showAdjacentMonths,
      date,
      minDate,
      maxDate,
      isDateDisabled,
    ],
  );

  const beginDrag = useCallback(
    (x: number, y: number) => {
      // A fresh press starts a new interaction, so any guard left over from the
      // previous one (a drag whose trailing click never reached a cell) is stale.
      suppressPressRef.current = false;
      movedRef.current = false;
      const hit = hitTest(x, y);
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
    [hitTest, onDragEvent, onCreateEvent, onSelectDrag, onDragStart, canMoveEvent, applyDrag],
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
    // Let a touch drag sketch a span instead of scrolling the page under it, and
    // stop a sweep from text-selecting the day numbers it passes over.
    const node = gridRef.current as unknown as {
      style?: { touchAction?: string; userSelect?: string };
    } | null;
    if (node?.style) {
      node.style.touchAction = "none";
      node.style.userSelect = "none";
    }
    return () => target.removeEventListener?.("pointerup", up);
  }, [dragEnabled, endDrag]);

  const renderDay = (
    day: Date,
    dayCol: number,
    rowLayout: MonthWeekEvents<T>,
    visibleLanes: number,
  ) => {
    const isCurrentMonth = isSameMonth(day, date);

    // Blank out adjacent-month days when they're hidden, keeping the grid shape.
    if (!isCurrentMonth && !showAdjacentMonths) {
      return (
        <View
          key={day.toISOString()}
          {...slot("day", {
            base: styles.dayCell,
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
    // Events past the visible lanes (this day's segments the row can't show)
    // collapse into "+N more"; the popover still lists the whole day.
    const hiddenEvents = rowLayout.segments
      .filter((s) => s.startCol <= dayCol && s.endCol >= dayCol && s.lane >= visibleLanes)
      .map((s) => s.event);
    const hiddenCount = hiddenEvents.length;

    // The range shows as a band behind the days; endpoints and discrete selected
    // days get a filled badge on top. Today's badge wins when it coincides. The
    // band/badge decisions come from core so both renderers can't disagree.
    const isFilledBadge = dayBadgeKind({ isSelected }, isHighlighted) !== "none";
    const hasBand =
      rangeBandKind({ isInRange, isRangeStart, isRangeEnd }, fillCellOnSelection) !== "none";
    const dayKey = day.toISOString();
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

    const daySlot = slot("day", {
      // Events mode mirrors the dom renderer: left-aligned cell content with
      // the date badge in the top-right. The picker (no grid) stays centered
      // so the selection range band lines up with the centered badge.
      base: [styles.dayCell, showGrid && styles.dayCellEvents],
      themed: [
        showGrid && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.gridLine,
        },
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
        // The consumer's per-date style is an explicit override, so it merges
        // after the slot (and survives a `day` class).
        style={[daySlot.style, calendarCellStyle?.(day)]}
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
        {renderCustomDateForMonth ? (
          renderCustomDateForMonth(day)
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
        )}
        {/* Reserve one row per visible lane so the overlay bars have space and
            "+more" sits below them; the bars themselves render in the row overlay
            (they span cells). */}
        {Array.from({ length: visibleLanes }, (_, i) => (
          <View
            key={`lane-${i}`}
            style={{ height: chipMetrics.chipHeight, pointerEvents: "none" }}
          />
        ))}
        {hiddenCount > 0 ? (
          <Text
            {...slot<TextStyle>("more", {
              base: styles.moreLabel,
              themed: [theme.text.more, { color: theme.colors.textMuted }],
            })}
            onPress={
              onPressMore
                ? () => onPressMore(dayEvents, day)
                : () => setMoreOpenFor({ day, events: dayEvents })
            }
            accessibilityRole="button"
            accessibilityLabel={labels.moreEvents(hiddenCount)}
            allowFontScaling={false}
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
    <View style={styles.root}>
      {showTitle ? (
        <Text
          {...slot<TextStyle>("title", {
            base: styles.title,
            themed: [theme.text.monthTitle, { color: theme.colors.text }],
          })}
          allowFontScaling={false}
        >
          {format(date, "MMMM yyyy", locale ? { locale } : undefined)}
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
        <Modal transparent animationType="fade" visible onRequestClose={() => setMoreOpenFor(null)}>
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
                      mode="month"
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
      <MonthGridSurface gesture={dragGesture}>
        <View
          ref={gridRef}
          testID="month-grid"
          {...slot("grid", { base: styles.container })}
          onLayout={handleLayout}
          {...(isWeb && dragEnabled
            ? {
                onPointerDown: (event: RNPointerEvent) => {
                  const point = gridPoint(event.nativeEvent.clientX, event.nativeEvent.clientY);
                  if (point) beginDrag(point.x, point.y);
                },
                onPointerMove: (event: RNPointerEvent) => {
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
            const rowLayout = weekLayouts[weekIndex] ?? EMPTY_LAYOUT;
            const visibleLanes = monthVisibleCount(rowLayout.laneCount, capacity);
            const cols = week.length;
            // With adjacent months hidden, clamp bars to the current-month columns so
            // none draw over the blank leading/trailing cells.
            let firstVisCol = 0;
            let lastVisCol = cols - 1;
            if (showGrid && !showAdjacentMonths) {
              const first = week.findIndex((d) => isSameMonth(d, date));
              if (first !== -1) {
                firstVisCol = first;
                lastVisCol = cols - 1 - [...week].reverse().findIndex((d) => isSameMonth(d, date));
              }
            }
            return (
              <View
                {...slot("week", { base: styles.weekRow, themed: theme.containers.weekRow })}
                key={week[0].toISOString()}
              >
                {week.map((day, dayCol) => renderDay(day, dayCol, rowLayout, visibleLanes))}
                {showGrid ? (
                  <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
                    {rowLayout.segments
                      .filter((seg) => seg.lane < visibleLanes)
                      .map((seg) => {
                        const startCol = Math.max(seg.startCol, firstVisCol);
                        const endCol = Math.min(seg.endCol, lastVisCol);
                        if (startCol > endCol) return null;
                        // Fade the bar being carried, so the tinted drop target reads
                        // as where it is going and this as where it came from.
                        const isDragged = drag?.kind === "move" && drag.event === seg.event;
                        return (
                          <View
                            key={`bar-${seg.event.start.toISOString()}:${seg.event.title}:${seg.lane}`}
                            style={{
                              position: "absolute",
                              left: pct((startCol / cols) * 100),
                              width: pct(((endCol - startCol + 1) / cols) * 100),
                              top: BADGE_AREA + seg.lane * chipMetrics.chipRowHeight,
                              height: chipMetrics.chipHeight,
                              paddingHorizontal: CHIP_INSET_H,
                              // Let a sweep in progress reach the cells underneath.
                              pointerEvents: drag ? "none" : "box-none",
                              opacity: isDragged ? DRAGGED_BAR_OPACITY : 1,
                            }}
                          >
                            <RenderEventComponent
                              event={seg.event}
                              mode="month"
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
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </MonthGridSurface>
    </View>
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

const styles = StyleSheet.create({
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
