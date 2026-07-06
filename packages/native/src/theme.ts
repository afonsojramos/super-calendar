import { type CalendarColors, darkColors, lightColors } from "@super-calendar/core";
import { type Context, createContext, useContext } from "react";
import type { TextStyle } from "react-native";

/**
 * The full set of colours, text styles and metrics the calendar paints with.
 * Supply a `Partial<CalendarTheme>` to `<Calendar theme={...} />`; missing keys
 * fall back to {@link defaultTheme}, so you only override what you care about.
 */
export interface CalendarTheme {
  /** The shared colour palette (sourced from `@super-calendar/core`). */
  colors: CalendarColors;
  /** Text styles for the calendar's labels and the built-in event box. */
  text: {
    /** Large day number in the week/day header. */
    dayNumber: TextStyle;
    /** Short weekday label ("Mon") in headers. */
    weekday: TextStyle;
    /** The "MMMM yyyy" month title above the month grid. */
    monthTitle: TextStyle;
    /** Date number inside a month cell. */
    dateCell: TextStyle;
    /** Hour labels down the left of the time grid. */
    hourLabel: TextStyle;
    /** The "+N more" overflow label in month cells. */
    more: TextStyle;
    /** Title inside the built-in default event box. */
    eventTitle: TextStyle;
  };
  /** Corner radius of the today badge. Use a large value for a circle. */
  todayBadgeRadius: number;
  /**
   * Height of the range selection band (the centered rounded "pill"); its corner
   * radius is half this. Ignored when `fillCellOnSelection` fills the whole cell.
   */
  rangeBandHeight: number;
}

/** The default light theme. Every key the calendar reads falls back to this. */
export const defaultTheme: CalendarTheme = {
  colors: lightColors,
  text: {
    dayNumber: { fontSize: 22, fontWeight: "700" },
    weekday: { fontSize: 13, fontWeight: "700" },
    monthTitle: { fontSize: 17, fontWeight: "700" },
    dateCell: { fontSize: 13, fontWeight: "700" },
    hourLabel: { fontSize: 10 },
    more: { fontSize: 11, fontWeight: "700" },
    // Explicit lineHeight so the timed-grid renderer can clamp the title to a
    // whole number of lines (clipping on a line boundary, never mid-line).
    eventTitle: { fontSize: 12, fontWeight: "700", lineHeight: 16 },
  },
  todayBadgeRadius: 999,
  rangeBandHeight: 22,
};

/**
 * A ready-made dark palette. Pass it straight to `<Calendar theme={darkTheme} />`,
 * or switch on the system scheme with React Native's `useColorScheme()`. Shares
 * {@link defaultTheme}'s typography and metrics; only the colours change.
 */
export const darkTheme: CalendarTheme = {
  colors: darkColors,
  text: defaultTheme.text,
  todayBadgeRadius: defaultTheme.todayBadgeRadius,
  rangeBandHeight: defaultTheme.rangeBandHeight,
};

/** Deep-merge a partial theme over {@link defaultTheme}. */
export function mergeTheme(theme?: PartialCalendarTheme): CalendarTheme {
  if (!theme) return defaultTheme;
  return {
    colors: { ...defaultTheme.colors, ...theme.colors },
    text: { ...defaultTheme.text, ...theme.text },
    todayBadgeRadius: theme.todayBadgeRadius ?? defaultTheme.todayBadgeRadius,
    rangeBandHeight: theme.rangeBandHeight ?? defaultTheme.rangeBandHeight,
  };
}

/**
 * A theme with every key optional. Pass this to `<Calendar theme={...} />` to
 * override only the colours, text styles, or metrics you care about; the rest
 * come from {@link defaultTheme}.
 */
export type PartialCalendarTheme = {
  colors?: Partial<CalendarTheme["colors"]>;
  text?: Partial<CalendarTheme["text"]>;
  todayBadgeRadius?: number;
  rangeBandHeight?: number;
};

const CalendarThemeContext: Context<CalendarTheme> = createContext<CalendarTheme>(defaultTheme);

/**
 * Context provider that supplies the active {@link CalendarTheme} to descendants.
 * `<Calendar>` wraps its subtree in this; use it directly only to theme custom
 * components rendered outside a `<Calendar>`.
 */
export const CalendarThemeProvider = CalendarThemeContext.Provider;

/** Read the active {@link CalendarTheme} from context. Useful inside custom renderers. */
export const useCalendarTheme = (): CalendarTheme => useContext(CalendarThemeContext);
