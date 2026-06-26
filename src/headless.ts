// Headless entry point: the render-agnostic core of the library. This module
// imports nothing from React Native, Reanimated, Gesture Handler, or Legend
// List, so it bundles cleanly into any renderer (react-dom, Solid, vanilla)
// as well as React Native. Build your own calendar UI on top of these hooks,
// the pure grid builder, the selection model, and the date helpers.
export type {
  CalendarEvent,
  CalendarMode,
  ICalendarEvent,
  RecurrenceRule,
  TimeGridMode,
  WeekStartsOn,
} from "./types";
export { isAllDayEvent, layoutDayEvents, type PositionedEvent } from "./utils/layout";
export {
  type DateRange,
  type DateSelectionConstraints,
  type DaySelectionState,
  type UseDateRangeOptions,
  daySelectionState,
  isDateSelectable,
  isRangeEndpoint,
  isWithinDateRange,
  nextDateRange,
  useDateRange,
} from "./utils/dateRange";
export {
  buildMonthGrid,
  type MonthGrid,
  type MonthGridDay,
  type MonthGridWeek,
  type MonthGridWeekday,
  type UseMonthGridOptions,
  useMonthGrid,
} from "./utils/monthGrid";
export {
  buildMonthWeeks,
  getIsToday,
  getViewDays,
  getWeekDays,
  isSameCalendarDay,
  isWeekend,
  minutesIntoDay,
  viewDayCount,
} from "./utils/dates";
