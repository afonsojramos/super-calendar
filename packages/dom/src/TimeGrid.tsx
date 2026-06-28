import { addDays, addMinutes, format, type Locale, startOfDay } from "date-fns";
import {
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
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
  closedHourBands,
  eventAccessibilityLabel,
  eventChipLayout,
  eventTimeLabel,
  getIsToday,
  getViewDays,
  isAllDayEvent,
  isSameCalendarDay,
  layoutDayEvents,
  type TimeGridMode,
  titleNumberOfLines,
  type WeekStartsOn,
} from "@super-calendar/core";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const GUTTER_WIDTH = 56;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Props passed to a custom time-grid event renderer. */
export interface DomRenderEventArgs<T = unknown> {
  event: CalendarEvent<T>;
  mode: CalendarMode;
  isAllDay: boolean;
  boxHeight?: number;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  /** Show the time range in 12-hour AM/PM. */
  ampm?: boolean;
  onPress: () => void;
}

export type DomRenderEvent<T = unknown> = ComponentType<DomRenderEventArgs<T>>;

export interface TimeGridProps<T = unknown> {
  date: Date;
  events?: CalendarEvent<T>[];
  /** "day" (default), "3days", "week", or "custom" (with `numberOfDays`). */
  mode?: TimeGridMode;
  numberOfDays?: number;
  weekStartsOn?: WeekStartsOn;
  /** Initial pixels per hour (default 48). */
  hourHeight?: number;
  /** Initial scroll position, in minutes from midnight (default 8:00). */
  scrollOffsetMinutes?: number;
  /** Pinch / Ctrl-⌘-scroll to zoom the grid (default true). */
  zoomable?: boolean;
  minHourHeight?: number;
  maxHourHeight?: number;
  /** Snap dragged events to this many minutes (default 15). */
  dragStepMinutes?: number;
  /** Render event time ranges in 12-hour AM/PM (default false, 24h). */
  ampm?: boolean;
  /** Sub-divisions per hour for the grid lines, e.g. 2 for half-hour (default 1). */
  timeslots?: number;
  /** Shade the hours outside business hours; `null` shades the whole day. */
  businessHours?: BusinessHours;
  /** Show the current-time indicator on today's column (default true). */
  showNowIndicator?: boolean;
  /** Show the all-day lane above the grid (default true). */
  showAllDayEventCell?: boolean;
  locale?: Locale;
  theme?: Partial<DomCalendarTheme>;
  height?: number | string;
  renderEvent?: DomRenderEvent<T>;
  onPressEvent?: (event: CalendarEvent<T>) => void;
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
  className?: string;
  style?: CSSProperties;
}

type DragState = {
  key: string;
  kind: "move" | "resize";
  startHours: number;
  durationHours: number;
  moved: boolean;
};

// Chip line metrics, matched to the box font below so the title clamp lands on a
// line boundary. fontSize 12 * lineHeight 1.25 = 15px per line; the time reserves
// two lines (it wraps to a second line on a narrow column).
const DOM_TITLE_LINE_HEIGHT = 15;
const DOM_TIME_LINE_HEIGHT = 30;
const DOM_BOX_PADDING_V = 2;

function DefaultDomEvent<T>({
  event,
  mode,
  isAllDay,
  boxHeight,
  ampm = false,
  theme,
}: DomRenderEventArgs<T> & { theme: DomCalendarTheme }) {
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
  return (
    <div
      style={{
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        padding: `${DOM_BOX_PADDING_V}px 6px`,
        borderRadius: 6,
        background: theme.eventBackground,
        color: theme.eventText,
        fontSize: 12,
        lineHeight: `${DOM_TITLE_LINE_HEIGHT}px`,
      }}
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

/**
 * A day / week / N-day time grid rendered with plain DOM elements. Events are
 * positioned with the library's pure `layoutDayEvents`, so overlap columns and
 * multi-day clipping match the React Native renderer. Supports Ctrl/⌘-scroll and
 * two-finger pinch to zoom, and pointer drag to move / resize events.
 */
export function TimeGrid<T = unknown>({
  date,
  events = [],
  mode = "day",
  numberOfDays = 1,
  weekStartsOn = 0,
  hourHeight: initialHourHeight = 48,
  scrollOffsetMinutes = 8 * 60,
  zoomable = true,
  minHourHeight = 24,
  maxHourHeight = 160,
  dragStepMinutes = 15,
  ampm = false,
  timeslots = 1,
  businessHours,
  showNowIndicator = true,
  showAllDayEventCell = true,
  locale,
  theme: themeOverrides,
  height = 600,
  renderEvent,
  onPressEvent,
  onPressDateHeader,
  onPressCell,
  onCreateEvent,
  onDragStart,
  onDragEvent,
  className,
  style,
}: TimeGridProps<T>) {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dfns = locale ? { locale } : undefined;
  const snapHours = dragStepMinutes / 60;

  const [hourHeight, setHourHeight] = useState(initialHourHeight);
  useEffect(() => setHourHeight(initialHourHeight), [initialHourHeight]);
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;

  // `drag` drives the visual; `dragRef` is the source of truth the pointer
  // handlers read, so they never see a stale state closure between events.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragOrigin = useRef<{ pointerY: number; startHours: number; durationHours: number } | null>(
    null,
  );
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
    () => getViewDays(mode, date, weekStartsOn, numberOfDays),
    [mode, date, weekStartsOn, numberOfDays],
  );

  const allDayByDay = useMemo(
    // A multi-day all-day event shows in every column it overlaps (matching the
    // native AllDayLane), not just its start day.
    () =>
      days.map((day) => {
        const dayStart = startOfDay(day);
        const dayEnd = addDays(dayStart, 1);
        return events.filter((e) => isAllDayEvent(e) && e.start < dayEnd && e.end > dayStart);
      }),
    [days, events],
  );
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  useEffect(() => {
    // On mount / when the offset prop changes, not on every zoom (hence the ref).
    if (scrollRef.current)
      scrollRef.current.scrollTop = (scrollOffsetMinutes / 60) * hourHeightRef.current;
  }, [scrollOffsetMinutes]);

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
  const totalHeight = 24 * hourHeight;

  const beginDrag = (
    e: ReactPointerEvent,
    event: CalendarEvent<T>,
    key: string,
    kind: "move" | "resize",
    startHours: number,
    durationHours: number,
  ) => {
    if (!onDragEvent) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is best-effort; some environments reject it.
    }
    dragOrigin.current = { pointerY: e.clientY, startHours, durationHours };
    applyDrag({ key, kind, startHours, durationHours, moved: false });
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
      const startHours = clamp(
        snap(dragOrigin.current.startHours + dHours),
        0,
        24 - d.durationHours,
      );
      applyDrag({ ...d, startHours, moved: true });
    } else {
      const durationHours = clamp(
        snap(dragOrigin.current.durationHours + dHours),
        snapHours,
        24 - d.startHours,
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
    const base = startOfDay(day);
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
      const range = cellRangeFromDrag(day, o.startPx, endPx, h, 0, dragStepMinutes);
      if (range) onCreateEvent(range.start, range.end);
    } else if (onPressCell) {
      const at = cellRangeFromDrag(day, o.startPx, o.startPx, h, 0, dragStepMinutes);
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
  // Keyboard equivalent of tapping/sweeping the grid: a focusable column fires
  // this on Enter/Space at the currently visible top of the grid, so
  // create/press-cell don't require a pointer.
  const activateCell = (day: Date) => {
    const visibleMinutes = ((scrollRef.current?.scrollTop ?? 0) / hourHeightRef.current) * 60;
    const at = addMinutes(
      startOfDay(day),
      Math.round(visibleMinutes / dragStepMinutes) * dragStepMinutes,
    );
    if (onPressCell) onPressCell(at);
    else if (onCreateEvent) onCreateEvent(at, addMinutes(at, dragStepMinutes));
  };

  // Per-day layout and shading are pure functions of days/events/businessHours,
  // so memoize them — otherwise every drag pointermove (which calls setDrag)
  // re-runs the full layout for each column.
  const positionedByDay = useMemo(
    () => days.map((day) => layoutDayEvents(events, day)),
    [days, events],
  );
  // The dom grid always renders a full 0–24 window (no minHour/maxHour props), so
  // closedHourBands uses its 0/24 defaults.
  const bandsByDay = useMemo(
    () => days.map((day) => closedHourBands(day, businessHours)),
    [days, businessHours],
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
      <div style={{ display: "flex", borderBottom: `1px solid ${theme.gridLine}` }}>
        <div style={{ width: GUTTER_WIDTH, flex: "none" }} />
        {days.map((day) => {
          const today = getIsToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              tabIndex={onPressDateHeader ? 0 : -1}
              aria-hidden={onPressDateHeader ? undefined : true}
              onClick={onPressDateHeader ? () => onPressDateHeader(day) : undefined}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                font: "inherit",
                color: theme.textMuted,
                cursor: onPressDateHeader ? "pointer" : "default",
                padding: "6px 0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600 }}>{format(day, "EEE", dfns)}</span>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  fontWeight: 600,
                  background: today ? theme.todayBackground : "transparent",
                  color: today ? theme.todayText : theme.text,
                }}
              >
                {format(day, "d", dfns)}
              </span>
            </button>
          );
        })}
      </div>

      {/* All-day lane */}
      {showAllDayEventCell && hasAllDay ? (
        <div style={{ display: "flex", borderBottom: `1px solid ${theme.gridLine}` }}>
          <div
            style={{
              width: GUTTER_WIDTH,
              flex: "none",
              fontSize: 10,
              color: theme.textMuted,
              textAlign: "right",
              padding: "4px 6px 0 0",
            }}
          >
            all-day
          </div>
          {allDayByDay.map((list, i) => {
            const dayStart = startOfDay(days[i]);
            const dayEnd = addDays(dayStart, 1);
            return (
              <div
                key={days[i].toISOString()}
                style={{
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
                }}
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
                      aria-label={eventAccessibilityLabel({
                        title: event.title,
                        isAllDay: true,
                        start: event.start,
                        end: event.end,
                        ampm,
                      })}
                      style={{
                        border: "none",
                        padding: 0,
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        height: 22,
                      }}
                    >
                      {Renderer ? (
                        <Renderer {...args} />
                      ) : (
                        <DefaultDomEvent {...args} theme={theme} />
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
          {/* Hour gutter */}
          <div style={{ width: GUTTER_WIDTH, flex: "none", position: "relative" }}>
            {HOURS.map((h) => (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: h * hourHeight - 6,
                  right: 6,
                  fontSize: 10,
                  color: theme.textMuted,
                }}
              >
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIndex) => {
            const positioned = positionedByDay[dayIndex];
            const showNow = showNowIndicator && isSameCalendarDay(day, new Date());
            const nowDate = new Date();
            const nowTop = ((nowDate.getHours() * 60 + nowDate.getMinutes()) / 60) * hourHeight;
            const bands = bandsByDay[dayIndex];
            const ghost = createBox?.dayIndex === dayIndex ? createBox : null;
            return (
              <div
                key={day.toISOString()}
                role={cellEnabled ? "button" : undefined}
                tabIndex={cellEnabled ? 0 : undefined}
                aria-label={
                  cellEnabled ? `Add event on ${format(day, "EEEE, d MMMM yyyy", dfns)}` : undefined
                }
                onPointerDown={cellEnabled ? (e) => beginCreate(e, dayIndex) : undefined}
                onPointerMove={cellEnabled ? moveCreate : undefined}
                onPointerUp={cellEnabled ? endCreate : undefined}
                onPointerCancel={cellEnabled ? cancelCreate : undefined}
                onKeyDown={
                  cellEnabled
                    ? (e) => {
                        // Don't hijack Enter/Space aimed at a focused event chip.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          activateCell(day);
                        }
                      }
                    : undefined
                }
                style={{
                  flex: 1,
                  position: "relative",
                  borderLeft: `1px solid ${theme.gridLine}`,
                  cursor: cellEnabled ? "crosshair" : "default",
                }}
              >
                {/* Business-hours shade, behind the grid lines and events. */}
                {bands.map((b) => (
                  <div
                    key={b.start}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: b.start * hourHeight,
                      height: (b.end - b.start) * hourHeight,
                      background: theme.outsideHoursBackground,
                      pointerEvents: "none",
                      zIndex: 0,
                    }}
                  />
                ))}
                {/* Grid lines, painted over the shade so they stay visible. */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 0,
                    backgroundImage: gridLines,
                  }}
                />
                {positioned.map((pe, idx) => {
                  const key = `${dayIndex}:${idx}`;
                  const active = drag?.key === key ? drag : null;
                  const startHours = active ? active.startHours : pe.startHours;
                  const durationHours = active ? active.durationHours : pe.durationHours;
                  const top = startHours * hourHeight;
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
                      tabIndex={0}
                      aria-label={eventAccessibilityLabel({
                        title: pe.event.title,
                        isAllDay: false,
                        start: pe.event.start,
                        end: pe.event.end,
                        ampm,
                      })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onPress();
                        }
                      }}
                      onPointerDown={
                        draggable
                          ? (e) =>
                              beginDrag(e, pe.event, key, "move", pe.startHours, pe.durationHours)
                          : undefined
                      }
                      onPointerMove={draggable ? moveDrag : undefined}
                      onPointerUp={
                        draggable ? (e) => endDrag(e, day, pe.event, onPress) : undefined
                      }
                      onPointerCancel={draggable ? cancelDrag : undefined}
                      onClick={draggable ? undefined : onPress}
                      style={{
                        position: "absolute",
                        top,
                        height: boxHeight,
                        left: `calc(${pe.column * widthPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        cursor: draggable ? "grab" : "pointer",
                        touchAction: draggable ? "none" : "auto",
                        zIndex: active ? 3 : 1,
                        opacity: active ? 0.85 : 1,
                      }}
                    >
                      {Renderer ? (
                        <Renderer {...args} />
                      ) : (
                        <DefaultDomEvent {...args} theme={theme} />
                      )}
                      {draggable ? (
                        <div
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            beginDrag(e, pe.event, key, "resize", pe.startHours, pe.durationHours);
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
                    style={{
                      position: "absolute",
                      top: nowTop,
                      left: 0,
                      right: 0,
                      height: 0,
                      zIndex: 2,
                      pointerEvents: "none",
                    }}
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
                    style={{
                      position: "absolute",
                      left: 1,
                      right: 1,
                      top: ghost.topPx,
                      height: Math.max(ghost.heightPx, 2),
                      background: theme.rangeBackground,
                      border: `1px solid ${theme.selectedBackground}`,
                      borderRadius: 6,
                      opacity: 0.7,
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
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
