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
  dayBadgeKind,
  type DateRange,
  type DateSelectionConstraints,
  type MonthGridDay,
  rangeBandKind,
  type WeekStartsOn,
} from "@super-calendar/core";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

export interface MonthViewProps extends DateSelectionConstraints {
  /** Any day within the month to render. */
  date: Date;
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
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
  const style: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
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

/** A single static month grid, rendered with plain DOM elements. */
export function MonthView({
  date,
  weekStartsOn = 0,
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
  className,
  style,
}: MonthViewProps) {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
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
            gridTemplateColumns: "repeat(7, 1fr)",
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
        onKeyDown={onKeyDown}
      >
        {weeks.map((week) => (
          <div
            key={week.id}
            role="row"
            style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}
          >
            {week.days.map((day) => {
              const hidden = !showAdjacentMonths && !day.isCurrentMonth;
              if (hidden) {
                return (
                  <div
                    key={day.id}
                    role="gridcell"
                    aria-hidden
                    style={{ height: theme.cellHeight }}
                  />
                );
              }
              const band = rangeBandStyle(day, theme, fillCellOnSelection);
              return (
                <button
                  key={day.id}
                  type="button"
                  role="gridcell"
                  data-day={day.id}
                  tabIndex={day.id === focusKey ? 0 : -1}
                  aria-disabled={day.isDisabled || undefined}
                  aria-label={format(
                    day.date,
                    "EEEE, d MMMM yyyy",
                    locale ? { locale } : undefined,
                  )}
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
