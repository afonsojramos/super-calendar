/**
 * Minutes to shift an event, snapping a vertical pixel drag to the nearest
 * `stepMinutes`. Runs on the UI thread inside the drag gesture. Returns 0 for a
 * degenerate grid (non-positive height/step).
 */
export function snapDeltaMinutes(
  translationPx: number,
  cellHeightPx: number,
  stepMinutes: number,
): number {
  "worklet";
  if (cellHeightPx <= 0 || stepMinutes <= 0) return 0;
  const rawMinutes = (translationPx / cellHeightPx) * 60;
  return Math.round(rawMinutes / stepMinutes) * stepMinutes;
}

/** A copy of `date` shifted by `minutes` (may be negative). */
export function shiftMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

/**
 * Resolve a committed drag into the event's new bounds: `start` shifts by
 * `deltaStartMinutes`, `end` by `deltaEndMinutes` (a move passes the same delta
 * to both; a resize passes 0 for the start). Returns `null` only when the change
 * would *shrink* the event below one `snapMinutes` step, so a resize can't commit
 * a degenerate duration; a pure move (both deltas equal) keeps its duration and is
 * never rejected, even for an already sub-step event. Pure, so the commit path is
 * unit-testable without a running gesture.
 */
export function resolveDraggedBounds(
  start: Date,
  end: Date,
  deltaStartMinutes: number,
  deltaEndMinutes: number,
  snapMinutes: number,
): { start: Date; end: Date } | null {
  const nextStart = shiftMinutes(start, deltaStartMinutes);
  const nextEnd = shiftMinutes(end, deltaEndMinutes);
  const oldDuration = end.getTime() - start.getTime();
  const newDuration = nextEnd.getTime() - nextStart.getTime();
  // Reject only a shrink past one step — never a move, which preserves duration.
  if (newDuration < snapMinutes * 60_000 && newDuration < oldDuration) return null;
  return { start: nextStart, end: nextEnd };
}

/**
 * The start/end of a new event swept out on `day` by dragging from `startPx` to
 * `endPx` (vertical pixels from the grid's top, i.e. the `minHour` line). Both
 * ends snap to `snapMinutes`; the range is ordered (drag up or down) and widened
 * to at least one step so a stationary press still yields a usable event.
 * Returns `null` for a degenerate grid (non-positive height/step). Pure, so the
 * commit path is unit-testable without a running gesture.
 */
export function cellRangeFromDrag(
  day: Date,
  startPx: number,
  endPx: number,
  cellHeightPx: number,
  minHour: number,
  snapMinutes: number,
): { start: Date; end: Date } | null {
  if (cellHeightPx <= 0 || snapMinutes <= 0) return null;
  const snapAt = (px: number) => {
    const rawMinutes = (minHour + px / cellHeightPx) * 60;
    return Math.round(rawMinutes / snapMinutes) * snapMinutes;
  };
  const MAX = 24 * 60;
  let lower = Math.max(0, Math.min(MAX - snapMinutes, snapAt(startPx)));
  let upper = Math.max(0, Math.min(MAX, snapAt(endPx)));
  if (upper < lower) [lower, upper] = [upper, lower];
  // Keep the range at least one step wide without spilling past midnight.
  if (upper - lower < snapMinutes) upper = Math.min(MAX, lower + snapMinutes);
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  start.setMinutes(lower);
  const end = new Date(day);
  end.setHours(0, 0, 0, 0);
  end.setMinutes(upper);
  return { start, end };
}
