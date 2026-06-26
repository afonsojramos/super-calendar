import { addMinutes, format, type Locale, startOfDay } from "date-fns";
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
  type CalendarEvent,
  type CalendarMode,
  getIsToday,
  getViewDays,
  isAllDayEvent,
  isSameCalendarDay,
  layoutDayEvents,
  type TimeGridMode,
  type WeekStartsOn,
} from "../headless";
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
  snapMinutes?: number;
  locale?: Locale;
  theme?: Partial<DomCalendarTheme>;
  height?: number | string;
  renderEvent?: DomRenderEvent<T>;
  onPressEvent?: (event: CalendarEvent<T>) => void;
  onPressDayHeader?: (day: Date) => void;
  /** Enables drag-to-move and resize; called with the proposed new start/end. */
  onDragEvent?: (event: CalendarEvent<T>, start: Date, end: Date) => void;
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

function DefaultDomEvent<T>({
  event,
  isAllDay,
  theme,
}: DomRenderEventArgs<T> & { theme: DomCalendarTheme }) {
  return (
    <div
      style={{
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        padding: "2px 6px",
        borderRadius: 6,
        background: theme.eventBackground,
        color: theme.eventText,
        fontSize: 12,
        lineHeight: 1.25,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          overflow: "hidden",
        }}
      >
        {event.title}
      </div>
      {!isAllDay ? (
        <div style={{ opacity: 0.75 }}>
          {format(event.start, "HH:mm")}–{format(event.end, "HH:mm")}
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
  snapMinutes = 15,
  locale,
  theme: themeOverrides,
  height = 600,
  renderEvent,
  onPressEvent,
  onPressDayHeader,
  onDragEvent,
  className,
  style,
}: TimeGridProps<T>) {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dfns = locale ? { locale } : undefined;
  const snapHours = snapMinutes / 60;

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

  const days = useMemo(
    () => getViewDays(mode, date, weekStartsOn, numberOfDays),
    [mode, date, weekStartsOn, numberOfDays],
  );

  const allDayByDay = useMemo(
    () =>
      days.map((day) => events.filter((e) => isAllDayEvent(e) && isSameCalendarDay(e.start, day))),
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
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || !dragOrigin.current) return;
    const dHours = (e.clientY - dragOrigin.current.pointerY) / hourHeight;
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
              onClick={onPressDayHeader ? () => onPressDayHeader(day) : undefined}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                font: "inherit",
                color: theme.textMuted,
                cursor: onPressDayHeader ? "pointer" : "default",
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
      {hasAllDay ? (
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
          {allDayByDay.map((list, i) => (
            <div
              key={days[i].toISOString()}
              style={{ flex: 1, padding: 2, display: "flex", flexDirection: "column", gap: 2 }}
            >
              {list.map((event, j) => {
                const args: DomRenderEventArgs<T> = {
                  event,
                  mode,
                  isAllDay: true,
                  onPress: () => onPressEvent?.(event),
                };
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => onPressEvent?.(event)}
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
          ))}
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
            const positioned = layoutDayEvents(events, day);
            const showNow = isSameCalendarDay(day, new Date());
            const nowDate = new Date();
            const nowTop = ((nowDate.getHours() * 60 + nowDate.getMinutes()) / 60) * hourHeight;
            return (
              <div
                key={day.toISOString()}
                style={{
                  flex: 1,
                  position: "relative",
                  borderLeft: `1px solid ${theme.gridLine}`,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, ${theme.gridLine} ${hourHeight - 1}px, ${theme.gridLine} ${hourHeight}px)`,
                }}
              >
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
                    onPress,
                  };
                  const draggable = !!onDragEvent;
                  return (
                    <div
                      key={idx}
                      onPointerDown={
                        draggable
                          ? (e) => beginDrag(e, key, "move", pe.startHours, pe.durationHours)
                          : undefined
                      }
                      onPointerMove={draggable ? moveDrag : undefined}
                      onPointerUp={
                        draggable ? (e) => endDrag(e, day, pe.event, onPress) : undefined
                      }
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
                          onPointerDown={(e) =>
                            beginDrag(e, key, "resize", pe.startHours, pe.durationHours)
                          }
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
