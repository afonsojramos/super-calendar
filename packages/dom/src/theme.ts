// Theme for the react-dom renderer. The DOM components style themselves with
// plain inline styles driven by this object, so consumers don't need to import
// a stylesheet or configure their bundler for CSS. Colours come from the shared
// @super-calendar/core token palette (one source for both renderers); only the
// DOM-specific pixel metrics and font stack live here.
import { type CalendarColors, darkColors, lightColors } from "@super-calendar/core";

/**
 * Theme for the react-dom renderer. Combines the shared color palette from
 * `@super-calendar/core` with the DOM-specific pixel metrics and font stack.
 */
export type DomCalendarTheme = CalendarColors & {
  /** Row height of a day cell, in px. */
  cellHeight: number;
  /** Diameter of the day badge, in px. */
  dayBadgeSize: number;
  /**
   * Height of the selection band strip, in px (the default pill look). The pill's
   * corner radius is half this. Ignored when `fillCellOnSelection` is set, where
   * the band fills the whole cell instead.
   */
  rangeBandHeight: number;
  /** Font stack for the calendar. */
  fontFamily: string;
};

const SYSTEM_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const METRICS = { cellHeight: 48, dayBadgeSize: 34, rangeBandHeight: 32, fontFamily: SYSTEM_FONT };

/** The default light theme: the core light palette plus the DOM metrics. */
export const defaultDomTheme: DomCalendarTheme = { ...lightColors, ...METRICS };

/** The dark theme: the core dark palette plus the DOM metrics. */
export const darkDomTheme: DomCalendarTheme = { ...darkColors, ...METRICS };

/** Merge a partial override onto a base theme (defaults to {@link defaultDomTheme}). */
export function mergeDomTheme(
  overrides?: Partial<DomCalendarTheme>,
  base: DomCalendarTheme = defaultDomTheme,
): DomCalendarTheme {
  return overrides ? { ...base, ...overrides } : base;
}
