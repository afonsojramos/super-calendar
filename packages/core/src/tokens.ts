// Neutral, renderer-agnostic theme tokens: the shared colour palette both the
// React Native and react-dom renderers derive their themes from. Plain data, no
// platform types. Renderer-specific metrics (cell / badge / band sizes) stay in
// each renderer's theme, since they legitimately differ between the two.

/** The shared colour palette both renderers derive their themes from. */
export interface CalendarColors {
  /** Opaque surface behind floating chrome (e.g. the date-picker field and popover). */
  surface: string;
  /** Hour lines, day separators and month-cell borders. */
  gridLine: string;
  /** Background tint behind weekend columns/cells. */
  weekendBackground: string;
  /** Background tint over hours outside business hours (time grid). */
  outsideHoursBackground: string;
  /** Today badge fill. */
  todayBackground: string;
  /** Today badge text. */
  todayText: string;
  /** Selected day / range-endpoint badge fill. */
  selectedBackground: string;
  /** Selected day / range-endpoint badge text. */
  selectedText: string;
  /** Band behind a selected range. */
  rangeBackground: string;
  /** Hover highlight behind a day (DOM, mouse only). */
  hoverBackground: string;
  /** Current-time indicator line (time grid). */
  nowIndicator: string;
  /** Primary text (day numbers, weekday labels). */
  text: string;
  /** Muted text (hour labels, "+N more"). */
  textMuted: string;
  /** Dimmed text for disabled / adjacent-month days. */
  textDisabled: string;
  /** Default event chip fill. */
  eventBackground: string;
  /** Default event chip text. */
  eventText: string;
  /** Shaded band behind a `display: "background"` event. */
  backgroundEvent: string;
}

/** The default light-theme colour palette. */
export const lightColors: CalendarColors = {
  surface: "#FFFFFF",
  gridLine: "#E2E4E9",
  weekendBackground: "#F6F7F9",
  outsideHoursBackground: "#F1F2F4",
  todayBackground: "#1F6FEB",
  todayText: "#FFFFFF",
  selectedBackground: "#1F6FEB",
  selectedText: "#FFFFFF",
  rangeBackground: "#DCE7FF",
  hoverBackground: "#E6ECF5",
  nowIndicator: "#E5484D",
  text: "#1A1B1E",
  textMuted: "#6B7280",
  textDisabled: "#B5B9C0",
  eventBackground: "#DCE7FF",
  eventText: "#1A1B1E",
  backgroundEvent: "#E3F4E4",
};

/** The default dark-theme colour palette. */
export const darkColors: CalendarColors = {
  surface: "#1A1B1E",
  gridLine: "#2A2E37",
  weekendBackground: "#15171C",
  outsideHoursBackground: "#101216",
  todayBackground: "#1F6FEB",
  todayText: "#FFFFFF",
  selectedBackground: "#1F6FEB",
  selectedText: "#FFFFFF",
  rangeBackground: "#243B53",
  hoverBackground: "#2E3138",
  nowIndicator: "#E5484D",
  text: "#ECEDEE",
  textMuted: "#9BA1A6",
  textDisabled: "#4B4F58",
  eventBackground: "#243B53",
  eventText: "#EAF2FF",
  backgroundEvent: "#17301F",
};
