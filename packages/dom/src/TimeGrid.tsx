import { addDays, addMinutes, format, getISOWeek, type Locale, startOfDay } from "date-fns";
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
  type CalendarEvent,
  type CalendarMode,
  cellRangeFromDrag,
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
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
  /** Show the current-time indicator on today's column (default true). */
  showNowIndicator?: boolean;
  /** Show the all-day lane above the grid (default true). */
  showAllDayEventCell?: boolean;
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
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

type DragState = {
  key: string;
  kind: "move" | "resize";
  startHours: number;
  durationHours: number;
  /** Whole day columns the box has been dragged across, clamped to the view. */
  dayDelta: number;
  /** Pixel equivalent of dayDelta, applied as a transform on the dragged box. */
  dayOffsetPx: number;
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

const NOW_TICK_MS = 60_000;

// A `Date` that advances every minute while `enabled`, so the now-indicator
// tracks the wall clock instead of freezing at the last render. Mirrors the
// native renderer's `useNow`.
function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

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
  showNowIndicator = true,
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
  className,
  style,
  classNames,
  styles,
}: TimeGridProps<T>): ReactElement {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const slot = createSlots<TimeGridSlot>({ classNames, styles });
  const scrollRef = useRef<HTMLDivElement>(null);
  const dfns = locale ? { locale } : undefined;
  const snapHours = dragStepMinutes / 60;

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

  // Ticks every minute so the red now-line follows the wall clock.
  const now = useNow(showNowIndicator);

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

  const beginDrag = (
    e: ReactPointerEvent,
    event: CalendarEvent<T>,
    key: string,
    kind: "move" | "resize",
    startHours: number,
    durationHours: number,
    dayIndex: number,
  ) => {
    if (!onDragEvent) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is best-effort; some environments reject it.
    }
    // The event box is positioned inside its day column, so the parent's width
    // is one day; columns are equal-width, so measuring one is enough. Resizes
    // never move across days, so 0 is fine there.
    const column = kind === "move" ? (e.currentTarget as HTMLElement).parentElement : null;
    const dayWidth = column ? column.getBoundingClientRect().width : 0;
    dragOrigin.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startHours,
      durationHours,
      dayIndex,
      dayWidth,
    };
    applyDrag({ key, kind, startHours, durationHours, dayDelta: 0, dayOffsetPx: 0, moved: false });
    onDragStart?.(event);
  };
  const cancelDrag = () => {
    applyDrag(null);
    dragOrigin.current = null;
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || !dragOrigin.current) return;
    // Read the live row height (ref, not the state closure) so a mid-drag zoom
    // keeps the math aligned with what's on screen.
    const dHours = (e.clientY - dragOrigin.current.pointerY) / hourHeightRef.current;
    const snap = (v: number) => Math.round(v / snapHours) * snapHours;
    if (d.kind === "move") {
      // Guard the upper bound: an event taller than the window would otherwise
      // invert the clamp (`windowEnd - duration < windowStart`) and teleport.
      const startHours = clamp(
        snap(dragOrigin.current.startHours + dHours),
        windowStart,
        Math.max(windowStart, windowEnd - d.durationHours),
      );
      // Map the horizontal drag to whole day columns, clamped so the event
      // can't leave the visible range (mirrors the native renderer).
      const o = dragOrigin.current;
      const rawDayDelta = o.dayWidth > 0 ? Math.round((e.clientX - o.pointerX) / o.dayWidth) : 0;
      const targetDay = clamp(o.dayIndex + rawDayDelta, 0, days.length - 1);
      const dayDelta = targetDay - o.dayIndex;
      applyDrag({ ...d, startHours, dayDelta, dayOffsetPx: dayDelta * o.dayWidth, moved: true });
    } else {
      const durationHours = clamp(
        snap(dragOrigin.current.durationHours + dHours),
        snapHours,
        Math.max(snapHours, windowEnd - d.startHours),
      );
      applyDrag({ ...d, durationHours, moved: true });
    }
  };
  const endDrag = (
    e: ReactPointerEvent,
    day: Date,
    event: CalendarEvent<T>,
    onPress: () => void,
  ) => {
    const d = dragRef.current;
    if (!d) return;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Best-effort release; ignore if the capture was never granted.
    }
    if (!d.moved) {
      applyDrag(null);
      onPress();
      return;
    }
    // The horizontal delta lands the event on another visible day column.
    const base = startOfDay(addDays(day, d.dayDelta));
    const start = addMinutes(base, Math.round(d.startHours * 60));
    const end = addMinutes(base, Math.round((d.startHours + d.durationHours) * 60));
    onDragEvent?.(event, start, end);
    applyDrag(null);
    dragOrigin.current = null;
  };

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
      const range = cellRangeFromDrag(day, o.startPx, endPx, h, windowStart, dragStepMinutes);
      if (range) onCreateEvent(range.start, range.end);
    } else if (onPressCell) {
      const at = cellRangeFromDrag(day, o.startPx, o.startPx, h, windowStart, dragStepMinutes);
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
        <div style={{ display: "flex", height: totalHeight, position: "relative" }}>
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
            return (
              <div
                key={day.toISOString()}
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
                    ...(isWeekend(day) ? { background: theme.weekendBackground } : null),
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
                      themed: { background: theme.outsideHoursBackground },
                    })}
                  />
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
                  const active = drag?.key === key ? drag : null;
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
                  const boxHeight = Math.max(durationHours * hourHeight, 14);
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
                  const draggable = !!onDragEvent;
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
                      onPointerDown={
                        draggable
                          ? (e) =>
                              beginDrag(
                                e,
                                pe.event,
                                key,
                                "move",
                                pe.startHours,
                                pe.durationHours,
                                dayIndex,
                              )
                          : undefined
                      }
                      onPointerMove={draggable ? moveDrag : undefined}
                      onPointerUp={
                        draggable ? (e) => endDrag(e, day, pe.event, onPress) : undefined
                      }
                      onPointerCancel={draggable ? cancelDrag : undefined}
                      onClick={draggable ? undefined : onPress}
                      {...dataState({ "data-dragging": !!active })}
                      {...slot("event", {
                        base: {
                          position: "absolute",
                          top,
                          // Height is the event's duration, so it always tracks the
                          // grid's hour scale (zoom/resize). Content that doesn't fit
                          // is the renderer's concern: the built-in one clamps, and a
                          // custom renderer should adapt to the `boxHeight` it's given.
                          height: boxHeight,
                          left: `calc(${pe.column * widthPct}% + 1px)`,
                          width: `calc(${widthPct}% - 2px)`,
                          cursor: draggable ? "grab" : "pointer",
                          touchAction: draggable ? "none" : "auto",
                          zIndex: active ? 3 : 1,
                          opacity: active ? 0.85 : 1,
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
                      {draggable ? (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            beginDrag(
                              e,
                              pe.event,
                              key,
                              "resize",
                              pe.startHours,
                              pe.durationHours,
                              dayIndex,
                            );
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
                        left: 1,
                        right: 1,
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
    </div>
  );
}
