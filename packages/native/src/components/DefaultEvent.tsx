import type { ReactElement } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue } from "react-native-reanimated";
import { useCalendarTheme } from "../theme";
import type { RenderEventArgs } from "../types";
import {
  eventAccessibilityLabel,
  eventChipLayout,
  eventTimeLabel,
  titleEllipsizeMode,
  titleNumberOfLines,
} from "@super-calendar/core";

// Box vertical padding (mirrors styles.box) and the reserved height for the time
// line. The time wraps to at most two lines on a narrow column, so reserve two
// lines' worth; the title gets every whole line that fits in what remains.
const BOX_PADDING_V = 2;
const TIME_LINE_HEIGHT = 30;
const FALLBACK_TITLE_LINE_HEIGHT = 16;

const numericStyle = (value: number | string | undefined, fallback: number) =>
  typeof value === "number" ? value : fallback;

/**
 * The built-in event renderer: a filled, rounded box showing the event title
 * and (on the day/week grid, when the box is tall enough) its time range. The
 * title fills the box in whole lines, never a half-cut last line, and clips
 * without an ellipsis unless `ellipsizeTitle` is set. The time is secondary: it
 * only shows once a full line is free beneath the title. Pass your own
 * `renderEvent` to `<Calendar>` to replace it entirely.
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
  accessibilityLabel: accessibilityLabelProp,
  accessibilityActions,
  onAccessibilityAction,
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
  const titleLineHeight = numericStyle(
    theme.text.eventTitle.lineHeight,
    FALLBACK_TITLE_LINE_HEIGHT,
  );

  // Announce the full event to screen readers: title plus the all-day label or
  // the time range (which is otherwise only shown visually). A consumer's
  // `eventAccessibilityLabel` override, threaded in as `accessibilityLabelProp`,
  // takes precedence.
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

  // Month cells and the all-day lane get a single clipped line; the timed grid
  // (and the roomy schedule rows) wrap to fill the box. `titleNumberOfLines`
  // returns 1 for the single-line contexts and undefined for the wrapping ones.
  const fixedTitleLines = titleNumberOfLines(mode, isAllDayEvent);

  // The schedule view is a list, not a grid, so its rows are a roomier card with
  // a larger title and time, mirroring the dom renderer's default agenda row.
  const isSchedule = mode === "schedule";

  // Whole-line title clamp + time visibility, recomputed on the UI thread as the
  // box grows or shrinks with pinch-zoom, so the title never shows a half-cut
  // line and the secondary time only appears once a full line is free below it.
  const layout = useDerivedValue(
    () =>
      eventChipLayout({
        boxHeightPx: boxHeight?.value,
        mode,
        hasTime: timeLabel != null,
        titleLineHeightPx: titleLineHeight,
        timeLineHeightPx: TIME_LINE_HEIGHT,
        paddingYPx: BOX_PADDING_V,
      }),
    [boxHeight, mode, timeLabel, titleLineHeight],
  );

  // Clip the wrapped title to a whole number of lines (overflow hidden on the
  // wrapper), so the visible text is always full words on full lines.
  const titleClipStyle = useAnimatedStyle(() => {
    const lines = layout.value.titleMaxLines;
    return { maxHeight: lines > 0 ? lines * titleLineHeight : undefined };
  }, [layout, titleLineHeight]);

  const timeStyle = useAnimatedStyle(() => {
    return { display: layout.value.showTime ? "flex" : "none" };
  }, [layout]);

  // A chip reduced to a single title line (no time) centers it vertically, so a
  // very short event reads balanced instead of hugging the top edge. Layout is
  // recomputed on the UI thread, so the alignment tracks pinch-zoom live.
  const contentStyle = useAnimatedStyle(() => {
    const { titleMaxLines, showTime } = layout.value;
    return { justifyContent: titleMaxLines === 1 && !showTime ? "center" : "flex-start" };
  }, [layout]);

  return (
    <TouchableOpacity
      style={[
        styles.box,
        isSchedule && styles.scheduleBox,
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
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
    >
      <Animated.View testID="event-chip-content" style={[styles.content, contentStyle]}>
        {event.title ? (
          fixedTitleLines == null ? (
            <Animated.View style={[styles.titleClip, titleClipStyle]}>
              <Text
                style={[
                  theme.text.eventTitle,
                  isSchedule && styles.scheduleTitle,
                  { color: theme.colors.eventText },
                ]}
                ellipsizeMode={ellipsizeMode}
                allowFontScaling={false}
              >
                {event.title}
              </Text>
            </Animated.View>
          ) : (
            <Text
              style={[
                theme.text.eventTitle,
                styles.title,
                isSchedule && styles.scheduleTitle,
                { color: theme.colors.eventText },
              ]}
              // Month cells and the all-day lane are compact: a single clipped line.
              numberOfLines={fixedTitleLines}
              ellipsizeMode={ellipsizeMode}
              allowFontScaling={false}
            >
              {event.title}
            </Text>
          )
        ) : null}
        {timeLabel ? (
          <Animated.View style={timeStyle}>
            <Text
              style={[
                styles.time,
                isSchedule && styles.scheduleTime,
                { color: theme.colors.eventText },
              ]}
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
      </Animated.View>
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
    paddingVertical: BOX_PADDING_V,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  // The roomy schedule-row card, matching the dom default agenda row.
  scheduleBox: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  scheduleTime: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.75,
  },
  // The title/time column; grows into the grid's sized box so a lone title line
  // can center vertically, and shrinks with it (content-sized chips unaffected).
  content: {
    flexGrow: 1,
    flexShrink: 1,
  },
  // Clips the wrapped title to the animated whole-line max-height.
  titleClip: {
    overflow: "hidden",
  },
  // The all-day single line shrinks and clips before the time line (whose default
  // flexShrink of 0 keeps it whole), so a short lane never shows a half-cut time.
  title: {
    flexShrink: 1,
  },
  time: {
    fontSize: 11,
    lineHeight: 15,
  },
  disabled: {
    opacity: 0.5,
  },
});
