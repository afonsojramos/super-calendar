import { addDays, startOfDay } from 'date-fns';
import { StyleSheet, View } from 'react-native';
import { useCalendarTheme } from '../theme';
import type { CalendarEvent, CalendarMode, EventKeyExtractor, RenderEvent } from '../types';
import { isAllDayEvent } from '../utils/layout';

type AllDayLaneProps<T> = {
  days: Date[];
  events: CalendarEvent<T>[];
  mode: CalendarMode;
  hourColumnWidth: number;
  dayWidth: number;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
};

/**
 * The all-day lane that sits above the scrolling time grid. All-day events are
 * excluded from the timed columns (see `layoutDayEvents`) and shown here,
 * stacked under their day(s). Renders nothing when no day has an all-day event,
 * so timed-only calendars are unaffected.
 */
export function AllDayLane<T>({
  days,
  events,
  mode,
  hourColumnWidth,
  dayWidth,
  renderEvent,
  keyExtractor,
  onPressEvent,
  onLongPressEvent,
}: AllDayLaneProps<T>) {
  const theme = useCalendarTheme();
  const RenderEventComponent = renderEvent;

  const allDay = events.filter(isAllDayEvent);
  const perDay = days.map((day) => {
    const start = startOfDay(day);
    const next = addDays(start, 1);
    return allDay.filter((event) => event.start < next && event.end > start);
  });

  if (perDay.every((list) => list.length === 0)) return null;

  return (
    <View style={[styles.lane, { borderBottomColor: theme.colors.gridLine }]}>
      <View style={{ width: hourColumnWidth }} />
      {days.map((day, dayIndex) => (
        <View key={day.toISOString()} style={[styles.column, { width: dayWidth }]}>
          {perDay[dayIndex].map((event, index) => (
            <View key={keyExtractor(event, index)} style={styles.chip}>
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
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 2,
  },
  column: {
    paddingHorizontal: 1,
    gap: 2,
  },
  chip: {
    minHeight: 18,
  },
});
