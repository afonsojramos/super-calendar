/**
 * Words the built-in views add to their screen-reader labels and gutter text.
 * The date parts are formatted through `locale`; these words are not, so pass
 * translations through the `labels` prop to localize them. Shared by both
 * renderers, so a translation reads the same on web and native.
 */
export interface CalendarLabels {
  /** Appended to a day's label when it is today. Default "today". */
  today: string;
  /** Appended to a day's label when it is selected. Default "selected". */
  selected: string;
  /** Appended to a day's label when it is disabled. Default "unavailable". */
  unavailable: string;
  /** Appended to a year-view day's label when it has events. Default "has events". */
  hasEvents: string;
  /** How many events a month-view day holds. Default "1 event" / "N events". */
  eventCount: (count: number) => string;
  /** The "+N more" overflow control's label. Default "N more events". */
  moreEvents: (count: number) => string;
  /** The all-day gutter text in the time grid. Default "all-day". */
  allDay: string;
  /** The close control of the "+N more" popover. Default "Close". */
  close: string;
}

/** The built-in English {@link CalendarLabels}. */
export const defaultCalendarLabels: CalendarLabels = {
  today: "today",
  selected: "selected",
  unavailable: "unavailable",
  hasEvents: "has events",
  eventCount: (count) => (count === 1 ? "1 event" : `${count} events`),
  moreEvents: (count) => `${count} more events`,
  allDay: "all-day",
  close: "Close",
};

/** Fill the labels a consumer left out with {@link defaultCalendarLabels}. */
export function resolveCalendarLabels(labels?: Partial<CalendarLabels>): CalendarLabels {
  return labels ? { ...defaultCalendarLabels, ...labels } : defaultCalendarLabels;
}

/**
 * Screen-reader label for a day: the formatted date followed by its state
 * words, joined with ", " (e.g. "Friday, 17 July 2026, today, 3 events").
 */
export function dayAccessibilityLabel(args: {
  /** The date, already formatted with the consumer's locale. */
  dateLabel: string;
  isToday?: boolean;
  isSelected?: boolean;
  isDisabled?: boolean;
  hasEvents?: boolean;
  /** Event count to announce; omit to leave the count out. */
  eventCount?: number;
  labels: CalendarLabels;
}): string {
  const { labels } = args;
  return [
    args.dateLabel,
    args.isToday ? labels.today : null,
    args.isSelected ? labels.selected : null,
    args.isDisabled ? labels.unavailable : null,
    args.hasEvents ? labels.hasEvents : null,
    args.eventCount == null ? null : labels.eventCount(args.eventCount),
  ]
    .filter(Boolean)
    .join(", ");
}
