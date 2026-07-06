import type { ComponentType, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import {
  type CalendarEvent,
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
const MINUTES_PER_HOUR = 60;

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
  /** Pixel width of the event bar. */
  width: number;
  onPress: () => void;
}

/** Props for {@link ResourceTimeline}. */
export interface ResourceTimelineProps<T = unknown> {
  /** The day to lay out along the horizontal axis. */
  date: Date;
  /** The rows, top to bottom. */
  resources: Resource[];
  /** Events; each is placed in the row named by `resourceId(event)`. */
  events: CalendarEvent<T>[];
  /** Read an event's resource id. Default: `event.resourceId`. */
  resourceId?: (event: CalendarEvent<T>) => string | undefined;
  /** First hour shown (default 0). */
  startHour?: number;
  /** Last hour shown, exclusive (default 24). */
  endHour?: number;
  /** Pixels per hour along the axis (default 80). */
  hourWidth?: number;
  /** Height of each resource row in px (default 56). */
  rowHeight?: number;
  /** Width of the left resource-label column in px (default 140). */
  labelWidth?: number;
  /** 12-hour AM/PM axis labels (default false). */
  ampm?: boolean;
  /** Custom event renderer; falls back to the built-in bar. */
  renderEvent?: ComponentType<ResourceEventArgs<T>>;
  /** Tap an event. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /**
   * Enables drag-to-move and edge-resize along the time axis: long-press a bar to
   * move it, or drag its right edge to resize. Called with the proposed new
   * start/end; return `false` to reject the drop (it snaps back).
   */
  onDragEvent?: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  /** Snap dragged events to this many minutes (default 15). */
  dragStepMinutes?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function DefaultBar<T>({ event, width }: ResourceEventArgs<T>): ReactElement {
  const theme = useCalendarTheme();
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
      {time && width > 56 ? (
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
  left: number;
  width: number;
  laneHeight: number;
  hourWidth: number;
  snapMinutes: number;
  Renderer: ComponentType<ResourceEventArgs<T>>;
  onPress: () => void;
  onDragEvent: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  theme: ReturnType<typeof useCalendarTheme>;
};

// A bar with drag-to-move (long-press) and right-edge resize along the time axis.
// The pure snap/commit math is shared with the time grid (`snapDeltaMinutes`,
// `resolveDraggedBounds`); this only wires the horizontal gestures.
function ResourceBar<T>({
  pe,
  left,
  width,
  laneHeight,
  hourWidth,
  snapMinutes,
  Renderer,
  onPress,
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

  const barStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: moveX.value }], width: Math.max(width + resizeW.value, 2) }),
    [width],
  );

  const moveGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(draggable)
        .activateAfterLongPress(MOVE_ACTIVATE_MS)
        .onUpdate((e) => {
          moveX.value = e.translationX;
        })
        .onEnd((e) => {
          const delta = snapDeltaMinutes(e.translationX, hourWidth, snapMinutes);
          if (delta === 0) {
            moveX.value = 0;
            return;
          }
          moveX.value = (delta / MINUTES_PER_HOUR) * hourWidth;
          runOnJS(commit)(delta, delta);
        }),
    [draggable, hourWidth, snapMinutes, moveX, commit],
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(draggable)
        .onUpdate((e) => {
          resizeW.value = e.translationX;
        })
        .onEnd((e) => {
          const delta = snapDeltaMinutes(e.translationX, hourWidth, snapMinutes);
          if (delta === 0) {
            resizeW.value = 0;
            return;
          }
          resizeW.value = (delta / MINUTES_PER_HOUR) * hourWidth;
          runOnJS(commit)(0, delta);
        }),
    [draggable, hourWidth, snapMinutes, resizeW, commit],
  );

  return (
    <Animated.View
      style={[
        { position: "absolute", left, top: pe.column * laneHeight, height: laneHeight, padding: 1 },
        barStyle,
      ]}
    >
      <GestureDetector gesture={moveGesture}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={pe.event.title}
          style={styles.fill}
        >
          <Renderer event={pe.event} width={width} onPress={onPress} />
        </Pressable>
      </GestureDetector>
      <GestureDetector gesture={resizeGesture}>
        <View
          style={[styles.resizeGrip, { backgroundColor: theme.colors.eventText }]}
          accessibilityRole="adjustable"
          accessibilityLabel={`Resize ${pe.event.title}`}
        />
      </GestureDetector>
    </Animated.View>
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
  resources,
  events,
  resourceId = (event) => (event as { resourceId?: string }).resourceId,
  startHour = 0,
  endHour = 24,
  hourWidth = 80,
  rowHeight = 56,
  labelWidth = 140,
  ampm = false,
  renderEvent,
  onPressEvent,
  onDragEvent,
  dragStepMinutes = 15,
}: ResourceTimelineProps<T>): ReactElement {
  const theme = useCalendarTheme();
  const Renderer = renderEvent ?? DefaultBar;

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
                        left={left}
                        width={width}
                        laneHeight={laneHeight}
                        hourWidth={hourWidth}
                        snapMinutes={dragStepMinutes}
                        Renderer={Renderer}
                        onPress={onPress}
                        onDragEvent={onDragEvent}
                        theme={theme}
                      />
                    );
                  }
                  return (
                    <Pressable
                      key={idx}
                      onPress={onPress}
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
});
