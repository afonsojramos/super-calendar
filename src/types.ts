import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type CalendarMode = 'day' | '3days' | 'week' | 'custom' | 'month' | 'schedule';

/** The time-grid modes (day-column views, excluding month and schedule). */
export type TimeGridMode = Exclude<CalendarMode, 'month' | 'schedule'>;

/**
 * The minimal shape every calendar event must have. Layout (positioning,
 * overlap resolution, paging) only ever reads `start`/`end`; `title` is used by
 * the built-in default renderer. Anything else lives in your own type and is
 * threaded through untouched via the `T` generic.
 */
export interface ICalendarEvent {
  start: Date;
  end: Date;
  title?: string;
  /**
   * Force this event into the all-day lane (above the time grid) instead of the
   * timed columns. When omitted, an event is treated as all-day only if it spans
   * whole days (both `start` and `end` land on midnight).
   */
  allDay?: boolean;
  /** Ignore taps/long-presses on this event (the built-in renderer also dims it). */
  disabled?: boolean;
}

/**
 * An event carrying arbitrary extra fields `T` alongside the required shape.
 * `ICalendarEvent` is authoritative: keys it reserves (`start`/`end`/`title`)
 * cannot be re-typed by `T`.
 */
export type CalendarEvent<T = unknown> = ICalendarEvent & Omit<T, keyof ICalendarEvent>;

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
  /** Per-event style resolved from `eventCellStyle`; the built-in renderer merges it onto the box. */
  cellStyle?: StyleProp<ViewStyle>;
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

/** Build a stable key for an event. Defaults to start-time + index. */
export type EventKeyExtractor<T = unknown> = (event: CalendarEvent<T>, index: number) => string;

/** Sunday = 0 … Saturday = 6, matching `Date.prototype.getDay()`. */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;
