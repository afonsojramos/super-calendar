import { useMemo } from "react";
import { addDays, startOfDay } from "date-fns";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, CalendarMode, EventKeyExtractor, RenderEvent } from "../types";
import { useSlots } from "../utils/slots";
import {
  isAllDayEvent,
  isBackgroundEvent,
  layoutMonthWeek,
  type MonthEventSegment,
} from "@super-calendar/core";

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
  /** Reports the lane's natural height, which the grid's all-day band follows. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

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
  onLayout,
}: AllDayLaneProps<T>) {
  const theme = useCalendarTheme();
  const slot = useSlots<AllDayLaneSlot>();
  const RenderEventComponent = renderEvent;

  const rows = useMemo(() => {
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
    return lanes;
  }, [days, events]);

  return (
    <View
      {...slot("allDayLane", {
        base: [styles.lane, rows.length > 0 && { paddingVertical: 2 }],
        themed: theme.containers.allDayLane,
      })}
      onLayout={onLayout}
    >
      {rows.map((segments, lane) => (
        <View key={lane} style={styles.row}>
          {segments.map((segment, index) => {
            const { event, startCol, endCol, continuesBefore, continuesAfter } = segment;
            const previousEnd = index === 0 ? -1 : segments[index - 1].endCol;
            return (
              <View
                key={keyExtractor(event, index)}
                {...slot("allDayColumn", {
                  base: [
                    styles.column,
                    {
                      width: dayWidth * (endCol - startCol + 1),
                      marginLeft: dayWidth * (startCol - previousEnd - 1),
                    },
                  ],
                  themed: theme.containers.allDayColumn,
                })}
              >
                <View {...slot("allDayEvent", { base: styles.chip })}>
                  <RenderEventComponent
                    event={event}
                    mode={mode}
                    isAllDay
                    continuesBefore={continuesBefore}
                    continuesAfter={continuesAfter}
                    onPress={() => onPressEvent(event)}
                    onLongPress={onLongPressEvent ? () => onLongPressEvent(event) : undefined}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  column: {
    paddingHorizontal: 1,
  },
  chip: {
    minHeight: 18,
  },
});
