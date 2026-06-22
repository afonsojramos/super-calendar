import type { ComponentType } from 'react';
import type { SharedValue } from 'react-native-reanimated';

export type CalendarMode = 'day' | 'week' | 'month';

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
  onPress: () => void;
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
