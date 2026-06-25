import { StyleSheet, Text, TouchableOpacity } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useCalendarTheme } from "../theme";
import type { RenderEventArgs } from "../types";
import {
  eventAccessibilityLabel,
  eventTimeLabel,
  isTimeVisibleAtHeight,
  titleEllipsizeMode,
  titleNumberOfLines,
} from "../utils/eventDisplay";

/**
 * The built-in event renderer: a filled, rounded box showing the event title
 * and (on the day/week grid, when the box is tall enough) its time range. Pass
 * your own `renderEvent` to `<Calendar>` to replace it entirely.
 */
export function DefaultEvent<T>({
  event,
  mode,
  boxHeight,
  isAllDay,
  ampm = false,
  showTime = true,
  ellipsizeTitle = false,
  allDayLabel,
  cellStyle,
  onPress,
  onLongPress,
}: RenderEventArgs<T>) {
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

  // Announce the full event to screen readers: title plus the all-day label or
  // the time range (which is otherwise only shown visually).
  const accessibilityLabel = eventAccessibilityLabel({
    title: event.title,
    isAllDay: isAllDayEvent,
    start: event.start,
    end: event.end,
    ampm,
    allDayLabel,
  });

  // Hide the time on boxes too short to fit it (driven on the UI thread, so it
  // reveals as you pinch-zoom in). Always returns the same key so Reanimated has
  // a prior value to diff against.
  const timeStyle = useAnimatedStyle(() => {
    return { display: isTimeVisibleAtHeight(boxHeight?.value, mode) ? "flex" : "none" };
  }, [boxHeight, mode]);

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
          // Month cells and the all-day lane are compact: one clipped line. Timed
          // grid events (day/week/3days/…) have vertical room, so let the title
          // wrap to fill its box. It shrinks (flexShrink) before the time, so a
          // short box clips the title rather than slicing the time line in half.
          numberOfLines={titleNumberOfLines(mode, isAllDayEvent)}
          ellipsizeMode={ellipsizeMode}
          allowFontScaling={false}
        >
          {event.title}
        </Text>
      ) : null}
      {timeLabel ? (
        <Animated.View style={timeStyle}>
          <Text
            style={[styles.time, { color: theme.colors.eventText }]}
            // Wrap rather than clip horizontally: a narrow column shows the full
            // range across two lines instead of a cut-off "11:00 - 1".
            numberOfLines={2}
            ellipsizeMode={ellipsizeMode}
            allowFontScaling={false}
          >
            {timeLabel}
          </Text>
        </Animated.View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  box: {
    // Grow to fill the grid's sized box, but fall back to the content height
    // (flexBasis: auto) so month chips — whose wrapper has no fixed height —
    // size to their text instead of collapsing.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  // Shrink and clip the title before the time line (whose default flexShrink of
  // 0 keeps it whole), so short boxes never show a half-cut time.
  title: {
    flexShrink: 1,
  },
  time: {
    fontSize: 11,
  },
  disabled: {
    opacity: 0.5,
  },
});
