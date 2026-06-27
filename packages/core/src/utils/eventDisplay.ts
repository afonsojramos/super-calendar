import { format } from "date-fns";
import type { CalendarMode } from "../types";

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
