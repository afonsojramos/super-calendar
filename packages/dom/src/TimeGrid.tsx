import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  format,
  getISOWeek,
  type Locale,
  startOfDay,
} from "date-fns";
import {
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type BusinessHours,
  type BusinessHoursBand,
  type CalendarEvent,
  type CalendarMode,
  cellRangeFromDrag,
  clampMoveStartMinutes,
  pageStepDays,
  backgroundBandsForDay,
  closedHourBands,
  isBackgroundEvent,
  eventAccessibilityLabel as defaultEventAccessibilityLabel,
  type EventAccessibilityLabeler,
  eventChipLayout,
  eventTimeLabel,
  formatHour,
  getIsToday,
  getViewDays,
  isAllDayEvent,
  isSameCalendarDay,
  isWeekend,
  layoutDayEvents,
  overlapsOtherEvents,
  type PositionedEvent,
  useNow,
  type TimeGridMode,
  titleNumberOfLines,
  type WeekdayFormat,
  weekdayFormatToken,
  type WeekStartsOn,
} from "@super-calendar/core";
import { createSlots, dataState, type ResolvedSlot, type SlotStyleProps } from "./slots";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/**
 * Styleable parts of {@link TimeGrid}. Pass a class or inline style per slot via
 * the `classNames` / `styles` props.
 */
export type TimeGridSlot =
  | "header"
  | "weekNumber"
  | "columnHeader"
  | "columnHeaderWeekday"
  | "columnHeaderDate"
  | "allDayLane"
  | "allDayLabel"
  | "allDayColumn"
  | "allDayEvent"
  | "hourGutter"
  | "hourLabel"
  | "dayColumn"
  | "gridLines"
  | "businessHours"
  | "backgroundEvent"
  | "event"
  | "eventBox"
  | "nowIndicator"
  | "createGhost";

const GUTTER_WIDTH = 56;
const HOURS_PER_DAY = 24;
// Floor for a timed event box's height, so a very short event still shows a
// sliver of its chip. Overridable per grid via `minEventHeight`.
const DEFAULT_MIN_EVENT_HEIGHT = 14;
// Horizontal inset of each event box from its column edges. Overridable per grid
// via `eventGap`.
const DEFAULT_EVENT_GAP = 1;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Edge auto-advance: how close to the day-columns edge (px) counts as "at the
// edge", how long to dwell there before paging, and the repeat interval while
// the pointer stays in the zone.
const EDGE_ZONE = 32;
const EDGE_DWELL_MS = 600;
const EDGE_REPEAT_MS = 600;

// Off-screen but readable by assistive tech: gives an element an accessible name
// without changing the visible layout.
const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Props passed to a custom time-grid event renderer. */
export interface DomRenderEventArgs<T = unknown> {
  /** The event to render. */
  event: CalendarEvent<T>;
  /** The current view mode. */
  mode: CalendarMode;
  /** Whether the event is all-day. */
  isAllDay: boolean;
  /** Pixel height of the event box (timed events only). */
  boxHeight?: number;
  /** The event started before the visible day and continues into it. */
  continuesBefore?: boolean;
  /** The event continues past the visible day. */
  continuesAfter?: boolean;
  /** Show the time range in 12-hour AM/PM. */
  ampm?: boolean;
  /** Call to fire the view's `onPressEvent` for this event. */
  onPress: () => void;
}

/** A component that renders a single time-grid event box. */
export type DomRenderEvent<T = unknown> = ComponentType<DomRenderEventArgs<T>>;

/** Props for {@link TimeGrid}. */
export interface TimeGridProps<T = unknown> extends SlotStyleProps<TimeGridSlot> {
  /** Anchor date; the visible columns are derived from it and `mode`. */
  date: Date;
  /** Events to lay out on the grid. */
  events?: CalendarEvent<T>[];
  /** "day" (default), "3days", "week", or "custom" (with `numberOfDays`). */
  mode?: TimeGridMode;
  /** Column count for `mode="custom"`. */
  numberOfDays?: number;
  /** First day of the week. Sunday = 0 (default) ... Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Column-header weekday label width: `narrow` ("M"), `short` ("Mon", default), or `long` ("Monday"). */
  weekdayFormat?: WeekdayFormat;
  /** Initial pixels per hour (default 48). */
  hourHeight?: number;
  /** Initial scroll position, in minutes from midnight (default 8:00). */
  scrollOffsetMinutes?: number;
  /** Pinch / Ctrl-⌘-scroll to zoom the grid (default true). */
  zoomable?: boolean;
  /** Lower bound for pixels per hour when zooming. */
  minHourHeight?: number;
  /** Upper bound for pixels per hour when zooming. */
  maxHourHeight?: number;
  /**
   * Minimum pixel height of a timed event box, so short events stay legible and
   * clickable. Also the floor of the `boxHeight` handed to `renderEvent`. Default
   * 14; pass 0 to size every box strictly by its duration.
   */
  minEventHeight?: number;
  /**
   * Inset in pixels between a timed event box and its column edges (each side).
   * Default 1; pass 0 to let events fill their column.
   */
  eventGap?: number;
  /** Snap dragged events to this many minutes (default 15). */
  dragStepMinutes?: number;
  /** Render event time ranges in 12-hour AM/PM (default false, 24h). */
  ampm?: boolean;
  /** Sub-divisions per hour for the grid lines, e.g. 2 for half-hour (default 1). */
  timeslots?: number;
  /** First hour shown (0–23). Default 0. */
  minHour?: number;
  /** Last hour shown, exclusive (1–24). Default 24. */
  maxHour?: number;
  /** Hide the left hour-axis column (lines stay, labels/gutter go). Default false. */
  hideHours?: boolean;
  /** Show the ISO week number in the header gutter. Default false. */
  showWeekNumber?: boolean;
  /** Prefix for the week number, e.g. "W" → "W28". Default "W". */
  weekNumberPrefix?: string;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  /** Shade the hours outside business hours; `null` shades the whole day. */
  businessHours?: BusinessHours;
  /**
   * Render a closed-hours band's content yourself (a label, icon, pattern).
   * The grid keeps positioning the band; when set, the themed tint is dropped
   * and your output fills the band instead. Decorative only: the
   * band stays non-interactive and hidden from assistive tech.
   */
  renderBusinessHours?: (band: BusinessHoursBand) => ReactNode;
  /** Show the current-time indicator on today's column (default true). */
  showNowIndicator?: boolean;
  /** Fixed "now" instant for the indicator (doesn't tick). Defaults to the device clock. */
  now?: Date;
  /** Shift the now indicator into this IANA zone (pair with `eventsInTimeZone`). */
  timeZone?: string;
  /** Show the all-day lane above the grid (default true). */
  showAllDayEventCell?: boolean;
  /** Tint Saturday/Sunday columns with the weekend background (default true). Set
   * false to treat weekends like any other day. */
  highlightWeekends?: boolean;
  /** Allow moving events by default (per-event `startEditable` overrides). Default true. */
  eventStartEditable?: boolean;
  /** Allow resizing events by default (per-event `durationEditable` overrides). Default true. */
  eventDurationEditable?: boolean;
  /** Allow a dragged/resized event to overlap another (default true). Set false to
   * reject a drop that would collide, snapping the event back. */
  eventOverlap?: boolean;
  /** date-fns locale for the column headers and time labels. */
  locale?: Locale;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<DomCalendarTheme>;
  /** Height of the scroll viewport, in px. */
  height?: number | string;
  /** Custom event renderer; falls back to the built-in event box. */
  renderEvent?: DomRenderEvent<T>;
  /**
   * Override the screen-reader label for each event. Receives the event and a
   * `{ mode, isAllDay, ampm }` context; return the full text to announce. Defaults
   * to the title plus the time range (or "all day"), which the grid otherwise only
   * conveys visually.
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;
  /** Replace the hour-axis label. Receives the hour (0-23) and the `ampm` flag. */
  hourComponent?: (hour: number, ampm: boolean) => ReactNode;
  /**
   * Add arrow-key navigation between events. Up/Down move between a day's events by
   * time, Left/Right jump to the nearest event in the adjacent day, Home/End go to
   * the day's first/last event; Enter/Space activate. Additive: every event stays
   * individually tabbable (so screen-reader users keep full access), so this is a
   * convenience for sighted keyboard users. Default false.
   */
  keyboardEventNavigation?: boolean;
  /** Tap an event. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /** Tap a day's column header. */
  onPressDateHeader?: (day: Date) => void;
  /** Tap empty grid space; called with the date and time at the press. */
  onPressCell?: (date: Date) => void;
  /** Drag empty grid space to create; called with the swept start/end. */
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Fires when an event drag begins (e.g. to trigger haptics). */
  onDragStart?: (event: CalendarEvent<T>) => void;
  /**
   * Enables drag-to-move and resize; called with the proposed new start/end.
   * Return `false` to reject the drop (the event snaps back).
   */
  onDragEvent?: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  /**
   * Page the grid to a new anchor date. Supplying it alongside `onDragEvent`
   * turns on edge auto-advance: dragging an event to the left/right edge and
   * dwelling briefly pages the view so the event can be dropped on a day in the
   * previous/next period. Controlled, like the native renderer's `onChangeDate`.
   */
  onChangeDate?: (date: Date) => void;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

type DragState = {
  key: string;
  // "resize" drags the bottom edge (changes the end); "resize-start" drags the
  // top edge (changes the start, end fixed).
  kind: "move" | "resize" | "resize-start";
  startHours: number;
  durationHours: number;
  /** Whole day columns the box has been dragged across, clamped to the view. */
  dayDelta: number;
  /** Pixel equivalent of dayDelta, applied as a transform on the dragged box. */
  dayOffsetPx: number;
  /** Whether the dragged segment carries on from the previous day / into the next. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Hours of a move that run past the end of the day, previewed in the next column. */
  spillHours: number;
  /** Column that previews the spill, or -1 when there is none to show. */
  spillDayIndex: number;
  moved: boolean;
};

// Chip line metrics, matched to the box font below so the title clamp lands on a
// line boundary. 16px matches the native renderer's `eventTitle` line height, so
// the "does the time line still fit" decision flips at the same box height on
// both. The time reserves two lines (it can wrap on a narrow column).
const DOM_TITLE_LINE_HEIGHT = 16;
const DOM_TIME_LINE_HEIGHT = 30;
const DOM_BOX_PADDING_V = 2;

function DefaultDomEvent<T>({
  event,
  mode,
  isAllDay,
  boxHeight,
  ampm = false,
  theme,
  boxProps,
}: DomRenderEventArgs<T> & { theme: DomCalendarTheme; boxProps?: ResolvedSlot }) {
  const timeLabel = eventTimeLabel({
    mode,
    isAllDay,
    start: event.start,
    end: event.end,
    ampm,
    showTime: true,
  });
  // The title fills the box in whole lines; the time is secondary and only shows
  // once a full line is free beneath it. Mirrors the RN renderer via the same
  // core helper, so a 30-minute slot shows just its title instead of clipping
  // both lines, and the title never ends on a half-cut line.
  const { titleMaxLines, showTime } = eventChipLayout({
    boxHeightPx: boxHeight,
    mode,
    hasTime: !isAllDay && timeLabel != null,
    titleLineHeightPx: DOM_TITLE_LINE_HEIGHT,
    timeLineHeightPx: DOM_TIME_LINE_HEIGHT,
    paddingYPx: DOM_BOX_PADDING_V,
  });
  const oneLine = titleNumberOfLines(mode, isAllDay) === 1;
  // A chip reduced to a single title line (no time) centers it vertically, so a
  // very short event reads balanced instead of hugging the top edge.
  const centerLoneTitle = titleMaxLines === 1 && !showTime;
  // Structural box metrics always apply; the card's look (colour, radius, type)
  // is themed and yields to a `eventBox` class when one is supplied.
  const boxBase: CSSProperties = {
    height: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    lineHeight: `${DOM_TITLE_LINE_HEIGHT}px`,
    ...(centerLoneTitle
      ? { display: "flex", flexDirection: "column", justifyContent: "center" }
      : null),
  };
  const boxThemed: CSSProperties = {
    padding: `${DOM_BOX_PADDING_V}px 6px`,
    borderRadius: 6,
    background: theme.eventBackground,
    color: theme.eventText,
    fontSize: 12,
  };
  return (
    <div
      className={boxProps?.className}
      data-slot={boxProps?.["data-slot"]}
      style={
        boxProps?.className
          ? { ...boxBase, ...boxProps.style }
          : { ...boxBase, ...boxThemed, ...boxProps?.style }
      }
    >
      <div
        style={{
          fontWeight: 600,
          overflow: "hidden",
          // Clip on a line boundary with no ellipsis. The all-day lane is a single
          // line; timed events wrap to as many whole lines as the box allows.
          ...(oneLine
            ? { whiteSpace: "nowrap" }
            : {
                wordBreak: "break-word",
                ...(titleMaxLines > 0
                  ? { maxHeight: titleMaxLines * DOM_TITLE_LINE_HEIGHT }
                  : null),
              }),
        }}
      >
        {event.title}
      </div>
      {showTime ? (
        <div style={{ opacity: 0.75, overflow: "hidden", maxHeight: DOM_TIME_LINE_HEIGHT }}>
          {timeLabel}
        </div>
      ) : null}
    </div>
  );
}

// A `Date` that advances every minute while `enabled`, so the now-indicator
// tracks the wall clock instead of freezing at the last render. Mirrors the

/**
 * A day / week / N-day time grid rendered with plain DOM elements. Events are
 * positioned with the library's pure `layoutDayEvents`, so overlap columns and
 * multi-day clipping match the React Native renderer. Supports Ctrl/⌘-scroll and
 * two-finger pinch to zoom, and pointer drag to move / resize events.
 *
 * @example
 * ```tsx
 * <TimeGrid mode="week" date={new Date()} events={events} />
 * ```
 */
export function TimeGrid<T = unknown>({
  date,
  events = [],
  mode = "day",
  numberOfDays = 1,
  weekStartsOn = 0,
  weekdayFormat = "short",
  hourHeight: initialHourHeight = 48,
  scrollOffsetMinutes = 8 * 60,
  zoomable = true,
  minHourHeight = 24,
  maxHourHeight = 160,
  minEventHeight = DEFAULT_MIN_EVENT_HEIGHT,
  eventGap = DEFAULT_EVENT_GAP,
  dragStepMinutes = 15,
  ampm = false,
  timeslots = 1,
  minHour = 0,
  maxHour = 24,
  hideHours = false,
  showWeekNumber = false,
  weekNumberPrefix = "W",
  hiddenDays,
  keyboardEventNavigation = false,
  businessHours,
  renderBusinessHours,
  showNowIndicator = true,
  highlightWeekends = true,
  eventStartEditable = true,
  eventDurationEditable = true,
  eventOverlap = true,
  now: nowProp,
  timeZone,
  showAllDayEventCell = true,
  locale,
  theme: themeOverrides,
  height = 600,
  renderEvent,
  eventAccessibilityLabel,
  hourComponent,
  onPressEvent,
  onPressDateHeader,
  onPressCell,
  onCreateEvent,
  onDragStart,
  onDragEvent,
  onChangeDate,
  className,
  style,
  classNames,
  styles,
}: TimeGridProps<T>): ReactElement {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const slot = createSlots<TimeGridSlot>({ classNames, styles });
  const scrollRef = useRef<HTMLDivElement>(null);
  const dfns = locale ? { locale } : undefined;
  // Clamped like the native renderer: a zero or negative step would divide by zero
  // in the snap below and put NaN through every drag commit.
  const snapMinutes = Math.max(1, dragStepMinutes);
  const snapHours = snapMinutes / 60;

  // The visible hour window [windowStart, windowEnd). Clamped the same way as the
  // native renderer so out-of-range props can't invert or overflow the day.
  const windowStart = Math.max(0, Math.min(minHour, 23));
  const windowEnd = Math.max(windowStart + 1, Math.min(maxHour, 24));
  const windowHours = windowEnd - windowStart;
  const gutterWidth = hideHours ? 0 : GUTTER_WIDTH;
  const visibleHours = useMemo(
    () => Array.from({ length: windowHours }, (_, i) => windowStart + i),
    [windowStart, windowHours],
  );

  // Ticks every minute so the red now-line follows the wall clock; a `now`
  // override pins it, and `timeZone` shifts it to match zone-shifted events.
  const now = useNow(showNowIndicator, { now: nowProp, timeZone });

  const [hourHeight, setHourHeight] = useState(initialHourHeight);
  useEffect(() => setHourHeight(initialHourHeight), [initialHourHeight]);
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;

  // `drag` drives the visual; `dragRef` is the source of truth the pointer
  // handlers read, so they never see a stale state closure between events.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragOrigin = useRef<{
    pointerX: number;
    pointerY: number;
    startHours: number;
    durationHours: number;
    dayIndex: number;
    dayWidth: number;
    // The dragged *segment*'s bounds when the gesture began. A multi-day event is
    // laid out as one segment per day, so the commit shifts the real event by how
    // far its segment moved rather than rebuilding the event from the segment
    // (which would truncate everything outside the dragged day).
    segmentStart: Date;
    segmentEnd: Date;
  } | null>(null);
  const applyDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // Create-by-drag / tap on empty grid space. Mouse and pen sweep out a new
  // event; on touch the column scrolls instead, so a tap still hits onPressCell.
  const [createBox, setCreateBox] = useState<{
    dayIndex: number;
    topPx: number;
    heightPx: number;
  } | null>(null);
  const createOrigin = useRef<{ el: HTMLElement; dayIndex: number; startPx: number } | null>(null);
  const cellEnabled = !!onPressCell || !!onCreateEvent;

  const days = useMemo(
    () => getViewDays(mode, date, weekStartsOn, numberOfDays, false, undefined, hiddenDays),
    [mode, date, weekStartsOn, numberOfDays, hiddenDays],
  );

  // Edge auto-advance. During a move drag the pointer stream is handled at the
  // document level (attached in beginDrag) so it survives the day columns
  // unmounting when a page change swaps `date`. The listeners read these live
  // refs rather than a stale render closure; `daysRef`/`pageDepsRef` update every
  // render so the drop and the next page use the current view.
  const edgeAdvanceEnabled = !!onChangeDate && !!onDragEvent;
  const columnsRef = useRef<HTMLDivElement>(null);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeSide = useRef<-1 | 0 | 1>(0);
  const ptr = useRef({ x: 0, y: 0 });
  const pagedRef = useRef(false);
  const [paged, setPaged] = useState(false);
  const draggedRef = useRef<{
    event: CalendarEvent<T>;
    onPress: () => void;
    grabX: number;
    grabY: number;
    w: number;
    h: number;
  } | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const docHandlersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    cancel: (e: PointerEvent) => void;
  } | null>(null);
  const daysRef = useRef(days);
  daysRef.current = days;
  const pageDepsRef = useRef({ date, mode, weekStartsOn, numberOfDays });
  pageDepsRef.current = { date, mode, weekStartsOn, numberOfDays };
  const onChangeDateRef = useRef(onChangeDate);
  onChangeDateRef.current = onChangeDate;
  // Wrap the handler so a drop that would overlap another event is rejected when
  // `eventOverlap` is false, without the consumer wiring it in `onDragEvent`.
  const onDragEventRef = useRef(onDragEvent);
  onDragEventRef.current =
    onDragEvent && eventOverlap === false
      ? (event, start, end) =>
          overlapsOtherEvents(events, event, start, end) ? false : onDragEvent(event, start, end)
      : onDragEvent;

  const allDayByDay = useMemo(
    // A multi-day all-day event shows in every column it overlaps (matching the
    // native AllDayLane), not just its start day.
    () =>
      days.map((day) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        return events.filter(
          (e) => isAllDayEvent(e) && !isBackgroundEvent(e) && e.start < dayEnd && e.end > dayStart,
        );
      }),
    [days, events],
  );
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  useEffect(() => {
    // On mount / when the offset prop changes, not on every zoom (hence the ref).
    // The offset is measured from midnight, so subtract the window's start hour.
    if (scrollRef.current)
      scrollRef.current.scrollTop = Math.max(
        0,
        (scrollOffsetMinutes / 60 - windowStart) * hourHeightRef.current,
      );
  }, [scrollOffsetMinutes, windowStart]);

  // Zoom: Ctrl/⌘ + wheel (native listener so we can preventDefault), plus
  // two-pointer pinch. Both scale hourHeight about the current view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setHourHeight((h) => clamp(h * (1 - e.deltaY * 0.0015), minHourHeight, maxHourHeight));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomable, minHourHeight, maxHourHeight]);

  const pinch = useRef<Map<number, number>>(new Map());
  const pinchBase = useRef<{ dist: number; height: number } | null>(null);
  const onBodyPointerDown = (e: ReactPointerEvent) => {
    if (!zoomable || e.pointerType !== "touch") return;
    pinch.current.set(e.pointerId, e.clientY);
    if (pinch.current.size === 2) {
      const ys = [...pinch.current.values()];
      pinchBase.current = { dist: Math.abs(ys[0] - ys[1]), height: hourHeight };
    }
  };
  const onBodyPointerMove = (e: ReactPointerEvent) => {
    if (!pinch.current.has(e.pointerId)) return;
    pinch.current.set(e.pointerId, e.clientY);
    if (pinch.current.size === 2 && pinchBase.current) {
      const ys = [...pinch.current.values()];
      const dist = Math.abs(ys[0] - ys[1]);
      const ratio = dist / (pinchBase.current.dist || 1);
      setHourHeight(clamp(pinchBase.current.height * ratio, minHourHeight, maxHourHeight));
    }
  };
  const onBodyPointerUp = (e: ReactPointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchBase.current = null;
  };

  const Renderer = renderEvent;
  const totalHeight = windowHours * hourHeight;

  // The day under a screen point, from the `data-date` on the column beneath the
  // pointer (the ghost is pointer-transparent, so it doesn't shadow it). Guarded
  // for jsdom, which has no `elementFromPoint`.
  const dayAt = (x: number, y: number): Date | null => {
    if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
      return null;
    }
    const el = document.elementFromPoint(x, y)?.closest?.("[data-date]");
    const iso = el?.getAttribute("data-date");
    return iso ? new Date(iso) : null;
  };

  const clearEdgeTimer = () => {
    if (edgeTimer.current) {
      clearTimeout(edgeTimer.current);
      edgeTimer.current = null;
    }
  };

  // Page one period toward the held edge, then re-arm so holding keeps advancing.
  const fireEdge = () => {
    const side = edgeSide.current;
    if (side === 0) return;
    const p = pageDepsRef.current;
    const step = pageStepDays(p.mode, p.date, p.weekStartsOn, p.numberOfDays);
    onChangeDateRef.current?.(addDays(p.date, side * step));
    pagedRef.current = true;
    setPaged(true);
    edgeTimer.current = setTimeout(fireEdge, EDGE_REPEAT_MS);
  };

  const detachDocListeners = () => {
    const h = docHandlersRef.current;
    if (!h) return;
    document.removeEventListener("pointermove", h.move);
    document.removeEventListener("pointerup", h.up);
    document.removeEventListener("pointercancel", h.cancel);
    docHandlersRef.current = null;
  };

  const finishDrag = () => {
    detachDocListeners();
    clearEdgeTimer();
    edgeSide.current = 0;
    pagedRef.current = false;
    setPaged(false);
    draggedRef.current = null;
    dragOrigin.current = null;
    applyDrag(null);
  };

  const moveDrag = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d || !dragOrigin.current) return;
    ptr.current = { x: e.clientX, y: e.clientY };
    // Read the live row height (ref, not the state closure) so a mid-drag zoom
    // keeps the math aligned with what's on screen.
    const dHours = (e.clientY - dragOrigin.current.pointerY) / hourHeightRef.current;
    const snap = (v: number) => Math.round(v / snapHours) * snapHours;
    if (d.kind === "move") {
      // Only the start is held inside the window; the end may run past the end of
      // the day, continuing on the next one (see `clampMoveStartMinutes`). A
      // segment that continues *before* is skipped: its 00:00 top edge is where the
      // layout clipped the event, not where the event starts, so holding it there
      // would make the tail of a midnight-spanning event impossible to drag earlier.
      const raw = snap(dragOrigin.current.startHours + dHours);
      const startHours = d.continuesBefore
        ? raw
        : clampMoveStartMinutes(raw * 60, windowStart, windowEnd, snapMinutes) / 60;
      // Map the horizontal drag to whole day columns, clamped so the in-view box
      // can't leave the visible range (mirrors the native renderer). Once paged,
      // the drop day comes from the hit-test instead.
      const o = dragOrigin.current;
      const rawDayDelta = o.dayWidth > 0 ? Math.round((e.clientX - o.pointerX) / o.dayWidth) : 0;
      const targetDay = clamp(o.dayIndex + rawDayDelta, 0, daysRef.current.length - 1);
      const dayDelta = targetDay - o.dayIndex;
      // Preview the part that runs past *midnight* at the top of the next column.
      // Measured against the end of the day, not `windowEnd`: a narrowed window
      // (say 8–18) leaves plenty of events hanging below the last visible hour
      // without them reaching the next day at all.
      const spillHours = Math.min(
        Math.max(startHours + d.durationHours - HOURS_PER_DAY, 0),
        windowHours,
      );
      const nextDay = daysRef.current[targetDay + 1];
      const spillDayIndex =
        spillHours > 0 &&
        nextDay &&
        // Only when that column really is the next calendar day (`hiddenDays` can
        // break the run), otherwise the spill lands off-view and isn't shown.
        differenceInCalendarDays(nextDay, daysRef.current[targetDay]) === 1 &&
        // A segment that already continues after owns a real next-day box; a
        // preview on top of it would just double up.
        !d.continuesAfter
          ? targetDay + 1
          : -1;
      applyDrag({
        ...d,
        startHours,
        dayDelta,
        dayOffsetPx: dayDelta * o.dayWidth,
        spillHours,
        spillDayIndex,
        moved: true,
      });
      // Follow the pointer with the floating ghost once the origin column is gone.
      const g = ghostRef.current;
      const held = draggedRef.current;
      if (g && held) {
        g.style.transform = `translate(${e.clientX - held.grabX}px, ${e.clientY - held.grabY}px)`;
      }
      // Edge auto-advance: dwell near a horizontal edge to page the view. Read the
      // columns rect live so a mid-drag scroll/layout shift can't stale it.
      if (edgeAdvanceEnabled) {
        const rect = columnsRef.current?.getBoundingClientRect();
        if (rect && rect.right > rect.left) {
          const left = rect.left + gutterWidth;
          const side: -1 | 0 | 1 =
            e.clientX <= left + EDGE_ZONE ? -1 : e.clientX >= rect.right - EDGE_ZONE ? 1 : 0;
          if (side !== edgeSide.current) {
            clearEdgeTimer();
            edgeSide.current = side;
            if (side !== 0) edgeTimer.current = setTimeout(fireEdge, EDGE_DWELL_MS);
          }
        }
      }
    } else if (d.kind === "resize") {
      const durationHours = clamp(
        snap(dragOrigin.current.durationHours + dHours),
        snapHours,
        Math.max(snapHours, windowEnd - d.startHours),
      );
      applyDrag({ ...d, durationHours, moved: true });
    } else {
      // Top-edge resize: move the start, keep the end fixed. Clamp the start into
      // the window and never past one snap step before the end.
      const o = dragOrigin.current;
      const end = o.startHours + o.durationHours;
      const startHours = clamp(snap(o.startHours + dHours), windowStart, end - snapHours);
      applyDrag({ ...d, startHours, durationHours: end - startHours, moved: true });
    }
  };

  const endDrag = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    try {
      (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    } catch {
      // Best-effort release; ignore if the capture was never granted.
    }
    const held = draggedRef.current;
    if (!d.moved) {
      finishDrag();
      held?.onPress();
      return;
    }
    const origin = dragOrigin.current;
    const originIndex = origin?.dayIndex ?? 0;
    let base: Date | null = null;
    if (d.kind === "move") {
      if (pagedRef.current) {
        // The origin column has scrolled off with the page change, so the day
        // under the pointer is authoritative; dropping off the grid snaps back.
        const day = dayAt(e.clientX, e.clientY);
        base = day ? startOfDay(day) : null;
      } else {
        // In view: resolve from the days array (correct under hiddenDays), as
        // before. `dayDelta` is clamped to the visible range at drag time.
        base = startOfDay(
          daysRef.current[originIndex + d.dayDelta] ?? daysRef.current[originIndex],
        );
      }
    } else {
      base = startOfDay(daysRef.current[originIndex] ?? daysRef.current[0]);
    }
    if (base && held && origin) {
      // Shift the real event by how far its segment moved, so a move that now
      // spans midnight (and every later drag of the resulting multi-day event)
      // keeps the parts outside the dragged day instead of clipping to it.
      const segmentStart = addMinutes(base, Math.round(d.startHours * 60));
      const segmentEnd = addMinutes(base, Math.round((d.startHours + d.durationHours) * 60));
      const startShift =
        d.kind === "resize" ? 0 : segmentStart.getTime() - origin.segmentStart.getTime();
      const endShift =
        d.kind === "move"
          ? startShift
          : d.kind === "resize-start"
            ? 0
            : segmentEnd.getTime() - origin.segmentEnd.getTime();
      const start = new Date(held.event.start.getTime() + startShift);
      const end = new Date(held.event.end.getTime() + endShift);
      if (end > start) onDragEventRef.current?.(held.event, start, end);
    }
    finishDrag();
  };

  const cancelDrag = () => {
    finishDrag();
  };

  // Takes the laid-out segment whole rather than five of its fields: the two
  // `continues*` flags are the same type, so passing them positionally invites a
  // silent transposition.
  const beginDrag = (
    e: ReactPointerEvent,
    pe: PositionedEvent<T>,
    key: string,
    kind: "move" | "resize" | "resize-start",
    dayIndex: number,
    onPress?: () => void,
  ) => {
    if (!onDragEvent) return;
    const { event, startHours, durationHours, continuesBefore, continuesAfter } = pe;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is best-effort; some environments reject it.
    }
    // The event box sits inside its day column, so the parent's width is one day;
    // columns are equal-width, so measuring one is enough. Resizes never move
    // across days, so 0 is fine there.
    const boxEl = e.currentTarget as HTMLElement;
    const column = kind === "move" ? boxEl.parentElement : null;
    const dayWidth = column ? column.getBoundingClientRect().width : 0;
    const boxRect = kind === "move" ? boxEl.getBoundingClientRect() : null;
    const originBase = startOfDay(days[dayIndex] ?? days[0]);
    dragOrigin.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startHours,
      durationHours,
      dayIndex,
      dayWidth,
      segmentStart: addMinutes(originBase, Math.round(startHours * 60)),
      segmentEnd: addMinutes(originBase, Math.round((startHours + durationHours) * 60)),
    };
    draggedRef.current = {
      event,
      onPress: onPress ?? (() => {}),
      grabX: boxRect ? e.clientX - boxRect.left : 0,
      grabY: boxRect ? e.clientY - boxRect.top : 0,
      w: boxRect ? boxRect.width : 0,
      h: boxRect ? boxRect.height : 0,
    };
    ptr.current = { x: e.clientX, y: e.clientY };
    edgeSide.current = 0;
    pagedRef.current = false;
    setPaged(false);
    clearEdgeTimer();
    applyDrag({
      key,
      kind,
      startHours,
      durationHours,
      continuesBefore,
      continuesAfter,
      dayDelta: 0,
      dayOffsetPx: 0,
      spillHours: 0,
      spillDayIndex: -1,
      moved: false,
    });
    onDragStart?.(event);
    // Transport the rest of the drag at the document level so it survives the day
    // columns unmounting on a page change (the dragged box's own node disappears).
    // Detach any prior set first so a second beginDrag can't leak listeners.
    detachDocListeners();
    const handlers = { move: moveDrag, up: endDrag, cancel: cancelDrag };
    docHandlersRef.current = handlers;
    document.addEventListener("pointermove", handlers.move);
    document.addEventListener("pointerup", handlers.up);
    document.addEventListener("pointercancel", handlers.cancel);
  };

  // Remove any lingering document listeners / dwell timer if we unmount mid-drag.
  useEffect(
    () => () => {
      detachDocListeners();
      clearEdgeTimer();
    },
    [],
  );

  const pxFromTop = (el: HTMLElement, clientY: number) => clientY - el.getBoundingClientRect().top;
  const beginCreate = (e: ReactPointerEvent, dayIndex: number) => {
    // Mouse / pen only: on touch the column must stay free to scroll the grid.
    // Only from the column background, primary button, never on an event.
    if (!cellEnabled || e.pointerType === "touch") return;
    if (e.target !== e.currentTarget || e.button > 0) return;
    const el = e.currentTarget as HTMLElement;
    const startPx = pxFromTop(el, e.clientY);
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Best-effort capture.
    }
    createOrigin.current = { el, dayIndex, startPx };
    setCreateBox({ dayIndex, topPx: startPx, heightPx: 0 });
  };
  const moveCreate = (e: ReactPointerEvent) => {
    const o = createOrigin.current;
    if (!o) return;
    const cur = pxFromTop(o.el, e.clientY);
    setCreateBox({
      dayIndex: o.dayIndex,
      topPx: Math.min(o.startPx, cur),
      heightPx: Math.abs(cur - o.startPx),
    });
  };
  const endCreate = (e: ReactPointerEvent) => {
    const o = createOrigin.current;
    if (!o) return;
    try {
      o.el.releasePointerCapture?.(e.pointerId);
    } catch {
      // Best-effort release.
    }
    const endPx = pxFromTop(o.el, e.clientY);
    const day = days[o.dayIndex];
    const moved = Math.abs(endPx - o.startPx) > 4;
    const h = hourHeightRef.current;
    if (moved && onCreateEvent) {
      const range = cellRangeFromDrag(day, o.startPx, endPx, h, windowStart, snapMinutes);
      if (range) onCreateEvent(range.start, range.end);
    } else if (onPressCell) {
      const at = cellRangeFromDrag(day, o.startPx, o.startPx, h, windowStart, snapMinutes);
      if (at) onPressCell(at.start);
    }
    createOrigin.current = null;
    setCreateBox(null);
  };
  // A gesture the browser/OS cancels (scroll takeover, etc.) must not commit a
  // create — just drop the in-progress state.
  const cancelCreate = () => {
    createOrigin.current = null;
    setCreateBox(null);
  };

  // Per-day layout and shading are pure functions of days/events/businessHours,
  // so memoize them — otherwise every drag pointermove (which calls setDrag)
  // re-runs the full layout for each column.
  const positionedByDay = useMemo(
    () => days.map((day) => layoutDayEvents(events, day)),
    [days, events],
  );

  // Keep the original boxes mounted for pointer capture, but replace every
  // segment of a moving multi-day event with the same shifted range.
  const moveOrigin = dragOrigin.current;
  const heldEvent = draggedRef.current?.event;
  const movingEvent =
    heldEvent &&
    (events.includes(heldEvent)
      ? heldEvent
      : (events.find(
          (event) =>
            event.start.getTime() === heldEvent.start.getTime() &&
            event.end.getTime() === heldEvent.end.getTime() &&
            event.title === heldEvent.title,
        ) ?? heldEvent));
  const multiDayMove =
    !paged &&
    drag?.kind === "move" &&
    (drag.continuesBefore || drag.continuesAfter) &&
    moveOrigin &&
    movingEvent
      ? (() => {
          const target = days[moveOrigin.dayIndex + drag.dayDelta];
          const segmentStart = addMinutes(startOfDay(target), Math.round(drag.startHours * 60));
          const shift = segmentStart.getTime() - moveOrigin.segmentStart.getTime();
          return {
            ...movingEvent,
            start: new Date(movingEvent.start.getTime() + shift),
            end: new Date(movingEvent.end.getTime() + shift),
            allDay: false,
          };
        })()
      : null;

  // The tail of an in-progress move that runs past midnight, shown on `dayIndex`
  // so the drop is visible on both days at once. `drag` and `draggedRef` are set
  // together in `beginDrag` and cleared together in `finishDrag`, so the guard on
  // the state keeps the ref read consistent.
  const spillPreviewFor = (dayIndex: number): DomRenderEventArgs<T> | null => {
    if (paged || !drag || drag.kind !== "move" || drag.spillDayIndex !== dayIndex) return null;
    const dragged = draggedRef.current?.event;
    if (!dragged) return null;
    return {
      event: dragged,
      mode,
      isAllDay: false,
      boxHeight: Math.max(drag.spillHours * hourHeight, minEventHeight),
      continuesBefore: true,
      continuesAfter: false,
      ampm,
      onPress: () => {},
    };
  };

  // Arrow-key navigation across events (`keyboardEventNavigation`). This is purely
  // additive: every event stays a tab stop (so screen-reader users keep full
  // access), and the arrow keys are a convenience for sighted keyboard users. It's
  // deliberately NOT a roving tabindex — that needs a composite container role
  // (grid/listbox), which this overlapping, absolutely-positioned layout can't
  // honestly claim, and without one it would strip events from the tab order for
  // exactly the screen-reader users it's meant to help. Events are keyed `day:idx`
  // to match the rendered chips and sorted by start time so Up/Down step through a
  // day chronologically.
  const navByDay = useMemo(
    () =>
      positionedByDay.map((list, day) =>
        list
          .map((pe, idx) => ({ key: `${day}:${idx}`, start: pe.startHours, dur: pe.durationHours }))
          .filter((n) => !(n.start >= windowEnd || n.start + n.dur <= windowStart))
          .sort((a, b) => a.start - b.start),
      ),
    [positionedByDay, windowStart, windowEnd],
  );
  // The event to move focus to for an arrow/Home/End key, or null to stay put.
  const nextEventKey = (currentKey: string, arrowKey: string): string | null => {
    let day = -1;
    let pos = -1;
    for (let d = 0; d < navByDay.length; d++) {
      const p = navByDay[d].findIndex((n) => n.key === currentKey);
      if (p !== -1) {
        day = d;
        pos = p;
        break;
      }
    }
    if (day === -1) return null;
    const start = navByDay[day][pos].start;
    // The event in day `d` whose start time is closest to the current one.
    const nearestInDay = (d: number): string | null => {
      let best: string | null = null;
      let bestDiff = Number.POSITIVE_INFINITY;
      for (const n of navByDay[d]) {
        const diff = Math.abs(n.start - start);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = n.key;
        }
      }
      return best;
    };
    switch (arrowKey) {
      case "ArrowDown":
        return navByDay[day][Math.min(pos + 1, navByDay[day].length - 1)].key;
      case "ArrowUp":
        return navByDay[day][Math.max(pos - 1, 0)].key;
      case "ArrowRight":
        for (let d = day + 1; d < navByDay.length; d++) {
          const k = nearestInDay(d);
          if (k) return k;
        }
        return null;
      case "ArrowLeft":
        for (let d = day - 1; d >= 0; d--) {
          const k = nearestInDay(d);
          if (k) return k;
        }
        return null;
      case "Home":
        return navByDay[day][0].key;
      case "End":
        return navByDay[day][navByDay[day].length - 1].key;
      default:
        return null;
    }
  };
  const onEventKeyDown = (currentKey: string, e: ReactKeyboardEvent) => {
    const next = nextEventKey(currentKey, e.key);
    if (!next) return;
    e.preventDefault();
    scrollRef.current?.querySelector<HTMLElement>(`[data-event-key="${next}"]`)?.focus();
  };
  // Shade only the closed hours inside the visible window.
  const bandsByDay = useMemo(
    () => days.map((day) => closedHourBands(day, businessHours, windowStart, windowEnd)),
    [days, businessHours, windowStart, windowEnd],
  );
  // `display: "background"` events, sliced per day and clipped to the window.
  const backgroundByDay = useMemo(
    () =>
      days.map((day) =>
        backgroundBandsForDay(events, day)
          .map((b) => ({
            ...b,
            startHours: Math.max(b.startHours, windowStart),
            endHours: Math.min(b.endHours, windowEnd),
          }))
          .filter((b) => b.endHours > b.startHours),
      ),
    [days, events, windowStart, windowEnd],
  );
  const gridLines = useMemo(() => {
    const hourLines = `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, ${theme.gridLine} ${hourHeight - 1}px, ${theme.gridLine} ${hourHeight}px)`;
    if (timeslots <= 1) return hourLines;
    const slotHeight = hourHeight / timeslots;
    return `${hourLines}, repeating-linear-gradient(to bottom, transparent 0, transparent ${slotHeight - 1}px, ${theme.gridLine}80 ${slotHeight - 1}px, ${theme.gridLine}80 ${slotHeight}px)`;
  }, [hourHeight, timeslots, theme.gridLine]);

  return (
    <div
      className={className}
      style={{
        fontFamily: theme.fontFamily,
        color: theme.text,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      {/* Header */}
      <div
        {...slot("header", {
          base: { display: "flex" },
          themed: { borderBottom: `1px solid ${theme.gridLine}` },
        })}
      >
        <div
          {...slot("weekNumber", {
            base: {
              width: gutterWidth,
              flex: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            },
            themed: { fontSize: 10, color: theme.textMuted },
          })}
        >
          {showWeekNumber && gutterWidth > 0 && days[0]
            ? // Reference the visible Thursday: an ISO week is defined by its Thursday,
              // so a Sunday-start week (days[0] is Sunday, the previous ISO week's last
              // day) still shows the week number its Mon–Sat body belongs to.
              `${weekNumberPrefix}${getISOWeek(days.find((d) => d.getDay() === 4) ?? days[0])}`
            : null}
        </div>
        {days.map((day) => {
          const today = getIsToday(day);
          // Full, unambiguous date for assistive tech; the visible weekday + day
          // number below are decorative (aria-hidden) so it isn't read twice.
          const dateLabel = format(day, "EEEE, d MMMM yyyy", dfns);
          const headerProps = slot("columnHeader", {
            base: {
              flex: 1,
              border: "none",
              background: "transparent",
              font: "inherit",
              cursor: onPressDateHeader ? "pointer" : "default",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            },
            themed: { color: theme.textMuted, padding: "6px 0" },
          });
          const inner = (
            <>
              <span style={VISUALLY_HIDDEN}>{dateLabel}</span>
              <span
                aria-hidden
                {...slot("columnHeaderWeekday", { themed: { fontSize: 11, fontWeight: 600 } })}
              >
                {format(day, weekdayFormatToken(weekdayFormat), dfns)}
              </span>
              <span
                aria-hidden
                {...dataState({ "data-today": today })}
                {...slot("columnHeaderDate", {
                  base: {
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  themed: {
                    fontSize: 15,
                    fontWeight: 600,
                    background: today ? theme.todayBackground : "transparent",
                    color: today ? theme.todayText : theme.text,
                  },
                })}
              >
                {format(day, "d", dfns)}
              </span>
            </>
          );
          // Interactive → a real, labeled button. Otherwise a labeled, non-focusable
          // element that screen readers can still announce (never `aria-hidden`, so
          // the day columns aren't invisible to assistive tech).
          return onPressDateHeader ? (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onPressDateHeader(day)}
              {...dataState({ "data-today": today })}
              {...headerProps}
            >
              {inner}
            </button>
          ) : (
            <div key={day.toISOString()} {...dataState({ "data-today": today })} {...headerProps}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* All-day lane */}
      {showAllDayEventCell && hasAllDay ? (
        <div
          {...slot("allDayLane", {
            base: { display: "flex" },
            themed: { borderBottom: `1px solid ${theme.gridLine}` },
          })}
        >
          <div
            {...slot("allDayLabel", {
              // `minWidth: 0` + `overflow: hidden` so the text doesn't spill when
              // `hideHours` collapses the gutter to zero width.
              base: {
                width: gutterWidth,
                flex: "none",
                minWidth: 0,
                overflow: "hidden",
                textAlign: "right",
              },
              themed: { fontSize: 10, color: theme.textMuted, padding: "4px 6px 0 0" },
            })}
          >
            all-day
          </div>
          {allDayByDay.map((list, i) => {
            const dayStart = startOfDay(days[i]);
            const dayEnd = addDays(dayStart, 1);
            return (
              <div
                key={days[i].toISOString()}
                {...slot("allDayColumn", {
                  base: {
                    flex: 1,
                    minWidth: 0,
                    // Mirror the day column's geometry so the all-day chip lines up
                    // exactly with the timed events below it: a 1px left border (the
                    // grid line, transparent here) plus a 1px horizontal inset.
                    borderLeft: "1px solid transparent",
                    padding: "2px 1px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  },
                })}
              >
                {list.map((event) => {
                  const args: DomRenderEventArgs<T> = {
                    event,
                    mode,
                    isAllDay: true,
                    // Whether this all-day event continues into the previous/next
                    // column, so custom renderers can draw continuation affordances.
                    continuesBefore: event.start < dayStart,
                    continuesAfter: event.end > dayEnd,
                    ampm,
                    onPress: () => onPressEvent?.(event),
                  };
                  return (
                    <button
                      key={`${event.start.toISOString()}:${event.title}`}
                      type="button"
                      onClick={() => onPressEvent?.(event)}
                      aria-label={
                        eventAccessibilityLabel
                          ? eventAccessibilityLabel(event, { mode, isAllDay: true, ampm })
                          : defaultEventAccessibilityLabel({
                              title: event.title,
                              isAllDay: true,
                              start: event.start,
                              end: event.end,
                              ampm,
                            })
                      }
                      {...slot("allDayEvent", {
                        base: {
                          border: "none",
                          padding: 0,
                          background: "transparent",
                          cursor: "pointer",
                          textAlign: "left",
                          height: 22,
                        },
                      })}
                    >
                      {Renderer ? (
                        <Renderer {...args} />
                      ) : (
                        <DefaultDomEvent {...args} theme={theme} boxProps={slot("eventBox")} />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerUp}
        style={{
          overflowY: "auto",
          height,
          position: "relative",
          touchAction: zoomable ? "pan-y" : "auto",
        }}
      >
        <div
          ref={columnsRef}
          style={{ display: "flex", height: totalHeight, position: "relative" }}
        >
          {/* Hour gutter (hidden when hideHours; the grid lines stay). */}
          {hideHours ? null : (
            <div
              {...slot("hourGutter", {
                base: { width: gutterWidth, flex: "none", position: "relative" },
              })}
            >
              {visibleHours.map((h) => (
                <div
                  key={h}
                  {...slot("hourLabel", {
                    base: {
                      position: "absolute",
                      // Clamp so the top-of-grid label (`h === windowStart`) sits at
                      // the edge instead of clipping 6px above it.
                      top: Math.max(0, (h - windowStart) * hourHeight - 6),
                      right: 6,
                    },
                    themed: { fontSize: 10, color: theme.textMuted },
                  })}
                >
                  {hourComponent ? hourComponent(h, ampm) : h === 0 ? "" : formatHour(h, { ampm })}
                </div>
              ))}
            </div>
          )}

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const positioned = positionedByDay[dayIndex];
            const nowHours = (now.getHours() * 60 + now.getMinutes()) / 60;
            const showNow =
              showNowIndicator &&
              isSameCalendarDay(day, now) &&
              nowHours >= windowStart &&
              nowHours <= windowEnd;
            const nowTop = (nowHours - windowStart) * hourHeight;
            const bands = bandsByDay[dayIndex];
            const ghost = createBox?.dayIndex === dayIndex ? createBox : null;
            // The tail of a move that runs past midnight, previewed at the top of
            // this column. The dragged event is looked up from its `drag.key`
            // ("<originColumn>:<index>"), so no extra state has to track it.
            const spill = multiDayMove ? null : spillPreviewFor(dayIndex);
            const moveSegment = multiDayMove
              ? layoutDayEvents<T>([multiDayMove], day)[0]
              : undefined;
            return (
              <div
                key={day.toISOString()}
                // Identifies the drop day for a cross-page drag hit-test.
                data-date={day.toISOString()}
                // Empty columns are a pointer-only create surface: drag to sweep
                // out an event. They are deliberately not tab stops, so keyboard
                // focus moves through events only, not every empty day.
                onPointerDown={cellEnabled ? (e) => beginCreate(e, dayIndex) : undefined}
                onPointerMove={cellEnabled ? moveCreate : undefined}
                onPointerUp={cellEnabled ? endCreate : undefined}
                onPointerCancel={cellEnabled ? cancelCreate : undefined}
                {...dataState({ "data-today": getIsToday(day), "data-weekend": isWeekend(day) })}
                {...slot("dayColumn", {
                  base: { flex: 1, position: "relative" },
                  // Weekend columns are tinted (matching the native renderer); the
                  // tint sits behind the grid lines, business-hours shade and events.
                  themed: {
                    borderLeft: `1px solid ${theme.gridLine}`,
                    ...(highlightWeekends && isWeekend(day)
                      ? { background: theme.weekendBackground }
                      : null),
                  },
                })}
              >
                {/* Business-hours shade, behind the grid lines and events. */}
                {bands.map((b) => (
                  <div
                    key={b.start}
                    aria-hidden
                    {...slot("businessHours", {
                      base: {
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: (b.start - windowStart) * hourHeight,
                        height: (b.end - b.start) * hourHeight,
                        pointerEvents: "none",
                        zIndex: 0,
                      },
                      themed: renderBusinessHours
                        ? undefined
                        : { background: theme.outsideHoursBackground },
                    })}
                  >
                    {renderBusinessHours?.({ date: day, start: b.start, end: b.end })}
                  </div>
                ))}
                {/* Background events: shaded, non-interactive time ranges. */}
                {backgroundByDay[dayIndex].map((b, bandIndex) => (
                  <div
                    key={`bg-${bandIndex}`}
                    aria-hidden
                    title={b.event.title}
                    {...slot("backgroundEvent", {
                      base: {
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: (b.startHours - windowStart) * hourHeight,
                        height: (b.endHours - b.startHours) * hourHeight,
                        pointerEvents: "none",
                        zIndex: 0,
                      },
                      themed: { background: theme.backgroundEvent },
                    })}
                  />
                ))}
                {/* Grid lines, painted over the shade so they stay visible. */}
                <div
                  aria-hidden
                  {...slot("gridLines", {
                    base: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 },
                    themed: { backgroundImage: gridLines },
                  })}
                />
                {positioned.map((pe, idx) => {
                  const key = `${dayIndex}:${idx}`;
                  // Not while paged: after a page change the origin box is gone and
                  // the ghost stands in, so a same-slot event on the new page (e.g. a
                  // recurring one) must not also render lifted.
                  const active =
                    !paged && drag?.key === key && (!multiDayMove || pe.event === movingEvent)
                      ? drag
                      : null;
                  const hiddenForMove = !!multiDayMove && pe.event === movingEvent;
                  const startHours = active ? active.startHours : pe.startHours;
                  const durationHours = active ? active.durationHours : pe.durationHours;
                  // Drop events that fall entirely outside the visible window; those
                  // that straddle an edge render clipped by the scroll container.
                  if (
                    !active &&
                    (pe.startHours >= windowEnd || pe.startHours + pe.durationHours <= windowStart)
                  )
                    return null;
                  const top = (startHours - windowStart) * hourHeight;
                  // A drag that runs past midnight is cut off at the day boundary
                  // (a move previews the remainder in the next column). Applied to
                  // resting boxes too, where `layoutDayEvents` has already clipped
                  // them to the day, so the height doesn't jump on commit.
                  const boxHeight = Math.max(
                    Math.min(durationHours, HOURS_PER_DAY - startHours) * hourHeight,
                    minEventHeight,
                  );
                  const widthPct = 100 / pe.columns;
                  const onPress = () => onPressEvent?.(pe.event);
                  const args: DomRenderEventArgs<T> = {
                    event: pe.event,
                    mode,
                    isAllDay: false,
                    boxHeight,
                    continuesBefore: pe.continuesBefore,
                    continuesAfter: pe.continuesAfter,
                    ampm,
                    onPress,
                  };
                  // `draggable: false` locks a single event: it keeps its normal
                  // look and still responds to clicks, it just can't be dragged.
                  // `startEditable`/`durationEditable` (per-event, falling back to
                  // the grid props) split whether it can be moved vs resized.
                  const editable = !!onDragEvent && pe.event.draggable !== false;
                  const canMove = editable && (pe.event.startEditable ?? eventStartEditable);
                  const canResize =
                    editable && (pe.event.durationEditable ?? eventDurationEditable);
                  return (
                    <div
                      key={idx}
                      role="button"
                      // Always a tab stop: keyboard nav is additive, arrows only add a
                      // faster path between events without removing any from Tab order.
                      tabIndex={0}
                      data-event-key={keyboardEventNavigation ? key : undefined}
                      aria-label={
                        eventAccessibilityLabel
                          ? eventAccessibilityLabel(pe.event, { mode, isAllDay: false, ampm })
                          : defaultEventAccessibilityLabel({
                              title: pe.event.title,
                              isAllDay: false,
                              start: pe.event.start,
                              end: pe.event.end,
                              ampm,
                            })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPress();
                          return;
                        }
                        if (keyboardEventNavigation) onEventKeyDown(key, e);
                      }}
                      // Pointer move/up/cancel are handled at the document level
                      // (attached in beginDrag) so the drag survives the columns
                      // remounting on a page change.
                      onPointerDown={
                        canMove
                          ? (e) => beginDrag(e, pe, key, "move", dayIndex, onPress)
                          : undefined
                      }
                      onClick={canMove ? undefined : onPress}
                      {...dataState({ "data-dragging": !!active && !hiddenForMove })}
                      {...slot("event", {
                        base: {
                          position: "absolute",
                          top,
                          // Height is the event's duration, so it always tracks the
                          // grid's hour scale (zoom/resize). Content that doesn't fit
                          // is the renderer's concern: the built-in one clamps, and a
                          // custom renderer should adapt to the `boxHeight` it's given.
                          height: boxHeight,
                          left: `calc(${pe.column * widthPct}% + ${eventGap}px)`,
                          width: `calc(${widthPct}% - ${eventGap * 2}px)`,
                          cursor: canMove ? "grab" : "pointer",
                          touchAction: canMove ? "none" : "auto",
                          zIndex: active ? 3 : 1,
                          opacity: active ? 0.85 : 1,
                          visibility: hiddenForMove ? "hidden" : undefined,
                          // Snap the dragged box over the target day column so the
                          // drop location is visible before release.
                          ...(active && active.dayOffsetPx !== 0
                            ? { transform: `translateX(${active.dayOffsetPx}px)` }
                            : null),
                        },
                      })}
                    >
                      {Renderer ? (
                        <Renderer {...args} />
                      ) : (
                        <DefaultDomEvent {...args} theme={theme} boxProps={slot("eventBox")} />
                      )}
                      {canResize && !pe.continuesBefore ? (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            beginDrag(e, pe, key, "resize-start", dayIndex);
                          }}
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: 0,
                            height: 8,
                            cursor: "ns-resize",
                            touchAction: "none",
                          }}
                        />
                      ) : null}
                      {/* Only the segment that owns the real end may be resized
                          from the bottom (matching the native renderer). On a
                          continued segment the bottom edge is the day boundary,
                          not the event's end, so dragging it would move an end
                          the user can't see. */}
                      {canResize && !pe.continuesAfter ? (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            beginDrag(e, pe, key, "resize", dayIndex);
                          }}
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: 8,
                            cursor: "ns-resize",
                            touchAction: "none",
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {moveSegment ? (
                  <div
                    aria-hidden
                    {...dataState({ "data-dragging": true })}
                    {...slot("event", {
                      base: {
                        position: "absolute",
                        top: (moveSegment.startHours - windowStart) * hourHeight,
                        left: eventGap,
                        right: eventGap,
                        height: Math.max(moveSegment.durationHours * hourHeight, minEventHeight),
                        pointerEvents: "none",
                        zIndex: 3,
                        opacity: 0.85,
                      },
                    })}
                  >
                    {(() => {
                      const args: DomRenderEventArgs<T> = {
                        event: moveSegment.event,
                        mode,
                        isAllDay: false,
                        boxHeight: Math.max(moveSegment.durationHours * hourHeight, minEventHeight),
                        continuesBefore: moveSegment.continuesBefore,
                        continuesAfter: moveSegment.continuesAfter,
                        ampm,
                        onPress: () => {},
                      };
                      return Renderer ? (
                        <Renderer {...args} />
                      ) : (
                        <DefaultDomEvent {...args} theme={theme} boxProps={slot("eventBox")} />
                      );
                    })()}
                  </div>
                ) : null}
                {spill ? (
                  <div
                    aria-hidden
                    {...dataState({ "data-dragging": true })}
                    {...slot("event", {
                      base: {
                        position: "absolute",
                        // Anchored at midnight, which sits `windowStart` hours above
                        // the top of the grid. With a window that starts after 00:00
                        // the preview is scrolled out of view, exactly like the
                        // continuation the drop will commit.
                        top: -windowStart * hourHeight,
                        left: eventGap,
                        right: eventGap,
                        height: spill.boxHeight,
                        pointerEvents: "none",
                        zIndex: 3,
                        opacity: 0.85,
                      },
                    })}
                  >
                    {Renderer ? (
                      <Renderer {...spill} />
                    ) : (
                      <DefaultDomEvent {...spill} theme={theme} boxProps={slot("eventBox")} />
                    )}
                  </div>
                ) : null}
                {showNow ? (
                  <div
                    {...slot("nowIndicator", {
                      base: {
                        position: "absolute",
                        top: nowTop,
                        left: 0,
                        right: 0,
                        height: 0,
                        zIndex: 2,
                        pointerEvents: "none",
                      },
                    })}
                  >
                    <div style={{ height: 2, background: theme.nowIndicator }} />
                    <div
                      style={{
                        position: "absolute",
                        left: -3,
                        top: -3,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: theme.nowIndicator,
                      }}
                    />
                  </div>
                ) : null}
                {ghost ? (
                  <div
                    aria-hidden
                    {...slot("createGhost", {
                      base: {
                        position: "absolute",
                        left: eventGap,
                        right: eventGap,
                        top: ghost.topPx,
                        height: Math.max(ghost.heightPx, 2),
                        opacity: 0.7,
                        pointerEvents: "none",
                        zIndex: 2,
                      },
                      themed: {
                        background: theme.rangeBackground,
                        border: `1px solid ${theme.selectedBackground}`,
                        borderRadius: 6,
                      },
                    })}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {/* Floating drag ghost: shown only after a page change, when the dragged
          event's own column has unmounted. Positioned imperatively per pointer
          move (see moveDrag) and pointer-transparent so the drop hit-test reads
          the column beneath it. */}
      {paged && draggedRef.current ? (
        <div
          ref={ghostRef}
          aria-hidden
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            width: draggedRef.current.w,
            height: draggedRef.current.h,
            transform: `translate(${ptr.current.x - draggedRef.current.grabX}px, ${
              ptr.current.y - draggedRef.current.grabY
            }px)`,
            pointerEvents: "none",
            zIndex: 1000,
            opacity: 0.85,
          }}
        >
          {Renderer ? (
            <Renderer
              event={draggedRef.current.event}
              mode={mode}
              isAllDay={false}
              boxHeight={draggedRef.current.h}
              ampm={ampm}
              onPress={() => {}}
            />
          ) : (
            <DefaultDomEvent
              event={draggedRef.current.event}
              mode={mode}
              isAllDay={false}
              boxHeight={draggedRef.current.h}
              ampm={ampm}
              onPress={() => {}}
              theme={theme}
              boxProps={slot("eventBox")}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
