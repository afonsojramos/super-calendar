import type { ComponentType, ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import {
  backgroundBandsForDay,
  type CalendarEvent,
  cellRangeFromDrag,
  isSameCalendarDay,
  useNow,
  type BusinessHoursBand,
  closedHourBands,
  eventTimeLabel,
  formatHour,
  layoutDayEvents,
  type PositionedEvent,
  resolveDraggedBounds,
  snapDeltaMinutes,
} from "@super-calendar/core";
import { useCalendarTheme } from "../theme";

// Native long-press duration (ms) before a bar is picked up to move.
const MOVE_ACTIVATE_MS = 250;
// Web: activate the create sweep past a small drag instead of a long-press, so
// a plain mouse drag creates (mirrors the time grid).
const DRAG_ACTIVATE_PX = 8;
const MINUTES_PER_HOUR = 60;
const isWeb = Platform.OS === "web";

/** A schedulable lane (room, person, machine) events are grouped under. */
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
export interface ResourceTimelineProps<T = unknown> {
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
  /** Custom event renderer; falls back to the built-in bar. */
  renderEvent?: ComponentType<ResourceEventArgs<T>>;
  /** Tap an event. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /**
   * Long-press an event. When `onDragEvent` is also set, a long-press picks the
   * bar up to move instead, so this fires only for non-draggable bars.
   */
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  /**
   * Enables drag-to-move and edge-resize along the time axis: long-press a bar to
   * move it, or drag its right edge to resize. Called with the proposed new
   * start/end; return `false` to reject the drop (it snaps back).
   */
  onDragEvent?: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  /** Tap empty lane space; called with the snapped time and the lane's resource. */
  onPressCell?: (at: Date, resource: Resource) => void;
  /**
   * Long-press empty lane space. When `onCreateEvent` is also set, the long-press
   * starts the create drag instead, so this fires only without it.
   */
  onLongPressCell?: (at: Date, resource: Resource) => void;
  /**
   * Long-press empty lane space, then drag along the time axis to sweep out a new
   * event; called with the swept start/end and the lane's resource.
   */
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
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Hour-gutter width in the vertical orientation, matching the time grid's axis.
const GUTTER_WIDTH = 56;

function DefaultBar<T>({ event, width, height }: ResourceEventArgs<T>): ReactElement {
  const theme = useCalendarTheme();
  // Show the time line only when the bar has room for it along its long axis.
  const showTime = height != null ? height > 34 : width > 56;
  const time = eventTimeLabel({
    mode: "day",
    isAllDay: false,
    start: event.start,
    end: event.end,
    ampm: false,
    showTime: true,
  });
  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: theme.colors.eventBackground },
        theme.containers.timeGridEvent,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[theme.text.eventTitle, { color: theme.colors.eventText }]}
        allowFontScaling={false}
      >
        {event.title}
      </Text>
      {time && showTime ? (
        <Text
          numberOfLines={1}
          style={[styles.barTime, { color: theme.colors.eventText }]}
          allowFontScaling={false}
        >
          {time}
        </Text>
      ) : null}
    </View>
  );
}

type ResourceBarProps<T> = {
  pe: PositionedEvent<T>;
  /** Time flows down instead of across; gestures and resize follow. */
  vertical: boolean;
  /** Pixels per hour along the time axis. */
  hourSize: number;
  /** Cross-axis lane offset: px when horizontal, a percent string when vertical. */
  left: number | `${number}%`;
  top: number;
  /** Along-axis size when horizontal (px); lane width (percent) when vertical. */
  width: number | `${number}%`;
  /** Lane height when horizontal; along-axis size when vertical (px). */
  height: number;
  /** What the custom renderer is told about the bar's box. */
  rendererSize: { width: number; height?: number };
  snapMinutes: number;
  Renderer: ComponentType<ResourceEventArgs<T>>;
  onPress: () => void;
  onLongPress?: () => void;
  onDragEvent: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  theme: ReturnType<typeof useCalendarTheme>;
};

// A bar with drag-to-move (long-press) and edge resize along the time axis
// (right edge when horizontal, bottom edge when vertical). The pure snap/commit
// math is shared with the time grid (`snapDeltaMinutes`, `resolveDraggedBounds`);
// this only wires the gestures.
function ResourceBar<T>({
  pe,
  vertical,
  hourSize,
  left,
  top,
  width,
  height,
  rendererSize,
  snapMinutes,
  Renderer,
  onPress,
  onLongPress,
  onDragEvent,
  theme,
}: ResourceBarProps<T>): ReactElement {
  const moveX = useSharedValue(0);
  const resizeW = useSharedValue(0);
  const latest = useRef({ event: pe.event, onDragEvent });
  latest.current = { event: pe.event, onDragEvent };
  const draggable = !(pe.event as { disabled?: boolean }).disabled;

  // Clear the live preview once the committed change re-renders the bar.
  useEffect(() => {
    moveX.value = 0;
    resizeW.value = 0;
  }, [pe.startHours, pe.durationHours, moveX, resizeW]);

  const snapBack = useCallback(() => {
    moveX.value = 0;
    resizeW.value = 0;
  }, [moveX, resizeW]);

  const commit = useCallback(
    (deltaStartMin: number, deltaEndMin: number) => {
      const { event, onDragEvent: handler } = latest.current;
      const next = resolveDraggedBounds(
        event.start,
        event.end,
        deltaStartMin,
        deltaEndMin,
        snapMinutes,
      );
      if (!next) {
        snapBack();
        return;
      }
      if (handler(event, next.start, next.end) === false) snapBack();
    },
    [snapMinutes, snapBack],
  );

  // Dragging is gesture-only, so mirror move AND resize as screen-reader actions on
  // the same `commit` path. They all live on the bar's accessible Pressable (the
  // resize grip is a non-focusable visual/gesture affordance, so an `adjustable`
  // role there would never receive focus on a real device).
  const unit = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;
  const barActions = draggable
    ? [
        { name: "move-later", label: `Move ${unit(snapMinutes)} later` },
        { name: "move-earlier", label: `Move ${unit(snapMinutes)} earlier` },
        { name: "extend", label: `Extend by ${unit(snapMinutes)}` },
        { name: "shrink", label: `Shorten by ${unit(snapMinutes)}` },
      ]
    : undefined;
  const onBarAction = draggable
    ? (e: AccessibilityActionEvent) => {
        switch (e.nativeEvent.actionName) {
          case "move-later":
            commit(snapMinutes, snapMinutes);
            break;
          case "move-earlier":
            commit(-snapMinutes, -snapMinutes);
            break;
          case "extend":
            commit(0, snapMinutes);
            break;
          case "shrink":
            commit(0, -snapMinutes);
            break;
        }
      }
    : undefined;

  const barStyle = useAnimatedStyle(
    () =>
      vertical
        ? {
            transform: [{ translateY: moveX.value }],
            height: Math.max(height + resizeW.value, 2),
          }
        : {
            transform: [{ translateX: moveX.value }],
            width: Math.max((width as number) + resizeW.value, 2),
          },
    [vertical, width, height],
  );

  const moveGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(draggable)
        .activateAfterLongPress(MOVE_ACTIVATE_MS)
        .onUpdate((e) => {
          moveX.value = vertical ? e.translationY : e.translationX;
        })
        .onEnd((e) => {
          const translation = vertical ? e.translationY : e.translationX;
          const delta = snapDeltaMinutes(translation, hourSize, snapMinutes);
          if (delta === 0) {
            moveX.value = 0;
            return;
          }
          moveX.value = (delta / MINUTES_PER_HOUR) * hourSize;
          runOnJS(commit)(delta, delta);
        }),
    [draggable, vertical, hourSize, snapMinutes, moveX, commit],
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(draggable)
        .onUpdate((e) => {
          resizeW.value = vertical ? e.translationY : e.translationX;
        })
        .onEnd((e) => {
          const translation = vertical ? e.translationY : e.translationX;
          const delta = snapDeltaMinutes(translation, hourSize, snapMinutes);
          if (delta === 0) {
            resizeW.value = 0;
            return;
          }
          resizeW.value = (delta / MINUTES_PER_HOUR) * hourSize;
          runOnJS(commit)(0, delta);
        }),
    [draggable, vertical, hourSize, snapMinutes, resizeW, commit],
  );

  return (
    <Animated.View
      style={[
        { position: "absolute", left, top, padding: 1 },
        vertical ? { width } : { height },
        barStyle,
      ]}
    >
      <GestureDetector gesture={moveGesture}>
        <Pressable
          onPress={onPress}
          // When the bar is draggable, the move gesture claims the long-press
          // first; this fires only for non-draggable (disabled) bars.
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityLabel={pe.event.title}
          accessibilityActions={barActions}
          onAccessibilityAction={onBarAction}
          style={styles.fill}
        >
          <Renderer
            event={pe.event}
            width={rendererSize.width}
            height={rendererSize.height}
            onPress={onPress}
          />
        </Pressable>
      </GestureDetector>
      <GestureDetector gesture={resizeGesture}>
        {/* Visual + gesture resize affordance only; screen readers use the bar's
            extend/shorten actions above (a non-focusable View can't hold them). */}
        <View
          testID="resource-resize-grip"
          style={[
            vertical ? styles.resizeGripBottom : styles.resizeGrip,
            { backgroundColor: theme.colors.eventText },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </GestureDetector>
    </Animated.View>
  );
}

type LaneInteractionLayerProps = {
  resource: Resource;
  /** Time flows down instead of across. */
  vertical: boolean;
  /** Pixels per hour along the time axis. */
  hourSize: number;
  startHour: number;
  date: Date;
  snapMinutes: number;
  onPressCell?: (at: Date, resource: Resource) => void;
  onLongPressCell?: (at: Date, resource: Resource) => void;
  onCreateEvent?: (start: Date, end: Date, resource: Resource) => void;
  theme: ReturnType<typeof useCalendarTheme>;
};

// The tap/long-press/create surface behind a lane's bars, mirroring the time
// grid's cell layer: taps snap to `snapMinutes`, and (when `onCreateEvent` is
// set) a long-press starts a drag that sweeps out a ghost along the time axis.
// Hidden from screen readers — it's a pointer convenience, not the accessible
// path.
function LaneInteractionLayer({
  resource,
  vertical,
  hourSize,
  startHour,
  date,
  snapMinutes,
  onPressCell,
  onLongPressCell,
  onCreateEvent,
  theme,
}: LaneInteractionLayerProps): ReactElement {
  const ghostStart = useSharedValue(0);
  const ghostSize = useSharedValue(0);
  const ghostVisible = useSharedValue(0);

  const timeAt = useCallback(
    (px: number) => cellRangeFromDrag(date, px, px, hourSize, startHour, snapMinutes)?.start,
    [date, hourSize, startHour, snapMinutes],
  );
  const commitCreate = useCallback(
    (fromPx: number, toPx: number) => {
      const range = cellRangeFromDrag(date, fromPx, toPx, hourSize, startHour, snapMinutes);
      if (range) onCreateEvent?.(range.start, range.end, resource);
    },
    [date, hourSize, startHour, snapMinutes, onCreateEvent, resource],
  );

  const pressAt = useCallback(
    (px: number) => {
      const at = timeAt(px);
      if (at) onPressCell?.(at, resource);
    },
    [timeAt, onPressCell, resource],
  );

  // Web: a GestureDetector swallows the Pressable's presses on react-native-web,
  // so taps come back through a Tap gesture, and the create sweep activates past
  // a small drag instead of a long-press so a plain mouse drag creates. Both
  // mirror the time grid's cell layer.
  const laneGesture = useMemo(() => {
    const pan = onCreateEvent
      ? Gesture.Pan()
          .onStart((e) => {
            ghostStart.value = vertical ? e.y : e.x;
            ghostSize.value = 0;
            ghostVisible.value = 1;
          })
          .onUpdate((e) => {
            ghostSize.value = (vertical ? e.y : e.x) - ghostStart.value;
          })
          // `success` is false when the gesture is cancelled/failed after it
          // activated (RNGH still calls onEnd); only a real end should create.
          .onEnd((e, success) => {
            ghostVisible.value = 0;
            if (success) runOnJS(commitCreate)(ghostStart.value, vertical ? e.y : e.x);
          })
          .onFinalize(() => {
            ghostVisible.value = 0;
          })
      : null;
    const activatedPan = pan
      ? isWeb
        ? vertical
          ? pan.activeOffsetY([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
          : pan.activeOffsetX([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
        : pan.activateAfterLongPress(MOVE_ACTIVATE_MS)
      : null;
    const tap =
      isWeb && onPressCell
        ? Gesture.Tap().onEnd((e) => {
            runOnJS(pressAt)(vertical ? e.y : e.x);
          })
        : null;
    if (activatedPan && tap) return Gesture.Exclusive(activatedPan, tap);
    return activatedPan ?? tap;
  }, [
    onCreateEvent,
    onPressCell,
    vertical,
    commitCreate,
    pressAt,
    ghostStart,
    ghostSize,
    ghostVisible,
  ]);

  const ghostStyle = useAnimatedStyle(() => {
    // Snap the preview to the same grid the commit resolves to, so what you see
    // is what cellRangeFromDrag will create.
    const stepPx = (snapMinutes / MINUTES_PER_HOUR) * hourSize;
    const snap = (v: number) => (stepPx > 0 ? Math.round(v / stepPx) * stepPx : v);
    const a = snap(ghostStart.value);
    const b = snap(ghostStart.value + ghostSize.value);
    const from = Math.min(a, b);
    const size = Math.max(Math.abs(b - a), 2);
    return vertical
      ? { opacity: ghostVisible.value, top: from, height: size }
      : { opacity: ghostVisible.value, left: from, width: size };
  }, [vertical, hourSize, snapMinutes]);

  const pxOf = (e: GestureResponderEvent) =>
    vertical ? e.nativeEvent.locationY : e.nativeEvent.locationX;
  const handlePress = onPressCell ? (e: GestureResponderEvent) => pressAt(pxOf(e)) : undefined;
  // When create is on, a long-press starts the create drag, so don't also fire
  // the consumer's long-press handler (mirrors the time grid).
  const handleLongPress =
    onLongPressCell && !onCreateEvent
      ? (e: GestureResponderEvent) => {
          const at = timeAt(pxOf(e));
          if (at) onLongPressCell(at, resource);
        }
      : undefined;

  const layer = (
    <Pressable
      testID="resource-cell-layer"
      style={StyleSheet.absoluteFill}
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
  return (
    <>
      {laneGesture ? <GestureDetector gesture={laneGesture}>{layer}</GestureDetector> : layer}
      {onCreateEvent ? (
        <Animated.View
          testID="resource-create-ghost"
          pointerEvents="none"
          style={[
            vertical ? styles.vcreateGhost : styles.hcreateGhost,
            {
              backgroundColor: theme.colors.eventBackground,
              borderColor: theme.colors.todayBackground,
            },
            ghostStyle,
          ]}
        />
      ) : null}
    </>
  );
}

/**
 * A horizontal resource timeline: rows are resources (rooms, people, machines)
 * and the x-axis is one day's hours. Events sit in their resource's row, and
 * overlapping events in the same row stack into sub-lanes (via the shared
 * `layoutDayEvents`). The grid scrolls horizontally when the axis is wider than
 * the screen. Pass `onDragEvent` to enable long-press drag-to-move and edge
 * resize along the time axis. Read the theme from context — wrap in
 * `CalendarThemeProvider` (or render inside `<Calendar>`) to restyle.
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
  renderEvent,
  onPressEvent,
  onLongPressEvent,
  onDragEvent,
  onPressCell,
  onLongPressCell,
  onCreateEvent,
  businessHours,
  renderBusinessHours,
  dragStepMinutes = 15,
  showNowIndicator = true,
  now: nowProp,
  timeZone,
}: ResourceTimelineProps<T>): ReactElement {
  const theme = useCalendarTheme();
  // Window the lanes to the requested page when resourcesPerPage caps them.
  const resources = useMemo(() => {
    if (!resourcesPerPage || resourcesPerPage <= 0) return allResources;
    const pages = Math.max(1, Math.ceil(allResources.length / resourcesPerPage));
    const page = Math.min(Math.max(resourcePage, 0), pages - 1);
    return allResources.slice(page * resourcesPerPage, (page + 1) * resourcesPerPage);
  }, [allResources, resourcesPerPage, resourcePage]);
  const Renderer = renderEvent ?? DefaultBar;
  const cellEnabled = !!onPressCell || !!onLongPressCell || !!onCreateEvent;
  // The current-time line, shown only when the board's day is the zone's today.
  const now = useNow(showNowIndicator, { now: nowProp, timeZone });
  const nowHours = now.getHours() + now.getMinutes() / 60;
  const showNow =
    showNowIndicator &&
    isSameCalendarDay(now, date) &&
    nowHours >= startHour &&
    nowHours <= endHour;
  const nowLine = (vertical: boolean, hourSize: number) =>
    showNow ? (
      <View
        pointerEvents="none"
        testID="resource-now-indicator"
        style={[
          vertical
            ? { position: "absolute", left: 0, right: 0, height: 2 }
            : { position: "absolute", top: 0, bottom: 0, width: 2 },
          vertical
            ? { top: (nowHours - startHour) * hourSize }
            : { left: (nowHours - startHour) * hourSize },
          { backgroundColor: theme.colors.nowIndicator, zIndex: 2 },
        ]}
      />
    ) : null;
  // The closed-hours bands to shade in a lane, resolved per resource.
  const bandsFor = (resource: Resource) =>
    businessHours
      ? closedHourBands(date, (d) => businessHours(d, resource), startHour, endHour)
      : [];
  // `display: "background"` events in a lane, clipped to the visible window.
  const backgroundBandsFor = (resource: Resource) =>
    backgroundBandsForDay(
      events.filter((event) => resourceId(event) === resource.id),
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

  // Group the overlap-resolved events by resource, once.
  const byResource = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutDayEvents<T>>>();
    for (const resource of resources) {
      const own = events.filter((event) => resourceId(event) === resource.id);
      map.set(resource.id, layoutDayEvents(own, date));
    }
    return map;
  }, [resources, events, resourceId, date]);

  if (orientation === "vertical") {
    // Time flows down like the time grid: hour gutter on the left and one
    // flexed column per resource, so narrow screens share the width instead of
    // scrolling sideways. The resource headers stay fixed above the scroll.
    const trackHeight = (endHour - startHour) * hourHeight;
    return (
      <View style={styles.vroot}>
        <View style={[styles.header, { borderBottomColor: theme.colors.gridLine }]}>
          <View style={{ width: GUTTER_WIDTH }} />
          {resources.map((resource) => (
            <View key={resource.id} style={[styles.vheaderCell, theme.containers.resourceLabel]}>
              <Text
                numberOfLines={1}
                style={[styles.vheaderText, { color: theme.colors.text }]}
                allowFontScaling={false}
              >
                {resource.title ?? resource.id}
              </Text>
            </View>
          ))}
        </View>
        <ScrollView showsVerticalScrollIndicator>
          <View style={[styles.vbody, { height: trackHeight }]}>
            <View style={{ width: GUTTER_WIDTH }}>
              {hours.map((h) => (
                <Text
                  key={h}
                  allowFontScaling={false}
                  style={[
                    styles.vhourLabel,
                    {
                      top: Math.max(0, (h - startHour) * hourHeight - 6),
                      color: theme.colors.textMuted,
                    },
                  ]}
                >
                  {formatHour(h, { ampm })}
                </Text>
              ))}
            </View>
            {resources.map((resource) => {
              const positioned = byResource.get(resource.id) ?? [];
              return (
                <View
                  key={resource.id}
                  style={[
                    styles.vcolumn,
                    { borderLeftColor: theme.colors.gridLine },
                    theme.containers.resourceRow,
                  ]}
                >
                  {/* Closed-hours shade, behind the grid lines and bars. */}
                  {bandsFor(resource).map((b) => (
                    <View
                      key={`shade-${b.start}`}
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      testID="resource-hours-shade"
                      style={[
                        styles.vshadeBand,
                        {
                          top: (b.start - startHour) * hourHeight,
                          height: (b.end - b.start) * hourHeight,
                        },
                        renderBusinessHours
                          ? null
                          : { backgroundColor: theme.colors.outsideHoursBackground },
                      ]}
                    >
                      {renderBusinessHours?.({ date, start: b.start, end: b.end, resource })}
                    </View>
                  ))}
                  {backgroundBandsFor(resource).map((b, i) => (
                    <View
                      key={`bg-${i}`}
                      pointerEvents="none"
                      testID="background-event-shade"
                      style={[
                        styles.vshadeBand,
                        {
                          top: (b.startHours - startHour) * hourHeight,
                          height: (b.endHours - b.startHours) * hourHeight,
                          backgroundColor: theme.colors.backgroundEvent,
                        },
                      ]}
                    />
                  ))}
                  {hours.slice(1).map((h) => (
                    <View
                      key={h}
                      pointerEvents="none"
                      style={[
                        styles.vgridLine,
                        {
                          top: (h - startHour) * hourHeight,
                          backgroundColor: theme.colors.gridLine,
                        },
                      ]}
                    />
                  ))}
                  {nowLine(true, hourHeight)}
                  {cellEnabled ? (
                    <LaneInteractionLayer
                      resource={resource}
                      vertical
                      hourSize={hourHeight}
                      startHour={startHour}
                      date={date}
                      snapMinutes={dragStepMinutes}
                      onPressCell={onPressCell}
                      onLongPressCell={onLongPressCell}
                      onCreateEvent={onCreateEvent}
                      theme={theme}
                    />
                  ) : null}
                  {positioned.map((pe, idx) => {
                    const top =
                      clamp(pe.startHours - startHour, 0, endHour - startHour) * hourHeight;
                    const bottomPx =
                      clamp(pe.startHours + pe.durationHours - startHour, 0, endHour - startHour) *
                      hourHeight;
                    const height = Math.max(bottomPx - top, 2);
                    // Overlapping events share the column as side-by-side sub-lanes.
                    const lanePct = 100 / pe.columns;
                    const left = `${pe.column * lanePct}%` as const;
                    const width = `${lanePct}%` as const;
                    const onPress = () => onPressEvent?.(pe.event);
                    if (onDragEvent) {
                      return (
                        <ResourceBar
                          key={idx}
                          pe={pe}
                          vertical
                          hourSize={hourHeight}
                          left={left}
                          top={top}
                          width={width}
                          height={height}
                          rendererSize={{ width: 0, height }}
                          snapMinutes={dragStepMinutes}
                          Renderer={Renderer}
                          onPress={onPress}
                          onLongPress={
                            onLongPressEvent ? () => onLongPressEvent(pe.event) : undefined
                          }
                          onDragEvent={onDragEvent}
                          theme={theme}
                        />
                      );
                    }
                    return (
                      <Pressable
                        key={idx}
                        onPress={onPress}
                        onLongPress={
                          onLongPressEvent ? () => onLongPressEvent(pe.event) : undefined
                        }
                        accessibilityRole="button"
                        accessibilityLabel={pe.event.title}
                        style={{ position: "absolute", left, width, top, height, padding: 1 }}
                      >
                        <Renderer event={pe.event} width={0} height={height} onPress={onPress} />
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.root}>
      <View style={{ width: labelWidth + trackWidth }}>
        {/* Header: corner + hour axis */}
        <View style={[styles.header, { borderBottomColor: theme.colors.gridLine }]}>
          <View style={{ width: labelWidth }} />
          <View style={{ width: trackWidth, height: 24 }}>
            {hours.map((h) => (
              <Text
                key={h}
                allowFontScaling={false}
                style={[
                  styles.hourTick,
                  { left: (h - startHour) * hourWidth, color: theme.colors.textMuted },
                ]}
              >
                {formatHour(h, { ampm })}
              </Text>
            ))}
          </View>
        </View>

        {/* Resource rows */}
        {resources.map((resource) => {
          const positioned = byResource.get(resource.id) ?? [];
          return (
            <View
              key={resource.id}
              style={[
                styles.row,
                { height: rowHeight, borderBottomColor: theme.colors.gridLine },
                theme.containers.resourceRow,
              ]}
            >
              <View
                style={[
                  styles.label,
                  { width: labelWidth, borderRightColor: theme.colors.gridLine },
                  theme.containers.resourceLabel,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: theme.colors.text }}
                  allowFontScaling={false}
                >
                  {resource.title ?? resource.id}
                </Text>
              </View>
              <View style={{ width: trackWidth }}>
                {/* Closed-hours shade, behind the grid lines and bars. */}
                {bandsFor(resource).map((b) => (
                  <View
                    key={`shade-${b.start}`}
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    testID="resource-hours-shade"
                    style={[
                      styles.hshadeBand,
                      {
                        left: (b.start - startHour) * hourWidth,
                        width: (b.end - b.start) * hourWidth,
                      },
                      renderBusinessHours
                        ? null
                        : { backgroundColor: theme.colors.outsideHoursBackground },
                    ]}
                  >
                    {renderBusinessHours?.({ date, start: b.start, end: b.end, resource })}
                  </View>
                ))}
                {backgroundBandsFor(resource).map((b, i) => (
                  <View
                    key={`bg-${i}`}
                    pointerEvents="none"
                    testID="background-event-shade"
                    style={[
                      styles.hshadeBand,
                      {
                        left: (b.startHours - startHour) * hourWidth,
                        width: (b.endHours - b.startHours) * hourWidth,
                        backgroundColor: theme.colors.backgroundEvent,
                      },
                    ]}
                  />
                ))}
                {/* Hour grid lines */}
                {hours.slice(1).map((h) => (
                  <View
                    key={h}
                    pointerEvents="none"
                    style={[
                      styles.gridLine,
                      { left: (h - startHour) * hourWidth, backgroundColor: theme.colors.gridLine },
                    ]}
                  />
                ))}
                {nowLine(false, hourWidth)}
                {cellEnabled ? (
                  <LaneInteractionLayer
                    resource={resource}
                    vertical={false}
                    hourSize={hourWidth}
                    startHour={startHour}
                    date={date}
                    snapMinutes={dragStepMinutes}
                    onPressCell={onPressCell}
                    onLongPressCell={onLongPressCell}
                    onCreateEvent={onCreateEvent}
                    theme={theme}
                  />
                ) : null}
                {positioned.map((pe, idx) => {
                  const left = clamp(pe.startHours - startHour, 0, endHour - startHour) * hourWidth;
                  const right =
                    clamp(pe.startHours + pe.durationHours - startHour, 0, endHour - startHour) *
                    hourWidth;
                  const width = Math.max(right - left, 2);
                  // Overlapping events share the row height as stacked sub-lanes.
                  const laneHeight = rowHeight / pe.columns;
                  const onPress = () => onPressEvent?.(pe.event);
                  if (onDragEvent) {
                    return (
                      <ResourceBar
                        key={idx}
                        pe={pe}
                        vertical={false}
                        hourSize={hourWidth}
                        left={left}
                        top={pe.column * laneHeight}
                        width={width}
                        height={laneHeight}
                        rendererSize={{ width }}
                        snapMinutes={dragStepMinutes}
                        Renderer={Renderer}
                        onPress={onPress}
                        onLongPress={
                          onLongPressEvent ? () => onLongPressEvent(pe.event) : undefined
                        }
                        onDragEvent={onDragEvent}
                        theme={theme}
                      />
                    );
                  }
                  return (
                    <Pressable
                      key={idx}
                      onPress={onPress}
                      onLongPress={onLongPressEvent ? () => onLongPressEvent(pe.event) : undefined}
                      accessibilityRole="button"
                      accessibilityLabel={pe.event.title}
                      style={{
                        position: "absolute",
                        left,
                        width,
                        top: pe.column * laneHeight,
                        height: laneHeight,
                        padding: 1,
                      }}
                    >
                      <Renderer event={pe.event} width={width} onPress={onPress} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 0 },
  header: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  hourTick: { position: "absolute", top: 4, fontSize: 10 },
  row: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  label: {
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  gridLine: { position: "absolute", top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  bar: { flex: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden" },
  barTime: { fontSize: 11, opacity: 0.75 },
  fill: { flex: 1 },
  // A slim right-edge handle for resizing along the time axis.
  resizeGrip: {
    position: "absolute",
    right: 1,
    top: "30%",
    bottom: "30%",
    width: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  // Its bottom-edge counterpart in the vertical orientation.
  resizeGripBottom: {
    position: "absolute",
    bottom: 1,
    left: "30%",
    right: "30%",
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  vroot: { flex: 1 },
  vheaderCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  vheaderText: { fontSize: 13, fontWeight: "600" },
  vbody: { flexDirection: "row" },
  vcolumn: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  vhourLabel: { position: "absolute", right: 6, fontSize: 10 },
  vgridLine: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth },
  // The drag-to-create preview, sized along the time axis by the gesture. It
  // sits above the bars (like the dom renderer and the time grid) so the sweep
  // stays visible when it crosses an existing event.
  vcreateGhost: {
    position: "absolute",
    left: 2,
    right: 2,
    borderWidth: 1,
    borderRadius: 6,
    opacity: 0,
    zIndex: 2,
  },
  hcreateGhost: {
    position: "absolute",
    top: 2,
    bottom: 2,
    borderWidth: 1,
    borderRadius: 6,
    opacity: 0,
    zIndex: 2,
  },
  hshadeBand: { position: "absolute", top: 0, bottom: 0 },
  vshadeBand: { position: "absolute", left: 0, right: 0 },
});
