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
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  bandRounding,
  buildMonthGrid,
  type CalendarEvent,
  compareDayEvents,
  dayBadgeKind,
  type DateRange,
  type DateSelectionConstraints,
  groupEventsByDay,
  type MonthGridDay,
  monthVisibleCount,
  rangeBandKind,
  type WeekStartsOn,
} from "@super-calendar/core";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

// Chip metrics for the events layout (when `events` is provided).
const DATE_ROW = 24;
const CHIP_HEIGHT = 18;
const CHIP_GAP = 2;
const CELL_PAD = 4;

/** Props passed to a custom month event chip renderer. */
export interface DomMonthEventArgs<T = unknown> {
  event: CalendarEvent<T>;
  onPress: () => void;
}

export type DomMonthEvent<T = unknown> = ComponentType<DomMonthEventArgs<T>>;

export interface MonthViewProps<T = unknown> extends DateSelectionConstraints {
  /** Any day within the month to render. */
  date: Date;
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /**
   * Events to render as chips in each day cell. Passing this (even `[]`) switches
   * the grid to the calendar layout (date in the corner, chips below); omit it for
   * the compact date-picker look.
   */
  events?: CalendarEvent<T>[];
  /** Custom chip renderer; falls back to the built-in titled chip. */
  renderEvent?: DomMonthEvent<T>;
  /** Max chips shown per day before a "+N more" row (default 3). */
  maxVisibleEventCount?: number;
  /** Template for the overflow row; `{moreCount}` is replaced (default "{moreCount} More"). */
  moreLabel?: string;
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
  theme?: Partial<DomCalendarTheme>;
  /** Fired when a selectable day is clicked. */
  onPressDay?: (date: Date) => void;
  /**
   * When events are shown, also make the day cells keyboard-navigable: a single
   * roving tab stop, arrow keys move the focus, Enter opens the day (`onPressDay`).
   * Default false, so keyboard focus moves through events only. The date picker
   * (rendered without `events`) is always navigable regardless of this flag.
   */
  keyboardDayNavigation?: boolean;
  className?: string;
  style?: CSSProperties;
}

function dayCellStyle(day: MonthGridDay, theme: DomCalendarTheme): CSSProperties {
  return {
    position: "relative",
    height: theme.cellHeight,
    border: "none",
    // The range band is a separate layer; the cell only carries the weekend tint.
    background: day.isWeekend && !day.isInRange ? theme.weekendBackground : "transparent",
    font: "inherit",
    fontSize: 15,
    color: day.isDisabled ? theme.textDisabled : theme.text,
    cursor: day.isDisabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    WebkitTapHighlightColor: "transparent",
  };
}

/**
 * The range band behind a day, rendered as its own layer so it can be a centered
 * rounded strip (the default) or fill the whole cell (`fillCell`). Returns null
 * for days with no band. Endpoints get the leading/trailing pill rounding.
 */
function rangeBandStyle(
  day: MonthGridDay,
  theme: DomCalendarTheme,
  fillCell: boolean,
): CSSProperties | null {
  const kind = rangeBandKind(day, fillCell);
  if (kind === "none") return null;
  const fill = kind === "fill";
  const inset = fill ? 0 : Math.max(0, (theme.cellHeight - theme.rangeBandHeight) / 2);
  const radius = fill ? 0 : theme.rangeBandHeight / 2;
  const rounding = bandRounding(kind);
  // Cap the pill at the endpoint circles: a start/end band stops at the circle's
  // outer edge (half a badge in from the cell centre) rather than spilling to the
  // cell edge, so no band shows in the empty space beside the day circles.
  const cap = `calc(50% - ${theme.dayBadgeSize / 2}px)`;
  const style: CSSProperties = {
    position: "absolute",
    left: rounding.start ? cap : 0,
    right: rounding.end ? cap : 0,
    top: inset,
    bottom: inset,
    background: theme.rangeBackground,
    zIndex: 0,
  };
  if (rounding.start) {
    style.borderTopLeftRadius = radius;
    style.borderBottomLeftRadius = radius;
  }
  if (rounding.end) {
    style.borderTopRightRadius = radius;
    style.borderBottomRightRadius = radius;
  }
  return style;
}

function badgeStyle(day: MonthGridDay, theme: DomCalendarTheme, hovered: boolean): CSSProperties {
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
    position: "relative",
    zIndex: 1,
    width: theme.dayBadgeSize,
    height: theme.dayBadgeSize,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background,
    color: filled ? (day.isToday ? theme.todayText : theme.selectedText) : "inherit",
  };
}

// --- Calendar (events) layout styles -------------------------------------

function eventCellStyle(day: MonthGridDay, theme: DomCalendarTheme, height: number): CSSProperties {
  return {
    position: "relative",
    minHeight: height,
    minWidth: 0,
    border: "none",
    borderTop: `1px solid ${theme.gridLine}`,
    background: day.isWeekend && !day.isInRange ? theme.weekendBackground : "transparent",
    color: day.isDisabled ? theme.textDisabled : theme.text,
    cursor: day.isDisabled ? "default" : "pointer",
    display: "flex",
    flexDirection: "column",
    gap: CHIP_GAP,
    padding: CELL_PAD,
    boxSizing: "border-box",
    textAlign: "left",
    WebkitTapHighlightColor: "transparent",
  };
}

function compactBadgeStyle(day: MonthGridDay, theme: DomCalendarTheme): CSSProperties {
  const badge = dayBadgeKind(day, day.isToday);
  const filled = badge !== "none";
  return {
    position: "relative",
    zIndex: 1,
    alignSelf: "flex-end",
    width: DATE_ROW - 2,
    height: DATE_ROW - 2,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    background: filled
      ? badge === "today"
        ? theme.todayBackground
        : theme.selectedBackground
      : "transparent",
    color: filled ? (day.isToday ? theme.todayText : theme.selectedText) : "inherit",
  };
}

const chipButtonStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  border: "none",
  padding: 0,
  margin: 0,
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

function chipStyle(theme: DomCalendarTheme): CSSProperties {
  return {
    display: "block",
    height: CHIP_HEIGHT,
    lineHeight: `${CHIP_HEIGHT}px`,
    padding: "0 6px",
    borderRadius: 4,
    background: theme.eventBackground,
    color: theme.eventText,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

function moreButtonStyle(theme: DomCalendarTheme): CSSProperties {
  return {
    position: "relative",
    zIndex: 1,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
    padding: "0 6px",
    height: CHIP_HEIGHT,
    lineHeight: `${CHIP_HEIGHT}px`,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "inherit",
    color: theme.textMuted,
  };
}

// Internal-only: MonthList passes a day→events index built once for the whole
// list (via `groupEventsByDay`) so each month doesn't rebuild it. Not exported,
// so it stays off the public MonthViewProps surface.
interface MonthViewInternalProps<T = unknown> extends MonthViewProps<T> {
  eventsByDay?: ReadonlyMap<string, CalendarEvent<T>[]>;
}

/** A single static month grid, rendered with plain DOM elements. */
export function MonthView<T = unknown>({
  date,
  weekStartsOn = 0,
  events,
  eventsByDay: eventsByDayProp,
  renderEvent,
  maxVisibleEventCount = 3,
  moreLabel = "{moreCount} More",
  onPressEvent,
  onPressMore,
  selectedRange,
  selectedDates,
  showAdjacentMonths = true,
  fillCellOnSelection = false,
  showTitle = true,
  showWeekdays = true,
  locale,
  theme: themeOverrides,
  minDate,
  maxDate,
  isDateDisabled,
  onPressDay,
  keyboardDayNavigation = false,
  className,
  style,
}: MonthViewInternalProps<T>) {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);

  // Calendar layout (date in the corner + event chips) is on whenever `events`
  // is provided; otherwise the compact picker badge layout is used.
  const eventsMode = events !== undefined;
  // The day cells form a roving tab stop (arrow keys + Enter) in the picker
  // always, and in events mode only when the consumer opts in. Otherwise events
  // mode tabs through the event chips alone.
  const dayRoving = !eventsMode || keyboardDayNavigation;
  // Use the list-built index when provided (MonthList), else build it for this
  // month. Either way lookups use startOfDay(date).toISOString().
  const eventsByDay = useMemo(() => {
    // The list (MonthList) sorts before passing its index in; only sort here when
    // building our own, so each day reads all-day events first, then by start.
    if (eventsByDayProp) return eventsByDayProp;
    const map = groupEventsByDay(events ?? []);
    for (const list of map.values()) list.sort(compareDayEvents);
    return map;
  }, [eventsByDayProp, events]);
  const Chip = renderEvent;
  // Reserve `maxVisibleEventCount` rows below the date so every cell is uniform;
  // when a day overflows, the last row becomes the "+N more" affordance.
  const eventRowHeight = CELL_PAD * 2 + DATE_ROW + maxVisibleEventCount * (CHIP_HEIGHT + CHIP_GAP);
  const { weeks, weekdays } = useMemo(
    () =>
      buildMonthGrid(date, {
        weekStartsOn,
        selectedRange,
        selectedDates,
        minDate,
        maxDate,
        isDateDisabled,
        locale,
      }),
    [date, weekStartsOn, selectedRange, selectedDates, minDate, maxDate, isDateDisabled, locale],
  );

  // Roving tabindex: only one day is in the tab order; arrow keys move focus
  // within the month, so the grid is a single, sensible tab stop.
  const initialFocus = useMemo(() => {
    const inMonth = (d?: Date | null) => !!d && isSameMonth(d, date);
    if (inMonth(selectedRange?.start)) return startOfDay(selectedRange!.start);
    const picked = selectedDates?.find(inMonth);
    if (picked) return startOfDay(picked);
    const today = new Date();
    return isSameMonth(today, date) ? startOfDay(today) : startOfMonth(date);
  }, [date, selectedRange, selectedDates]);

  const [focusedDate, setFocusedDate] = useState(initialFocus);
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;
  const monthKey = format(date, "yyyy-MM");
  useEffect(() => setFocusedDate(initialFocusRef.current), [monthKey]);

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusKey = format(focusedDate, "yyyy-MM-dd");
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let next: Date | null = null;
    if (e.key === "ArrowLeft") next = addDays(focusedDate, -1);
    else if (e.key === "ArrowRight") next = addDays(focusedDate, 1);
    else if (e.key === "ArrowUp") next = addDays(focusedDate, -7);
    else if (e.key === "ArrowDown") next = addDays(focusedDate, 7);
    else if (e.key === "Home") next = startOfMonth(date);
    else if (e.key === "End") next = endOfMonth(date);
    else return;
    e.preventDefault();
    if (!isSameMonth(next, date)) return;
    setFocusedDate(next);
    const key = format(next, "yyyy-MM-dd");
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${key}"]`)?.focus();
  };

  return (
    <div
      className={className}
      style={{ fontFamily: theme.fontFamily, color: theme.text, ...style }}
    >
      {showTitle ? (
        <div style={{ fontSize: 17, fontWeight: 700, padding: "10px 14px 6px" }}>
          {format(date, "MMMM yyyy", locale ? { locale } : undefined)}
        </div>
      ) : null}
      {showWeekdays ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            borderBottom: `1px solid ${theme.gridLine}`,
            padding: "6px 0",
          }}
        >
          {weekdays.map((wd) => (
            <span
              key={wd.label}
              style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: theme.textMuted }}
            >
              {wd.label}
            </span>
          ))}
        </div>
      ) : null}
      <div
        ref={gridRef}
        role="grid"
        aria-label={format(date, "MMMM yyyy", locale ? { locale } : undefined)}
        // Arrow-key roving applies whenever the day cells are a tab stop: the
        // picker always, events mode only when keyboardDayNavigation is set.
        onKeyDown={dayRoving ? onKeyDown : undefined}
      >
        {weeks.map((week) => (
          <div
            key={week.id}
            role="row"
            style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
          >
            {week.days.map((day) => {
              const hidden = !showAdjacentMonths && !day.isCurrentMonth;
              const cellHeight = eventsMode ? eventRowHeight : theme.cellHeight;
              if (hidden) {
                return (
                  <div key={day.id} role="gridcell" aria-hidden style={{ height: cellHeight }} />
                );
              }
              const band = rangeBandStyle(day, theme, fillCellOnSelection);
              const label = format(day.date, "EEEE, d MMMM yyyy", locale ? { locale } : undefined);

              if (eventsMode) {
                const dayEvents = eventsByDay.get(startOfDay(day.date).toISOString()) ?? [];
                // Core decides how many fit; withMore keeps >=1 chip so an
                // overflowing day never shows only the "+N more" row.
                const visible = monthVisibleCount(dayEvents.length, {
                  full: maxVisibleEventCount,
                  withMore: Math.max(maxVisibleEventCount - 1, 1),
                });
                const shown = dayEvents.slice(0, visible);
                const rest = dayEvents.slice(visible);
                const overflow = rest.length > 0;
                const dayLabel = format(day.date, "d MMMM", locale ? { locale } : undefined);
                return (
                  // Events mode: by default the cell is not a tab stop, so keyboard
                  // focus moves through the event chips (real buttons) only, not
                  // every empty day. With keyboardDayNavigation the cell joins the
                  // roving tab order (arrow keys + Enter to open the day). A pointer
                  // click always drills into the day.
                  <div
                    key={day.id}
                    role="gridcell"
                    data-day={day.id}
                    tabIndex={keyboardDayNavigation ? (day.id === focusKey ? 0 : -1) : undefined}
                    aria-disabled={day.isDisabled || undefined}
                    aria-label={label}
                    style={eventCellStyle(day, theme, cellHeight)}
                    onClick={day.isDisabled ? undefined : () => onPressDay?.(day.date)}
                    onKeyDown={
                      keyboardDayNavigation && !day.isDisabled
                        ? (e) => {
                            // Let Enter/Space on a focused chip activate the chip.
                            if (e.target !== e.currentTarget) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onPressDay?.(day.date);
                            }
                          }
                        : undefined
                    }
                  >
                    {band ? <span data-band aria-hidden style={band} /> : null}
                    <span style={compactBadgeStyle(day, theme)}>{day.label}</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: CHIP_GAP }}>
                      {shown.map((event) => {
                        const onPress = () => onPressEvent?.(event);
                        return (
                          <button
                            key={`${event.start.toISOString()}:${event.title}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPress();
                            }}
                            style={chipButtonStyle}
                            title={event.title}
                            aria-label={`${event.title}, ${dayLabel}`}
                          >
                            {Chip ? (
                              <Chip event={event} onPress={onPress} />
                            ) : (
                              <span style={chipStyle(theme)}>{event.title}</span>
                            )}
                          </button>
                        );
                      })}
                      {overflow ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPressMore?.(rest, day.date);
                          }}
                          style={moreButtonStyle(theme)}
                          aria-label={`${rest.length} more events, ${dayLabel}`}
                        >
                          {moreLabel.replace("{moreCount}", String(rest.length))}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={day.id}
                  type="button"
                  role="gridcell"
                  data-day={day.id}
                  tabIndex={day.id === focusKey ? 0 : -1}
                  aria-disabled={day.isDisabled || undefined}
                  aria-label={label}
                  aria-pressed={day.isSelected || day.isInRange}
                  style={dayCellStyle(day, theme)}
                  onClick={day.isDisabled ? undefined : () => onPressDay?.(day.date)}
                  onMouseEnter={day.isDisabled ? undefined : () => setHoveredKey(day.id)}
                  onMouseLeave={() => setHoveredKey((k) => (k === day.id ? null : k))}
                >
                  {band ? <span data-band aria-hidden style={band} /> : null}
                  <span style={badgeStyle(day, theme, hoveredKey === day.id)}>{day.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
