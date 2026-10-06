import { type CalendarLabels, defaultCalendarLabels } from "@super-calendar/core";
import { type Context, createContext, useContext } from "react";

/**
 * The resolved `labels` of the nearest view, so the built-in event renderers
 * can localize their screen-reader text without a prop on `RenderEventArgs`.
 */
export const CalendarLabelsContext: Context<CalendarLabels> =
  createContext<CalendarLabels>(defaultCalendarLabels);

export function useCalendarLabels(): CalendarLabels {
  return useContext(CalendarLabelsContext);
}
