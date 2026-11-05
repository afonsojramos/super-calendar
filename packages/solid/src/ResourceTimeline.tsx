import { Dynamic, type JSX } from "@solidjs/web";
import {
  backgroundBandsForDay,
  type BusinessHoursBand,
  type BusinessHoursValue,
  type CalendarEvent,
  type CalendarLabels,
  type CreateGhostArgs,
  cellRangeFromDrag,
  eventAccessibilityLabel,
  closedHourBands,
  eventTimeLabel,
  formatHour,
  isSameCalendarDay,
  layoutDayEvents,
  isAllDayEvent,
  isBackgroundEvent,
  movedClockSpan,
  type PositionedEvent,
  resolveCalendarLabels,
  resolveDraggedBounds,
} from "@super-calendar/core/vanilla";
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  untrack,
} from "solid-js";
import {
  createEventActions,
  EventActionsDialog,
  describeEventDates,
  type EventActionsSlot,
  EventActionsMenu,
  type EventEditAction,
} from "./EventActions";
import { withDefaults } from "./props";
import { createSlots, dataState, type ResolvedSlot, type SlotStyleProps } from "./slots";
import { createNow } from "./state";
import { css, type CSSProperties, type DomPointerEvent, type ElementRef } from "./styles";
import { mergeSolidTheme, type SolidCalendarTheme } from "./theme";

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
  | "createGhost"
  | EventActionsSlot;

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
  theme?: Partial<SolidCalendarTheme>;
  /** Custom event renderer; falls back to the built-in bar. */
  renderEvent?: Component<ResourceEventArgs<T>>;
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
  /** Stable, unique event identity for the web editing dialog across data refreshes. */
  getEventId?: (event: CalendarEvent<T>) => string | number;
  /** Tap empty lane space; called with the snapped time and the lane's resource. */
  onPressCell?: (at: Date, resource: Resource) => void;
  /** Drag empty lane space to create; called with the swept start/end and the lane's resource. */
  onCreateEvent?: (start: Date, end: Date, resource: Resource) => void;
  /**
   * A component that draws content inside the drag-to-create preview, such as a
   * draft title and the live time range. It receives the snapped `start` and
   * `end` that `onCreateEvent` would get if the pointer were released now, plus
   * the lane's resource, and its props update as the sweep changes them. The
   * board keeps positioning, sizing and styling the preview and clips the
   * content to it; the content is non-interactive and hidden from assistive
   * tech. Renders only while a sweep can create, so it needs `onCreateEvent` and
   * does not enable creation itself. Applies to both orientations.
   */
  renderCreateGhost?: Component<CreateGhostArgs & { resource: Resource }>;
  /**
   * Shade the hours outside this window, per lane. Same shape as the Calendar's
   * `businessHours` plus the lane's resource, so per-resource opening hours work
   * (return `null` for a fully closed lane). A date-only function is accepted.
   */
  businessHours?: (date: Date, resource: Resource) => BusinessHoursValue;
  /**
   * Render a closed-hours band's content yourself (a label, icon, pattern). The
   * board keeps positioning the band; when set, the themed tint is dropped and
   * your output fills the band instead. Receives the lane's resource. Decorative only: the
   * band stays non-interactive and hidden from assistive tech.
   */
  renderBusinessHours?: (
    band: BusinessHoursBand & {
      resource: Resource;
    },
  ) => JSX.Element;
  /**
   * Render each resource's header cell yourself (an avatar, a subtitle, a status
   * dot). Receives the resource and its index; return the cell's content. The board
   * keeps the header cell's sizing so columns stay aligned, so this replaces only
   * the label content. Falls back to the resource title (or id). Applies to both
   * orientations: the top header cells when vertical, the row labels when horizontal.
   */
  renderResourceHeader?: (resource: Resource, index: number) => JSX.Element;
  /** Snap dragged events to this many minutes (default 15). */
  dragStepMinutes?: number;
  /**
   * Words for the move and resize actions and the event labels. Keys you omit
   * stay in English (`defaultCalendarLabels`).
   */
  labels?: Partial<CalendarLabels>;
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
// Two create-preview ranges cover the same times.
const sameRange = (a: CreateGhostArgs | null, b: CreateGhostArgs | null) =>
  a === b ||
  (!!a && !!b && a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime());

// Hour-gutter width in the vertical orientation, matching the time grid's axis.
const GUTTER_WIDTH = 56;
type DragState<T> = {
  pointerId: number;
  event: CalendarEvent<T>;
  /** The lane the drag started in, so its row can be lifted while dragging. */
  resource: Resource;
  kind: "move" | "resize";
  startHours: number;
  durationHours: number;
  /** Live cross-axis offset (px) of a move, for the follow-the-pointer ghost. */
  crossPx: number;
  moved: boolean;
};
function DefaultBar<T>(
  props: ResourceEventArgs<T> & {
    boxProps: ResolvedSlot;
    theme: SolidCalendarTheme;
  },
) {
  // Vertical bars gate the time line on their height (short slots show just the
  // title); horizontal bars keep it always, as before.
  const showTime = createMemo(() => (props.height != null ? props.height > 34 : true));
  const time = createMemo(() =>
    eventTimeLabel({
      mode: "day",
      isAllDay: false,
      start: props.event.start,
      end: props.event.end,
      ampm: false,
      showTime: true,
    }),
  );
  const base = createMemo<CSSProperties>(() => ({
    height: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  }));
  const themed = createMemo<CSSProperties>(() => ({
    padding: "2px 6px",
    borderRadius: 6,
    background: props.theme.eventBackground,
    color: props.theme.eventText,
    fontSize: 12,
  }));
  return (
    <div
      class={props.boxProps.class}
      data-slot={props.boxProps["data-slot"]}
      style={css(
        props.boxProps.class
          ? {
              ...base(),
              ...props.boxProps.style,
            }
          : {
              ...base(),
              ...themed(),
              ...props.boxProps.style,
            },
      )}
    >
      <div
        style={css({
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        })}
      >
        {props.event.title}
      </div>
      {time() && showTime() ? (
        <div
          style={css({
            opacity: 0.75,
            fontSize: 11,
          })}
        >
          {time()}
        </div>
      ) : null}
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
export function ResourceTimeline<T = unknown>(incoming: ResourceTimelineProps<T>): JSX.Element {
  const props = withDefaults(
    {
      orientation: "horizontal",
      resourcePage: 0,
      resourceId: (event) =>
        (
          event as {
            resourceId?: string;
          }
        ).resourceId,
      startHour: 0,
      endHour: 24,
      hourWidth: 80,
      hourHeight: 48,
      rowHeight: 56,
      labelWidth: 140,
      ampm: false,
      dragStepMinutes: 15,
      showNowIndicator: true,
    } satisfies Partial<ResourceTimelineProps<T>>,
    incoming,
  );
  // Window the lanes to the requested page when resourcesPerPage caps them.
  const resources = createMemo(() => {
    if (!props.resourcesPerPage || props.resourcesPerPage <= 0) return props.resources;
    const pages = Math.max(1, Math.ceil(props.resources.length / props.resourcesPerPage));
    const page = Math.min(Math.max(props.resourcePage, 0), pages - 1);
    return props.resources.slice(
      page * props.resourcesPerPage,
      (page + 1) * props.resourcesPerPage,
    );
  });
  const theme = createMemo(() => mergeSolidTheme(props.theme));
  const slot = createSlots<ResourceTimelineSlot>(props);
  const labels = createMemo(() => resolveCalendarLabels(props.labels));
  const Renderer = createMemo(() => props.renderEvent);
  const snapHours = createMemo(() => props.dragStepMinutes / 60);
  const vertical = createMemo(() => props.orientation === "vertical");
  // Pixels per hour along whichever axis carries the time.
  const hourSize = createMemo(() => (vertical() ? props.hourHeight : props.hourWidth));
  // The current-time line, shown only when the board's day is the zone's today.
  const now = createNow(() => ({
    enabled: props.showNowIndicator,
    now: props.now,
    timeZone: props.timeZone,
  }));
  const nowHours = createMemo(() => now().getHours() + now().getMinutes() / 60);
  const showNow = createMemo(
    () =>
      props.showNowIndicator &&
      isSameCalendarDay(now(), props.date) &&
      nowHours() >= props.startHour &&
      nowHours() <= props.endHour,
  );
  const nowLine = (_resourceKey: string) =>
    showNow() ? (
      <div
        aria-hidden="true"
        {...slot("nowIndicator", {
          base: vertical()
            ? {
                position: "absolute",
                left: 0,
                right: 0,
                top: (nowHours() - props.startHour) * hourSize(),
                height: 2,
                pointerEvents: "none",
                zIndex: 2,
              }
            : {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: (nowHours() - props.startHour) * hourSize(),
                width: 2,
                pointerEvents: "none",
                zIndex: 2,
              },
          themed: {
            background: theme().nowIndicator,
          },
        })}
      />
    ) : null;

  // `drag` drives the visual; `dragRef` is the source of truth the pointer
  // handlers read so they never see a stale closure between events.
  const [drag, setDrag] = createSignal<DragState<T> | null>(null);
  let handledClick: HTMLButtonElement | null = null;
  const dragRef: ElementRef<DragState<T> | null> = {
    current: null,
  };
  const origin: ElementRef<{
    element: HTMLButtonElement;
    x: number;
    cross: number;
    startHours: number;
    durationHours: number;
    // The event's own bounds, for previewing a move across a DST change; null
    // for a bar clipped to the day.
    span: {
      start: Date;
      end: Date;
    } | null;
  } | null> = {
    current: null,
  };
  const applyDrag = (next: DragState<T> | null) => {
    dragRef.current = next;
    setDrag(next);
  };
  const clearDrag = () => {
    const previous = dragRef.current;
    const element = origin.current?.element;
    applyDrag(null);
    origin.current = null;
    try {
      if (previous) element?.releasePointerCapture?.(previous.pointerId);
    } catch {
      // The browser may have already released capture.
    }
  };
  const beginDrag = (
    e: DomPointerEvent,
    resource: Resource,
    kind: "move" | "resize",
    pe: PositionedEvent<T>,
  ) => {
    const { startHours, durationHours } = pe;
    if (e.button === 0 && e.isPrimary !== false && !dragRef.current) handledClick = null;
    if (
      !props.onDragEvent ||
      pe.event.draggable === false ||
      dragRef.current ||
      createOrigin.current ||
      e.isPrimary === false ||
      e.button !== 0
    )
      return;
    const element = e.currentTarget.closest("button");
    if (!element) return;
    e.stopPropagation();
    try {
      element.setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
    origin.current = {
      element,
      x: vertical() ? e.clientY : e.clientX,
      cross: vertical() ? e.clientX : e.clientY,
      startHours,
      durationHours,
      span:
        pe.continuesBefore || pe.continuesAfter
          ? null
          : {
              start: pe.event.start,
              end: pe.event.end,
            },
    };
    applyDrag({
      pointerId: e.pointerId,
      event: pe.event,
      resource,
      kind,
      startHours,
      durationHours,
      crossPx: 0,
      moved: false,
    });
  };
  const moveDrag = (e: DomPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || !origin.current) return;
    const dHours = ((vertical() ? e.clientY : e.clientX) - origin.current.x) / hourSize();
    const snap = (v: number) => Math.round(v / snapHours()) * snapHours();
    if (d.kind === "move") {
      const o = origin.current;
      const requestedHours = clamp(
        snap(o.startHours + dHours),
        props.startHour,
        props.endHour - o.durationHours,
      );
      // Draw the bar where the drop commits it: a start in the hour a
      // spring-forward change skips moves on past it, and the kept elapsed
      // duration covers a different number of hours once a DST change falls
      // inside it or stops falling inside it.
      const span = o.span;
      const moved = span
        ? movedClockSpan(span.start, span.end, Math.round((requestedHours - o.startHours) * 60))
        : null;
      const startHours = moved ? o.startHours + moved.startHours : requestedHours;
      const durationHours = moved ? moved.hours : o.durationHours;
      const crossPx = (vertical() ? e.clientX : e.clientY) - o.cross;
      applyDrag({
        ...d,
        startHours,
        durationHours,
        crossPx,
        moved: true,
      });
    } else {
      const durationHours = clamp(
        snap(origin.current.durationHours + dHours),
        snapHours(),
        props.endHour - d.startHours,
      );
      applyDrag({
        ...d,
        durationHours,
        moved: true,
      });
    }
  };
  // Which visible lane the pointer is over, found by hit-testing rather than
  // measuring flexed columns. The dragged bar is momentarily made
  // pointer-transparent so `elementFromPoint` sees the lane, not the bar (which
  // stays a DOM child of its origin lane however far it's visually translated).
  const laneAt = (e: DomPointerEvent, fallback: Resource): Resource => {
    if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
      return fallback;
    }
    const bar = e.currentTarget as HTMLElement;
    const prev = bar.style.pointerEvents;
    // Restore in a finally: a left-behind "none" would permanently disable this
    // bar, because this inline style is set imperatively during the drag.
    let hit: Element | null;
    bar.style.pointerEvents = "none";
    try {
      hit = document.elementFromPoint(e.clientX, e.clientY);
    } finally {
      bar.style.pointerEvents = prev;
    }
    const laneEl = (hit as HTMLElement | null)?.closest?.("[data-resource-id]");
    const id = laneEl?.getAttribute("data-resource-id");
    return (id && resources().find((r) => r.id === id)) || fallback;
  };
  const endDrag = (e: DomPointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    handledClick = origin.current?.element ?? null;
    if (!d.moved) {
      clearDrag();
      props.onPressEvent?.(d.event);
      return;
    }
    const resource = resources().find((resource) => resource.id === d.resource.id);
    if (!resource) {
      clearDrag();
      return;
    }
    const target = d.kind === "move" ? laneAt(e, resource) : resource;
    // Shift the event by how far its bar moved, like the native renderer, so a
    // move keeps its elapsed duration across a DST change.
    const o = origin.current;
    const startDelta = o ? Math.round((d.startHours - o.startHours) * 60) : 0;
    // A move shifts both edges alike; its preview duration only redraws the
    // kept elapsed duration.
    const endDelta =
      d.kind === "move" ? startDelta : o ? Math.round((d.durationHours - o.durationHours) * 60) : 0;
    const next = resolveDraggedBounds(
      d.event.start,
      d.event.end,
      startDelta,
      endDelta,
      props.dragStepMinutes,
    );
    clearDrag();
    if (next) props.onDragEvent?.(d.event, next.start, next.end, target);
  };
  const cancelDrag = (e: DomPointerEvent) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    handledClick = origin.current?.element ?? null;
    clearDrag();
  };

  // Create-by-drag / tap on empty lane space, mirroring the time grid: mouse and
  // pen sweep out a new event, and a tap without movement fires onPressCell. Touch
  // is left free to scroll the board, so cell taps are pointer (mouse/pen) only.
  const [createBox, setCreateBox] = createSignal<{
    resourceKey: string;
    startPx: number;
    curPx: number;
  } | null>(null);
  const createOrigin: ElementRef<{
    pointerId: number;
    el: HTMLElement;
    resource: Resource;
    startPx: number;
    dayKey: string;
    creating: boolean;
  } | null> = {
    current: null,
  };
  const clearCreate = () => {
    const previous = createOrigin.current;
    createOrigin.current = null;
    setCreateBox(null);
    try {
      previous?.el.releasePointerCapture?.(previous.pointerId);
    } catch {
      // The browser may have already released capture.
    }
  };
  createEffect(
    () => [],
    () => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !createOrigin.current) return;
        event.preventDefault();
        event.stopPropagation();
        clearCreate();
      };
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    },
  );
  const cellEnabled = createMemo(() => !!props.onPressCell || !!props.onCreateEvent);
  createEffect(
    () => ({
      dayKey: props.date.toDateString(),
      creating: !!props.onCreateEvent,
      enabled: cellEnabled(),
    }),
    (state) => {
      const origin = createOrigin.current;
      if (
        origin &&
        (!state.enabled || (origin.creating && !state.creating) || origin.dayKey !== state.dayKey)
      )
        clearCreate();
    },
  );
  const pxAlongAxis = (el: HTMLElement, e: DomPointerEvent) => {
    const rect = el.getBoundingClientRect();
    return vertical() ? e.clientY - rect.top : e.clientX - rect.left;
  };
  const beginCreate = (e: DomPointerEvent, resource: Resource) => {
    // Only from the lane background, primary button, never on an event bar.
    if (
      !cellEnabled() ||
      e.pointerType === "touch" ||
      e.isPrimary === false ||
      createOrigin.current ||
      dragRef.current
    )
      return;
    if (e.target !== e.currentTarget || e.button > 0) return;
    const el = e.currentTarget as HTMLElement;
    const startPx = pxAlongAxis(el, e);
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      // Best-effort capture.
    }
    createOrigin.current = {
      pointerId: e.pointerId,
      el,
      resource,
      startPx,
      dayKey: props.date.toDateString(),
      creating: !!props.onCreateEvent,
    };
    // Only preview a ghost when a create can happen; in press-only mode
    // (onPressCell without onCreateEvent) the tap still commits via endCreate.
    if (props.onCreateEvent)
      setCreateBox({
        resourceKey: resource.id,
        startPx,
        curPx: startPx,
      });
  };
  const moveCreate = (e: DomPointerEvent) => {
    const o = createOrigin.current;
    if (!o || o.pointerId !== e.pointerId || !props.onCreateEvent) return;
    setCreateBox({
      resourceKey: o.resource.id,
      startPx: o.startPx,
      curPx: pxAlongAxis(o.el, e),
    });
  };
  const endCreate = (e: DomPointerEvent) => {
    const o = createOrigin.current;
    if (!o || o.pointerId !== e.pointerId) return;
    const endPx = pxAlongAxis(o.el, e);
    const moved = Math.abs(endPx - o.startPx) > 4;
    clearCreate();
    const resource = resources().find((resource) => resource.id === o.resource.id);
    if (!resource) return;
    if (moved && props.onCreateEvent) {
      const range = cellRangeFromDrag(
        props.date,
        o.startPx,
        endPx,
        hourSize(),
        props.startHour,
        props.dragStepMinutes,
      );
      if (range) props.onCreateEvent(range.start, range.end, resource);
    } else if (props.onPressCell) {
      const at = cellRangeFromDrag(
        props.date,
        o.startPx,
        o.startPx,
        hourSize(),
        props.startHour,
        props.dragStepMinutes,
      );
      if (at) props.onPressCell(at.start, resource);
    }
  };
  // A gesture the browser cancels (scroll takeover, etc.) must not commit.
  const cancelCreate = (e: DomPointerEvent) => {
    if (createOrigin.current?.pointerId !== e.pointerId) return;
    clearCreate();
  };
  // What `onCreateEvent` would receive if the sweep ended here. Kept while the
  // range holds, so content updates only when it changes.
  const createRange = createMemo(
    () => {
      const box = createBox();
      return box && props.renderCreateGhost && props.onCreateEvent
        ? cellRangeFromDrag(
            props.date,
            box.startPx,
            box.curPx,
            hourSize(),
            props.startHour,
            props.dragStepMinutes,
          )
        : null;
    },
    { equals: sameRange },
  );
  const trackInteractionProps = (resource: Resource) => ({
    onPointerDown: (e: DomPointerEvent) => beginCreate(e, resource),
    onPointerMove: moveCreate,
    onPointerUp: endCreate,
    onPointerCancel: cancelCreate,
    onLostPointerCapture: cancelCreate,
  });
  // The closed-hours bands to shade in a lane, resolved per resource.
  const bandsFor = (resource: Resource) => {
    const businessHours = props.businessHours;
    return businessHours
      ? closedHourBands(
          props.date,
          (d) => businessHours(d, resource),
          props.startHour,
          props.endHour,
        )
      : [];
  };
  // `display: "background"` events in a lane, clipped to the visible window.
  const backgroundBandsFor = (resource: Resource) =>
    backgroundBandsForDay(
      props.events.filter((e) => props.resourceId(e) === resource.id),
      props.date,
    )
      .map((b) => ({
        ...b,
        startHours: Math.max(b.startHours, props.startHour),
        endHours: Math.min(b.endHours, props.endHour),
      }))
      .filter((b) => b.endHours > b.startHours);
  const hours = createMemo(() =>
    Array.from(
      {
        length: Math.max(0, props.endHour - props.startHour),
      },
      (_, i) => props.startHour + i,
    ),
  );
  const trackWidth = createMemo(() => (props.endHour - props.startHour) * props.hourWidth);
  const trackHeight = createMemo(() => (props.endHour - props.startHour) * props.hourHeight);
  const vGridLines = createMemo(
    () =>
      `repeating-linear-gradient(to bottom, transparent 0, transparent ${props.hourHeight - 1}px, ${theme().gridLine} ${props.hourHeight - 1}px, ${theme().gridLine} ${props.hourHeight}px)`,
  );

  // The actions dialog's steps, matching the native screen-reader actions: one
  // snap step along the axis, or one lane across, through the same commit as a
  // drop. `draggable: false` locks a bar, as it does for a drag.
  const laneOf = (event: CalendarEvent<T>) =>
    resources().findIndex((resource) => resource.id === props.resourceId(event));
  const eventDescription = (event: CalendarEvent<T>) =>
    `${resources().find((resource) => resource.id === props.resourceId(event))?.title ?? ""}, ${describeEventDates(event)}, ${eventAccessibilityLabel({ title: event.title, isAllDay: false, start: event.start, end: event.end, ampm: props.ampm, labels: labels() })}`;
  const actionDelta = (id: string): [number, number, number] | null => {
    const step = props.dragStepMinutes;
    switch (id) {
      case "move-later":
        return [step, step, 0];
      case "move-earlier":
        return [-step, -step, 0];
      case "extend":
        return [0, step, 0];
      case "shorten":
        return [0, -step, 0];
      case "move-next-resource":
        return [0, 0, 1];
      case "move-previous-resource":
        return [0, 0, -1];
      default:
        return null;
    }
  };
  const editActions = (event: CalendarEvent<T>): EventEditAction[] => {
    if (isAllDayEvent(event) || isBackgroundEvent(event)) return [];
    const lane = laneOf(event);
    if (!props.onDragEvent || event.draggable === false || lane < 0) return [];
    const step = props.dragStepMinutes;
    const words = labels();
    const action = (id: string, label: string): EventEditAction => {
      const [startDelta, endDelta] = actionDelta(id) ?? [0, 0];
      const next = resolveDraggedBounds(event.start, event.end, startDelta, endDelta, step);
      return { id, label, available: next !== null };
    };
    const laneTitle = (resource?: Resource) => resource && (resource.title || resource.id);
    const nextLane = laneTitle(resources()[lane + 1]);
    const previousLane = laneTitle(resources()[lane - 1]);
    return [
      action("move-later", words.moveLater(step)),
      action("move-earlier", words.moveEarlier(step)),
      action("extend", words.extend(step)),
      action("shorten", words.shorten(step)),
      ...(nextLane ? [action("move-next-resource", words.moveToResource(nextLane))] : []),
      ...(previousLane
        ? [action("move-previous-resource", words.moveToResource(previousLane))]
        : []),
    ];
  };
  const eventActions = createEventActions<CalendarEvent<T>>(
    () => props.events,
    editActions,
    (event, id) => {
      const delta = actionDelta(id);
      const target = delta ? resources()[laneOf(event) + delta[2]] : undefined;
      const next =
        delta &&
        target &&
        resolveDraggedBounds(event.start, event.end, delta[0], delta[1], props.dragStepMinutes);
      if (!next || !target || props.onDragEvent?.(event, next.start, next.end, target) === false)
        return null;
      return (candidate) =>
        candidate !== event &&
        candidate.start.getTime() === next.start.getTime() &&
        candidate.end.getTime() === next.end.getTime() &&
        candidate.title === event.title &&
        props.resourceId(candidate) === target.id;
    },
    () => props.getEventId,
  );

  // Group the positioned (overlap-resolved) events by resource, once.
  const byResource = createMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutDayEvents<T>>>();
    for (const resource of resources()) {
      const own = props.events.filter((e) => props.resourceId(e) === resource.id);
      map.set(resource.id, layoutDayEvents(own, props.date));
    }
    return map;
  });

  // The lane a move is dragging in, lifted above its siblings so the ghost
  // stays visible as it crosses into another lane (a later DOM sibling).
  const dragLaneId = createMemo(() => {
    const currentDrag = drag();
    return currentDrag?.kind === "move" && currentDrag.moved ? currentDrag.resource.id : null;
  });
  return (
    <>
      {(() => {
        if (vertical()) {
          // Time flows down like the time grid: hour gutter on the left, one flexed
          // column per resource, so narrow screens share the width instead of
          // scrolling sideways.
          return (
            <div
              ref={(el) => (eventActions.rootRef.current = el)}
              tabindex={-1}
              class={props.className}
              style={css({
                fontFamily: theme().fontFamily,
                color: theme().text,
                overflowY: "auto",
                ...props.style,
              })}
            >
              <EventActionsMenu
                events={[
                  ...new Set([...byResource().values()].flat().map((pe) => pe.event)),
                ].filter((event) => editActions(event).length > 0)}
                label={labels().editEvents}
                labelFor={(event) => labels().eventActions(event.title ?? "")}
                descriptionFor={eventDescription}
                onSelect={eventActions.select}
                rootRef={eventActions.rootRef}
                slot={slot}
                theme={theme()}
              />

              {/* Header: corner above the hour gutter + one label per resource column */}
              <div
                {...slot("header", {
                  // Sticky so the resource labels stay visible while the hours scroll
                  // (matching the native renderer's fixed header row).
                  base: {
                    display: "flex",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  },
                  themed: {
                    borderBottom: `1px solid ${theme().gridLine}`,
                    background: theme().surface,
                  },
                })}
              >
                <div
                  {...slot("corner", {
                    base: {
                      width: GUTTER_WIDTH,
                      flex: "none",
                    },
                  })}
                />
                {
                  <For each={resources()} keyed={false}>
                    {(resource, index) => (
                      <div
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
                            borderLeft: `1px solid ${theme().gridLine}`,
                          },
                        })}
                      >
                        {props.renderResourceHeader
                          ? props.renderResourceHeader(resource(), index)
                          : (resource().title ?? resource().id)}
                      </div>
                    )}
                  </For>
                }
              </div>
              <div
                style={css({
                  display: "flex",
                })}
              >
                <div
                  {...slot("timeAxis", {
                    base: {
                      position: "relative",
                      width: GUTTER_WIDTH,
                      flex: "none",
                      height: trackHeight(),
                    },
                  })}
                >
                  {
                    <For each={hours()} keyed={false}>
                      {(h) => (
                        <div
                          {...slot("hourTick", {
                            base: {
                              position: "absolute",
                              top: Math.max(0, (h() - props.startHour) * props.hourHeight - 6),
                              right: 6,
                            },
                            themed: {
                              fontSize: 10,
                              color: theme().textMuted,
                            },
                          })}
                        >
                          {formatHour(h(), {
                            ampm: props.ampm,
                          })}
                        </div>
                      )}
                    </For>
                  }
                </div>
                {
                  <For each={resources()} keyed={(resource) => resource.id}>
                    {(resource) => {
                      const resourceKey = untrack(() => resource().id);
                      onCleanup(() => {
                        if (createOrigin.current?.resource.id === resourceKey) clearCreate();
                      });
                      const ghost = createMemo(() => {
                        const box = createBox();
                        return box?.resourceKey === resource().id ? box : null;
                      });
                      const positioned = createMemo(() => byResource().get(resource().id) ?? []);
                      return (
                        <div
                          {...slot("row", {
                            base: {
                              flex: 1,
                              minWidth: 0,
                              ...(dragLaneId() === resource().id
                                ? {
                                    position: "relative",
                                    zIndex: 5,
                                  }
                                : null),
                            },
                            themed: {
                              borderLeft: `1px solid ${theme().gridLine}`,
                            },
                          })}
                        >
                          <div
                            data-resource-id={resource().id}
                            {...trackInteractionProps(resource())}
                            {...slot("track", {
                              base: {
                                position: "relative",
                                height: trackHeight(),
                              },
                            })}
                          >
                            {/* Closed-hours shade, behind the grid lines and events. */}
                            {
                              <For each={bandsFor(resource())} keyed={false}>
                                {(b) => (
                                  <div
                                    aria-hidden="true"
                                    {...slot("businessHours", {
                                      base: {
                                        position: "absolute",
                                        left: 0,
                                        right: 0,
                                        top: (b().start - props.startHour) * props.hourHeight,
                                        height: (b().end - b().start) * props.hourHeight,
                                        pointerEvents: "none",
                                        zIndex: 0,
                                      },
                                      themed: props.renderBusinessHours
                                        ? undefined
                                        : {
                                            background: theme().outsideHoursBackground,
                                          },
                                    })}
                                  >
                                    {props.renderBusinessHours?.({
                                      date: props.date,
                                      start: b().start,
                                      end: b().end,
                                      resource: resource(),
                                    })}
                                  </div>
                                )}
                              </For>
                            }
                            {
                              <For each={backgroundBandsFor(resource())} keyed={false}>
                                {(b) => (
                                  <div
                                    aria-hidden="true"
                                    title={b().event.title}
                                    {...slot("backgroundEvent", {
                                      base: {
                                        position: "absolute",
                                        left: 0,
                                        right: 0,
                                        top: (b().startHours - props.startHour) * props.hourHeight,
                                        height: (b().endHours - b().startHours) * props.hourHeight,
                                        pointerEvents: "none",
                                        zIndex: 0,
                                      },
                                      themed: {
                                        background: theme().backgroundEvent,
                                      },
                                    })}
                                  />
                                )}
                              </For>
                            }
                            <div
                              aria-hidden="true"
                              {...slot("gridLines", {
                                base: {
                                  position: "absolute",
                                  inset: 0,
                                  pointerEvents: "none",
                                },
                                themed: {
                                  backgroundImage: vGridLines(),
                                },
                              })}
                            />
                            {
                              <For each={positioned()} keyed={(pe) => pe.event}>
                                {(pe) => {
                                  const event = untrack(() => pe().event);
                                  onCleanup(() => {
                                    if (dragRef.current?.event === event) clearDrag();
                                  });
                                  const active = createMemo(() => {
                                    const currentDrag = drag();
                                    return currentDrag?.event === event &&
                                      currentDrag.resource.id === resource().id
                                      ? currentDrag
                                      : null;
                                  });
                                  const startH = createMemo(() => {
                                    const currentActive = active();
                                    return currentActive
                                      ? currentActive.startHours
                                      : pe().startHours;
                                  });
                                  const durH = createMemo(() => {
                                    const currentActive = active();
                                    return currentActive
                                      ? currentActive.durationHours
                                      : pe().durationHours;
                                  });
                                  const top = createMemo(
                                    () =>
                                      clamp(
                                        startH() - props.startHour,
                                        0,
                                        props.endHour - props.startHour,
                                      ) * props.hourHeight,
                                  );
                                  const bottom = createMemo(
                                    () =>
                                      clamp(
                                        startH() + durH() - props.startHour,
                                        0,
                                        props.endHour - props.startHour,
                                      ) * props.hourHeight,
                                  );
                                  const height = createMemo(() => Math.max(bottom() - top(), 2));
                                  // Overlapping events share the column as side-by-side sub-lanes.
                                  const lanePct = createMemo(() => 100 / pe().columns);
                                  const onPress = () => props.onPressEvent?.(pe().event);
                                  const args = createMemo<ResourceEventArgs<T>>(() => ({
                                    event: pe().event,
                                    width: 0,
                                    height: height(),
                                    onPress,
                                  }));
                                  // `draggable: false` locks a single bar (keeps clicks, blocks drag).
                                  const draggable = createMemo(
                                    () => !!props.onDragEvent && pe().event.draggable !== false,
                                  );
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        if (e.detail !== 0 && handledClick === e.currentTarget) {
                                          handledClick = null;
                                          return;
                                        }
                                        if (!draggable() || e.detail === 0) onPress();
                                      }}
                                      aria-label={pe().event.title}
                                      {...dataState({
                                        "data-dragging": !!active(),
                                      })}
                                      onPointerDown={(e) => beginDrag(e, resource(), "move", pe())}
                                      onPointerMove={moveDrag}
                                      onPointerUp={endDrag}
                                      onPointerCancel={cancelDrag}
                                      onLostPointerCapture={cancelDrag}
                                      {...slot("event", {
                                        base: {
                                          position: "absolute",
                                          top: top(),
                                          height: height(),
                                          left: `${pe().column * lanePct()}%`,
                                          width: `${lanePct()}%`,
                                          transform:
                                            active()?.kind === "move"
                                              ? `translateX(${active()?.crossPx}px)`
                                              : undefined,
                                          padding: 1,
                                          border: "none",
                                          background: "transparent",
                                          cursor: draggable() ? "grab" : "pointer",
                                          touchAction: draggable() ? "none" : "auto",
                                          font: "inherit",
                                          textAlign: "left",
                                          boxSizing: "border-box",
                                          zIndex: active() ? 3 : 1,
                                          opacity: active() ? 0.85 : 1,
                                        },
                                      })}
                                    >
                                      {Renderer() ? (
                                        <Dynamic component={Renderer()} {...args()} />
                                      ) : (
                                        <DefaultBar
                                          {...args()}
                                          theme={theme()}
                                          boxProps={slot("eventBox")}
                                        />
                                      )}
                                      {draggable() ? (
                                        <span
                                          aria-hidden="true"
                                          onPointerDown={(e) => {
                                            e.stopPropagation();
                                            beginDrag(e, resource(), "resize", pe());
                                          }}
                                          style={css({
                                            position: "absolute",
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            height: 8,
                                            cursor: "ns-resize",
                                            touchAction: "none",
                                          })}
                                        />
                                      ) : null}
                                    </button>
                                  );
                                }}
                              </For>
                            }
                            {nowLine(resource().id)}
                            {
                              <Show when={ghost()}>
                                {(ghost) => (
                                  <div
                                    aria-hidden="true"
                                    // Custom content stays out of the tab order and pointer input.
                                    inert={createRange() ? true : undefined}
                                    {...slot("createGhost", {
                                      base: {
                                        position: "absolute",
                                        left: 1,
                                        right: 1,
                                        top: Math.min(ghost().startPx, ghost().curPx),
                                        height: Math.max(
                                          Math.abs(ghost().curPx - ghost().startPx),
                                          2,
                                        ),
                                        ...(createRange() ? { overflow: "hidden" } : null),
                                        opacity: 0.7,
                                        pointerEvents: "none",
                                        zIndex: 2,
                                      },
                                      themed: {
                                        background: theme().rangeBackground,
                                        border: `1px solid ${theme().selectedBackground}`,
                                        borderRadius: 6,
                                      },
                                    })}
                                  >
                                    <Show when={createRange()}>
                                      {(range) => (
                                        <Dynamic
                                          component={props.renderCreateGhost}
                                          start={range().start}
                                          end={range().end}
                                          resource={resource()}
                                        />
                                      )}
                                    </Show>
                                  </div>
                                )}
                              </Show>
                            }
                          </div>
                        </div>
                      );
                    }}
                  </For>
                }
              </div>
            </div>
          );
        }
        const gridLines = createMemo(
          () =>
            `repeating-linear-gradient(to right, transparent 0, transparent ${props.hourWidth - 1}px, ${theme().gridLine} ${props.hourWidth - 1}px, ${theme().gridLine} ${props.hourWidth}px)`,
        );
        return (
          <div
            ref={(el) => (eventActions.rootRef.current = el)}
            tabindex={-1}
            class={props.className}
            style={css({
              fontFamily: theme().fontFamily,
              color: theme().text,
              overflowX: "auto",
              ...props.style,
            })}
          >
            <EventActionsMenu
              events={[...new Set([...byResource().values()].flat().map((pe) => pe.event))].filter(
                (event) => editActions(event).length > 0,
              )}
              label={labels().editEvents}
              labelFor={(event) => labels().eventActions(event.title ?? "")}
              descriptionFor={eventDescription}
              onSelect={eventActions.select}
              rootRef={eventActions.rootRef}
              slot={slot}
              theme={theme()}
            />
            <div
              style={css({
                minWidth: props.labelWidth + trackWidth(),
              })}
            >
              {/* Header: corner + hour axis */}
              <div
                {...slot("header", {
                  base: {
                    display: "flex",
                  },
                  themed: {
                    borderBottom: `1px solid ${theme().gridLine}`,
                  },
                })}
              >
                <div
                  {...slot("corner", {
                    base: {
                      width: props.labelWidth,
                      flex: "none",
                    },
                  })}
                />
                <div
                  {...slot("timeAxis", {
                    base: {
                      position: "relative",
                      height: 24,
                      width: trackWidth(),
                    },
                  })}
                >
                  {
                    <For each={hours()} keyed={false}>
                      {(h) => (
                        <div
                          {...slot("hourTick", {
                            base: {
                              position: "absolute",
                              left: (h() - props.startHour) * props.hourWidth,
                              top: 4,
                            },
                            themed: {
                              fontSize: 10,
                              color: theme().textMuted,
                            },
                          })}
                        >
                          {formatHour(h(), {
                            ampm: props.ampm,
                          })}
                        </div>
                      )}
                    </For>
                  }
                </div>
              </div>

              {/* Resource rows */}
              {
                <For each={resources()} keyed={(resource) => resource.id}>
                  {(resource, index) => {
                    const resourceKey = untrack(() => resource().id);
                    onCleanup(() => {
                      if (createOrigin.current?.resource.id === resourceKey) clearCreate();
                    });
                    const ghost = createMemo(() => {
                      const box = createBox();
                      return box?.resourceKey === resource().id ? box : null;
                    });
                    const positioned = createMemo(() => byResource().get(resource().id) ?? []);
                    return (
                      <div
                        {...slot("row", {
                          base: {
                            display: "flex",
                            height: props.rowHeight,
                            ...(dragLaneId() === resource().id
                              ? {
                                  position: "relative",
                                  zIndex: 5,
                                }
                              : null),
                          },
                          themed: {
                            borderBottom: `1px solid ${theme().gridLine}`,
                          },
                        })}
                      >
                        <div
                          {...slot("resourceLabel", {
                            base: {
                              width: props.labelWidth,
                              flex: "none",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 10px",
                              boxSizing: "border-box",
                            },
                            themed: {
                              fontSize: 13,
                              fontWeight: 600,
                              borderRight: `1px solid ${theme().gridLine}`,
                            },
                          })}
                        >
                          {props.renderResourceHeader
                            ? props.renderResourceHeader(resource(), index())
                            : (resource().title ?? resource().id)}
                        </div>
                        <div
                          data-resource-id={resource().id}
                          {...trackInteractionProps(resource())}
                          {...slot("track", {
                            base: {
                              position: "relative",
                              width: trackWidth(),
                            },
                          })}
                        >
                          {/* Closed-hours shade, behind the grid lines and events. */}
                          {
                            <For each={bandsFor(resource())} keyed={false}>
                              {(b) => (
                                <div
                                  aria-hidden="true"
                                  {...slot("businessHours", {
                                    base: {
                                      position: "absolute",
                                      top: 0,
                                      bottom: 0,
                                      left: (b().start - props.startHour) * props.hourWidth,
                                      width: (b().end - b().start) * props.hourWidth,
                                      pointerEvents: "none",
                                      zIndex: 0,
                                    },
                                    themed: props.renderBusinessHours
                                      ? undefined
                                      : {
                                          background: theme().outsideHoursBackground,
                                        },
                                  })}
                                >
                                  {props.renderBusinessHours?.({
                                    date: props.date,
                                    start: b().start,
                                    end: b().end,
                                    resource: resource(),
                                  })}
                                </div>
                              )}
                            </For>
                          }
                          {
                            <For each={backgroundBandsFor(resource())} keyed={false}>
                              {(b) => (
                                <div
                                  aria-hidden="true"
                                  title={b().event.title}
                                  {...slot("backgroundEvent", {
                                    base: {
                                      position: "absolute",
                                      top: 0,
                                      bottom: 0,
                                      left: (b().startHours - props.startHour) * props.hourWidth,
                                      width: (b().endHours - b().startHours) * props.hourWidth,
                                      pointerEvents: "none",
                                      zIndex: 0,
                                    },
                                    themed: {
                                      background: theme().backgroundEvent,
                                    },
                                  })}
                                />
                              )}
                            </For>
                          }
                          <div
                            aria-hidden="true"
                            {...slot("gridLines", {
                              base: {
                                position: "absolute",
                                inset: 0,
                                pointerEvents: "none",
                              },
                              themed: {
                                backgroundImage: gridLines(),
                              },
                            })}
                          />
                          {
                            <For each={positioned()} keyed={(pe) => pe.event}>
                              {(pe) => {
                                const event = untrack(() => pe().event);
                                onCleanup(() => {
                                  if (dragRef.current?.event === event) clearDrag();
                                });
                                const active = createMemo(() => {
                                  const currentDrag = drag();
                                  return currentDrag?.event === event &&
                                    currentDrag.resource.id === resource().id
                                    ? currentDrag
                                    : null;
                                });
                                const startH = createMemo(() => {
                                  const currentActive = active();
                                  return currentActive ? currentActive.startHours : pe().startHours;
                                });
                                const durH = createMemo(() => {
                                  const currentActive = active();
                                  return currentActive
                                    ? currentActive.durationHours
                                    : pe().durationHours;
                                });
                                const left = createMemo(
                                  () =>
                                    clamp(
                                      startH() - props.startHour,
                                      0,
                                      props.endHour - props.startHour,
                                    ) * props.hourWidth,
                                );
                                const right = createMemo(
                                  () =>
                                    clamp(
                                      startH() + durH() - props.startHour,
                                      0,
                                      props.endHour - props.startHour,
                                    ) * props.hourWidth,
                                );
                                const width = createMemo(() => Math.max(right() - left(), 2));
                                // Overlapping events in a row share the height as stacked sub-lanes.
                                const laneHeight = createMemo(() => props.rowHeight / pe().columns);
                                const onPress = () => props.onPressEvent?.(pe().event);
                                const args = createMemo<ResourceEventArgs<T>>(() => ({
                                  event: pe().event,
                                  width: width(),
                                  onPress,
                                }));
                                const draggable = createMemo(
                                  () => !!props.onDragEvent && pe().event.draggable !== false,
                                );
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      if (e.detail !== 0 && handledClick === e.currentTarget) {
                                        handledClick = null;
                                        return;
                                      }
                                      if (!draggable() || e.detail === 0) onPress();
                                    }}
                                    aria-label={pe().event.title}
                                    {...dataState({
                                      "data-dragging": !!active(),
                                    })}
                                    onPointerDown={(e) => beginDrag(e, resource(), "move", pe())}
                                    onPointerMove={moveDrag}
                                    onPointerUp={endDrag}
                                    onPointerCancel={cancelDrag}
                                    onLostPointerCapture={cancelDrag}
                                    {...slot("event", {
                                      base: {
                                        position: "absolute",
                                        left: left(),
                                        width: width(),
                                        top: pe().column * laneHeight(),
                                        height: laneHeight(),
                                        transform:
                                          active()?.kind === "move"
                                            ? `translateY(${active()?.crossPx}px)`
                                            : undefined,
                                        padding: 1,
                                        border: "none",
                                        background: "transparent",
                                        cursor: draggable() ? "grab" : "pointer",
                                        touchAction: draggable() ? "none" : "auto",
                                        font: "inherit",
                                        textAlign: "left",
                                        boxSizing: "border-box",
                                        zIndex: active() ? 3 : 1,
                                        opacity: active() ? 0.85 : 1,
                                      },
                                    })}
                                  >
                                    {Renderer() ? (
                                      <Dynamic component={Renderer()} {...args()} />
                                    ) : (
                                      <DefaultBar
                                        {...args()}
                                        theme={theme()}
                                        boxProps={slot("eventBox")}
                                      />
                                    )}
                                    {draggable() ? (
                                      <span
                                        aria-hidden="true"
                                        onPointerDown={(e) => {
                                          e.stopPropagation();
                                          beginDrag(e, resource(), "resize", pe());
                                        }}
                                        style={css({
                                          position: "absolute",
                                          top: 0,
                                          bottom: 0,
                                          right: 0,
                                          width: 8,
                                          cursor: "ew-resize",
                                          touchAction: "none",
                                        })}
                                      />
                                    ) : null}
                                  </button>
                                );
                              }}
                            </For>
                          }
                          {nowLine(resource().id)}
                          {
                            <Show when={ghost()}>
                              {(ghost) => (
                                <div
                                  aria-hidden="true"
                                  // Custom content stays out of the tab order and pointer input.
                                  inert={createRange() ? true : undefined}
                                  {...slot("createGhost", {
                                    base: {
                                      position: "absolute",
                                      top: 1,
                                      bottom: 1,
                                      left: Math.min(ghost().startPx, ghost().curPx),
                                      width: Math.max(Math.abs(ghost().curPx - ghost().startPx), 2),
                                      ...(createRange() ? { overflow: "hidden" } : null),
                                      opacity: 0.7,
                                      pointerEvents: "none",
                                      zIndex: 2,
                                    },
                                    themed: {
                                      background: theme().rangeBackground,
                                      border: `1px solid ${theme().selectedBackground}`,
                                      borderRadius: 6,
                                    },
                                  })}
                                >
                                  <Show when={createRange()}>
                                    {(range) => (
                                      <Dynamic
                                        component={props.renderCreateGhost}
                                        start={range().start}
                                        end={range().end}
                                        resource={resource()}
                                      />
                                    )}
                                  </Show>
                                </div>
                              )}
                            </Show>
                          }
                        </div>
                      </div>
                    );
                  }}
                </For>
              }
            </div>
          </div>
        );
      })()}
      <Show when={eventActions.openEvent()}>
        {(event) => (
          <EventActionsDialog
            dialogRef={eventActions.dialogRef}
            title={labels().eventActions(event().title ?? "")}
            description={eventDescription(event())}
            actions={editActions(event())}
            closeLabel={labels().close}
            rejectedLabel={labels().eventChangeRejected}
            rejections={eventActions.rejections()}
            onAction={eventActions.run}
            onClose={() => eventActions.close(true)}
            slot={slot}
            theme={theme()}
          />
        )}
      </Show>
    </>
  );
}
