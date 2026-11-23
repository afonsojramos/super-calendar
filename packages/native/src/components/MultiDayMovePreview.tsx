import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from "react-native-reanimated";
import {
  clockHoursBetween,
  resolveDraggedBounds,
  shiftMinutes,
  wallClockHours,
} from "@super-calendar/core";
import type { CalendarEvent, CalendarMode, RenderEvent } from "../types";
import { useCalendarTheme } from "../theme";
import { useSlots } from "../utils/slots";
import type { TimeGridSlot } from "./TimeGrid";

export type MultiDayMove<T> = {
  event: CalendarEvent<T>;
  eventIndex: number;
  phase: "dragging" | "dropped";
  dayIndex: number;
  offsetX: SharedValue<number>;
  offsetY: SharedValue<number>;
  lifted: SharedValue<number>;
  // The snapped start and end deltas a release would commit, and the step they
  // snap to, so the renderer shows the times the drop will report.
  liveStartDelta: SharedValue<number>;
  liveEndDelta: SharedValue<number>;
  snapMinutes: number;
};

type PreviewProps<T> = {
  move: MultiDayMove<T>;
  days: Date[];
  cellHeight: SharedValue<number>;
  dayWidth: number;
  minHour: number;
  mode: CalendarMode;
  renderEvent: RenderEvent<T>;
  minEventHeight: number;
  eventGap: number;
};

const noop = () => {};

// Mount once on grab. Only numbers and shared values cross to the UI thread;
// moving the pointer does not rerender the page or rebuild its gestures. The
// segments re-render once per snapped step, to show the times a drop reports.
export function MultiDayMovePreview<T>(props: PreviewProps<T>) {
  const { move, days } = props;
  const { liveStartDelta, liveEndDelta, snapMinutes } = move;
  const dayOffsets = useMemo(
    () => days.map((day) => differenceInCalendarDays(day, days[move.dayIndex]) * 1440),
    [days, move],
  );
  const [delta, setDelta] = useState({ start: 0, end: 0 });
  const syncDelta = useCallback((next: { start: number; end: number }) => {
    setDelta((current) =>
      current.start === next.start && current.end === next.end ? current : next,
    );
  }, []);
  // The first run syncs too, since the shared values may hold a delta already.
  useAnimatedReaction(
    () => ({ start: liveStartDelta.value, end: liveEndDelta.value }),
    (next, previous) => {
      if (!previous || next.start !== previous.start || next.end !== previous.end) {
        runOnJS(syncDelta)(next);
      }
    },
  );
  const event = useMemo(() => {
    const next =
      delta.start === 0 && delta.end === 0
        ? null
        : resolveDraggedBounds(
            move.event.start,
            move.event.end,
            delta.start,
            delta.end,
            snapMinutes,
          );
    return next ? { ...move.event, start: next.start, end: next.end } : move.event;
  }, [move.event, delta, snapMinutes]);
  return days.map((day, index) => (
    <PreviewDay
      key={day.toISOString()}
      {...props}
      liveEvent={event}
      dayOffsets={dayOffsets}
      index={index}
      dayStart={startOfDay(day).getTime()}
      dayEnd={addDays(startOfDay(day), 1).getTime()}
    />
  ));
}

function PreviewDay<T>({
  move,
  cellHeight,
  dayWidth,
  minHour,
  mode,
  renderEvent: RenderEventComponent,
  minEventHeight,
  eventGap,
  liveEvent,
  dayOffsets,
  index,
  dayStart,
  dayEnd,
}: PreviewProps<T> & {
  liveEvent: CalendarEvent<T>;
  dayOffsets: number[];
  index: number;
  dayStart: number;
  dayEnd: number;
}) {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  const { offsetX, offsetY, lifted, dayIndex, event } = move;
  const duration = event.end.getTime() - event.start.getTime();
  const startTimestamp = event.start.getTime();
  const segment = useDerivedValue(() => {
    const columnDelta = dayWidth > 0 ? Math.round(offsetX.value / dayWidth) : 0;
    const target = Math.min(Math.max(dayIndex + columnDelta, 0), dayOffsets.length - 1);
    const minuteDelta = cellHeight.value > 0 ? (offsetY.value / cellHeight.value) * 60 : 0;
    const start = shiftMinutes(
      new Date(startTimestamp),
      dayOffsets[target] + minuteDelta,
    ).getTime();
    const end = start + duration;
    const visible = !lifted.value && start < dayEnd && end > dayStart;
    const segStart = new Date(Math.max(start, dayStart));
    const segEnd = new Date(Math.min(end, dayEnd));
    return {
      top: wallClockHours(segStart, new Date(dayStart), new Date(dayEnd)),
      hours: visible ? Math.max(clockHoursBetween(segStart, segEnd), 0.25) : 0,
      continuesBefore: start < dayStart,
      continuesAfter: end > dayEnd,
    };
  }, [dayWidth, dayIndex, dayOffsets, startTimestamp, duration, dayStart, dayEnd]);
  const boxHeight = useDerivedValue(
    () =>
      segment.value.hours > 0
        ? Math.max(segment.value.hours * cellHeight.value, minEventHeight)
        : 0,
    [minEventHeight],
  );
  const style = useAnimatedStyle(
    () => ({
      top: (segment.value.top - minHour) * cellHeight.value,
      height: boxHeight.value,
      opacity: boxHeight.value > 0 ? 1 : 0,
    }),
    [minHour],
  );
  const [continuation, setContinuation] = useState(() => ({
    continuesBefore: segment.value.continuesBefore,
    continuesAfter: segment.value.continuesAfter,
  }));
  useAnimatedReaction(
    () => ({
      continuesBefore: segment.value.continuesBefore,
      continuesAfter: segment.value.continuesAfter,
    }),
    (next, previous) => {
      if (
        previous &&
        (next.continuesBefore !== previous.continuesBefore ||
          next.continuesAfter !== previous.continuesAfter)
      ) {
        runOnJS(setContinuation)(next);
      }
    },
  );
  const eventSlot = slot("event", { themed: theme.containers.timeGridEvent });
  return (
    <Animated.View
      {...eventSlot}
      testID="multi-day-move-preview"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: "absolute",
          overflow: "hidden",
          padding: eventGap,
          left: index * dayWidth,
          width: dayWidth,
          zIndex: 100,
        },
        eventSlot.style,
        style,
      ]}
    >
      <RenderEventComponent
        event={liveEvent}
        mode={mode}
        boxHeight={boxHeight}
        {...continuation}
        onPress={noop}
      />
    </Animated.View>
  );
}
