import { format, startOfDay, type Locale } from "date-fns";
import type { CSSProperties, ReactElement } from "react";
import { useMemo } from "react";
import {
  buildMonthWeeks,
  type CalendarEvent,
  getIsToday,
  getWeekDays,
  getYearMonths,
  groupEventsByDay,
  isBackgroundEvent,
  isSameCalendarDay,
  type WeekStartsOn,
  weekdayFormatToken,
} from "@super-calendar/core";
import { createSlots, dataState, type SlotStyleProps } from "./slots";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/**
 * Styleable parts of {@link YearView}. Pass a class or inline style per slot
 * via the `classNames` / `styles` props; day cells carry `data-today` and
 * `data-events` state attributes for variants.
 */
export type YearViewSlot =
  | "grid"
  | "month"
  | "monthTitle"
  | "weekdays"
  | "weekday"
  | "week"
  | "day"
  | "eventDot";

/** Props for {@link YearView}, the twelve mini-month year grid. */
export interface YearViewProps<T = unknown> extends SlotStyleProps<YearViewSlot> {
  /** Any date inside the year to render. */
  date: Date;
  /** Days holding at least one event get a dot. Omit for a plain year. */
  events?: CalendarEvent<T>[];
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  locale?: Locale;
  /** Highlight this date instead of the real "today". */
  activeDate?: Date;
  /**
   * Smallest width a mini month may take before the grid drops a column
   * (default 150). The grid fits as many columns as the container allows.
   */
  minMonthWidth?: number;
  /** Tap a day cell (e.g. to drill into the day or month view). */
  onPressDay?: (date: Date) => void;
  /** Tap a month's title (e.g. to jump to that month's view). */
  onPressMonth?: (month: Date) => void;
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
  locale,
  activeDate,
  minMonthWidth = 150,
  onPressDay,
  onPressMonth,
  theme: themeOverrides,
  className,
  style,
  classNames,
  styles,
}: YearViewProps<T>): ReactElement {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const slot = createSlots<YearViewSlot>({ classNames, styles });

  const months = useMemo(() => getYearMonths(date), [date]);
  const weekdayLabels = useMemo(
    () =>
      getWeekDays(date, weekStartsOn).map((d) =>
        format(d, weekdayFormatToken("narrow"), { locale }),
      ),
    [date, weekStartsOn, locale],
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
          const weeks = buildMonthWeeks(month, weekStartsOn);
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
                      const isHighlighted = activeDate
                        ? isSameCalendarDay(day, activeDate)
                        : getIsToday(day);
                      const hasEvents = eventDays.has(startOfDay(day).toISOString());
                      const label = `${format(day, "EEEE, d LLLL yyyy", { locale })}${
                        getIsToday(day) ? ", today" : ""
                      }${hasEvents ? ", has events" : ""}`;
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
                          cursor: onPressDay ? "pointer" : "default",
                          boxSizing: "border-box",
                        },
                        themed: {
                          fontSize: 11,
                          borderRadius: "50%",
                          ...(isHighlighted
                            ? { background: theme.todayBackground, color: theme.todayText }
                            : { color: theme.text }),
                        },
                      });
                      const states = dataState({
                        // `data-today` states the fact; the activeDate highlight is
                        // visual only (themed), so the two can differ.
                        "data-today": getIsToday(day),
                        "data-events": hasEvents,
                      });
                      const dot = hasEvents ? (
                        <span
                          aria-hidden
                          {...slot("eventDot", {
                            base: {
                              position: "absolute",
                              bottom: 1,
                              left: "50%",
                              marginLeft: -1.5,
                              width: 3,
                              height: 3,
                              borderRadius: 2,
                            },
                            themed: {
                              background: isHighlighted ? theme.todayText : theme.todayBackground,
                            },
                          })}
                        />
                      ) : null;
                      return onPressDay ? (
                        <button
                          key={day.toISOString()}
                          type="button"
                          role="gridcell"
                          onClick={() => onPressDay(day)}
                          aria-label={label}
                          {...states}
                          {...daySlot}
                        >
                          {day.getDate()}
                          {dot}
                        </button>
                      ) : (
                        <div
                          key={day.toISOString()}
                          role="gridcell"
                          aria-label={label}
                          {...states}
                          {...daySlot}
                        >
                          {day.getDate()}
                          {dot}
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
