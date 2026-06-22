import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useCalendarTheme } from '../theme';
import type { CalendarEvent, EventKeyExtractor, RenderEvent, WeekStartsOn } from '../types';
import { getIsToday, isWeekend } from '../utils/dates';
import { eventDayKeys } from '../utils/layout';

const chunkIntoWeeks = (days: Date[]): Date[][] => {
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
};

export type MonthViewProps<T> = {
  date: Date;
  events: CalendarEvent<T>[];
  maxVisibleEventCount: number;
  weekStartsOn: WeekStartsOn;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressDay?: (date: Date) => void;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
};

function MonthViewInner<T>({
  date,
  events,
  maxVisibleEventCount,
  weekStartsOn,
  renderEvent,
  keyExtractor,
  onPressDay,
  onPressEvent,
  onPressMore,
}: MonthViewProps<T>) {
  const theme = useCalendarTheme();
  const RenderEventComponent = renderEvent;

  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(date), { weekStartsOn });
    const end = endOfWeek(endOfMonth(date), { weekStartsOn });
    return chunkIntoWeeks(eachDayOfInterval({ start, end }));
  }, [date, weekStartsOn]);

  // Group events by calendar day once per `events` change, rather than scanning
  // the whole list inside every one of the (up to) 42 day cells on each render.
  // Multi-day events are indexed under every day they span.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent<T>[]>();
    for (const event of events) {
      for (const key of eventDayKeys(event)) {
        const existing = map.get(key);
        if (existing) existing.push(event);
        else map.set(key, [event]);
      }
    }
    return map;
  }, [events]);

  const renderDay = (day: Date) => {
    const dayEvents = eventsByDay.get(startOfDay(day).toISOString()) ?? [];
    const isCurrentMonth = isSameMonth(day, date);
    const isToday = getIsToday(day);
    const hiddenCount = dayEvents.length - maxVisibleEventCount;

    const dateColor = isToday
      ? theme.colors.todayText
      : isCurrentMonth
        ? theme.colors.text
        : theme.colors.textDisabled;

    return (
      <TouchableOpacity
        key={day.toISOString()}
        style={[
          styles.dayCell,
          { borderColor: theme.colors.gridLine },
          isWeekend(day) && { backgroundColor: theme.colors.weekendBackground },
        ]}
        onPress={onPressDay ? () => onPressDay(day) : undefined}
        disabled={!onPressDay}
        accessibilityLabel={format(day, 'EEEE, d LLLL yyyy')}
      >
        <View
          style={[
            styles.dateBadge,
            isToday && {
              backgroundColor: theme.colors.todayBackground,
              borderRadius: theme.todayBadgeRadius,
            },
          ]}
        >
          <Text style={[theme.text.dateCell, { color: dateColor }]} allowFontScaling={false}>
            {format(day, 'd')}
          </Text>
        </View>
        {dayEvents.slice(0, maxVisibleEventCount).map((event, index) => (
          <View key={keyExtractor(event, index)} style={styles.monthEvent}>
            <RenderEventComponent event={event} mode="month" onPress={() => onPressEvent(event)} />
          </View>
        ))}
        {hiddenCount > 0 ? (
          <Text
            style={[theme.text.more, styles.moreLabel, { color: theme.colors.textMuted }]}
            onPress={onPressMore ? () => onPressMore(dayEvents, day) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Show ${hiddenCount} more events`}
            allowFontScaling={false}
          >
            {`${hiddenCount} More`}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {weeks.map((week) => (
        <View style={styles.weekRow} key={week[0].toISOString()}>
          {week.map((day) => renderDay(day))}
        </View>
      ))}
    </View>
  );
}

export const MonthView = memo(MonthViewInner) as typeof MonthViewInner;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekRow: {
    flex: 1,
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 4,
    gap: 2,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dateBadge: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 24,
    width: 24,
  },
  monthEvent: {
    width: '92%',
  },
  moreLabel: {
    marginTop: 2,
  },
});
