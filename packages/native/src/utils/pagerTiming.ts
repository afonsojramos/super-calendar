/**
 * How long an Android pager must go without a scroll event before a drag that
 * never reported its end is treated as released. Android sends no drag end, and
 * no touch events, when a parent view takes the touch mid-drag, and a finger held
 * still sends no scroll events either, so the two cannot be told apart.
 */
export const PAGER_HELD_DRAG_MS = 1000;
