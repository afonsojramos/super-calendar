import { Dynamic, type JSX } from "@solidjs/web";
import {
  bandRounding,
  buildMonthGrid,
  buildMultiWeekGrid,
  type CalendarEvent,
  type CalendarLabels,
  compareDayEvents,
  type DateRange,
  type DateSelectionConstraints,
  dayAccessibilityLabel,
  dayBadgeKind,
  type EventAccessibilityLabeler,
  groupEventsByDay,
  isAllDayEvent,
  isBackgroundEvent,
  layoutMonthWeek,
  monthCreateRange,
  monthDropBounds,
  type MonthGridWeekday,
  type MultiWeekGridDay,
  overlapsOtherEvents,
  rangeBandKind,
  resolveCalendarLabels,
  type WeekdayFormat,
  type WeekStartsOn,
} from "@super-calendar/core/vanilla";
import {
  addDays,
  endOfMonth,
  format,
  isSameMonth,
  type Locale,
  startOfDay,
  startOfMonth,
} from "date-fns";
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  untrack,
} from "solid-js";
import { holdDateDrag } from "./touch";
import { withDefaults } from "./props";
import { createSlots, dataState, type SlotDefault, type SlotStyleProps } from "./slots";
import { css, type CSSProperties, type DomKeyboardEvent, type ElementRef } from "./styles";
import { mergeSolidTheme, type SolidCalendarTheme } from "./theme";

/**
 * Styleable parts of {@link MonthView}. Pass a class or inline style per slot via
 * the `classNames` / `styles` props to restyle just that part.
 */
export type MonthViewSlot =
  | "title"
  | "weekdays"
  | "weekday"
  | "grid"
  | "week"
  | "day"
  | "dayBadge"
  | "rangeBand"
  | "events"
  | "chipButton"
  | "chip"
  | "more"
  | "morePopover";

// Stable empty layout for rows with no events (avoids a fresh object per render).
const EMPTY_LAYOUT = {
  segments: [],
  laneCount: 0,
} as const;

// Chip metrics for the events layout (when `events` is provided).
const DATE_ROW = 24;
const CHIP_HEIGHT = 18;
const CHIP_GAP = 2;
const CELL_PAD = 4;
// Opacity of an event chip while it is being dragged to another day.
const DRAGGED_CHIP_OPACITY = 0.4;

/** Props passed to a custom month event chip renderer. */
export interface SolidMonthEventArgs<T = unknown> {
  /** The event to render. */
  event: CalendarEvent<T>;
  /** Call to fire the view's `onPressEvent` for this chip. */
  onPress: () => void;
  /** The current row view. Supplied by the calendar; optional for existing standalone chip callers. */
  mode?: "month" | "multiweek";
}

/** A component that renders a single month-grid event chip. */
export type SolidMonthEvent<T = unknown> = Component<SolidMonthEventArgs<T>>;

// An in-progress month drag: either a day span being swept out for a new event,
// or an existing event being carried to another day. Days are held as start-of-day
// timestamps, so the reducer-ish updates compare cheaply.
type MonthDrag<T> = (
  | {
      kind: "create";
      pointerId: number;
      anchor: number;
      hover: number;
    }
  | {
      kind: "move";
      pointerId: number;
      event: CalendarEvent<T>;
      from: number;
      to: number;
    }
) & {
  // The rows the drag began in, so a drag never commits into a different window.
  windowKey: string;
};

// A day as the shared rows render it. Month days carry `isCurrentMonth`;
// multi-week days omit it because every one of them is inside the period.
type RowDay = MultiWeekGridDay & { isCurrentMonth?: boolean };
type RowWeek = { id: string; days: RowDay[] };

// A leading or trailing day of a neighbouring month in the month grid.
const isOutsidePeriod = (day: RowDay) => day.isCurrentMonth === false;

/** Props for {@link MonthView}. */
export interface MonthViewProps<T = unknown>
  extends DateSelectionConstraints, SlotStyleProps<MonthViewSlot> {
  /** Any day within the month to render. */
  date: Date;
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  /** Weekday header label width: `narrow` ("M"), `short` ("Mon", default), or `long` ("Monday"). */
  weekdayFormat?: WeekdayFormat;
  /**
   * Events to render as chips in each day cell. Passing this (even `[]`) switches
   * the grid to the calendar layout (date in the corner, chips below); omit it for
   * the compact date-picker look.
   */
  events?: CalendarEvent<T>[];
  /** Custom chip renderer; falls back to the built-in titled chip. */
  renderEvent?: SolidMonthEvent<T>;
  /**
   * Override the screen-reader label for each event chip. Receives the event and a
   * `{ mode: "month", isAllDay, ampm: false }` context; return the full text to
   * announce. Defaults to the event title and day (e.g. "Standup, 15 July").
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;
  /**
   * Max event lanes (stacked rows) shown per week before the rest of a day's
   * events collapse into a "+N more" row (default 3). Because multi-day events draw
   * as one bar spanning a lane across the week, this caps lanes per row, not chips
   * per day, so a long bar can push a lightly-booked day's own events into "+N more".
   */
  maxVisibleEventCount?: number;
  /** Height of an event chip and of the "+N more" row, in px (default 18). */
  chipHeight?: number;
  /** Vertical gap between event chips, in px (default 2). */
  chipGap?: number;
  /** Template for the overflow row; `{moreCount}` is replaced (default "{moreCount} More"). */
  moreLabel?: string;
  /** Translations for the screen-reader words and gutter text; omitted keys use English. */
  labels?: Partial<CalendarLabels>;
  /** Tap an event chip. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /** Tap the "+N more" overflow row. */
  onPressMore?: (events: CalendarEvent<T>[], date: Date) => void;
  /** Selected span; days between the endpoints get the range band. */
  selectedRange?: DateRange;
  /** Discrete selected days (single / multiple). */
  selectedDates?: Date[];
  /** Render days from the neighbouring months in the leading/trailing cells (default true). */
  showAdjacentMonths?: boolean;
  /** Tint weekend day cells with the theme's weekend background (default true). */
  highlightWeekends?: boolean;
  /**
   * Fill the whole cell with the range background instead of the default
   * centered rounded "pill" strip. Default false.
   */
  fillCellOnSelection?: boolean;
  /** Render the "Month yyyy" title above the grid (default true). */
  showTitle?: boolean;
  /** Render the weekday header row (default true). */
  showWeekdays?: boolean;
  /** date-fns locale for the title and weekday labels. */
  locale?: Locale;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<SolidCalendarTheme>;
  /** Fired when a selectable day is clicked. */
  onPressDay?: (date: Date) => void;
  /**
   * Fired alongside `onPressDay` when a day cell is clicked, with the same day at
   * midnight, so one handler can create events across month and week/day modes.
   */
  onPressCell?: (date: Date) => void;
  /**
   * In events mode, enables drag-to-create: press on a day and drag across others
   * to sketch a span, then release to fire this with the all-day range (`start` at
   * midnight of the first day, `end` at midnight after the last, exclusive). A plain
   * click without dragging still fires `onPressDay`, not this. Days being sketched
   * carry `data-creating` for styling.
   */
  onCreateEvent?: (start: Date, end: Date) => void;
  /**
   * Reports the day span of a create sweep **as it happens**, as the ordered
   * inclusive `[start, end]` days (both at midnight), so a selection highlight can
   * follow the drag instead of appearing only on release. Pair it with
   * `createDateRange`'s `selectRange` to drive `selectedRange`. Enables the sweep on
   * its own, so it works without `onCreateEvent`.
   */
  onSelectDrag?: (start: Date, end: Date) => void;
  /**
   * In events mode, enables drag-to-reschedule: press an event chip and drop it on
   * another day. Called with the event and its new `start`/`end`, both shifted by
   * the whole days dragged, so the time of day and duration are preserved. Return
   * `false` to reject the drop. The day under the pointer carries `data-drop` for
   * styling.
   */
  onDragEvent?: (event: CalendarEvent<T>, start: Date, end: Date) => void | boolean;
  /** Fired the instant an event is picked up for a drag, before anything is committed. */
  onDragStart?: (event: CalendarEvent<T>) => void;
  /** Allow moving events by default (per-event `startEditable` overrides). Default true. */
  eventStartEditable?: boolean;
  /** Reject a drop that would overlap another event (default true = allowed). */
  eventOverlap?: boolean;
  /**
   * When events are shown, also make the day cells keyboard-navigable: a single
   * roving tab stop, arrow keys move the focus, Enter opens the day (`onPressDay`).
   * Default false, so keyboard focus moves through events only. The date picker
   * (rendered without `events`) is always navigable regardless of this flag.
   */
  keyboardDayNavigation?: boolean;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

// Each helper returns the slot's built-in styling split into `base` (structural,
// always applied) and `themed` (colour/type/spacing, dropped when a class is set).

function dayCellDefault(
  day: RowDay,
  theme: SolidCalendarTheme,
  highlightWeekends: boolean,
): SlotDefault {
  return {
    base: {
      position: "relative",
      height: theme.cellHeight,
      border: "none",
      font: "inherit",
      cursor: day.isDisabled ? "default" : "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
      WebkitTapHighlightColor: "transparent",
    },
    themed: {
      // The range band is a separate layer; the cell only carries the weekend tint.
      background:
        highlightWeekends && day.isWeekend && !day.isInRange
          ? theme.weekendBackground
          : "transparent",
      fontSize: 15,
      color: day.isDisabled ? theme.textDisabled : theme.text,
    },
  };
}

/**
 * The range band behind a day, rendered as its own layer so it can be a centered
 * rounded strip (the default) or fill the whole cell (`fillCell`). Returns null
 * for days with no band. Endpoints get the leading/trailing pill rounding. Its
 * geometry is structural; only the fill colour is themed.
 *
 * In events mode the strip tracks the compact date badge instead of the picker's
 * tall cell, so it reads as a band across the dates rather than a block over the
 * event chips (and matches the native renderer's month grid).
 */
function rangeBandDefault(
  day: RowDay,
  theme: SolidCalendarTheme,
  fillCell: boolean,
  eventsMode: boolean,
): SlotDefault | null {
  const kind = rangeBandKind(day, fillCell);
  if (kind === "none") return null;
  const fill = kind === "fill";
  const badgeSize = eventsMode ? DATE_ROW - 2 : theme.dayBadgeSize;
  const bandHeight = eventsMode ? badgeSize : theme.rangeBandHeight;
  const inset = fill ? 0 : eventsMode ? CELL_PAD : Math.max(0, (theme.cellHeight - bandHeight) / 2);
  const radius = fill ? 0 : bandHeight / 2;
  const rounding = bandRounding(kind);
  // Cap the pill at the endpoint circles: a start/end band stops at the circle's
  // outer edge (half a badge in from the cell centre) rather than spilling to the
  // cell edge, so no band shows in the empty space beside the day circles. Events
  // mode puts the badge in the cell's corner instead of its centre, so there the
  // band spans the whole cell and only rounds its outer ends.
  const cap = eventsMode ? 0 : `calc(50% - ${badgeSize / 2}px)`;
  const base: CSSProperties = {
    position: "absolute",
    left: rounding.start ? cap : 0,
    right: rounding.end ? cap : 0,
    top: inset,
    // An events cell is far taller than its date row, so the strip is sized from
    // the badge rather than stretched to the cell's bottom.
    ...(fill || !eventsMode
      ? {
          bottom: inset,
        }
      : {
          height: bandHeight,
        }),
    zIndex: 0,
  };
  if (rounding.start) {
    base.borderTopLeftRadius = radius;
    base.borderBottomLeftRadius = radius;
  }
  if (rounding.end) {
    base.borderTopRightRadius = radius;
    base.borderBottomRightRadius = radius;
  }
  return {
    base,
    themed: {
      background: theme.rangeBackground,
    },
  };
}
function badgeDefault(day: RowDay, theme: SolidCalendarTheme, hovered: boolean): SlotDefault {
  const badge = dayBadgeKind(day, day.isToday);
  const filled = badge !== "none";
  const background = filled
    ? badge === "today"
      ? theme.todayBackground
      : theme.selectedBackground
    : hovered
      ? theme.hoverBackground
      : "transparent";
  return {
    base: {
      position: "relative",
      zIndex: 1,
      width: theme.dayBadgeSize,
      height: theme.dayBadgeSize,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    themed: {
      background,
      color: filled ? (day.isToday ? theme.todayText : theme.selectedText) : "inherit",
    },
  };
}

// --- Calendar (events) layout styles -------------------------------------

function eventCellDefault(
  day: RowDay,
  theme: SolidCalendarTheme,
  height: number,
  highlightWeekends: boolean,
  // True while a drag is over this day: a create sweep covering it, or a move
  // about to land on it. Tinted over the weekend shading so the drag reads live.
  isDragTarget: boolean,
  chipGap: number,
): SlotDefault {
  return {
    base: {
      position: "relative",
      minHeight: height,
      minWidth: 0,
      border: "none",
      cursor: day.isDisabled ? "default" : "pointer",
      display: "flex",
      flexDirection: "column",
      gap: chipGap,
      padding: CELL_PAD,
      boxSizing: "border-box",
      textAlign: "left",
      WebkitTapHighlightColor: "transparent",
    },
    themed: {
      borderTop: `1px solid ${theme.gridLine}`,
      background: isDragTarget
        ? theme.rangeBackground
        : highlightWeekends && day.isWeekend && !day.isInRange
          ? theme.weekendBackground
          : "transparent",
      color: day.isDisabled ? theme.textDisabled : theme.text,
    },
  };
}
function compactBadgeDefault(day: RowDay, theme: SolidCalendarTheme): SlotDefault {
  const badge = dayBadgeKind(day, day.isToday);
  const filled = badge !== "none";
  return {
    base: {
      position: "relative",
      zIndex: 1,
      alignSelf: "flex-end",
      width: DATE_ROW - 2,
      height: DATE_ROW - 2,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    themed: {
      fontSize: 13,
      background: filled
        ? badge === "today"
          ? theme.todayBackground
          : theme.selectedBackground
        : "transparent",
      color: filled ? (day.isToday ? theme.todayText : theme.selectedText) : "inherit",
    },
  };
}
const chipButtonDefault: SlotDefault = {
  base: {
    position: "relative",
    zIndex: 1,
    border: "none",
    padding: 0,
    margin: 0,
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
  },
};
function chipDefault(theme: SolidCalendarTheme, chipHeight: number): SlotDefault {
  return {
    base: {
      display: "block",
      height: chipHeight,
      lineHeight: `${chipHeight}px`,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    themed: {
      padding: "0 6px",
      borderRadius: 4,
      background: theme.eventBackground,
      color: theme.eventText,
      fontSize: 11,
      fontWeight: 600,
    },
  };
}
function moreButtonDefault(
  theme: SolidCalendarTheme,
  chipHeight: number,
  multiWeek = false,
): SlotDefault {
  return {
    base: {
      position: "relative",
      zIndex: 1,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      textAlign: "left",
      height: chipHeight,
      lineHeight: `${chipHeight}px`,
      fontFamily: "inherit",
      ...(multiWeek ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : {}),
    },
    themed: {
      padding: "0 6px",
      fontSize: 11,
      fontWeight: 600,
      color: theme.textMuted,
    },
  };
}

// Internal-only: MonthList passes a day→events index built once for the whole
// list (via `groupEventsByDay`) so each month doesn't rebuild it. Not exported,
// so it stays off the public MonthViewProps surface.
interface MonthViewInternalProps<T = unknown> extends MonthViewProps<T> {
  eventsByDay?: ReadonlyMap<string, CalendarEvent<T>[]>;
}

// The distinct events touching a week row, in the per-day index's sorted order.
// A multi-day event lives in each covered day's bucket, so dedupe by reference;
// this scans only the row's days, not every event in the month.
function collectRowEvents<T>(
  week: RowWeek,
  eventsByDay: ReadonlyMap<string, CalendarEvent<T>[]>,
): CalendarEvent<T>[] {
  const seen = new Set<CalendarEvent<T>>();
  const out: CalendarEvent<T>[] = [];
  for (const day of week.days) {
    const list = eventsByDay.get(startOfDay(day.date).toISOString());
    if (!list) continue;
    for (const event of list) {
      if (!seen.has(event)) {
        seen.add(event);
        out.push(event);
      }
    }
  }
  return out;
}

/**
 * Which rows a {@link DateRows} grid shows. Internal to the package: the public
 * views adapt their own props to it.
 */
export type DateRowsSource =
  | {
      kind: "month";
      /** Any day within the month to render. */
      date: Date;
      showAdjacentMonths: boolean;
    }
  | {
      kind: "multiweek";
      /** Any day within the first week to render. */
      date: Date;
      numberOfWeeks: number;
    };

// The localized first and last displayed days, e.g. "Nov 1, 2026 – Nov 14, 2026".
function rangeTitle(start: Date, endExclusive: Date, locale?: Locale): string {
  const options = locale ? { locale } : undefined;
  return `${format(start, "PP", options)} – ${format(addDays(endExclusive, -1), "PP", options)}`;
}

/** Props for the private {@link DateRows} grid shared by the public row views. */
export interface DateRowsProps<T = unknown> extends Omit<
  MonthViewInternalProps<T>,
  "date" | "showAdjacentMonths"
> {
  source: DateRowsSource;
}

/**
 * A single static month grid, rendered with plain DOM elements.
 *
 * @example
 * ```tsx
 * <MonthView date={new Date()} events={events} onPressDay={(d) => setDate(d)} />
 * ```
 */
export function MonthView<T = unknown>(props: MonthViewInternalProps<T>): JSX.Element {
  return (
    <DateRows<T>
      {...props}
      source={{
        kind: "month",
        get date() {
          return props.date;
        },
        get showAdjacentMonths() {
          return props.showAdjacentMonths ?? true;
        },
      }}
    />
  );
}

/**
 * The day-row grid behind the public row views: week rows of day cells with
 * spanning event bars, overflow, selection, drag, and keyboard handling.
 */
export function DateRows<T = unknown>(incoming: DateRowsProps<T>): JSX.Element {
  const props = withDefaults(
    {
      weekStartsOn: 0,
      weekdayFormat: "short",
      maxVisibleEventCount: 3,
      chipHeight: CHIP_HEIGHT,
      chipGap: CHIP_GAP,
      moreLabel: "{moreCount} More",
      highlightWeekends: true,
      fillCellOnSelection: false,
      showTitle: true,
      showWeekdays: true,
      eventStartEditable: true,
      eventOverlap: true,
      keyboardDayNavigation: false,
    } satisfies Partial<DateRowsProps<T>>,
    incoming,
  );
  const theme = createMemo(() => mergeSolidTheme(props.theme));
  const labels = createMemo(() => resolveCalendarLabels(props.labels));
  const slot = createSlots<MonthViewSlot>(props);
  const multiWeek = createMemo(() => props.source.kind === "multiweek");
  // Multi-week rows only contain days of the requested period, so nothing is blanked.
  const showAdjacentMonths = createMemo(() =>
    props.source.kind === "month" ? props.source.showAdjacentMonths : true,
  );
  const numberOfWeeks = createMemo(() =>
    props.source.kind === "multiweek" ? props.source.numberOfWeeks : undefined,
  );
  // The mode reported to custom renderers and accessibility labels.
  const viewMode = createMemo((): "month" | "multiweek" => (multiWeek() ? "multiweek" : "month"));

  // Calendar layout (date in the corner + event chips) is on whenever `events`
  // is provided; otherwise the compact picker badge layout is used. Multi-week
  // rows always use the calendar layout.
  const eventsMode = createMemo(() => props.events !== undefined || multiWeek());
  // The day cells form a roving tab stop (arrow keys + Enter) in the picker
  // always, and in events mode only when the consumer opts in. Otherwise events
  // mode tabs through the event chips alone.
  const dayRoving = createMemo(() => !eventsMode() || props.keyboardDayNavigation);
  // Use the list-built index when provided (MonthList), else build it for this
  // month. Either way lookups use startOfDay(date).toISOString().
  const eventsByDay = createMemo(() => {
    // The list (MonthList) sorts before passing its index in; only sort here when
    // building our own, so each day reads all-day events first, then by start.
    if (props.eventsByDay) return props.eventsByDay;
    // Background events shade the time grid; the month grid ignores them.
    const map = groupEventsByDay((props.events ?? []).filter((event) => !isBackgroundEvent(event)));
    for (const list of map.values()) list.sort(compareDayEvents);
    return map;
  });
  const Chip = createMemo(() => props.renderEvent);
  // Built-in "+N more" popover: opens when the consumer doesn't handle
  // `onPressMore` themselves. Keyed by the day id; closes on outside click,
  // Escape, or picking an event.
  const [moreOpenFor, setMoreOpenFor] = createSignal<string | null>(null);
  const morePopoverRef: ElementRef<HTMLDivElement | null> = {
    current: null,
  };
  // The "+N more" button that opened the popover, so focus can return to it.
  const moreTriggerRef: ElementRef<HTMLButtonElement | null> = {
    current: null,
  };
  createEffect(
    () => [moreOpenFor()],
    () =>
      untrack(() => {
        if (moreOpenFor()) {
          // Move focus into the dialog so keyboard users land on the first event.
          morePopoverRef.current?.querySelector<HTMLElement>("button")?.focus();
          return;
        }
        // Return focus to the trigger when the popover closes.
        moreTriggerRef.current?.focus();
        moreTriggerRef.current = null;
      }),
  );
  createEffect(
    () => [moreOpenFor()],
    () =>
      untrack(() => {
        if (!moreOpenFor()) return;
        const onDocPointerDown = (e: PointerEvent) => {
          if (!morePopoverRef.current?.contains(e.target as Node)) {
            // A pointer dismissal moves focus to whatever was clicked; don't yank
            // it back to the trigger (that's for Escape and event selection).
            moreTriggerRef.current = null;
            setMoreOpenFor(null);
          }
        };
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape") setMoreOpenFor(null);
        };
        document.addEventListener("pointerdown", onDocPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
          document.removeEventListener("pointerdown", onDocPointerDown);
          document.removeEventListener("keydown", onKey);
        };
      }),
  );
  // Reserve `maxVisibleEventCount` rows below the date so every cell is uniform;
  // when a day overflows, the last row becomes the "+N more" affordance.
  const eventRowHeight = createMemo(
    () =>
      CELL_PAD * 2 +
      DATE_ROW +
      (multiWeek() ? Math.max(1, props.maxVisibleEventCount) : props.maxVisibleEventCount) *
        (props.chipHeight + props.chipGap),
  );
  const _grid = createMemo(
    (): {
      weeks: RowWeek[];
      weekdays: MonthGridWeekday[];
      title: string;
      period: { start: Date; endExclusive: Date } | null;
    } => {
      const options = {
        weekStartsOn: props.weekStartsOn,
        hiddenDays: props.hiddenDays,
        weekdayFormat: props.weekdayFormat,
        selectedRange: props.selectedRange,
        selectedDates: props.selectedDates,
        minDate: props.minDate,
        maxDate: props.maxDate,
        isDateDisabled: props.isDateDisabled,
        locale: props.locale,
      };
      const weeks = numberOfWeeks();
      if (weeks === undefined) {
        return {
          ...buildMonthGrid(props.source.date, options),
          title: format(
            props.source.date,
            "MMMM yyyy",
            props.locale ? { locale: props.locale } : undefined,
          ),
          period: null,
        };
      }
      const grid = buildMultiWeekGrid(props.source.date, { ...options, numberOfWeeks: weeks });
      return {
        weeks: grid.weeks,
        weekdays: grid.weekdays,
        title: rangeTitle(grid.visibleRange.start, grid.visibleRange.endExclusive, props.locale),
        period: grid.period,
      };
    },
  );

  // Lay out each week row's spanning bars once per data change, not per render, so
  // hover / popover / drag-create state changes don't relay out every row.
  const weekLayouts = createMemo(() =>
    eventsMode()
      ? _grid().weeks.map((week) =>
          layoutMonthWeek(
            week.days.map((d) => d.date),
            collectRowEvents(week, eventsByDay()),
          ),
        )
      : [],
  );

  // Multi-week rows rove over the rendered, enabled days only (oldest first), so
  // focus skips hidden and disabled days and never leaves the displayed weeks.
  const focusableDays = createMemo(() =>
    _grid().period
      ? _grid()
          .weeks.flatMap((week) => week.days)
          .filter((day) => !day.isDisabled)
          .map((day) => startOfDay(day.date))
          .sort((a, b) => a.getTime() - b.getTime())
      : null,
  );
  const focusableKeys = createMemo(() => {
    const days = focusableDays();
    return days ? new Set(days.map((d) => format(d, "yyyy-MM-dd"))) : null;
  });

  // Roving tabindex: only one day is in the tab order; arrow keys move focus
  // within the month, so the grid is a single, sensible tab stop.
  const initialFocus = createMemo((): Date | null => {
    const days = focusableDays();
    const keys = focusableKeys();
    if (days && keys) {
      // The selected day, then today, then the first enabled day; none when every
      // displayed day is disabled.
      const rendered = (d?: Date | null): d is Date => !!d && keys.has(format(d, "yyyy-MM-dd"));
      const rangeStart = props.selectedRange?.start;
      if (rendered(rangeStart)) return startOfDay(rangeStart);
      const picked = props.selectedDates?.find(rendered);
      if (picked) return startOfDay(picked);
      const today = new Date();
      if (rendered(today)) return startOfDay(today);
      return days[0] ?? null;
    }
    const inMonth = (d?: Date | null) => !!d && isSameMonth(d, props.source.date);
    if (inMonth(props.selectedRange?.start)) return startOfDay(props.selectedRange!.start);
    const picked = props.selectedDates?.find(inMonth);
    if (picked) return startOfDay(picked);
    const today = new Date();
    return isSameMonth(today, props.source.date)
      ? startOfDay(today)
      : startOfMonth(props.source.date);
  });
  const [focusedDate, setFocusedDate] = createSignal(untrack(() => initialFocus()));
  const initialFocusRef = {
    current: untrack(() => initialFocus()),
  };
  createEffect(
    () => initialFocus(),
    (value) => {
      initialFocusRef.current = value;
    },
  );
  // The displayed window: the month, or the first week and count of multi-week rows.
  const windowKey = createMemo(() => {
    const period = _grid().period;
    return period
      ? `${format(period.start, "yyyy-MM-dd")}+${numberOfWeeks()}:${_grid()
          .weekdays.map((day) => day.date.getDay())
          .join(",")}`
      : format(props.source.date, "yyyy-MM");
  });
  let focusedWindow = untrack(windowKey);
  createEffect(windowKey, (key) =>
    untrack(() => {
      if (key === focusedWindow) return;
      focusedWindow = key;
      setFocusedDate(initialFocusRef.current);
    }),
  );
  const [hoveredKey, setHoveredKey] = createSignal<string | null>(null);
  const gridRef: ElementRef<HTMLDivElement | null> = {
    current: null,
  };
  const lastDayFocus: ElementRef<HTMLElement | null> = { current: null };
  // A multi-week focus target that hidden days or new constraints removed falls
  // back to the initial target, without moving DOM focus.
  const focusKey = createMemo(() => {
    const focused = focusedDate();
    const stored = focused ? format(focused, "yyyy-MM-dd") : null;
    const keys = focusableKeys();
    if (!keys || (stored !== null && keys.has(stored))) return stored;
    const initial = initialFocus();
    return initial && format(initial, "yyyy-MM-dd");
  });

  createEffect(
    () => ({ enabled: multiWeek(), key: focusKey() }),
    ({ enabled, key }) => {
      if (!enabled) return;
      const active = gridRef.current?.ownerDocument.activeElement;
      const removedDay =
        active === gridRef.current?.ownerDocument.body &&
        lastDayFocus.current !== null &&
        !lastDayFocus.current.isConnected;
      if (!removedDay && (!active?.hasAttribute("data-day") || !gridRef.current?.contains(active)))
        return;
      if (
        active?.getAttribute("data-day") === key &&
        active?.getAttribute("aria-disabled") !== "true"
      )
        return;
      const next = key
        ? gridRef.current?.querySelector<HTMLElement>(`[data-day="${key}"]`)
        : gridRef.current;
      next?.focus();
    },
  );

  // Dragging (events mode): press a day and drag across others to sketch an
  // all-day span, or press an event chip and drop it on another day. Both are
  // released on a window pointerup, so letting go anywhere still commits.
  const [drag, setDrag] = createSignal<MonthDrag<T> | null>(null);
  const dragRef: ElementRef<MonthDrag<T> | null> = { current: null };
  const applyDrag = (value: MonthDrag<T> | null) => {
    dragRef.current = value;
    setDrag(value);
  };
  const movedRef = {
    current: false,
  };
  // Set when a drag commits, so the click the browser fires next is swallowed (it
  // must not also open the day, or the event the drag landed on). A drag that ends
  // over a different element than it began on gets its trailing click on their
  // common ancestor instead, where no handler consumes the guard, so every press
  // clears it first, keeping it scoped to the one interaction that set it.
  const suppressClickRef = {
    current: false,
  };
  // Keyboard and assistive-technology clicks have detail 0 and never trail a drag.
  const consumeSuppressedClick = (detail: number) => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return detail !== 0;
  };
  // `disabled` and `draggable: false` lock an event outright; `startEditable`
  // (per event, falling back to the grid default) allows or blocks a move.
  const canMove = (event: CalendarEvent<T>) =>
    props.onDragEvent != null &&
    !event.disabled &&
    event.draggable !== false &&
    (event.startEditable ?? props.eventStartEditable);
  // A fresh press starts a new interaction, so any guard left over from the
  // previous one is stale.
  const beginPress = (e: PointerEvent) => {
    if (dragRef.current || e.isPrimary === false) return false;
    suppressClickRef.current = false;
    movedRef.current = false;
    return true;
  };
  const beginCreate = (day: Date, pointerId: number) => {
    if (!props.onCreateEvent && !props.onSelectDrag) return;
    const t = startOfDay(day).getTime();
    applyDrag({
      kind: "create",
      pointerId,
      anchor: t,
      hover: t,
      windowKey: windowKey(),
    });
  };
  const beginMove = (event: CalendarEvent<T>, day: Date, pointerId: number) => {
    if (!canMove(event)) return;
    const t = startOfDay(day).getTime();
    applyDrag({
      kind: "move",
      pointerId,
      event,
      from: t,
      to: t,
      windowKey: windowKey(),
    });
    props.onDragStart?.(event);
  };
  const extendDrag = (day: Date, pointerId: number) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const t = startOfDay(day).getTime();
    if (t === (current.kind === "create" ? current.hover : current.to)) return;
    movedRef.current = true;
    applyDrag(
      current.kind === "create"
        ? {
            ...current,
            hover: t,
          }
        : {
            ...current,
            to: t,
          },
    );
    // A sweep reports its span live, so a selection can track the drag; a move
    // has nothing to report until it is dropped.
    if (current.kind === "create") {
      const [lo, hi] = current.anchor <= t ? [current.anchor, t] : [t, current.anchor];
      props.onSelectDrag?.(new Date(lo), new Date(hi));
    }
  };
  let heldTouch: (() => void) | null = null;
  let heldOrigin: { day: Date; event?: CalendarEvent<T> } | null = null;
  const dayLookup = createMemo(
    () =>
      new Map(
        _grid()
          .weeks.flatMap((week) => week.days)
          .map((day) => [day.id, day]),
      ),
  );
  const pressRow = (
    event: PointerEvent & { currentTarget: HTMLElement },
    day: Date,
    moving?: CalendarEvent<T>,
  ) => {
    if (event.button !== 0 || heldTouch || !beginPress(event)) return;
    const start = () => {
      if (moving) beginMove(moving, day, event.pointerId);
      else beginCreate(day, event.pointerId);
    };
    if (!multiWeek() || !event.pointerType || event.pointerType === "mouse") {
      start();
      return;
    }
    heldOrigin = { day, event: moving };
    heldTouch = holdDateDrag(
      {
        box: event.currentTarget,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        clientX: event.clientX,
        clientY: event.clientY,
      },
      start,
      (x, y) => {
        const element = gridRef.current?.ownerDocument
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>("[data-day]");
        if (!element || !gridRef.current?.contains(element)) return;
        const day = dayLookup().get(element.dataset.day ?? "");
        if (day && !day.isDisabled) extendDrag(day.date, event.pointerId);
      },
      () => {
        applyDrag(null);
        movedRef.current = false;
      },
      () => {
        heldTouch = null;
        heldOrigin = null;
      },
    );
  };
  createEffect(
    () => windowKey(),
    () => () => {
      heldTouch?.();
    },
  );
  createEffect(
    () => ({
      days: dayLookup(),
      events: props.events,
      canCreate: !!(props.onCreateEvent || props.onSelectDrag),
      canMove: !!props.onDragEvent,
      eventStartEditable: props.eventStartEditable,
    }),
    (state) => {
      const origin = heldOrigin;
      if (!origin) return;
      const current = dragRef.current;
      const destination = current
        ? new Date(current.kind === "create" ? current.hover : current.to)
        : origin.day;
      const enabled = (day: Date) => {
        const cell = state.days.get(format(day, "yyyy-MM-dd"));
        return cell != null && !cell.isDisabled;
      };
      if (
        !enabled(origin.day) ||
        !enabled(destination) ||
        (origin.event
          ? !state.canMove ||
            !state.events?.includes(origin.event) ||
            origin.event.disabled ||
            origin.event.draggable === false ||
            !(origin.event.startEditable ?? state.eventStartEditable)
          : !state.canCreate)
      ) {
        heldTouch?.();
      }
    },
  );
  const isDragging = createMemo(() => drag() !== null);
  // Whether any month drag is wired up at all, so the cells only take over touch
  // scrolling and pointer tracking when one of the handlers can actually fire.
  const dragWired = createMemo(
    () => props.onCreateEvent != null || props.onSelectDrag != null || props.onDragEvent != null,
  );
  createEffect(
    () => [isDragging(), props.onCreateEvent, props.onDragEvent, props.eventOverlap, props.events],
    () =>
      untrack(() => {
        if (!isDragging()) return;
        const finish = (e: PointerEvent) => {
          const current = dragRef.current;
          if (!current || current.pointerId !== e.pointerId) return;
          applyDrag(null);
          if (!movedRef.current) return;
          suppressClickRef.current = true;
          // Multi-week rows drop a drag whose window was replaced before release.
          if (multiWeek() && current.windowKey !== windowKey()) return;
          if (current.kind === "create") {
            const range = monthCreateRange(new Date(current.anchor), new Date(current.hover));
            props.onCreateEvent?.(range.start, range.end);
            return;
          }
          const next = monthDropBounds(current.event, new Date(current.from), new Date(current.to));
          if (!next) return;
          // Reject a drop that would land the event on top of another when
          // `eventOverlap` is off, before the consumer's handler ever sees it.
          if (
            props.eventOverlap === false &&
            overlapsOtherEvents(props.events ?? [], current.event, next.start, next.end)
          ) {
            return;
          }
          props.onDragEvent?.(current.event, next.start, next.end);
        };
        const clear = () => {
          heldTouch?.();
          applyDrag(null);
          movedRef.current = false;
          suppressClickRef.current = true;
        };
        const cancel = (event: PointerEvent) => {
          if (dragRef.current?.pointerId === event.pointerId) clear();
        };
        const keyDown = (event: KeyboardEvent) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          clear();
        };
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("keydown", keyDown);
        return () => {
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", cancel);
          window.removeEventListener("keydown", keyDown);
        };
      }),
  );
  // Replacing the multi-week window cancels a drag and closes the overflow
  // popover, so neither acts on days that are no longer shown.
  let transientWindow = untrack(windowKey);
  createEffect(windowKey, (key) =>
    untrack(() => {
      if (key === transientWindow) return;
      transientWindow = key;
      if (!multiWeek()) return;
      applyDrag(null);
      setMoreOpenFor(null);
    }),
  );
  // Multi-week roving: the neighbouring focusable day, the same weekday in the
  // nearest week that has it enabled, or the first/last focusable day.
  const nextMultiWeekFocus = (key: string): Date | null => {
    const days = focusableDays();
    const keys = focusableKeys();
    const period = _grid().period;
    if (!days || !keys || !period) return null;
    const index = days.findIndex((d) => format(d, "yyyy-MM-dd") === focusKey());
    if (index === -1) return null;
    if (key === "ArrowLeft") return days[index - 1] ?? null;
    if (key === "ArrowRight") return days[index + 1] ?? null;
    if (key === "Home") return days[0];
    if (key === "End") return days[days.length - 1];
    const step = key === "ArrowUp" ? -7 : 7;
    for (
      let cursor = addDays(days[index], step);
      cursor >= period.start && cursor < period.endExclusive;
      cursor = addDays(cursor, step)
    ) {
      if (keys.has(format(cursor, "yyyy-MM-dd"))) return cursor;
    }
    return null;
  };
  const onKeyDown = (e: DomKeyboardEvent<HTMLDivElement>) => {
    if (multiWeek()) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
        return;
      }
      e.preventDefault();
      const target = nextMultiWeekFocus(e.key);
      if (!target) return;
      setFocusedDate(target);
      const targetKey = format(target, "yyyy-MM-dd");
      gridRef.current?.querySelector<HTMLElement>(`[data-day="${targetKey}"]`)?.focus();
      return;
    }
    const focused = focusedDate();
    if (!focused) return;
    let next: Date | null = null;
    if (e.key === "ArrowLeft") next = addDays(focused, -1);
    else if (e.key === "ArrowRight") next = addDays(focused, 1);
    else if (e.key === "ArrowUp") next = addDays(focused, -7);
    else if (e.key === "ArrowDown") next = addDays(focused, 7);
    else if (e.key === "Home") next = startOfMonth(props.source.date);
    else if (e.key === "End") next = endOfMonth(props.source.date);
    else return;
    e.preventDefault();
    if (!isSameMonth(next, props.source.date)) return;
    setFocusedDate(next);
    const key = format(next, "yyyy-MM-dd");
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${key}"]`)?.focus();
  };
  return (
    <div
      class={props.className}
      style={css({
        fontFamily: theme().fontFamily,
        color: theme().text,
        // Multi-week rows keep their full height; when the view is given less
        // room, the grid scrolls under the title and weekday header.
        ...(multiWeek() ? { display: "flex", flexDirection: "column", minHeight: 0 } : null),
        ...props.style,
      })}
    >
      {props.showTitle ? (
        <div
          {...slot("title", {
            themed: {
              fontSize: 17,
              fontWeight: 700,
              padding: "10px 14px 6px",
            },
          })}
        >
          {_grid().title}
        </div>
      ) : null}
      {props.showWeekdays ? (
        <div
          {...slot("weekdays", {
            base: {
              display: "grid",
              gridTemplateColumns: `repeat(${_grid().weekdays.length}, minmax(0, 1fr))`,
            },
            themed: {
              borderBottom: `1px solid ${theme().gridLine}`,
              padding: "6px 0",
            },
          })}
        >
          {
            <For each={_grid().weekdays} keyed={false}>
              {(wd) => (
                <span
                  {...slot("weekday", {
                    themed: {
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme().textMuted,
                    },
                  })}
                >
                  {wd().label}
                </span>
              )}
            </For>
          }
        </div>
      ) : null}
      <div
        ref={(el) => (gridRef.current = el)}
        role="grid"
        tabindex={multiWeek() ? -1 : undefined}
        aria-label={_grid().title}
        // Arrow-key roving applies whenever the day cells are a tab stop: the
        // picker always, events mode only when keyboardDayNavigation is set.
        onKeyDown={dayRoving() ? onKeyDown : undefined}
        {...slot(
          "grid",
          multiWeek() ? { base: { flex: "1 1 auto", minHeight: 0, overflowY: "auto" } } : undefined,
        )}
      >
        {
          <For each={_grid().weeks} keyed={false}>
            {(week, weekIndex) => {
              // Spanning bars for this row (laid out once in `weekLayouts`). A multi-day
              // event is one bar across its columns, stacked into lanes; each bar renders
              // inside its start-column cell (valid grid content that reads with that day)
              // and overflows right across the days it spans. The cells reserve the lane
              // rows so "+more" sits below the bars.
              const rowLayout = createMemo(() => weekLayouts()[weekIndex] ?? EMPTY_LAYOUT);
              // When lanes overflow, keep the last row for "+more" but always show at
              // least one bar, so a day never collapses to only the overflow row.
              const overflowing = createMemo(
                () => rowLayout().laneCount > props.maxVisibleEventCount,
              );
              const visibleLanes = createMemo(() =>
                overflowing() ? Math.max(props.maxVisibleEventCount - 1, 1) : rowLayout().laneCount,
              );
              // With adjacent months hidden, clamp bars to the current-month columns so
              // none draw over the blank leading/trailing cells.
              const cols = createMemo(() => week().days.length);
              const columns = createMemo(() => {
                let first = 0;
                let last = cols() - 1;
                if (eventsMode() && !showAdjacentMonths()) {
                  const start = week().days.findIndex((d) => !isOutsidePeriod(d));
                  const end = [...week().days].reverse().findIndex((d) => !isOutsidePeriod(d));
                  if (start !== -1) {
                    first = start;
                    last = cols() - 1 - end;
                  }
                }
                return {
                  first,
                  last,
                };
              });
              return (
                <>
                  {(() => {
                    const barSegs = createMemo(() =>
                      rowLayout()
                        .segments.filter((s) => s.lane < visibleLanes())
                        .map((s) => {
                          const startCol = Math.max(s.startCol, columns().first);
                          const endCol = Math.min(s.endCol, columns().last);
                          return {
                            seg: s,
                            startCol,
                            endCol,
                            continuesBefore: s.continuesBefore || startCol > s.startCol,
                            continuesAfter: s.continuesAfter || endCol < s.endCol,
                          };
                        })
                        .filter((b) => b.startCol <= b.endCol),
                    );
                    const barChipButton = createMemo(() => slot("chipButton", chipButtonDefault));
                    const barChip = createMemo(() =>
                      slot("chip", chipDefault(theme(), props.chipHeight)),
                    );
                    return (
                      <div
                        role="row"
                        {...slot("week", {
                          base: {
                            display: "grid",
                            gridTemplateColumns: `repeat(${cols()}, minmax(0, 1fr))`,
                          },
                        })}
                      >
                        {
                          <For each={week().days} keyed={false}>
                            {(day, dayCol) => {
                              const hidden = createMemo(
                                () => !showAdjacentMonths() && isOutsidePeriod(day()),
                              );
                              const cellHeight = createMemo(() =>
                                eventsMode() ? eventRowHeight() : theme().cellHeight,
                              );
                              return (
                                <>
                                  {(() => {
                                    if (hidden()) {
                                      return (
                                        <div
                                          role="gridcell"
                                          aria-hidden="true"
                                          style={css({
                                            height: cellHeight(),
                                          })}
                                        />
                                      );
                                    }
                                    const band = createMemo(() =>
                                      rangeBandDefault(
                                        day(),
                                        theme(),
                                        props.fillCellOnSelection,
                                        eventsMode(),
                                      ),
                                    );
                                    const dateLabel = createMemo(() =>
                                      format(
                                        day().date,
                                        "EEEE, d MMMM yyyy",
                                        props.locale
                                          ? {
                                              locale: props.locale,
                                            }
                                          : undefined,
                                      ),
                                    );
                                    const label = createMemo(() =>
                                      dayAccessibilityLabel({
                                        dateLabel: dateLabel(),
                                        isToday: day().isToday,
                                        labels: labels(),
                                      }),
                                    );
                                    const dayTime = createMemo(() =>
                                      startOfDay(day().date).getTime(),
                                    );
                                    const inCreate = createMemo(() => {
                                      const currentDrag = drag();
                                      return (
                                        currentDrag?.kind === "create" &&
                                        dayTime() >=
                                          Math.min(currentDrag.anchor, currentDrag.hover) &&
                                        dayTime() <= Math.max(currentDrag.anchor, currentDrag.hover)
                                      );
                                    });
                                    // The day an event is about to land on (not the one it came from).
                                    const isDropTarget = createMemo(() => {
                                      const currentDrag = drag();
                                      return (
                                        currentDrag?.kind === "move" &&
                                        dayTime() === currentDrag.to &&
                                        currentDrag.to !== currentDrag.from
                                      );
                                    });
                                    // Present/absent data-* attributes so consumers can style day state
                                    // with CSS/Tailwind variants (e.g. `data-[today]:bg-blue-500`).
                                    const dayData = createMemo(() =>
                                      dataState({
                                        "data-today": day().isToday,
                                        "data-selected": day().isSelected,
                                        "data-range": day().isInRange,
                                        "data-weekend": day().isWeekend,
                                        "data-outside": isOutsidePeriod(day()),
                                        "data-disabled": day().isDisabled,
                                        "data-creating": inCreate(),
                                        "data-drop": isDropTarget(),
                                      }),
                                    );
                                    if (eventsMode()) {
                                      const dayEvents = createMemo(
                                        () =>
                                          eventsByDay().get(startOfDay(day().date).toISOString()) ??
                                          [],
                                      );
                                      // Events past the visible lanes (this day's segments in a lane the
                                      // row doesn't show) collapse into "+N more"; the popover lists the
                                      // whole day.
                                      const hiddenEvents = createMemo(() =>
                                        rowLayout()
                                          .segments.filter(
                                            (s) =>
                                              s.startCol <= dayCol &&
                                              s.endCol >= dayCol &&
                                              s.lane >= visibleLanes(),
                                          )
                                          .map((s) => s.event),
                                      );
                                      const dayLabel = createMemo(() =>
                                        format(
                                          day().date,
                                          "d MMMM",
                                          props.locale
                                            ? {
                                                locale: props.locale,
                                              }
                                            : undefined,
                                        ),
                                      );
                                      const dayCellProps = createMemo(() =>
                                        slot(
                                          "day",
                                          eventCellDefault(
                                            day(),
                                            theme(),
                                            cellHeight(),
                                            props.highlightWeekends,
                                            inCreate() || isDropTarget(),
                                            props.chipGap,
                                          ),
                                        ),
                                      );
                                      return (
                                        // Events mode: by default the cell is not a tab stop, so keyboard
                                        // focus moves through the event chips (real buttons) only, not
                                        // every empty day. With keyboardDayNavigation the cell joins the
                                        // roving tab order (arrow keys + Enter to open the day). A pointer
                                        // click always drills into the day.
                                        <div
                                          role="gridcell"
                                          data-day={day().id}
                                          onFocusIn={(event) => {
                                            if (event.target === event.currentTarget) {
                                              lastDayFocus.current = event.currentTarget;
                                              setFocusedDate(day().date);
                                            }
                                          }}
                                          onFocusOut={(event) => {
                                            if (event.target !== event.currentTarget) return;
                                            const previous = event.currentTarget;
                                            if (event.relatedTarget) lastDayFocus.current = null;
                                            else {
                                              // Removal blurs before detaching the node. Distinguish
                                              // it from a manual blur after the DOM update finishes.
                                              queueMicrotask(() => {
                                                if (
                                                  lastDayFocus.current === previous &&
                                                  previous.isConnected
                                                )
                                                  lastDayFocus.current = null;
                                              });
                                            }
                                          }}
                                          {...dayData()}
                                          tabindex={
                                            props.keyboardDayNavigation
                                              ? day().id === focusKey()
                                                ? 0
                                                : -1
                                              : undefined
                                          }
                                          aria-disabled={
                                            (day().isDisabled || undefined) == null
                                              ? undefined
                                              : day().isDisabled || undefined
                                                ? "true"
                                                : "false"
                                          }
                                          aria-label={dayAccessibilityLabel({
                                            dateLabel: dateLabel(),
                                            isToday: day().isToday,
                                            isSelected: day().isSelected,
                                            eventCount: dayEvents().length,
                                            labels: labels(),
                                          })}
                                          {...dayCellProps()}
                                          // Dragging disables touch scroll on the cell so a swipe
                                          // sketches a span (or carries an event) instead of scrolling
                                          // the grid, and stops the sweep from text-selecting the day
                                          // numbers and chip titles it passes over.
                                          style={css(
                                            dragWired()
                                              ? {
                                                  ...dayCellProps().style,
                                                  touchAction: multiWeek() ? "pan-y" : "none",
                                                  userSelect: "none",
                                                }
                                              : dayCellProps().style,
                                          )}
                                          onPointerDown={
                                            dragWired() && !day().isDisabled
                                              ? (e) => {
                                                  const date = day().date;
                                                  pressRow(e, date);
                                                }
                                              : undefined
                                          }
                                          // A disabled day is out of every selection, drag included, so
                                          // a sweep never extends onto it and no drop lands there.
                                          onPointerEnter={
                                            dragWired() && !day().isDisabled
                                              ? (e) => extendDrag(day().date, e.pointerId)
                                              : undefined
                                          }
                                          onClick={
                                            day().isDisabled
                                              ? undefined
                                              : (e) => {
                                                  if (consumeSuppressedClick(e.detail)) return;
                                                  props.onPressDay?.(day().date);
                                                  props.onPressCell?.(startOfDay(day().date));
                                                }
                                          }
                                          onKeyDown={
                                            props.keyboardDayNavigation && !day().isDisabled
                                              ? (e) => {
                                                  // Let Enter/Space on a focused chip activate the chip.
                                                  if (e.target !== e.currentTarget) return;
                                                  if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    props.onPressDay?.(day().date);
                                                    props.onPressCell?.(startOfDay(day().date));
                                                  }
                                                }
                                              : undefined
                                          }
                                        >
                                          {
                                            <Show when={band()}>
                                              {(band) => (
                                                <span
                                                  data-band
                                                  aria-hidden="true"
                                                  {...slot("rangeBand", band())}
                                                />
                                              )}
                                            </Show>
                                          }
                                          <span
                                            {...dayData()}
                                            {...slot(
                                              "dayBadge",
                                              compactBadgeDefault(day(), theme()),
                                            )}
                                          >
                                            {day().label}
                                          </span>
                                          {/* Spanning bars that start in this column: absolutely placed,
                                           overflowing right across the days they span. Rendered here
                                           (not a row overlay) so each bar is valid content of its
                                           start day's gridcell and reads with that day. Made
                                           non-interactive mid drag so a sweep (or a move) reaches the
                                           cells beneath. */}
                                          {
                                            <For
                                              each={barSegs().filter((b) => b.startCol === dayCol)}
                                              keyed={false}
                                            >
                                              {(b) => {
                                                const span = createMemo(
                                                  () => b().endCol - b().startCol + 1,
                                                );
                                                const isDragged = createMemo(() => {
                                                  const currentDrag = drag();
                                                  return (
                                                    currentDrag?.kind === "move" &&
                                                    currentDrag.event === b().seg.event
                                                  );
                                                });
                                                return (
                                                  <button
                                                    type="button"
                                                    onPointerDown={
                                                      canMove(b().seg.event)
                                                        ? (e) => {
                                                            e.stopPropagation();
                                                            const event = b().seg.event;
                                                            const date = day().date;
                                                            pressRow(e, date, event);
                                                          }
                                                        : undefined
                                                    }
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (consumeSuppressedClick(e.detail)) return;
                                                      props.onPressEvent?.(b().seg.event);
                                                    }}
                                                    {...barChipButton()}
                                                    title={b().seg.event.title}
                                                    aria-label={
                                                      props.eventAccessibilityLabel
                                                        ? props.eventAccessibilityLabel(
                                                            b().seg.event,
                                                            {
                                                              mode: viewMode(),
                                                              isAllDay: isAllDayEvent(
                                                                b().seg.event,
                                                              ),
                                                              ampm: false,
                                                            },
                                                          )
                                                        : `${b().seg.event.title}, ${dayLabel()}`
                                                    }
                                                    style={css({
                                                      ...barChipButton().style,
                                                      position: "absolute",
                                                      left: 2,
                                                      width: `calc(${span() * 100}% - 4px)`,
                                                      top:
                                                        CELL_PAD +
                                                        DATE_ROW +
                                                        props.chipGap +
                                                        b().seg.lane *
                                                          (props.chipHeight + props.chipGap),
                                                      height: props.chipHeight,
                                                      pointerEvents: isDragging() ? "none" : "auto",
                                                      // Fade the bar being carried, so the tinted drop
                                                      // target reads as where it is going.
                                                      opacity: isDragged()
                                                        ? DRAGGED_CHIP_OPACITY
                                                        : undefined,
                                                      cursor: canMove(b().seg.event)
                                                        ? "grab"
                                                        : undefined,
                                                      touchAction: dragWired()
                                                        ? multiWeek()
                                                          ? "pan-y"
                                                          : "none"
                                                        : undefined,
                                                      zIndex: 2,
                                                    })}
                                                  >
                                                    {Chip() ? (
                                                      <Dynamic
                                                        component={Chip()}
                                                        mode={viewMode()}
                                                        event={b().seg.event}
                                                        onPress={() =>
                                                          props.onPressEvent?.(b().seg.event)
                                                        }
                                                      />
                                                    ) : (
                                                      <span
                                                        {...barChip()}
                                                        style={css({
                                                          ...barChip().style,
                                                          ...(b().continuesBefore
                                                            ? {
                                                                borderTopLeftRadius: 0,
                                                                borderBottomLeftRadius: 0,
                                                              }
                                                            : null),
                                                          ...(b().continuesAfter
                                                            ? {
                                                                borderTopRightRadius: 0,
                                                                borderBottomRightRadius: 0,
                                                              }
                                                            : null),
                                                        })}
                                                      >
                                                        {b().seg.event.title}
                                                      </span>
                                                    )}
                                                  </button>
                                                );
                                              }}
                                            </For>
                                          }
                                          <div
                                            {...slot("events", {
                                              base: {
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: props.chipGap,
                                              },
                                            })}
                                          >
                                            {/* Reserve one row per visible lane so the absolute bars have
                                             space and "+more" sits below them. */}
                                            {Array.from(
                                              {
                                                length: visibleLanes(),
                                              },
                                              () => (
                                                <div
                                                  aria-hidden="true"
                                                  style={css({
                                                    height: props.chipHeight,
                                                  })}
                                                />
                                              ),
                                            )}
                                            {hiddenEvents().length > 0 ? (
                                              <button
                                                type="button"
                                                // In built-in-popover mode, keep the document
                                                // pointerdown dismiss from firing before this click's
                                                // toggle, so pressing the button again closes it.
                                                onPointerDown={
                                                  props.onPressMore
                                                    ? undefined
                                                    : (e) => e.stopPropagation()
                                                }
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (props.onPressMore)
                                                    props.onPressMore(hiddenEvents(), day().date);
                                                  else {
                                                    moreTriggerRef.current = e.currentTarget;
                                                    setMoreOpenFor((open) =>
                                                      open === day().id ? null : day().id,
                                                    );
                                                  }
                                                }}
                                                {...slot(
                                                  "more",
                                                  moreButtonDefault(
                                                    theme(),
                                                    props.chipHeight,
                                                    multiWeek(),
                                                  ),
                                                )}
                                                aria-label={`${labels().moreEvents(hiddenEvents().length)}, ${dayLabel()}`}
                                                aria-expanded={
                                                  (props.onPressMore
                                                    ? undefined
                                                    : moreOpenFor() === day().id) == null
                                                    ? undefined
                                                    : (
                                                          props.onPressMore
                                                            ? undefined
                                                            : moreOpenFor() === day().id
                                                        )
                                                      ? "true"
                                                      : "false"
                                                }
                                              >
                                                {props.moreLabel.replace(
                                                  "{moreCount}",
                                                  String(hiddenEvents().length),
                                                )}
                                              </button>
                                            ) : null}
                                            {moreOpenFor() === day().id ? (
                                              <div
                                                ref={(el) => (morePopoverRef.current = el)}
                                                // A non-modal dialog: Tab stays inside and Escape closes,
                                                // but the page behind is not inert (outside clicks work),
                                                // so no aria-modal claim.
                                                role="dialog"
                                                aria-label={dayLabel()}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                // Contain Tab inside the dialog; Escape (handled on the
                                                // document) closes it and restores focus to the trigger.
                                                onKeyDown={(e) => {
                                                  if (e.key !== "Tab") return;
                                                  const buttons =
                                                    morePopoverRef.current?.querySelectorAll<HTMLElement>(
                                                      "button",
                                                    );
                                                  if (!buttons?.length) return;
                                                  const first = buttons[0];
                                                  const last = buttons[buttons.length - 1];
                                                  if (
                                                    e.shiftKey &&
                                                    document.activeElement === first
                                                  ) {
                                                    e.preventDefault();
                                                    last.focus();
                                                  } else if (
                                                    !e.shiftKey &&
                                                    document.activeElement === last
                                                  ) {
                                                    e.preventDefault();
                                                    first.focus();
                                                  }
                                                }}
                                                {...slot("morePopover", {
                                                  base: {
                                                    position: "absolute",
                                                    top: 2,
                                                    left: 2,
                                                    right: 2,
                                                    zIndex: 10,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: 2,
                                                    maxHeight: 240,
                                                    overflowY: "auto",
                                                  },
                                                  themed: {
                                                    background: theme().surface,
                                                    border: `1px solid ${theme().gridLine}`,
                                                    borderRadius: 8,
                                                    padding: 6,
                                                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                                  },
                                                })}
                                              >
                                                <div
                                                  style={css({
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    color: theme().textMuted,
                                                  })}
                                                >
                                                  {dayLabel()}
                                                </div>
                                                {
                                                  <For each={dayEvents()} keyed={false}>
                                                    {(event) => {
                                                      return (
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            setMoreOpenFor(null);
                                                            props.onPressEvent?.(event());
                                                          }}
                                                          style={css({
                                                            display: "block",
                                                            width: "100%",
                                                            border: "none",
                                                            background: "transparent",
                                                            padding: 0,
                                                            font: "inherit",
                                                            textAlign: "left",
                                                            cursor: "pointer",
                                                          })}
                                                        >
                                                          {Chip() ? (
                                                            <Dynamic
                                                              component={Chip()}
                                                              mode={viewMode()}
                                                              event={event()}
                                                              onPress={() =>
                                                                props.onPressEvent?.(event())
                                                              }
                                                            />
                                                          ) : (
                                                            <span
                                                              {...slot(
                                                                "chip",
                                                                chipDefault(
                                                                  theme(),
                                                                  props.chipHeight,
                                                                ),
                                                              )}
                                                            >
                                                              {event().title}
                                                            </span>
                                                          )}
                                                        </button>
                                                      );
                                                    }}
                                                  </For>
                                                }
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    }
                                    return (
                                      <button
                                        type="button"
                                        role="gridcell"
                                        data-day={day().id}
                                        onFocusIn={(event) => {
                                          if (event.target === event.currentTarget) {
                                            lastDayFocus.current = event.currentTarget;
                                            setFocusedDate(day().date);
                                          }
                                        }}
                                        {...dayData()}
                                        tabindex={day().id === focusKey() ? 0 : -1}
                                        aria-disabled={
                                          (day().isDisabled || undefined) == null
                                            ? undefined
                                            : day().isDisabled || undefined
                                              ? "true"
                                              : "false"
                                        }
                                        aria-label={label()}
                                        aria-selected={
                                          day().isSelected || day().isInRange ? "true" : "false"
                                        }
                                        {...slot(
                                          "day",
                                          dayCellDefault(day(), theme(), props.highlightWeekends),
                                        )}
                                        onClick={
                                          day().isDisabled
                                            ? undefined
                                            : () => {
                                                props.onPressDay?.(day().date);
                                                props.onPressCell?.(startOfDay(day().date));
                                              }
                                        }
                                        onMouseEnter={
                                          day().isDisabled
                                            ? undefined
                                            : () => setHoveredKey(day().id)
                                        }
                                        onMouseLeave={() =>
                                          setHoveredKey((k) => (k === day().id ? null : k))
                                        }
                                      >
                                        {
                                          <Show when={band()}>
                                            {(band) => (
                                              <span
                                                data-band
                                                aria-hidden="true"
                                                {...slot("rangeBand", band())}
                                              />
                                            )}
                                          </Show>
                                        }
                                        <span
                                          {...dayData()}
                                          {...slot(
                                            "dayBadge",
                                            badgeDefault(day(), theme(), hoveredKey() === day().id),
                                          )}
                                        >
                                          {day().label}
                                        </span>
                                      </button>
                                    );
                                  })()}
                                </>
                              );
                            }}
                          </For>
                        }
                      </div>
                    );
                  })()}
                </>
              );
            }}
          </For>
        }
      </div>
    </div>
  );
}
