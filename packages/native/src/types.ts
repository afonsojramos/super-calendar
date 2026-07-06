import type { ComponentType } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { CalendarEvent, CalendarMode } from "@super-calendar/core";

// Re-export the renderer-agnostic types from core so native modules can keep
// importing them from "../types".
export type {
  BusinessHours,
  CalendarEvent,
  CalendarMode,
  EventAccessibilityLabelContext,
  EventAccessibilityLabeler,
  EventKeyExtractor,
  ICalendarEvent,
  RecurrenceFrequency,
  RecurrenceRule,
  TimeGridMode,
  WeekStartsOn,
} from "@super-calendar/core";

// The React Native render contract lives here, not in core: it references
// Reanimated (`SharedValue`) and React Native (`ViewStyle`) types, which must
// not leak into the platform-free core.
/**
 * Props passed to a {@link RenderEvent} component for one event. Carries the
 * event, the current mode, press handlers, and built-in renderer hints such as
 * `boxHeight`, `continuesBefore`/`continuesAfter`, and `isAllDay`.
 */
export type RenderEventArgs<T = unknown> = {
  event: CalendarEvent<T>;
  mode: CalendarMode;
  /**
   * Live pixel height of the event box on the week/day grid, driven on the UI
   * thread by pinch-to-zoom. Use it to reveal detail progressively as the box
   * grows. `undefined` in month mode, where events render at a fixed size.
   */
  boxHeight?: SharedValue<number>;
  /**
   * On the week/day grid, true when this is a clipped segment of a multi-day
   * event that started on an earlier day / continues onto a later day. Lets a
   * renderer draw "continues" affordances. `undefined` in month mode.
   */
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  /** True when this event is rendered in the all-day lane (week/day) or is an all-day event in month view. */
  isAllDay?: boolean;
  /** Format the built-in renderer's time range in 12-hour AM/PM. Default false (24h). */
  ampm?: boolean;
  /** Show the time range in the built-in renderer (day/week/schedule). Default true. */
  showTime?: boolean;
  /** Add a trailing ellipsis (…) when a clipped title overflows in the built-in renderer; otherwise the text is hard-clipped. Default false. */
  ellipsizeTitle?: boolean;
  /** Label shown for an all-day event in the schedule (and its screen-reader text). Default "All day". */
  allDayLabel?: string;
  /** Per-event style resolved from `eventCellStyle`; the built-in renderer merges it onto the box. */
  cellStyle?: StyleProp<ViewStyle>;
  /**
   * Screen-reader label to announce for the event, injected by a consumer's
   * `eventAccessibilityLabel` override. The built-in renderers use it in place of
   * their default label; `undefined` falls back to that default.
   */
  accessibilityLabel?: string;
  onPress: () => void;
  /** Wired when the consumer passes `onLongPressEvent`; otherwise undefined. */
  onLongPress?: () => void;
};

/**
 * A component that renders a single event. It is rendered as a real component
 * (not called as a function), so it may safely use hooks — including Reanimated
 * hooks driven by `boxHeight`. Render an element that fills its container
 * (`flex: 1`); the calendar positions and sizes the wrapping box for you.
 */
export type RenderEvent<T = unknown> = ComponentType<RenderEventArgs<T>>;
