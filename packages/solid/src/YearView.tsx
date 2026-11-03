import { type JSX } from "@solidjs/web";
import {
  bandRounding,
  buildMonthWeeks,
  type CalendarEvent,
  type CalendarLabels,
  type DateRange,
  type DateSelectionConstraints,
  dayAccessibilityLabel,
  dayBadgeKind,
  daySelectionState,
  filterHiddenDays,
  getIsToday,
  getWeekDays,
  getYearMonths,
  groupEventsByDay,
  isBackgroundEvent,
  isSameCalendarDay,
  monthCreateRange,
  rangeBandKind,
  resolveCalendarLabels,
  weekdayFormatToken,
  type WeekStartsOn,
} from "@super-calendar/core/vanilla";
import { format, type Locale, startOfDay } from "date-fns";
import { createEffect, createMemo, createSignal, For, untrack } from "solid-js";
import { withDefaults } from "./props";
import { createSlots, dataState, type SlotStyleProps } from "./slots";
import { css, type CSSProperties, type DomPointerEvent } from "./styles";
import { mergeSolidTheme, type SolidCalendarTheme } from "./theme";

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
   * `createDateRange`'s `selectRange` to drive `selectedRange`. Fires on every day the
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
  theme?: Partial<SolidCalendarTheme>;
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
export function YearView<T = unknown>(incoming: YearViewProps<T>): JSX.Element {
  const props = withDefaults(
    {
      weekStartsOn: 0,
      minMonthWidth: 150,
    } satisfies Partial<YearViewProps<T>>,
    incoming,
  );
  const theme = createMemo(() => mergeSolidTheme(props.theme));
  const labels = createMemo(() => resolveCalendarLabels(props.labels));
  const slot = createSlots<YearViewSlot>(props);

  // Drag-to-select / drag-to-create: press a day and sweep across others (mini
  // months included), released on a window pointerup so a drop anywhere commits.
  // `onSelectDrag` reports the span live, `onCreateEvent` once on release.
  const sweepEnabled = createMemo(() => props.onSelectDrag != null || props.onCreateEvent != null);
  const [creating, setCreating] = createSignal<{
    pointerId: number;
    anchor: number;
    hover: number;
  } | null>(null);
  const creatingRef: { current: ReturnType<typeof creating> } = { current: null };
  const applyCreating = (value: ReturnType<typeof creating>) => {
    creatingRef.current = value;
    setCreating(value);
  };
  const movedRef = {
    current: false,
  };
  // Set when a sweep commits, so the click the browser fires next doesn't also
  // open the day via onPressDay. A sweep that ends over a different cell than it
  // began on gets its trailing click on their common ancestor instead, where no
  // handler consumes the guard, so every fresh press clears it first.
  const suppressClickRef = {
    current: false,
  };
  const beginPress = (e: DomPointerEvent) => {
    if (creatingRef.current || e.isPrimary === false) return false;
    suppressClickRef.current = false;
    movedRef.current = false;
    return true;
  };
  const beginCreate = (day: Date, pointerId: number) => {
    const t = startOfDay(day).getTime();
    applyCreating({
      pointerId,
      anchor: t,
      hover: t,
    });
  };
  const extendCreate = (day: Date, pointerId: number) => {
    const current = creatingRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const t = startOfDay(day).getTime();
    if (t === current.hover) return;
    movedRef.current = true;
    applyCreating({ ...current, hover: t });
    const [lo, hi] = current.anchor <= t ? [current.anchor, t] : [t, current.anchor];
    props.onSelectDrag?.(new Date(lo), new Date(hi));
  };
  const isCreating = createMemo(() => creating() !== null);
  createEffect(
    () => [isCreating(), props.onCreateEvent],
    () =>
      untrack(() => {
        if (!isCreating()) return;
        const finish = (e: PointerEvent) => {
          const c = creatingRef.current;
          if (!c || c.pointerId !== e.pointerId) return;
          applyCreating(null);
          if (!movedRef.current) return;
          suppressClickRef.current = true;
          const range = monthCreateRange(new Date(c.anchor), new Date(c.hover));
          props.onCreateEvent?.(range.start, range.end);
        };
        const cancel = (e: PointerEvent) => {
          if (creatingRef.current?.pointerId !== e.pointerId) return;
          applyCreating(null);
          movedRef.current = false;
          suppressClickRef.current = true;
        };
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", cancel);
        return () => {
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", cancel);
        };
      }),
  );
  const months = createMemo(() => getYearMonths(props.date));
  const weekdayLabels = createMemo(() =>
    filterHiddenDays(getWeekDays(props.date, props.weekStartsOn), props.hiddenDays).map((d) =>
      format(d, weekdayFormatToken("narrow"), {
        locale: props.locale,
      }),
    ),
  );
  // Days that hold at least one event, keyed like `groupEventsByDay`.
  const eventDays = createMemo(
    () =>
      new Set(
        props.events && props.events.length > 0
          ? groupEventsByDay(props.events.filter((e) => !isBackgroundEvent(e))).keys()
          : [],
      ),
  );
  return (
    <div
      class={props.className}
      style={css({
        fontFamily: theme().fontFamily,
        color: theme().text,
        overflowY: "auto",
        ...props.style,
      })}
    >
      <div
        {...slot("grid", {
          base: {
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${props.minMonthWidth}px, 1fr))`,
          },
        })}
      >
        {
          <For each={months()} keyed={false}>
            {(month) => {
              const weeks = createMemo(() =>
                buildMonthWeeks(month(), props.weekStartsOn, {
                  hiddenDays: props.hiddenDays,
                }),
              );
              const monthLabel = createMemo(() =>
                format(month(), "MMMM yyyy", {
                  locale: props.locale,
                }),
              );
              const titleContent = createMemo(() =>
                format(month(), "MMMM", {
                  locale: props.locale,
                }),
              );
              return (
                <div
                  {...slot("month", {
                    base: {
                      padding: 8,
                    },
                  })}
                >
                  {props.onPressMonth ? (
                    <button
                      type="button"
                      onClick={() => props.onPressMonth?.(month())}
                      aria-label={monthLabel()}
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
                          color: theme().todayBackground,
                        },
                      })}
                    >
                      {titleContent()}
                    </button>
                  ) : (
                    <div
                      role="heading"
                      aria-level={3}
                      aria-label={monthLabel()}
                      {...slot("monthTitle", {
                        base: {
                          paddingBottom: 4,
                        },
                        themed: {
                          fontSize: 13,
                          fontWeight: 700,
                          color: theme().todayBackground,
                        },
                      })}
                    >
                      {titleContent()}
                    </div>
                  )}
                  <div
                    {...slot("weekdays", {
                      base: {
                        display: "grid",
                        gridTemplateColumns: "repeat(7, 1fr)",
                      },
                    })}
                  >
                    {
                      <For each={weekdayLabels()} keyed={false}>
                        {(label) => (
                          <div
                            aria-hidden="true"
                            {...slot("weekday", {
                              base: {
                                textAlign: "center",
                              },
                              themed: {
                                fontSize: 9,
                                fontWeight: 600,
                                color: theme().textMuted,
                              },
                            })}
                          >
                            {label()}
                          </div>
                        )}
                      </For>
                    }
                  </div>
                  <div role="grid" aria-label={monthLabel()}>
                    {
                      <For each={weeks()} keyed={false}>
                        {(week) => (
                          <div
                            role="row"
                            {...slot("week", {
                              base: {
                                display: "grid",
                                gridTemplateColumns: "repeat(7, 1fr)",
                              },
                            })}
                          >
                            {
                              <For each={week()} keyed={false}>
                                {(day) => {
                                  return (
                                    <>
                                      {(() => {
                                        // Adjacent-month days keep the grid shape but stay blank,
                                        // like the mini months of other year views.
                                        if (day().getMonth() !== month().getMonth()) {
                                          return (
                                            <div
                                              role="gridcell"
                                              aria-hidden="true"
                                              style={css({
                                                aspectRatio: "1",
                                              })}
                                            />
                                          );
                                        }
                                        const isToday = createMemo(() => getIsToday(day()));
                                        const isHighlighted = createMemo(() =>
                                          props.activeDate
                                            ? isSameCalendarDay(day(), props.activeDate)
                                            : isToday(),
                                        );
                                        const hasEvents = createMemo(() =>
                                          eventDays().has(startOfDay(day()).toISOString()),
                                        );
                                        // Selection/disabled flags come from core, so the year grid
                                        // can't disagree with the month grid about a day's state.
                                        const state = createMemo(() =>
                                          daySelectionState(
                                            day(),
                                            {
                                              selectedDates: props.selectedDates,
                                              selectedRange: props.selectedRange,
                                            },
                                            {
                                              minDate: props.minDate,
                                              maxDate: props.maxDate,
                                              isDateDisabled: props.isDateDisabled,
                                            },
                                          ),
                                        );
                                        const dayTime = createMemo(() =>
                                          startOfDay(day()).getTime(),
                                        );
                                        const inCreate = createMemo(() => {
                                          const currentCreating = creating();
                                          return (
                                            currentCreating != null &&
                                            dayTime() >=
                                              Math.min(
                                                currentCreating.anchor,
                                                currentCreating.hover,
                                              ) &&
                                            dayTime() <=
                                              Math.max(
                                                currentCreating.anchor,
                                                currentCreating.hover,
                                              )
                                          );
                                        });
                                        const label = createMemo(() =>
                                          dayAccessibilityLabel({
                                            dateLabel: format(day(), "EEEE, d LLLL yyyy", {
                                              locale: props.locale,
                                            }),
                                            isToday: isToday(),
                                            isSelected: state().isSelected,
                                            isDisabled: state().isDisabled,
                                            hasEvents: hasEvents(),
                                            labels: labels(),
                                          }),
                                        );
                                        // Today wins over a selection, matching the month grid.
                                        const badge = createMemo(() =>
                                          dayBadgeKind(state(), isHighlighted()),
                                        );
                                        const daySlot = createMemo(() =>
                                          slot("day", {
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
                                              cursor: state().isDisabled
                                                ? "default"
                                                : props.onPressDay || sweepEnabled()
                                                  ? "pointer"
                                                  : "default",
                                              boxSizing: "border-box",
                                              // The year grid scrolls vertically, so only the sideways
                                              // axis is handed to the sweep: a vertical swipe still
                                              // scrolls the months, a sideways drag sketches a range.
                                              ...(sweepEnabled()
                                                ? {
                                                    touchAction: "pan-y" as const,
                                                  }
                                                : null),
                                            },
                                            themed: {
                                              fontSize: 11,
                                              color: state().isDisabled
                                                ? theme().textDisabled
                                                : theme().text,
                                            },
                                          }),
                                        );
                                        const states = createMemo(() =>
                                          dataState({
                                            // `data-today` states the fact; the activeDate highlight is
                                            // visual only (themed), so the two can differ.
                                            "data-today": isToday(),
                                            "data-events": hasEvents(),
                                            "data-selected": state().isSelected,
                                            "data-range": state().isInRange,
                                            "data-disabled": state().isDisabled,
                                            "data-creating": inCreate(),
                                          }),
                                        );
                                        // The range draws as a band behind the day badges. The mini
                                        // cells sit flush in the grid, so per-cell segments read as one
                                        // continuous strip; only the endpoints round their outer edge.
                                        const bandKind = createMemo(() =>
                                          rangeBandKind(state(), true),
                                        );
                                        const rounding = createMemo(() =>
                                          bandRounding(rangeBandKind(state(), false)),
                                        );
                                        const band = createMemo(() =>
                                          bandKind() === "none" ? null : (
                                            <span
                                              data-band
                                              aria-hidden="true"
                                              {...slot("rangeBand", {
                                                base: {
                                                  position: "absolute",
                                                  inset: 0,
                                                  zIndex: 0,
                                                  borderTopLeftRadius: rounding().start ? "50%" : 0,
                                                  borderBottomLeftRadius: rounding().start
                                                    ? "50%"
                                                    : 0,
                                                  borderTopRightRadius: rounding().end ? "50%" : 0,
                                                  borderBottomRightRadius: rounding().end
                                                    ? "50%"
                                                    : 0,
                                                },
                                                themed: {
                                                  background: theme().rangeBackground,
                                                },
                                              })}
                                            />
                                          ),
                                        );
                                        const dot = createMemo(() =>
                                          hasEvents() ? (
                                            <span
                                              aria-hidden="true"
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
                                                    badge() === "none"
                                                      ? theme().todayBackground
                                                      : theme().todayText,
                                                },
                                              })}
                                            />
                                          ) : null,
                                        );
                                        const content = createMemo(() => (
                                          <>
                                            {band()}
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
                                                  badge() === "today"
                                                    ? {
                                                        background: theme().todayBackground,
                                                        color: theme().todayText,
                                                      }
                                                    : badge() === "selected"
                                                      ? {
                                                          background: theme().selectedBackground,
                                                          color: theme().selectedText,
                                                        }
                                                      : {},
                                              })}
                                            >
                                              {day().getDate()}
                                            </span>
                                            {dot()}
                                          </>
                                        ));
                                        // A disabled day is out of every selection, drag included, so
                                        // it neither anchors a sweep nor extends one onto itself.
                                        const sweepHandlers = createMemo(() =>
                                          sweepEnabled()
                                            ? {
                                                onPointerDown: (e: DomPointerEvent) => {
                                                  if (
                                                    e.button === 0 &&
                                                    !state().isDisabled &&
                                                    beginPress(e)
                                                  )
                                                    beginCreate(day(), e.pointerId);
                                                },
                                                onPointerEnter: state().isDisabled
                                                  ? undefined
                                                  : (e: DomPointerEvent) =>
                                                      extendCreate(day(), e.pointerId),
                                              }
                                            : null,
                                        );
                                        // Only a day that does something on click is a button: with
                                        // just the sweep wired, a button per day would be a tab stop
                                        // whose click and Enter do nothing.
                                        return props.onPressDay ? (
                                          <button
                                            type="button"
                                            role="gridcell"
                                            disabled={state().isDisabled}
                                            aria-label={label()}
                                            onClick={() => {
                                              if (suppressClickRef.current) {
                                                suppressClickRef.current = false;
                                                return;
                                              }
                                              props.onPressDay?.(day());
                                            }}
                                            {...sweepHandlers()}
                                            {...states()}
                                            {...daySlot()}
                                          >
                                            {content()}
                                          </button>
                                        ) : sweepEnabled() ? (
                                          <div
                                            role="gridcell"
                                            aria-disabled={
                                              (state().isDisabled || undefined) == null
                                                ? undefined
                                                : state().isDisabled || undefined
                                                  ? "true"
                                                  : "false"
                                            }
                                            aria-label={label()}
                                            {...sweepHandlers()}
                                            {...states()}
                                            {...daySlot()}
                                          >
                                            {content()}
                                          </div>
                                        ) : (
                                          <div
                                            role="gridcell"
                                            aria-label={label()}
                                            {...states()}
                                            {...daySlot()}
                                          >
                                            {content()}
                                          </div>
                                        );
                                      })()}
                                    </>
                                  );
                                }}
                              </For>
                            }
                          </div>
                        )}
                      </For>
                    }
                  </div>
                </div>
              );
            }}
          </For>
        }
      </div>
    </div>
  );
}
