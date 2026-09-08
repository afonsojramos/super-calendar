import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { useMemo, useState } from "react";
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
} from "react-native-reanimated";
import { shiftMinutes } from "@super-calendar/core";
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
};

type PreviewProps<T> = {
  move: MultiDayMove<T>;
  days: Date[];
  cellHeight: SharedValue<number>;
  dayWidth: number;
  hourColumnWidth: number;
  minHour: number;
  mode: CalendarMode;
  renderEvent: RenderEvent<T>;
  minEventHeight: number;
  eventGap: number;
};

const noop = () => {};

// Mount once on grab. Only numbers and shared values cross to the UI thread;
// moving the pointer does not rerender the page or rebuild its gestures.
export function MultiDayMovePreview<T>(props: PreviewProps<T>) {
  const { move, days } = props;
  const dayOffsets = useMemo(
    () => days.map((day) => differenceInCalendarDays(day, days[move.dayIndex]) * 1440),
    [days, move],
  );
  return days.map((day, index) => (
    <PreviewDay
      key={day.toISOString()}
      {...props}
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
  hourColumnWidth,
  minHour,
  mode,
  renderEvent: RenderEventComponent,
  minEventHeight,
  eventGap,
  dayOffsets,
  index,
  dayStart,
  dayEnd,
}: PreviewProps<T> & {
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
    return {
      top: (Math.max(start, dayStart) - dayStart) / 3_600_000,
      hours: visible
        ? Math.max((Math.min(end, dayEnd) - Math.max(start, dayStart)) / 3_600_000, 0.25)
        : 0,
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
          left: hourColumnWidth + index * dayWidth,
          width: dayWidth,
          zIndex: 100,
        },
        eventSlot.style,
        style,
      ]}
    >
      <RenderEventComponent
        event={event}
        mode={mode}
        boxHeight={boxHeight}
        {...continuation}
        onPress={noop}
      />
    </Animated.View>
  );
}
