/**
 * The render-agnostic core of super-calendar. Date math, the selection model,
 * event layout, the month-grid builder, the headless hooks, and the neutral
 * theme tokens.
 *
 * Imports nothing from React Native, react-dom, Reanimated, Gesture Handler, or
 * Legend List, so it bundles into any renderer. Pair it with `@super-calendar/dom`
 * or `@super-calendar/native`, or drive your own UI from the headless hooks.
 *
 * @example
 * ```ts
 * import { useMonthGrid, buildMonthWeeks } from "@super-calendar/core";
 * ```
 *
 * @see https://super-calendar.afonsojramos.me
 *
 * @module
 */
export * from "./types";
export * from "./tokens";
export * from "./presentation";
export * from "./utils/dateRange";
export * from "./utils/dates";
export * from "./utils/drag";
export * from "./utils/eventDisplay";
export * from "./utils/ical";
export * from "./utils/useNow";
export * from "./utils/layout";
export * from "./utils/monthGrid";
export * from "./utils/recurrence";
export * from "./utils/timezone";
