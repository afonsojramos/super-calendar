import { type ReactElement, useMemo, useRef, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { type LayoutChangeEvent, Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCalendarTheme } from "../theme";
import type {
  CalendarEvent,
  CalendarMode,
  EventDragHandler,
  EventDragStartHandler,
  EventKeyExtractor,
  RenderEvent,
} from "../types";
import { useSlots } from "../utils/slots";
import {
  isAllDayEvent,
  isBackgroundEvent,
  layoutMonthWeek,
  monthDropBounds,
  type MonthEventSegment,
} from "@super-calendar/core";

const isWeb = Platform.OS === "web";
// The timed grid's move timing: a long press picks the bar up on a device, and
// a few pixels of travel does on the web, so a tap or click still presses it.
const MOVE_ACTIVATE_MS = 500;
const DRAG_ACTIVATE_PX = 8;
// The carried bar fades like a month bar; its preview matches a moved timed box.
const CARRIED_OPACITY = 0.4;
const PREVIEW_OPACITY = 0.85;

// The lane's slots are a subset of the TimeGrid slot union; typed locally so
// this file doesn't import the full TimeGrid type.
type AllDayLaneSlot = "allDayLane" | "allDayColumn" | "allDayEvent";

type AllDayLaneProps<T> = {
  days: Date[];
  events: CalendarEvent<T>[];
  mode: CalendarMode;
  dayWidth: number;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  /** Enables moving a bar across the visible days. */
  onDragEvent?: EventDragHandler<T>;
  onDragStart?: EventDragStartHandler<T>;
  /** The grid default for moves; an event's `startEditable` overrides it. */
  eventStartEditable?: boolean;
  /** Reports the lane's natural height, which the grid's all-day band follows. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

// A bar being carried. Columns index `days`, so a move maps to calendar days
// correctly across hidden days and under RTL, where the columns run backwards.
type LaneDrag<T> = {
  event: CalendarEvent<T>;
  // The bar's React key, its identity across refreshes that replace the event.
  key: string;
  fromCol: number;
  toCol: number;
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * The all-day lane of one page, pinned above the scrolling hours. All-day
 * events are excluded from the timed columns (see `layoutDayEvents`) and shown
 * here as continuous spans, stacked only when their dates overlap. Always rendered so every page reports a
 * height, zero when the week has none, which the band above the grid follows
 * live as you swipe; the "all-day" label lives in the hour column.
 */
export function AllDayLane<T>({
  days,
  events,
  mode,
  dayWidth,
  renderEvent,
  keyExtractor,
  onPressEvent,
  onLongPressEvent,
  onDragEvent,
  onDragStart,
  eventStartEditable = true,
  onLayout,
}: AllDayLaneProps<T>) {
  const theme = useCalendarTheme();
  const slot = useSlots<AllDayLaneSlot>();
  const RenderEventComponent = renderEvent;

  const spans = useMemo(() => {
    const allDay = events.filter(
      (event) =>
        isAllDayEvent(event) &&
        !isBackgroundEvent(event) &&
        days.some(
          (day) => event.start < addDays(startOfDay(day), 1) && event.end > startOfDay(day),
        ),
    );
    const { segments, laneCount } = layoutMonthWeek(days, allDay);
    const lanes: MonthEventSegment<T>[][] = Array.from({ length: laneCount }, () => []);
    for (const segment of segments) lanes[segment.lane].push(segment);
    return lanes.flat();
  }, [days, events]);

  const [drag, setDrag] = useState<LaneDrag<T> | null>(null);
  const dragRef = useRef<LaneDrag<T> | null>(null);
  const applyDrag = (next: LaneDrag<T> | null) => {
    dragRef.current = next;
    setDrag(next);
  };
  const canMove = (event: CalendarEvent<T>) =>
    onDragEvent != null &&
    !event.disabled &&
    event.draggable !== false &&
    (event.startEditable ?? eventStartEditable);
  const moves = {
    start: (event: CalendarEvent<T>, key: string, fromCol: number) => {
      applyDrag({ event, key, fromCol, toCol: fromCol });
      onDragStart?.(event);
    },
    update: (columns: number) => {
      const current = dragRef.current;
      if (!current) return;
      const toCol = clamp(current.fromCol + columns, 0, days.length - 1);
      if (toCol !== current.toCol) applyDrag({ ...current, toCol });
    },
    end: () => {
      const current = dragRef.current;
      applyDrag(null);
      if (!current) return;
      // Report the event as it is now, so `eventOverlap` does not count the
      // carried event's own refreshed copy as another event.
      const event =
        spans.find((segment, index) => keyExtractor(segment.event, index) === current.key)?.event ??
        current.event;
      const next = monthDropBounds(event, days[current.fromCol], days[current.toCol]);
      if (next) onDragEvent?.(event, next.start, next.end);
    },
    cancel: () => {
      if (dragRef.current) applyDrag(null);
    },
  };

  // Where the carried bar would land, clipped to the visible days. Drawn once it
  // leaves its own column.
  const preview = useMemo(() => {
    if (!drag || drag.toCol === drag.fromCol) return null;
    const next = monthDropBounds(drag.event, days[drag.fromCol], days[drag.toCol]);
    if (!next) return null;
    const moved: CalendarEvent<T> = { ...drag.event, start: next.start, end: next.end };
    return layoutMonthWeek<T>(days, [moved]).segments[0] ?? null;
  }, [drag, days]);

  return (
    <View
      {...slot("allDayLane", {
        base: [styles.lane, spans.length > 0 && { paddingVertical: 2 }],
        themed: theme.containers.allDayLane,
      })}
      onLayout={onLayout}
    >
      {spans.map((segment, index) => {
        const { event, startCol, endCol, lane, continuesBefore, continuesAfter } = segment;
        const previous = spans[index - 1];
        const previousEnd = previous?.lane === lane ? previous.endCol : -1;
        const lastInLane = spans[index + 1]?.lane !== lane;
        const remaining = lastInLane ? days.length - endCol - 1 : 0;
        // Yoga wraps before pixel rounding. Leave subpixel slack at the row end
        // so float32 accumulation cannot push a bar onto the following line.
        const wrapSlack = lastInLane ? Math.min(0.5, dayWidth / 4) : 0;
        const movable = canMove(event);
        const key = keyExtractor(event, index);
        const carried = drag?.key === key;
        return (
          <MoveGesture
            key={key}
            enabled={movable}
            span={endCol - startCol + 1}
            dayWidth={dayWidth}
            onStart={(column) => moves.start(event, key, startCol + column)}
            onUpdate={moves.update}
            onEnd={moves.end}
            onCancel={moves.cancel}
          >
            <View
              {...slot("allDayColumn", {
                base: [
                  styles.column,
                  {
                    width: dayWidth * (endCol - startCol + 1),
                    marginLeft: dayWidth * (startCol - previousEnd - 1),
                    marginRight: dayWidth * remaining - wrapSlack,
                  },
                  carried && styles.carriedColumn,
                ],
                themed: theme.containers.allDayColumn,
              })}
            >
              <View
                {...slot("allDayEvent", {
                  base: [styles.chip, carried && { opacity: CARRIED_OPACITY }],
                })}
              >
                <RenderEventComponent
                  event={event}
                  mode={mode}
                  isAllDay
                  continuesBefore={continuesBefore}
                  continuesAfter={continuesAfter}
                  onPress={() => onPressEvent(event)}
                  // A long press picks a movable bar up instead.
                  onLongPress={
                    onLongPressEvent && !movable ? () => onLongPressEvent(event) : undefined
                  }
                />
              </View>
              {carried && preview ? (
                <View
                  testID="all-day-move-preview"
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.preview,
                    {
                      left: dayWidth * (preview.startCol - startCol),
                      width: dayWidth * (preview.endCol - preview.startCol + 1),
                    },
                  ]}
                >
                  <RenderEventComponent
                    event={preview.event}
                    mode={mode}
                    isAllDay
                    continuesBefore={preview.continuesBefore}
                    continuesAfter={preview.continuesAfter}
                    onPress={() => {}}
                  />
                </View>
              ) : null}
            </View>
          </MoveGesture>
        );
      })}
    </View>
  );
}

type MoveGestureProps = {
  enabled: boolean;
  span: number;
  dayWidth: number;
  /** The grabbed column, counted from the bar's first visible column. */
  onStart: (column: number) => void;
  /** Whole columns travelled from the grab. */
  onUpdate: (columns: number) => void;
  onEnd: () => void;
  onCancel: () => void;
  children: ReactElement;
};

// One bar's pan. The callbacks run on the JS thread (`runOnJS(true)`), like the
// month grid's move, because each step only updates React state.
function MoveGesture({ enabled, children, ...props }: MoveGestureProps): ReactElement {
  const latest = useRef(props);
  latest.current = props;
  // Always mounted, so a bar becoming movable keeps its renderer's state.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(enabled)
      .runOnJS(true)
      .onStart((event) => {
        const { span, dayWidth, onStart } = latest.current;
        if (dayWidth <= 0) return;
        onStart(clamp(Math.floor(event.x / dayWidth), 0, span - 1));
      })
      .onUpdate((event) => {
        const { dayWidth, onUpdate } = latest.current;
        if (dayWidth > 0) onUpdate(Math.round(event.translationX / dayWidth));
      })
      .onEnd((_event, success) => {
        if (success) latest.current.onEnd();
      })
      .onFinalize(() => latest.current.onCancel());
    return isWeb
      ? pan
          .activeOffsetX([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
          .activeOffsetY([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
      : pan.activateAfterLongPress(MOVE_ACTIVATE_MS);
  }, [enabled]);
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

const styles = StyleSheet.create({
  lane: {
    // Keep keyed events as siblings so changing lanes preserves renderer state.
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    rowGap: 2,
  },
  column: {
    paddingHorizontal: 1,
  },
  // Lifts the carried bar's cell so its preview draws over the bars after it.
  carriedColumn: {
    zIndex: 1,
  },
  chip: {
    minHeight: 18,
  },
  preview: {
    position: "absolute",
    top: 0,
    bottom: 0,
    paddingHorizontal: 1,
    opacity: PREVIEW_OPACITY,
  },
});
