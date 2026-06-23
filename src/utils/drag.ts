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
