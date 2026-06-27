// react-dom entry point: real DOM components (no React Native, no react-native-web).
// Built on the library's headless core and Legend List's DOM renderer. Pair with
// the headless hooks (useDateRange, useMonthGrid) re-exported below for selection
// state and custom layouts.
export {
  type DomMonthEvent,
  type DomMonthEventArgs,
  MonthView,
  type MonthViewProps,
} from "./MonthView";
export { MonthList, type MonthListProps } from "./MonthList";
export {
  type BusinessHours,
  TimeGrid,
  type TimeGridProps,
  type DomRenderEvent,
  type DomRenderEventArgs,
} from "./TimeGrid";
export { type DomCalendarTheme, darkDomTheme, defaultDomTheme, mergeDomTheme } from "./theme";
export {
  type CalendarEvent,
  type CalendarMode,
  type DateRange,
  type DateSelectionConstraints,
  type DaySelectionState,
  type ICalendarEvent,
  type PositionedEvent,
  type TimeGridMode,
  type UseDateRangeOptions,
  type WeekStartsOn,
  getViewDays,
  isAllDayEvent,
  layoutDayEvents,
  daySelectionState,
  isDateSelectable,
  isRangeEndpoint,
  isWithinDateRange,
  nextDateRange,
  useDateRange,
  useMonthGrid,
  buildMonthGrid,
  type MonthGrid,
  type MonthGridDay,
  type MonthGridWeek,
  type MonthGridWeekday,
  type UseMonthGridOptions,
} from "@super-calendar/core";
