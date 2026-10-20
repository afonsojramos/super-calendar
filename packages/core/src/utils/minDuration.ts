// Minimum duration (in hours) a positioned event is given, so a zero/negative
// span still occupies a sliver rather than collapsing to nothing. Internal: the
// layout and the drag previews share it, and it isn't part of the public API.
export const MIN_DURATION_HOURS = 0.25;
