import { addMinutes, startOfDay } from "date-fns";
import type {
  ComponentType,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  ReactNode,
} from "react";
import { useMemo, useRef, useState } from "react";
import {
  backgroundBandsForDay,
  type BusinessHoursBand,
  type CalendarEvent,
  isSameCalendarDay,
  useNow,
  cellRangeFromDrag,
  closedHourBands,
  eventTimeLabel,
  formatHour,
  layoutDayEvents,
} from "@super-calendar/core";
import { createSlots, dataState, type ResolvedSlot, type SlotStyleProps } from "./slots";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/**
 * Styleable parts of {@link ResourceTimeline}. Pass a class or inline style per
 * slot via the `classNames` / `styles` props.
 */
export type ResourceTimelineSlot =
  | "header"
  | "corner"
  | "timeAxis"
  | "hourTick"
  | "resourceLabel"
  | "row"
  | "track"
  | "gridLines"
  | "businessHours"
  | "backgroundEvent"
  | "event"
  | "eventBox"
  | "nowIndicator"
  | "createGhost";

/** A schedulable lane (room, person, machine) that events are grouped under. */
export interface Resource {
  /** Stable id events reference via their `resourceId`. */
  id: string;
  /** Row label; falls back to the id. */
  title?: string;
}

/** Props passed to a custom resource-timeline event renderer. */
export interface ResourceEventArgs<T = unknown> {
  event: CalendarEvent<T>;
  /**
   * Pixel width of the event bar. In the vertical orientation the columns flex
   * to the container, so this is 0 there; size against `height` instead.
   */
  width: number;
  /** Pixel height of the event bar; set in the vertical orientation. */
  height?: number;
  onPress: () => void;
}

/** Props for {@link ResourceTimeline}. */
export interface ResourceTimelineProps<T = unknown> extends SlotStyleProps<ResourceTimelineSlot> {
  /** The day to lay out along the time axis. */
  date: Date;
  /**
   * Lay the day out along the horizontal axis with resources as rows (the
   * default), or down the vertical axis with resources as columns, like the
   * time grid. Vertical reads better on narrow screens: the columns share the
   * width instead of the axis scrolling sideways.
   */
  orientation?: "horizontal" | "vertical";
  /** The resource lanes: rows when horizontal, columns when vertical. */
  resources: Resource[];
  /**
   * Cap the number of lanes shown at once; the rest sit on further pages. Pair
   * with `resourcePage` and your own prev/next controls to page through them
   * (like `date` drives the time axis). Omit to show every lane, sharing the
   * available space.
   */
  resourcesPerPage?: number;
  /**
   * The 0-based page of lanes to show when `resourcesPerPage` is set (default
   * 0, clamped to the last page). Controlled: update it from your own paging
   * controls.
   */
  resourcePage?: number;
  /** Events; each is placed in the row named by `resourceId(event)`. */
  events: CalendarEvent<T>[];
  /** Read an event's resource id. Default: `event.resourceId`. */
  resourceId?: (event: CalendarEvent<T>) => string | undefined;
  /** First hour shown (default 0). */
  startHour?: number;
  /** Last hour shown, exclusive (default 24). */
  endHour?: number;
  /** Pixels per hour along the horizontal axis (default 80). Horizontal only. */
  hourWidth?: number;
  /** Pixels per hour down the vertical axis (default 48). Vertical only. */
  hourHeight?: number;
  /** Height of each resource row in px (default 56). Horizontal only. */
  rowHeight?: number;
  /** Width of the left resource-label column in px (default 140). Horizontal only. */
  labelWidth?: number;
  /** 12-hour AM/PM axis labels (default false). */
  ampm?: boolean;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<DomCalendarTheme>;
  /** Custom event renderer; falls back to the built-in bar. */
  renderEvent?: ComponentType<ResourceEventArgs<T>>;
  /** Tap an event. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /**
   * Enables drag-to-move and edge-resize along the time axis; called with the
   * proposed new start/end. Return `false` to reject the drop (it snaps back).
   */
  onDragEvent?: (
    event: CalendarEvent<T>,
    start: Date,
    end: Date,
    resource: Resource,
  ) => void | boolean;
  /** Tap empty lane space; called with the snapped time and the lane's resource. */
  onPressCell?: (at: Date, resource: Resource) => void;
  /** Drag empty lane space to create; called with the swept start/end and the lane's resource. */
  onCreateEvent?: (start: Date, end: Date, resource: Resource) => void;
  /**
   * Shade the hours outside this window, per lane. Same shape as the Calendar's
   * `businessHours` plus the lane's resource, so per-resource opening hours work
   * (return `null` for a fully closed lane). A date-only function is accepted.
   */
  businessHours?: (date: Date, resource: Resource) => { start: number; end: number } | null;
  /**
   * Render a closed-hours band's content yourself (a label, icon, pattern). The
   * board keeps positioning the band; when set, the themed tint is dropped and
   * your output fills the band instead. Receives the lane's resource. Decorative only: the
   * band stays non-interactive and hidden from assistive tech.
   */
  renderBusinessHours?: (band: BusinessHoursBand & { resource: Resource }) => ReactNode;
  /** Snap dragged events to this many minutes (default 15). */
  dragStepMinutes?: number;
  /** Show the current-time line when `date` is today (default true). */
  showNowIndicator?: boolean;
  /** Fixed "now" instant for the indicator (doesn't tick). Defaults to the device clock. */
  now?: Date;
  /** Shift the now indicator into this IANA zone (pair with `eventsInTimeZone`). */
  timeZone?: string;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Hour-gutter width in the vertical orientation, matching the time grid's axis.
const GUTTER_WIDTH = 56;

type DragState = {
  key: string;
  /** The lane the drag started in, so its row can be lifted while dragging. */
  resourceId: string;
  kind: "move" | "resize";
  startHours: number;
  durationHours: number;
  /** Live cross-axis offset (px) of a move, for the follow-the-pointer ghost. */
  crossPx: number;
  moved: boolean;
};

function DefaultBar<T>({
  event,
  height,
  boxProps,
  theme,
}: ResourceEventArgs<T> & { boxProps: ResolvedSlot; theme: DomCalendarTheme }) {
  // Vertical bars gate the time line on their height (short slots show just the
  // title); horizontal bars keep it always, as before.
  const showTime = height != null ? height > 34 : true;
  const time = eventTimeLabel({
    mode: "day",
    isAllDay: false,
    start: event.start,
    end: event.end,
    ampm: false,
    showTime: true,
  });
  const base: CSSProperties = { height: "100%", boxSizing: "border-box", overflow: "hidden" };
  const themed: CSSProperties = {
    padding: "2px 6px",
    borderRadius: 6,
    background: theme.eventBackground,
    color: theme.eventText,
    fontSize: 12,
  };
  return (
    <div
      className={boxProps.className}
      data-slot={boxProps["data-slot"]}
      style={
        boxProps.className
          ? { ...base, ...boxProps.style }
          : { ...base, ...themed, ...boxProps.style }
      }
    >
      <div
        style={{
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {event.title}
      </div>
      {time && showTime ? <div style={{ opacity: 0.75, fontSize: 11 }}>{time}</div> : null}
    </div>
  );
}

/**
 * A horizontal resource timeline: rows are resources (rooms, people, machines)
 * and the x-axis is one day's hours. Events sit in their resource's row, and
 * overlapping events in the same row stack into sub-lanes (via the shared
 * `layoutDayEvents`). Pass `onDragEvent` to enable drag-to-move and edge-resize
 * along the axis.
 *
 * @example
 * ```tsx
 * <ResourceTimeline
 *   date={new Date()}
 *   resources={[{ id: "a", title: "Room A" }, { id: "b", title: "Room B" }]}
 *   events={events} // each event carries a `resourceId`
 * />
 * ```
 */
export function ResourceTimeline<T = unknown>({
  date,
  orientation = "horizontal",
  resources: allResources,
  resourcesPerPage,
  resourcePage = 0,
  events,
  resourceId = (event) => (event as { resourceId?: string }).resourceId,
  startHour = 0,
  endHour = 24,
  hourWidth = 80,
  hourHeight = 48,
  rowHeight = 56,
  labelWidth = 140,
  ampm = false,
  theme: themeOverrides,
  renderEvent,
  onPressEvent,
  onDragEvent,
  onPressCell,
  onCreateEvent,
  businessHours,
  renderBusinessHours,
  dragStepMinutes = 15,
  showNowIndicator = true,
  now: nowProp,
  timeZone,
  className,
  style,
  classNames,
  styles,
}: ResourceTimelineProps<T>): ReactElement {
  // Window the lanes to the requested page when resourcesPerPage caps them.
  const resources = useMemo(() => {
    if (!resourcesPerPage || resourcesPerPage <= 0) return allResources;
    const pages = Math.max(1, Math.ceil(allResources.length / resourcesPerPage));
    const page = Math.min(Math.max(resourcePage, 0), pages - 1);
    return allResources.slice(page * resourcesPerPage, (page + 1) * resourcesPerPage);
  }, [allResources, resourcesPerPage, resourcePage]);
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const slot = createSlots<ResourceTimelineSlot>({ classNames, styles });
  const Renderer = renderEvent;
  const snapHours = dragStepMinutes / 60;
  const vertical = orientation === "vertical";
  // Pixels per hour along whichever axis carries the time.
  const hourSize = vertical ? hourHeight : hourWidth;
  // The current-time line, shown only when the board's day is the zone's today.
  const now = useNow(showNowIndicator, { now: nowProp, timeZone });
  const nowHours = now.getHours() + now.getMinutes() / 60;
  const showNow =
    showNowIndicator &&
    isSameCalendarDay(now, date) &&
    nowHours >= startHour &&
    nowHours <= endHour;
  const nowLine = (resourceKey: string) =>
    showNow ? (
      <div
        key={`now-${resourceKey}`}
        aria-hidden
        {...slot("nowIndicator", {
          base: vertical
            ? {
                position: "absolute",
                left: 0,
                right: 0,
                top: (nowHours - startHour) * hourSize,
                height: 2,
                pointerEvents: "none",
                zIndex: 2,
              }
            : {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: (nowHours - startHour) * hourSize,
                width: 2,
                pointerEvents: "none",
                zIndex: 2,
              },
          themed: { background: theme.nowIndicator },
        })}
      />
    ) : null;

  // `drag` drives the visual; `dragRef` is the source of truth the pointer
  // handlers read so they never see a stale closure between events.
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const origin = useRef<{
    x: number;
    cross: number;
    startHours: number;
    durationHours: number;
  } | null>(null);
  const applyDrag = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const beginDrag = (
    e: ReactPointerEvent,
    key: string,
    resourceId: string,
    kind: "move" | "resize",
    startHours: number,
    durationHours: number,
  ) => {
    if (!onDragEvent) return;
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
    origin.current = {
      x: vertical ? e.clientY : e.clientX,
      cross: vertical ? e.clientX : e.clientY,
      startHours,
      durationHours,
    };
    applyDrag({ key, resourceId, kind, startHours, durationHours, crossPx: 0, moved: false });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || !origin.current) return;
    const dHours = ((vertical ? e.clientY : e.clientX) - origin.current.x) / hourSize;
    const snap = (v: number) => Math.round(v / snapHours) * snapHours;
    if (d.kind === "move") {
      const startHours = clamp(
        snap(origin.current.startHours + dHours),
        startHour,
        endHour - d.durationHours,
      );
      const crossPx = (vertical ? e.clientX : e.clientY) - origin.current.cross;
      applyDrag({ ...d, startHours, crossPx, moved: true });
    } else {
      const durationHours = clamp(
        snap(origin.current.durationHours + dHours),
        snapHours,
        endHour - d.startHours,
      );
      applyDrag({ ...d, durationHours, moved: true });
    }
  };
  // Which visible lane the pointer is over, found by hit-testing rather than
  // measuring flexed columns. The dragged bar is momentarily made
  // pointer-transparent so `elementFromPoint` sees the lane, not the bar (which
  // stays a DOM child of its origin lane however far it's visually translated).
  const laneAt = (e: ReactPointerEvent, fallback: Resource): Resource => {
    if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
      return fallback;
    }
    const bar = e.currentTarget as HTMLElement;
    const prev = bar.style.pointerEvents;
    // Restore in a finally: a left-behind "none" would permanently disable this
    // bar, since React never re-manages this imperatively-set inline style.
    let hit: Element | null;
    bar.style.pointerEvents = "none";
    try {
      hit = document.elementFromPoint(e.clientX, e.clientY);
    } finally {
      bar.style.pointerEvents = prev;
    }
    const laneEl = (hit as HTMLElement | null)?.closest?.("[data-resource-id]");
    const id = laneEl?.getAttribute("data-resource-id");
    return (id && resources.find((r) => r.id === id)) || fallback;
  };
  const endDrag = (
    e: ReactPointerEvent,
    event: CalendarEvent<T>,
    resource: Resource,
    onPress: () => void,
  ) => {
    const d = dragRef.current;
    if (!d) return;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Best-effort release.
    }
    if (!d.moved) {
      applyDrag(null);
      onPress();
      return;
    }
    const target = d.kind === "move" ? laneAt(e, resource) : resource;
    const base = startOfDay(date);
    const start = addMinutes(base, Math.round(d.startHours * 60));
    const end = addMinutes(base, Math.round((d.startHours + d.durationHours) * 60));
    onDragEvent?.(event, start, end, target);
    applyDrag(null);
    origin.current = null;
  };
  const cancelDrag = () => {
    applyDrag(null);
    origin.current = null;
  };

  // Create-by-drag / tap on empty lane space, mirroring the time grid: mouse and
  // pen sweep out a new event, and a tap without movement fires onPressCell. Touch
  // is left free to scroll the board, so cell taps are pointer (mouse/pen) only.
  const [createBox, setCreateBox] = useState<{
    resourceKey: string;
    startPx: number;
    curPx: number;
  } | null>(null);
  const createOrigin = useRef<{ el: HTMLElement; resource: Resource; startPx: number } | null>(
    null,
  );
  const cellEnabled = !!onPressCell || !!onCreateEvent;
  const pxAlongAxis = (el: HTMLElement, e: ReactPointerEvent) => {
    const rect = el.getBoundingClientRect();
    return vertical ? e.clientY - rect.top : e.clientX - rect.left;
  };
  const beginCreate = (e: ReactPointerEvent, resource: Resource) => {
    // Only from the lane background, primary button, never on an event bar.
    if (!cellEnabled || e.pointerType === "touch") return;
    if (e.target !== e.currentTarget || e.button > 0) return;
    const el = e.currentTarget as HTMLElement;
    const startPx = pxAlongAxis(el, e);
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Best-effort capture.
    }
    createOrigin.current = { el, resource, startPx };
    // Only preview a ghost when a create can happen; in press-only mode
    // (onPressCell without onCreateEvent) the tap still commits via endCreate.
    if (onCreateEvent) setCreateBox({ resourceKey: resource.id, startPx, curPx: startPx });
  };
  const moveCreate = (e: ReactPointerEvent) => {
    const o = createOrigin.current;
    if (!o || !onCreateEvent) return;
    setCreateBox({ resourceKey: o.resource.id, startPx: o.startPx, curPx: pxAlongAxis(o.el, e) });
  };
  const endCreate = (e: ReactPointerEvent) => {
    const o = createOrigin.current;
    if (!o) return;
    try {
      o.el.releasePointerCapture?.(e.pointerId);
    } catch {
      // Best-effort release.
    }
    const endPx = pxAlongAxis(o.el, e);
    const moved = Math.abs(endPx - o.startPx) > 4;
    if (moved && onCreateEvent) {
      const range = cellRangeFromDrag(date, o.startPx, endPx, hourSize, startHour, dragStepMinutes);
      if (range) onCreateEvent(range.start, range.end, o.resource);
    } else if (onPressCell) {
      const at = cellRangeFromDrag(
        date,
        o.startPx,
        o.startPx,
        hourSize,
        startHour,
        dragStepMinutes,
      );
      if (at) onPressCell(at.start, o.resource);
    }
    createOrigin.current = null;
    setCreateBox(null);
  };
  // A gesture the browser cancels (scroll takeover, etc.) must not commit.
  const cancelCreate = () => {
    createOrigin.current = null;
    setCreateBox(null);
  };
  const trackInteractionProps = (resource: Resource) =>
    cellEnabled
      ? {
          onPointerDown: (e: ReactPointerEvent) => beginCreate(e, resource),
          onPointerMove: moveCreate,
          onPointerUp: endCreate,
          onPointerCancel: cancelCreate,
        }
      : null;
  // The closed-hours bands to shade in a lane, resolved per resource.
  const bandsFor = (resource: Resource) =>
    businessHours
      ? closedHourBands(date, (d) => businessHours(d, resource), startHour, endHour)
      : [];
  // `display: "background"` events in a lane, clipped to the visible window.
  const backgroundBandsFor = (resource: Resource) =>
    backgroundBandsForDay(
      events.filter((e) => resourceId(e) === resource.id),
      date,
    )
      .map((b) => ({
        ...b,
        startHours: Math.max(b.startHours, startHour),
        endHours: Math.min(b.endHours, endHour),
      }))
      .filter((b) => b.endHours > b.startHours);

  const hours = useMemo(
    () => Array.from({ length: Math.max(0, endHour - startHour) }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const trackWidth = (endHour - startHour) * hourWidth;

  // Group the positioned (overlap-resolved) events by resource, once.
  const byResource = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutDayEvents<T>>>();
    for (const resource of resources) {
      const own = events.filter((e) => resourceId(e) === resource.id);
      map.set(resource.id, layoutDayEvents(own, date));
    }
    return map;
  }, [resources, events, resourceId, date]);

  // The lane a move is dragging in, lifted above its siblings so the ghost
  // stays visible as it crosses into another lane (a later DOM sibling).
  const dragLaneId = drag?.kind === "move" && drag.moved ? drag.resourceId : null;

  if (vertical) {
    // Time flows down like the time grid: hour gutter on the left, one flexed
    // column per resource, so narrow screens share the width instead of
    // scrolling sideways.
    const trackHeight = (endHour - startHour) * hourHeight;
    const vGridLines = `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, ${theme.gridLine} ${hourHeight - 1}px, ${theme.gridLine} ${hourHeight}px)`;
    return (
      <div
        className={className}
        style={{ fontFamily: theme.fontFamily, color: theme.text, overflowY: "auto", ...style }}
      >
        {/* Header: corner above the hour gutter + one label per resource column */}
        <div
          {...slot("header", {
            // Sticky so the resource labels stay visible while the hours scroll
            // (matching the native renderer's fixed header row).
            base: { display: "flex", position: "sticky", top: 0, zIndex: 2 },
            themed: { borderBottom: `1px solid ${theme.gridLine}`, background: theme.surface },
          })}
        >
          <div {...slot("corner", { base: { width: GUTTER_WIDTH, flex: "none" } })} />
          {resources.map((resource) => (
            <div
              key={resource.id}
              {...slot("resourceLabel", {
                base: {
                  flex: 1,
                  minWidth: 0,
                  padding: "6px 4px",
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  boxSizing: "border-box",
                },
                themed: {
                  fontSize: 13,
                  fontWeight: 600,
                  borderLeft: `1px solid ${theme.gridLine}`,
                },
              })}
            >
              {resource.title ?? resource.id}
            </div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          <div
            {...slot("timeAxis", {
              base: {
                position: "relative",
                width: GUTTER_WIDTH,
                flex: "none",
                height: trackHeight,
              },
            })}
          >
            {hours.map((h) => (
              <div
                key={h}
                {...slot("hourTick", {
                  base: {
                    position: "absolute",
                    top: Math.max(0, (h - startHour) * hourHeight - 6),
                    right: 6,
                  },
                  themed: { fontSize: 10, color: theme.textMuted },
                })}
              >
                {formatHour(h, { ampm })}
              </div>
            ))}
          </div>
          {resources.map((resource) => {
            const positioned = byResource.get(resource.id) ?? [];
            return (
              <div
                key={resource.id}
                {...slot("row", {
                  base: {
                    flex: 1,
                    minWidth: 0,
                    ...(dragLaneId === resource.id ? { position: "relative", zIndex: 5 } : null),
                  },
                  themed: { borderLeft: `1px solid ${theme.gridLine}` },
                })}
              >
                <div
                  data-resource-id={resource.id}
                  {...trackInteractionProps(resource)}
                  {...slot("track", { base: { position: "relative", height: trackHeight } })}
                >
                  {/* Closed-hours shade, behind the grid lines and events. */}
                  {bandsFor(resource).map((b) => (
                    <div
                      key={b.start}
                      aria-hidden
                      {...slot("businessHours", {
                        base: {
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: (b.start - startHour) * hourHeight,
                          height: (b.end - b.start) * hourHeight,
                          pointerEvents: "none",
                          zIndex: 0,
                        },
                        themed: renderBusinessHours
                          ? undefined
                          : { background: theme.outsideHoursBackground },
                      })}
                    >
                      {renderBusinessHours?.({ date, start: b.start, end: b.end, resource })}
                    </div>
                  ))}
                  {backgroundBandsFor(resource).map((b, i) => (
                    <div
                      key={`bg-${i}`}
                      aria-hidden
                      title={b.event.title}
                      {...slot("backgroundEvent", {
                        base: {
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: (b.startHours - startHour) * hourHeight,
                          height: (b.endHours - b.startHours) * hourHeight,
                          pointerEvents: "none",
                          zIndex: 0,
                        },
                        themed: { background: theme.backgroundEvent },
                      })}
                    />
                  ))}
                  <div
                    aria-hidden
                    {...slot("gridLines", {
                      base: { position: "absolute", inset: 0, pointerEvents: "none" },
                      themed: { backgroundImage: vGridLines },
                    })}
                  />
                  {positioned.map((pe, idx) => {
                    const key = `${resource.id}:${idx}`;
                    const active = drag?.key === key ? drag : null;
                    const startH = active ? active.startHours : pe.startHours;
                    const durH = active ? active.durationHours : pe.durationHours;
                    const top = clamp(startH - startHour, 0, endHour - startHour) * hourHeight;
                    const bottom =
                      clamp(startH + durH - startHour, 0, endHour - startHour) * hourHeight;
                    const height = Math.max(bottom - top, 2);
                    // Overlapping events share the column as side-by-side sub-lanes.
                    const lanePct = 100 / pe.columns;
                    const onPress = () => onPressEvent?.(pe.event);
                    const args: ResourceEventArgs<T> = {
                      event: pe.event,
                      width: 0,
                      height,
                      onPress,
                    };
                    const draggable = !!onDragEvent;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={draggable ? undefined : onPress}
                        aria-label={pe.event.title}
                        {...dataState({ "data-dragging": !!active })}
                        onPointerDown={
                          draggable
                            ? (e) =>
                                beginDrag(
                                  e,
                                  key,
                                  resource.id,
                                  "move",
                                  pe.startHours,
                                  pe.durationHours,
                                )
                            : undefined
                        }
                        onPointerMove={draggable ? moveDrag : undefined}
                        onPointerUp={
                          draggable ? (e) => endDrag(e, pe.event, resource, onPress) : undefined
                        }
                        onPointerCancel={draggable ? cancelDrag : undefined}
                        {...slot("event", {
                          base: {
                            position: "absolute",
                            top,
                            height,
                            left: `${pe.column * lanePct}%`,
                            width: `${lanePct}%`,
                            transform:
                              active?.kind === "move"
                                ? `translateX(${active.crossPx}px)`
                                : undefined,
                            padding: 1,
                            border: "none",
                            background: "transparent",
                            cursor: draggable ? "grab" : "pointer",
                            touchAction: draggable ? "none" : "auto",
                            font: "inherit",
                            textAlign: "left",
                            boxSizing: "border-box",
                            zIndex: active ? 3 : 1,
                            opacity: active ? 0.85 : 1,
                          },
                        })}
                      >
                        {Renderer ? (
                          <Renderer {...args} />
                        ) : (
                          <DefaultBar {...args} theme={theme} boxProps={slot("eventBox")} />
                        )}
                        {draggable ? (
                          <span
                            aria-hidden
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              beginDrag(
                                e,
                                key,
                                resource.id,
                                "resize",
                                pe.startHours,
                                pe.durationHours,
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
                      </button>
                    );
                  })}
                  {nowLine(resource.id)}
                  {createBox?.resourceKey === resource.id ? (
                    <div
                      aria-hidden
                      {...slot("createGhost", {
                        base: {
                          position: "absolute",
                          left: 1,
                          right: 1,
                          top: Math.min(createBox.startPx, createBox.curPx),
                          height: Math.max(Math.abs(createBox.curPx - createBox.startPx), 2),
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
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const gridLines = `repeating-linear-gradient(to right, transparent 0, transparent ${hourWidth - 1}px, ${theme.gridLine} ${hourWidth - 1}px, ${theme.gridLine} ${hourWidth}px)`;

  return (
    <div
      className={className}
      style={{ fontFamily: theme.fontFamily, color: theme.text, overflowX: "auto", ...style }}
    >
      <div style={{ minWidth: labelWidth + trackWidth }}>
        {/* Header: corner + hour axis */}
        <div
          {...slot("header", {
            base: { display: "flex" },
            themed: { borderBottom: `1px solid ${theme.gridLine}` },
          })}
        >
          <div {...slot("corner", { base: { width: labelWidth, flex: "none" } })} />
          <div
            {...slot("timeAxis", { base: { position: "relative", height: 24, width: trackWidth } })}
          >
            {hours.map((h) => (
              <div
                key={h}
                {...slot("hourTick", {
                  base: { position: "absolute", left: (h - startHour) * hourWidth, top: 4 },
                  themed: { fontSize: 10, color: theme.textMuted },
                })}
              >
                {formatHour(h, { ampm })}
              </div>
            ))}
          </div>
        </div>

        {/* Resource rows */}
        {resources.map((resource) => {
          const positioned = byResource.get(resource.id) ?? [];
          return (
            <div
              key={resource.id}
              {...slot("row", {
                base: {
                  display: "flex",
                  height: rowHeight,
                  ...(dragLaneId === resource.id ? { position: "relative", zIndex: 5 } : null),
                },
                themed: { borderBottom: `1px solid ${theme.gridLine}` },
              })}
            >
              <div
                {...slot("resourceLabel", {
                  base: {
                    width: labelWidth,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    boxSizing: "border-box",
                  },
                  themed: {
                    fontSize: 13,
                    fontWeight: 600,
                    borderRight: `1px solid ${theme.gridLine}`,
                  },
                })}
              >
                {resource.title ?? resource.id}
              </div>
              <div
                data-resource-id={resource.id}
                {...trackInteractionProps(resource)}
                {...slot("track", { base: { position: "relative", width: trackWidth } })}
              >
                {/* Closed-hours shade, behind the grid lines and events. */}
                {bandsFor(resource).map((b) => (
                  <div
                    key={b.start}
                    aria-hidden
                    {...slot("businessHours", {
                      base: {
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: (b.start - startHour) * hourWidth,
                        width: (b.end - b.start) * hourWidth,
                        pointerEvents: "none",
                        zIndex: 0,
                      },
                      themed: renderBusinessHours
                        ? undefined
                        : { background: theme.outsideHoursBackground },
                    })}
                  >
                    {renderBusinessHours?.({ date, start: b.start, end: b.end, resource })}
                  </div>
                ))}
                {backgroundBandsFor(resource).map((b, i) => (
                  <div
                    key={`bg-${i}`}
                    aria-hidden
                    title={b.event.title}
                    {...slot("backgroundEvent", {
                      base: {
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: (b.startHours - startHour) * hourWidth,
                        width: (b.endHours - b.startHours) * hourWidth,
                        pointerEvents: "none",
                        zIndex: 0,
                      },
                      themed: { background: theme.backgroundEvent },
                    })}
                  />
                ))}
                <div
                  aria-hidden
                  {...slot("gridLines", {
                    base: { position: "absolute", inset: 0, pointerEvents: "none" },
                    themed: { backgroundImage: gridLines },
                  })}
                />
                {positioned.map((pe, idx) => {
                  const key = `${resource.id}:${idx}`;
                  const active = drag?.key === key ? drag : null;
                  const startH = active ? active.startHours : pe.startHours;
                  const durH = active ? active.durationHours : pe.durationHours;
                  const left = clamp(startH - startHour, 0, endHour - startHour) * hourWidth;
                  const right =
                    clamp(startH + durH - startHour, 0, endHour - startHour) * hourWidth;
                  const width = Math.max(right - left, 2);
                  // Overlapping events in a row share the height as stacked sub-lanes.
                  const laneHeight = rowHeight / pe.columns;
                  const onPress = () => onPressEvent?.(pe.event);
                  const args: ResourceEventArgs<T> = { event: pe.event, width, onPress };
                  const draggable = !!onDragEvent;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={draggable ? undefined : onPress}
                      aria-label={pe.event.title}
                      {...dataState({ "data-dragging": !!active })}
                      onPointerDown={
                        draggable
                          ? (e) =>
                              beginDrag(
                                e,
                                key,
                                resource.id,
                                "move",
                                pe.startHours,
                                pe.durationHours,
                              )
                          : undefined
                      }
                      onPointerMove={draggable ? moveDrag : undefined}
                      onPointerUp={
                        draggable ? (e) => endDrag(e, pe.event, resource, onPress) : undefined
                      }
                      onPointerCancel={draggable ? cancelDrag : undefined}
                      {...slot("event", {
                        base: {
                          position: "absolute",
                          left,
                          width,
                          top: pe.column * laneHeight,
                          height: laneHeight,
                          transform:
                            active?.kind === "move" ? `translateY(${active.crossPx}px)` : undefined,
                          padding: 1,
                          border: "none",
                          background: "transparent",
                          cursor: draggable ? "grab" : "pointer",
                          touchAction: draggable ? "none" : "auto",
                          font: "inherit",
                          textAlign: "left",
                          boxSizing: "border-box",
                          zIndex: active ? 3 : 1,
                          opacity: active ? 0.85 : 1,
                        },
                      })}
                    >
                      {Renderer ? (
                        <Renderer {...args} />
                      ) : (
                        <DefaultBar {...args} theme={theme} boxProps={slot("eventBox")} />
                      )}
                      {draggable ? (
                        <span
                          aria-hidden
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            beginDrag(
                              e,
                              key,
                              resource.id,
                              "resize",
                              pe.startHours,
                              pe.durationHours,
                            );
                          }}
                          style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            right: 0,
                            width: 8,
                            cursor: "ew-resize",
                            touchAction: "none",
                          }}
                        />
                      ) : null}
                    </button>
                  );
                })}
                {nowLine(resource.id)}
                {createBox?.resourceKey === resource.id ? (
                  <div
                    aria-hidden
                    {...slot("createGhost", {
                      base: {
                        position: "absolute",
                        top: 1,
                        bottom: 1,
                        left: Math.min(createBox.startPx, createBox.curPx),
                        width: Math.max(Math.abs(createBox.curPx - createBox.startPx), 2),
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
