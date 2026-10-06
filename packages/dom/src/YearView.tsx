import { format, startOfDay, type Locale } from "date-fns";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  bandRounding,
  buildMonthWeeks,
  type CalendarEvent,
  type DateRange,
  type DateSelectionConstraints,
  dayBadgeKind,
  monthCreateRange,
  daySelectionState,
  getIsToday,
  filterHiddenDays,
  getWeekDays,
  getYearMonths,
  groupEventsByDay,
  isBackgroundEvent,
  isSameCalendarDay,
  rangeBandKind,
  type WeekStartsOn,
  weekdayFormatToken,
} from "@super-calendar/core";
import {
  type CalendarLabels,
  dayAccessibilityLabel,
  resolveCalendarLabels,
} from "@super-calendar/core";
import { createSlots, dataState, type SlotStyleProps } from "./slots";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/**
 * Styleable parts of {@link YearView}. Pass a class or inline style per slot
 * via the `classNames` / `styles` props; day cells carry `data-today`,
 * `data-events`, `data-selected`, `data-range`, `data-disabled` and
 * `data-creating` state attributes for variants.
 */
export type YearViewSlot =
  | "grid"
  | "month"
  | "monthTitle"
  | "weekdays"
  | "weekday"
  | "week"
  | "day"
  | "dayBadge"
  | "rangeBand"
  | "eventDot";

/** Props for {@link YearView}, the twelve mini-month year grid. */
export interface YearViewProps<T = unknown>
  extends DateSelectionConstraints, SlotStyleProps<YearViewSlot> {
  /** Any date inside the year to render. */
  date: Date;
  /** Days holding at least one event get a dot. Omit for a plain year. */
  events?: CalendarEvent<T>[];
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  locale?: Locale;
  /** Translations for the screen-reader words; omitted keys use English. */
  labels?: Partial<CalendarLabels>;
  /** Highlight this date instead of the real "today". */
  activeDate?: Date;
  /** A selected span: endpoints get a filled badge, the days between get the range band. */
  selectedRange?: DateRange;
  /** Discrete selected days, drawn with a filled badge. */
  selectedDates?: Date[];
  /**
   * Smallest width a mini month may take before the grid drops a column
   * (default 150). The grid fits as many columns as the container allows.
   */
  minMonthWidth?: number;
  /** Tap a day cell (e.g. to drill into the day or month view). */
  onPressDay?: (date: Date) => void;
  /** Tap a month's title (e.g. to jump to that month's view). */
  onPressMonth?: (month: Date) => void;
  /**
   * Enables drag-to-select and reports the swept span live, as the ordered
   * inclusive `[start, end]` days (both at midnight). Pair it with
   * `useDateRange`'s `selectRange` to drive `selectedRange`. Fires on every day the
   * pointer crosses, so the highlight follows the drag; `onCreateEvent` (when also
   * set) fires once on release. Either handler enables the same sweep gesture, and
   * a sweep can run across mini months.
   */
  onSelectDrag?: (start: Date, end: Date) => void;
  /**
   * Enables drag-to-create: press a day and drag across others, then release to
   * fire this with the all-day range (`start` at midnight of the first day, `end`
   * at midnight after the last, exclusive). A plain click without dragging still
   * fires `onPressDay`, not this. Days being sketched carry `data-creating`.
   */
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<DomCalendarTheme>;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

/**
 * A year at a glance: the twelve months as compact mini grids, with today
 * highlighted and a dot under days that hold events. It's the view `Calendar`
 * renders for `mode="year"`.
 */
export function YearView<T = unknown>({
  date,
  events,
  weekStartsOn = 0,
  hiddenDays,
  locale,
  labels: labelsProp,
  activeDate,
  selectedRange,
  selectedDates,
  minDate,
  maxDate,
  isDateDisabled,
  minMonthWidth = 150,
  onPressDay,
  onPressMonth,
  onSelectDrag,
  onCreateEvent,
  theme: themeOverrides,
  className,
  style,
  classNames,
  styles,
}: YearViewProps<T>): ReactElement {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const labels = useMemo(() => resolveCalendarLabels(labelsProp), [labelsProp]);
  const slot = createSlots<YearViewSlot>({ classNames, styles });

  // Drag-to-select / drag-to-create: press a day and sweep across others (mini
  // months included), released on a window pointerup so a drop anywhere commits.
  // `onSelectDrag` reports the span live, `onCreateEvent` once on release.
  const sweepEnabled = onSelectDrag != null || onCreateEvent != null;
  const [creating, setCreating] = useState<{ anchor: number; hover: number } | null>(null);
  const creatingRef = useRef(creating);
  creatingRef.current = creating;
  const movedRef = useRef(false);
  // Set when a sweep commits, so the click the browser fires next doesn't also
  // open the day via onPressDay. A sweep that ends over a different cell than it
  // began on gets its trailing click on their common ancestor instead, where no
  // handler consumes the guard, so every fresh press clears it first.
  const suppressClickRef = useRef(false);
  const beginPress = () => {
    suppressClickRef.current = false;
    movedRef.current = false;
  };
  const beginCreate = (day: Date) => {
    const t = startOfDay(day).getTime();
    setCreating({ anchor: t, hover: t });
  };
  const extendCreate = (day: Date) => {
    const current = creatingRef.current;
    if (!current) return;
    const t = startOfDay(day).getTime();
    if (t === current.hover) return;
    movedRef.current = true;
    setCreating((c) => (c ? { ...c, hover: t } : c));
    const [lo, hi] = current.anchor <= t ? [current.anchor, t] : [t, current.anchor];
    onSelectDrag?.(new Date(lo), new Date(hi));
  };
  const isCreating = creating !== null;
  useEffect(() => {
    if (!isCreating) return;
    const finish = () => {
      const c = creatingRef.current;
      setCreating(null);
      if (!c || !movedRef.current) return;
      suppressClickRef.current = true;
      const range = monthCreateRange(new Date(c.anchor), new Date(c.hover));
      onCreateEvent?.(range.start, range.end);
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [isCreating, onCreateEvent]);

  const months = useMemo(() => getYearMonths(date), [date]);
  const weekdayLabels = useMemo(
    () =>
      filterHiddenDays(getWeekDays(date, weekStartsOn), hiddenDays).map((d) =>
        format(d, weekdayFormatToken("narrow"), { locale }),
      ),
    [date, weekStartsOn, locale, hiddenDays],
  );
  // Days that hold at least one event, keyed like `groupEventsByDay`.
  const eventDays = useMemo(
    () =>
      new Set(
        events && events.length > 0
          ? groupEventsByDay(events.filter((e) => !isBackgroundEvent(e))).keys()
          : [],
      ),
    [events],
  );

  return (
    <div
      className={className}
      style={{ fontFamily: theme.fontFamily, color: theme.text, overflowY: "auto", ...style }}
    >
      <div
        {...slot("grid", {
          base: {
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${minMonthWidth}px, 1fr))`,
          },
        })}
      >
        {months.map((month) => {
          const weeks = buildMonthWeeks(month, weekStartsOn, { hiddenDays });
          const monthLabel = format(month, "MMMM yyyy", { locale });
          const titleContent = format(month, "MMMM", { locale });
          return (
            <div key={month.toISOString()} {...slot("month", { base: { padding: 8 } })}>
              {onPressMonth ? (
                <button
                  type="button"
                  onClick={() => onPressMonth(month)}
                  aria-label={monthLabel}
                  {...slot("monthTitle", {
                    base: {
                      display: "block",
                      border: "none",
                      background: "transparent",
                      padding: "0 0 4px",
                      cursor: "pointer",
                      font: "inherit",
                      textAlign: "left",
                    },
                    themed: {
                      fontSize: 13,
                      fontWeight: 700,
                      color: theme.todayBackground,
                    },
                  })}
                >
                  {titleContent}
                </button>
              ) : (
                <div
                  role="heading"
                  aria-level={3}
                  aria-label={monthLabel}
                  {...slot("monthTitle", {
                    base: { paddingBottom: 4 },
                    themed: { fontSize: 13, fontWeight: 700, color: theme.todayBackground },
                  })}
                >
                  {titleContent}
                </div>
              )}
              <div
                {...slot("weekdays", {
                  base: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
                })}
              >
                {weekdayLabels.map((label, i) => (
                  <div
                    key={i}
                    aria-hidden
                    {...slot("weekday", {
                      base: { textAlign: "center" },
                      themed: { fontSize: 9, fontWeight: 600, color: theme.textMuted },
                    })}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div role="grid" aria-label={monthLabel}>
                {weeks.map((week) => (
                  <div
                    key={week[0].toISOString()}
                    role="row"
                    {...slot("week", {
                      base: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)" },
                    })}
                  >
                    {week.map((day) => {
                      // Adjacent-month days keep the grid shape but stay blank,
                      // like the mini months of other year views.
                      if (day.getMonth() !== month.getMonth()) {
                        return (
                          <div
                            key={day.toISOString()}
                            role="gridcell"
                            aria-hidden
                            style={{ aspectRatio: "1" }}
                          />
                        );
                      }
                      const isToday = getIsToday(day);
                      const isHighlighted = activeDate
                        ? isSameCalendarDay(day, activeDate)
                        : isToday;
                      const hasEvents = eventDays.has(startOfDay(day).toISOString());
                      // Selection/disabled flags come from core, so the year grid
                      // can't disagree with the month grid about a day's state.
                      const state = daySelectionState(
                        day,
                        { selectedDates, selectedRange },
                        { minDate, maxDate, isDateDisabled },
                      );
                      const dayTime = startOfDay(day).getTime();
                      const inCreate =
                        creating != null &&
                        dayTime >= Math.min(creating.anchor, creating.hover) &&
                        dayTime <= Math.max(creating.anchor, creating.hover);
                      const label = dayAccessibilityLabel({
                        dateLabel: format(day, "EEEE, d LLLL yyyy", { locale }),
                        isToday,
                        isSelected: state.isSelected,
                        isDisabled: state.isDisabled,
                        hasEvents,
                        labels,
                      });
                      // Today wins over a selection, matching the month grid.
                      const badge = dayBadgeKind(state, isHighlighted);
                      const daySlot = slot("day", {
                        base: {
                          position: "relative",
                          aspectRatio: "1",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          font: "inherit",
                          cursor: state.isDisabled
                            ? "default"
                            : onPressDay || sweepEnabled
                              ? "pointer"
                              : "default",
                          boxSizing: "border-box",
                          // The year grid scrolls vertically, so only the sideways
                          // axis is handed to the sweep: a vertical swipe still
                          // scrolls the months, a sideways drag sketches a range.
                          ...(sweepEnabled ? { touchAction: "pan-y" as const } : null),
                        },
                        themed: {
                          fontSize: 11,
                          color: state.isDisabled ? theme.textDisabled : theme.text,
                        },
                      });
                      const states = dataState({
                        // `data-today` states the fact; the activeDate highlight is
                        // visual only (themed), so the two can differ.
                        "data-today": isToday,
                        "data-events": hasEvents,
                        "data-selected": state.isSelected,
                        "data-range": state.isInRange,
                        "data-disabled": state.isDisabled,
                        "data-creating": inCreate,
                      });
                      // The range draws as a band behind the day badges. The mini
                      // cells sit flush in the grid, so per-cell segments read as one
                      // continuous strip; only the endpoints round their outer edge.
                      const bandKind = rangeBandKind(state, true);
                      const rounding = bandRounding(rangeBandKind(state, false));
                      const band =
                        bandKind === "none" ? null : (
                          <span
                            data-band
                            aria-hidden
                            {...slot("rangeBand", {
                              base: {
                                position: "absolute",
                                inset: 0,
                                zIndex: 0,
                                borderTopLeftRadius: rounding.start ? "50%" : 0,
                                borderBottomLeftRadius: rounding.start ? "50%" : 0,
                                borderTopRightRadius: rounding.end ? "50%" : 0,
                                borderBottomRightRadius: rounding.end ? "50%" : 0,
                              },
                              themed: { background: theme.rangeBackground },
                            })}
                          />
                        );
                      const dot = hasEvents ? (
                        <span
                          aria-hidden
                          {...slot("eventDot", {
                            base: {
                              position: "absolute",
                              bottom: 1,
                              left: "50%",
                              marginLeft: -1.5,
                              zIndex: 2,
                              width: 3,
                              height: 3,
                              borderRadius: 2,
                            },
                            themed: {
                              background:
                                badge === "none" ? theme.todayBackground : theme.todayText,
                            },
                          })}
                        />
                      ) : null;
                      const content = (
                        <>
                          {band}
                          <span
                            {...slot("dayBadge", {
                              base: {
                                position: "relative",
                                zIndex: 1,
                                width: "100%",
                                height: "100%",
                                borderRadius: "50%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              },
                              themed:
                                badge === "today"
                                  ? { background: theme.todayBackground, color: theme.todayText }
                                  : badge === "selected"
                                    ? {
                                        background: theme.selectedBackground,
                                        color: theme.selectedText,
                                      }
                                    : {},
                            })}
                          >
                            {day.getDate()}
                          </span>
                          {dot}
                        </>
                      );
                      // A disabled day is out of every selection, drag included, so
                      // it neither anchors a sweep nor extends one onto itself.
                      const sweepHandlers = sweepEnabled
                        ? {
                            onPointerDown: (e: ReactPointerEvent) => {
                              beginPress();
                              if (e.button === 0 && !state.isDisabled) beginCreate(day);
                            },
                            onPointerEnter: state.isDisabled ? undefined : () => extendCreate(day),
                          }
                        : null;
                      // Only a day that does something on click is a button: with
                      // just the sweep wired, a button per day would be a tab stop
                      // whose click and Enter do nothing.
                      return onPressDay ? (
                        <button
                          key={day.toISOString()}
                          type="button"
                          role="gridcell"
                          disabled={state.isDisabled}
                          aria-label={label}
                          onClick={() => {
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            onPressDay(day);
                          }}
                          {...sweepHandlers}
                          {...states}
                          {...daySlot}
                        >
                          {content}
                        </button>
                      ) : sweepEnabled ? (
                        <div
                          key={day.toISOString()}
                          role="gridcell"
                          aria-disabled={state.isDisabled || undefined}
                          aria-label={label}
                          {...sweepHandlers}
                          {...states}
                          {...daySlot}
                        >
                          {content}
                        </div>
                      ) : (
                        <div
                          key={day.toISOString()}
                          role="gridcell"
                          aria-label={label}
                          {...states}
                          {...daySlot}
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
