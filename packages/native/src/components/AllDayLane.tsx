import { addDays, startOfDay } from "date-fns";
import { type LayoutChangeEvent, StyleSheet, View } from "react-native";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, CalendarMode, EventKeyExtractor, RenderEvent } from "../types";
import { useSlots } from "../utils/slots";
import { isAllDayEvent, isBackgroundEvent } from "@super-calendar/core";

// The lane's slots are a subset of the TimeGrid slot union; typed locally so
// this file doesn't import the full TimeGrid type.
type AllDayLaneSlot = "allDayLane" | "allDayColumn" | "allDayEvent";

/** Height of a lane with no all-day events: one empty chip row. */
export const MIN_ALL_DAY_LANE_HEIGHT = 24;

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
 * here, stacked under their day(s). Always rendered, at least one chip row
 * tall, so the band above the grid never jumps between pages; the "all-day"
 * label lives in the hour column.
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

  // Background events shade the timed columns instead of taking a lane chip.
  const allDay = events.filter((event) => isAllDayEvent(event) && !isBackgroundEvent(event));
  const perDay = days.map((day) => {
    const start = startOfDay(day);
    const next = addDays(start, 1);
    return allDay.filter((event) => event.start < next && event.end > start);
  });

  return (
    <View
      {...slot("allDayLane", {
        base: styles.lane,
        themed: [{ borderBottomColor: theme.colors.gridLine }, theme.containers.allDayLane],
      })}
      onLayout={onLayout}
    >
      {days.map((day, dayIndex) => (
        <View
          key={day.toISOString()}
          {...slot("allDayColumn", {
            base: [styles.column, { width: dayWidth }],
            themed: theme.containers.allDayColumn,
          })}
        >
          {perDay[dayIndex].map((event, index) => (
            <View key={keyExtractor(event, index)} {...slot("allDayEvent", { base: styles.chip })}>
              <RenderEventComponent
                event={event}
                mode={mode}
                isAllDay
                onPress={() => onPressEvent(event)}
                onLongPress={onLongPressEvent ? () => onLongPressEvent(event) : undefined}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: MIN_ALL_DAY_LANE_HEIGHT,
  },
  column: {
    paddingVertical: 2,
    paddingHorizontal: 1,
    gap: 2,
  },
  chip: {
    minHeight: 18,
  },
});
