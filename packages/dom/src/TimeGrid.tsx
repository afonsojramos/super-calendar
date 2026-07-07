import { addDays, addMinutes, format, type Locale, startOfDay } from "date-fns";
import {
  type ComponentType,
  type CSSProperties,
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
  closedHourBands,
  eventAccessibilityLabel as defaultEventAccessibilityLabel,
  type EventAccessibilityLabeler,
  eventChipLayout,
  eventTimeLabel,
  formatHour,
  getIsToday,
  getViewDays,
  isAllDayEvent,
  isSameCalendarDay,
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
  | "event"
  | "eventBox"
  | "nowIndicator"
  | "createGhost";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const GUTTER_WIDTH = 56;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
  // Structural box metrics always apply; the card's look (colour, radius, type)
  // is themed and yields to a `eventBox` class when one is supplied.
  const boxBase: CSSProperties = {
    height: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
    lineHeight: `${DOM_TITLE_LINE_HEIGHT}px`,
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
      <div
        {...slot("header", {
          base: { display: "flex" },
          themed: { borderBottom: `1px solid ${theme.gridLine}` },
        })}
      >
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
              {...dataState({ "data-today": today })}
              {...slot("columnHeader", {
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
              })}
            >
              <span {...slot("columnHeaderWeekday", { themed: { fontSize: 11, fontWeight: 600 } })}>
                {format(day, weekdayFormatToken(weekdayFormat), dfns)}
              </span>
              <span
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
            </button>
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
              base: { width: GUTTER_WIDTH, flex: "none", textAlign: "right" },
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
          {/* Hour gutter */}
          <div
            {...slot("hourGutter", {
              base: { width: GUTTER_WIDTH, flex: "none", position: "relative" },
            })}
          >
            {HOURS.map((h) => (
              <div
                key={h}
                {...slot("hourLabel", {
                  base: { position: "absolute", top: h * hourHeight - 6, right: 6 },
                  themed: { fontSize: 10, color: theme.textMuted },
                })}
              >
                {hourComponent ? hourComponent(h, ampm) : h === 0 ? "" : formatHour(h, { ampm })}
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
                // Empty columns are a pointer-only create surface: drag to sweep
                // out an event. They are deliberately not tab stops, so keyboard
                // focus moves through events only, not every empty day.
                onPointerDown={cellEnabled ? (e) => beginCreate(e, dayIndex) : undefined}
                onPointerMove={cellEnabled ? moveCreate : undefined}
                onPointerUp={cellEnabled ? endCreate : undefined}
                onPointerCancel={cellEnabled ? cancelCreate : undefined}
                {...dataState({ "data-today": getIsToday(day) })}
                {...slot("dayColumn", {
                  base: { flex: 1, position: "relative" },
                  themed: { borderLeft: `1px solid ${theme.gridLine}` },
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
                        top: b.start * hourHeight,
                        height: (b.end - b.start) * hourHeight,
                        pointerEvents: "none",
                        zIndex: 0,
                      },
                      themed: { background: theme.outsideHoursBackground },
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
