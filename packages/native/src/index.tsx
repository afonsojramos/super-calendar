/**
 * The React Native renderer for super-calendar: gesture-driven, virtualized
 * month, week, and day views, plus the agenda and date picker. Runs on native
 * and on the web through react-native-web.
 *
 * Built on the headless core, Legend List, Gesture Handler, and Reanimated. For
 * a picker-only bundle that does not pull in Reanimated, import from
 * `@super-calendar/native/picker` instead.
 *
 * @example
 * ```tsx
 * import { Calendar } from "@super-calendar/native";
 *
 * export function App() {
 *   return <Calendar mode="month" />;
 * }
 * ```
 *
 * @see https://super-calendar.afonsojramos.me
 *
 * @module
 */
export { Calendar, type CalendarProps } from "./components/Calendar";
export { Agenda, type AgendaProps } from "./components/Agenda";
export { MonthView, type MonthViewProps } from "./components/MonthView";
export { MonthPager, type MonthPagerProps } from "./components/MonthPager";
export { MonthList, type MonthListProps } from "./components/MonthList";
export {
  TimeGrid,
  type TimeGridProps,
  type EventDragHandler,
  type EventDragStartHandler,
  type HourRenderer,
  DEFAULT_HOUR_HEIGHT,
} from "./components/TimeGrid";
export { DefaultEvent } from "./components/DefaultEvent";
export { DefaultMonthEvent } from "./components/DefaultMonthEvent";
export {
  ResourceTimeline,
  type ResourceTimelineProps,
  type Resource,
  type ResourceEventArgs,
} from "./components/ResourceTimeline";
export {
  type CalendarTheme,
  type PartialCalendarTheme,
  defaultTheme,
  darkTheme,
  mergeTheme,
  CalendarThemeProvider,
  useCalendarTheme,
} from "./theme";
export type {
  BusinessHours,
  CalendarEvent,
  CalendarMode,
  EventAccessibilityLabelContext,
  EventAccessibilityLabeler,
  EventKeyExtractor,
  ICalendarEvent,
  RecurrenceFrequency,
  RecurrenceRule,
  RenderEvent,
  RenderEventArgs,
  TimeGridMode,
  WeekdayFormat,
  WeekStartsOn,
} from "./types";
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
} from "@super-calendar/core";
export {
  buildMonthGrid,
  type MonthGrid,
  type MonthGridDay,
  type MonthGridWeek,
  type MonthGridWeekday,
  type UseMonthGridOptions,
  useMonthGrid,
  weekdayFormatToken,
} from "@super-calendar/core";
export { expandRecurringEvents } from "@super-calendar/core";
export {
  type ICalEvent,
  parseICalendar,
  toICalendar,
  type ToICalendarOptions,
} from "@super-calendar/core";
export { eventsInTimeZone, toZonedTime } from "@super-calendar/core";
export {
  buildMonthWeeks,
  getViewDays,
  getWeekDays,
  getIsToday,
  isWeekend,
  isSameCalendarDay,
  minutesIntoDay,
} from "@super-calendar/core";
export { layoutDayEvents, isAllDayEvent, type PositionedEvent } from "@super-calendar/core";
