/**
 * The react-dom renderer for super-calendar: real DOM components, no React
 * Native and no react-native-web.
 *
 * Built on the headless core and Legend List's DOM renderer. The headless hooks
 * (`useDateRange`, `useMonthGrid`) are re-exported below for selection state and
 * custom layouts.
 *
 * @example
 * ```tsx
 * import { Calendar } from "@super-calendar/dom";
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
export {
  Agenda,
  type AgendaProps,
  type AgendaSlot,
  type DomAgendaEvent,
  type DomAgendaEventArgs,
} from "./Agenda";
export { Calendar, type CalendarProps, type CalendarSlot } from "./Calendar";
export {
  DatePicker,
  type DatePickerProps,
  type DatePickerSlot,
  DateRangePicker,
  type DateRangePickerProps,
} from "./DateRangePicker";
export {
  type DomMonthEvent,
  type DomMonthEventArgs,
  MonthView,
  type MonthViewProps,
  type MonthViewSlot,
} from "./MonthView";
export { MonthList, type MonthListProps, type MonthListSlot } from "./MonthList";
export {
  type Resource,
  type ResourceEventArgs,
  ResourceTimeline,
  type ResourceTimelineProps,
  type ResourceTimelineSlot,
} from "./ResourceTimeline";
export {
  TimeGrid,
  type TimeGridProps,
  type TimeGridSlot,
  type DomRenderEvent,
  type DomRenderEventArgs,
} from "./TimeGrid";
export { type ResolvedSlot, type SlotDefault, type SlotStyleProps } from "./slots";
export { type DomCalendarTheme, darkDomTheme, defaultDomTheme, mergeDomTheme } from "./theme";
export {
  type BusinessHours,
  type CalendarEvent,
  type CalendarMode,
  type DateRange,
  type DateSelectionConstraints,
  type DaySelectionState,
  type EventAccessibilityLabelContext,
  type EventAccessibilityLabeler,
  type ICalendarEvent,
  type ICalEvent,
  parseICalendar,
  toICalendar,
  type ToICalendarOptions,
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
