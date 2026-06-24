import { createContext, useContext } from "react";
import type { TextStyle } from "react-native";

/**
 * The full set of colours, text styles and metrics the calendar paints with.
 * Supply a `Partial<CalendarTheme>` to `<Calendar theme={...} />`; missing keys
 * fall back to {@link defaultTheme}, so you only override what you care about.
 */
export interface CalendarTheme {
  colors: {
    /** Hour lines, day separators and month-cell borders. */
    gridLine: string;
    /** Background tint behind weekend columns/cells. */
    weekendBackground: string;
    /** Background tint over hours outside `businessHours` on the week/day grid. */
    outsideHoursBackground: string;
    /** Fill of the "today" badge (and any today highlight). */
    todayBackground: string;
    /** Text on top of the today badge. */
    todayText: string;
    /** The current-time indicator line on the week/day grid. */
    nowIndicator: string;
    /** Default text colour (day numbers, weekday labels). */
    text: string;
    /** Muted text (hour labels, "+N more"). */
    textMuted: string;
    /** Dimmed text for days outside the current month. */
    textDisabled: string;
    /** Background of the built-in default event box. */
    eventBackground: string;
    /** Text colour inside the built-in default event box. */
    eventText: string;
  };
  text: {
    /** Large day number in the week/day header. */
    dayNumber: TextStyle;
    /** Short weekday label ("Mon") in headers. */
    weekday: TextStyle;
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
}

export const defaultTheme: CalendarTheme = {
  colors: {
    gridLine: "#E2E4E9",
    weekendBackground: "#F6F7F9",
    outsideHoursBackground: "#F1F2F4",
    todayBackground: "#1F6FEB",
    todayText: "#FFFFFF",
    nowIndicator: "#E5484D",
    text: "#1A1B1E",
    textMuted: "#6B7280",
    textDisabled: "#B5B9C0",
    eventBackground: "#DCE7FF",
    eventText: "#1A1B1E",
  },
  text: {
    dayNumber: { fontSize: 22, fontWeight: "700" },
    weekday: { fontSize: 13, fontWeight: "700" },
    dateCell: { fontSize: 13, fontWeight: "700" },
    hourLabel: { fontSize: 12 },
    more: { fontSize: 11, fontWeight: "700" },
    eventTitle: { fontSize: 12, fontWeight: "700" },
  },
  todayBadgeRadius: 999,
};

/**
 * A ready-made dark palette. Pass it straight to `<Calendar theme={darkTheme} />`,
 * or switch on the system scheme with React Native's `useColorScheme()`. Shares
 * {@link defaultTheme}'s typography and metrics; only the colours change.
 */
export const darkTheme: CalendarTheme = {
  colors: {
    gridLine: "#2A2E37",
    weekendBackground: "#15171C",
    outsideHoursBackground: "#101216",
    todayBackground: "#1F6FEB",
    todayText: "#FFFFFF",
    nowIndicator: "#E5484D",
    text: "#ECEDEE",
    textMuted: "#9BA1A6",
    textDisabled: "#4B4F58",
    eventBackground: "#243B53",
    eventText: "#EAF2FF",
  },
  text: defaultTheme.text,
  todayBadgeRadius: defaultTheme.todayBadgeRadius,
};

/** Deep-merge a partial theme over {@link defaultTheme}. */
export function mergeTheme(theme?: PartialCalendarTheme): CalendarTheme {
  if (!theme) return defaultTheme;
  return {
    colors: { ...defaultTheme.colors, ...theme.colors },
    text: { ...defaultTheme.text, ...theme.text },
    todayBadgeRadius: theme.todayBadgeRadius ?? defaultTheme.todayBadgeRadius,
  };
}

export type PartialCalendarTheme = {
  colors?: Partial<CalendarTheme["colors"]>;
  text?: Partial<CalendarTheme["text"]>;
  todayBadgeRadius?: number;
};

const CalendarThemeContext = createContext<CalendarTheme>(defaultTheme);

export const CalendarThemeProvider = CalendarThemeContext.Provider;

export const useCalendarTheme = () => useContext(CalendarThemeContext);
