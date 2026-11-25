/**
 * Helpers for a row of chronological day columns shown right to left. They mirror
 * only what is physical: screen x, arrow keys, and which edge of a bar is cut off.
 */

/**
 * Days a horizontal arrow key moves: ArrowRight goes to the next day and ArrowLeft
 * to the previous one, mirrored under RTL so each key follows the screen. Other
 * keys return 0.
 */
export function arrowKeyDayStep(key: string, isRTL = false): -1 | 0 | 1 {
  const step = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  return step === 0 ? 0 : isRTL ? (-step as -1 | 1) : step;
}

/**
 * The chronological column under a point `x` pixels from the left edge of a row
 * of `count` equal columns, each `columnWidth` wide. Under RTL the first column is
 * on the right. Not clamped: a point outside the row returns a column outside
 * `0..count-1`.
 */
export function columnAtX(x: number, columnWidth: number, count: number, isRTL = false): number {
  const fromLeft = Math.floor(x / columnWidth);
  return isRTL ? count - 1 - fromLeft : fromLeft;
}

/**
 * A bar's `continuesBefore` / `continuesAfter` as the edges it is cut off at on
 * screen: before is the left edge and after the right one. Laid out from
 * chronological columns, the flags name the first and last day, so RTL swaps them.
 * Use `startsBeforeVisible` to ask whether the event started earlier.
 */
export function screenContinues(
  segment: { continuesBefore: boolean; continuesAfter: boolean },
  isRTL = false,
): { continuesBefore: boolean; continuesAfter: boolean } {
  return isRTL
    ? { continuesBefore: segment.continuesAfter, continuesAfter: segment.continuesBefore }
    : { continuesBefore: segment.continuesBefore, continuesAfter: segment.continuesAfter };
}
