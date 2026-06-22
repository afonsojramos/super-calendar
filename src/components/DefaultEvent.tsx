import { format } from 'date-fns';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useCalendarTheme } from '../theme';
import type { RenderEventArgs } from '../types';

/**
 * The built-in event renderer: a filled, rounded box showing the event title
 * and (on the day/week grid) its time range. Pass your own `renderEvent` to
 * `<Calendar>` to replace it entirely.
 */
export function DefaultEvent<T>({ event, mode, isAllDay, onPress, onLongPress }: RenderEventArgs<T>) {
  const theme = useCalendarTheme();
  const showTime = mode !== 'month' && !isAllDay;

  return (
    <TouchableOpacity
      style={[styles.box, { backgroundColor: theme.colors.eventBackground }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={event.title}
    >
      {event.title ? (
        <Text
          style={[theme.text.eventTitle, { color: theme.colors.eventText }]}
          numberOfLines={mode === 'day' ? undefined : 1}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {event.title}
        </Text>
      ) : null}
      {showTime ? (
        <Text
          style={[styles.time, { color: theme.colors.eventText }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {`${format(event.start, 'HH:mm')} - ${format(event.end, 'HH:mm')}`}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  time: {
    fontSize: 11,
  },
});
