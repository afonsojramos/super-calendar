import type { ReactElement } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useCalendarTheme } from "../theme";
import type { RenderEventArgs } from "../types";
import {
  eventAccessibilityLabel,
  eventTimeLabel,
  titleEllipsizeMode,
  titleNumberOfLines,
} from "@super-calendar/core";

/**
 * A lightweight event chip for the month grid and the date picker: the same
 * titled box as {@link DefaultEvent} but with no Reanimated dependency (it drops
 * the pinch-zoom time reveal, which only applies to the week/day grid). It's the
 * default renderer for `MonthList`, so the `/picker` entry point stays free of
 * Reanimated.
 */
export function DefaultMonthEvent<T>({
  event,
  mode,
  isAllDay,
  ampm = false,
  showTime = true,
  ellipsizeTitle = false,
  allDayLabel,
  accessibilityLabel: accessibilityLabelProp,
  cellStyle,
  onPress,
  onLongPress,
}: RenderEventArgs<T>): ReactElement {
  const theme = useCalendarTheme();
  const isAllDayEvent = isAllDay ?? false;
  const timeLabel = eventTimeLabel({
    mode,
    isAllDay: isAllDayEvent,
    start: event.start,
    end: event.end,
    ampm,
    showTime,
    allDayLabel,
  });
  const ellipsizeMode = titleEllipsizeMode(ellipsizeTitle);
  const accessibilityLabel =
    accessibilityLabelProp ??
    eventAccessibilityLabel({
      title: event.title,
      isAllDay: isAllDayEvent,
      start: event.start,
      end: event.end,
      ampm,
      allDayLabel,
    });

  return (
    <TouchableOpacity
      style={[
        styles.box,
        { backgroundColor: theme.colors.eventBackground },
        event.disabled && styles.disabled,
        cellStyle,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: event.disabled ?? false }}
    >
      {event.title ? (
        <Text
          style={[theme.text.eventTitle, styles.title, { color: theme.colors.eventText }]}
          numberOfLines={titleNumberOfLines(mode, isAllDayEvent)}
          ellipsizeMode={ellipsizeMode}
          allowFontScaling={false}
        >
          {event.title}
        </Text>
      ) : null}
      {timeLabel ? (
        <View>
          <Text
            style={[styles.time, { color: theme.colors.eventText }]}
            numberOfLines={2}
            ellipsizeMode={ellipsizeMode}
            allowFontScaling={false}
          >
            {timeLabel}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  title: { flexShrink: 1 },
  time: { fontSize: 11 },
  disabled: { opacity: 0.5 },
});
