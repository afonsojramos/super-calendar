import { format } from "date-fns";
import type { CalendarEvent, CalendarMode } from "../types";

/**
 * Minimum event-box height (px) before the built-in renderer shows the time line
 * on a narrow multi-column timed grid. Tied to the default theme's font sizes.
 */
export const MIN_BOX_HEIGHT_FOR_TIME = 56;

/** Hard-clip an overflowing title by default; opt into a trailing ellipsis. */
export function titleEllipsizeMode(ellipsizeTitle: boolean): "clip" | "tail" {
  return ellipsizeTitle ? "tail" : "clip";
}

/**
 * Screen-reader label for an event: its title followed by "all day" or its time
 * range (which the grid otherwise only conveys visually). Empty title is dropped.
 */
export function eventAccessibilityLabel(args: {
  title?: string;
  isAllDay: boolean;
  start: Date;
  end: Date;
  ampm: boolean;
  /** Spoken text for an all-day event. Default "all day". */
  allDayLabel?: string;
}): string {
  const timeFormat = args.ampm ? "h:mm a" : "HH:mm";
  const time = args.isAllDay
    ? (args.allDayLabel ?? "all day")
    : `${format(args.start, timeFormat)} to ${format(args.end, timeFormat)}`;
  return [args.title, time].filter(Boolean).join(", ");
}

/**
 * Context describing how an event is being rendered, passed to a consumer's
 * {@link EventAccessibilityLabeler} so the label can adapt to the view (e.g. omit
 * the time in month mode, or read the 12-hour clock when `ampm` is set).
 */
export interface EventAccessibilityLabelContext {
  /** The view the event is rendered in. */
  mode: CalendarMode;
  /** Whether the event sits in the all-day lane (or is an all-day event in month view). */
  isAllDay: boolean;
  /** Whether times are formatted as 12-hour AM/PM. */
  ampm: boolean;
}

/**
 * Override for an event's screen-reader label. Return the full text to announce
 * for `event`; each renderer uses it verbatim in place of the built-in
 * {@link eventAccessibilityLabel}. Shared by both renderers, so a custom label
 * reads the same on web and native.
 */
export type EventAccessibilityLabeler<T = unknown> = (
  event: CalendarEvent<T>,
  context: EventAccessibilityLabelContext,
) => string;

/**
 * Month cells and the all-day lane show a single clipped line; timed-grid titles
 * (`undefined`) wrap to fill the box.
 */
export function titleNumberOfLines(mode: CalendarMode, isAllDay: boolean): number | undefined {
  return mode === "month" || isAllDay ? 1 : undefined;
}

/**
 * The secondary line under the title in the built-in renderer, or `null` when
 * none should show. Timed events get their `start - end` range. An all-day event
 * gets the literal "All day" in the schedule (which has no all-day lane to
 * signal it positionally) and nothing on the day/week grid (the lane already
 * does). Month cells and `showTime={false}` always return `null`.
 */
export function eventTimeLabel(args: {
  mode: CalendarMode;
  isAllDay: boolean;
  start: Date;
  end: Date;
  ampm: boolean;
  showTime: boolean;
  /** Text for an all-day event in the schedule. Default "All day". */
  allDayLabel?: string;
}): string | null {
  if (!args.showTime || args.mode === "month") return null;
  if (args.isAllDay) return args.mode === "schedule" ? (args.allDayLabel ?? "All day") : null;
  const timeFormat = args.ampm ? "h:mm a" : "HH:mm";
  return `${format(args.start, timeFormat)} - ${format(args.end, timeFormat)}`;
}

/**
 * The default hour-axis label shared by both renderers' time grids, so the gutter
 * reads the same on each: 24-hour "HH:00" (e.g. "08:00"), or a compact 12-hour
 * "h AM/PM" (e.g. "8 AM") when `ampm` is set. Exported so a custom hour renderer
 * can reuse the same formatting.
 */
export function formatHour(hour: number, opts?: { ampm?: boolean }): string {
  if (opts?.ampm) {
    const period = hour < 12 ? "AM" : "PM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12} ${period}`;
  }
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Whether the time line fits in the box. The wide `day` column and contexts with
 * no live box height (e.g. schedule, where `boxHeightPx` is undefined) always
 * show it; narrow multi-column modes only once the box is at least
 * {@link MIN_BOX_HEIGHT_FOR_TIME} tall. Runs on the UI thread inside the event
 * renderer's animated style.
 */
export function isTimeVisibleAtHeight(
  boxHeightPx: number | undefined,
  mode: CalendarMode,
): boolean {
  "worklet";
  if (boxHeightPx == null || mode === "day") return true;
  return boxHeightPx >= MIN_BOX_HEIGHT_FOR_TIME;
}

/** Layout for the built-in timed-grid event chip at a given box height. */
export type EventChipLayout = {
  /**
   * Max whole title lines that fit in the box. `0` means "no clamp" (the box
   * height is unknown, e.g. the schedule), so the title may wrap freely.
   */
  titleMaxLines: number;
  /** Whether the secondary time line still has room below the title. */
  showTime: boolean;
};

/**
 * Lay out the built-in timed-grid event chip for a box of `boxHeightPx`: how
 * many whole title lines fit, and whether the time line still has room below
 * them. The title is primary, so the title fills the box in whole lines (never a
 * half-cropped line) and the time only shows once a full line is left over. Pass
 * `titleLineHeightPx`/`timeLineHeightPx` matching the rendered line heights so
 * the clamp lands on a line boundary.
 *
 * Worklet-safe, so the native renderer can drive the title's max-height on the UI
 * thread as the grid zooms; the dom renderer calls it with its static box height.
 * A `boxHeightPx` of `undefined` (the schedule has no live box height) returns
 * `titleMaxLines: 0` (no clamp) with the unconditional time visibility.
 */
export function eventChipLayout(args: {
  boxHeightPx: number | undefined;
  mode: CalendarMode;
  hasTime: boolean;
  titleLineHeightPx: number;
  timeLineHeightPx: number;
  paddingYPx: number;
}): EventChipLayout {
  "worklet";
  const wantTime = args.hasTime && isTimeVisibleAtHeight(args.boxHeightPx, args.mode);
  if (args.boxHeightPx == null || args.titleLineHeightPx <= 0) {
    return { titleMaxLines: 0, showTime: wantTime };
  }
  const inner = args.boxHeightPx - args.paddingYPx * 2;
  // Reserve the time line first, then give the title every whole line that fits
  // in what remains (always at least one line).
  const titleMaxLines = Math.max(
    1,
    Math.floor((inner - (wantTime ? args.timeLineHeightPx : 0)) / args.titleLineHeightPx),
  );
  // Only keep the time if a full line is still free under the clamped title, so a
  // short box drops the time rather than slicing it in half.
  const showTime =
    wantTime && inner - titleMaxLines * args.titleLineHeightPx >= args.timeLineHeightPx;
  return { titleMaxLines, showTime };
}

/** How many month-cell chips fit in the available height. */
export type MonthEventCapacity = {
  /** Count when every event fits, with no overflow label. */
  full: number;
  /** Count that leaves room for the "+N more" label. */
  withMore: number;
};

/**
 * Derive how many event chips fit in a month cell from the measured space.
 * `chipRowHeightPx` is one chip plus its gap; `moreRowHeightPx` is the overflow
 * label plus its gap. Both counts are clamped to >= 0.
 */
export function monthEventCapacity(
  availableHeightPx: number,
  chipRowHeightPx: number,
  moreRowHeightPx: number,
): MonthEventCapacity {
  if (chipRowHeightPx <= 0) return { full: 0, withMore: 0 };
  return {
    full: Math.max(0, Math.floor(availableHeightPx / chipRowHeightPx)),
    withMore: Math.max(0, Math.floor((availableHeightPx - moreRowHeightPx) / chipRowHeightPx)),
  };
}

/**
 * Chips to show for a day: all of them when they fit, otherwise `withMore` (at
 * least one) so the rest collapse into a "+N more" label.
 */
export function monthVisibleCount(total: number, capacity: MonthEventCapacity): number {
  if (total <= capacity.full) return total;
  return Math.max(1, capacity.withMore);
}
