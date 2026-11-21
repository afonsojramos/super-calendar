# Native pager event facts

`MonthPager` and `TimeGrid` page with a horizontal LegendList. Their drag, settle,
and page-back logic depends on how React Native and LegendList deliver events.
Each fact below caused a bug in a pager change. Check a change against this list,
and add to it when a device run disproves an assumption.

Facts were checked against React Native 0.86 and `@legendapp/list` 3.7.

## iOS

- `onMomentumScrollEnd` also fires after a programmatic `scrollToIndex`, even a
  non-animated one. Don't read it as the end of a user gesture.

## Android

- When a scroll view starts its own drag, `JSTouchDispatcher.onChildStartedNativeGesture`
  sends JavaScript a `touchcancel` and drops the remaining touch events of that
  gesture. `onTouchCancel` on a pager therefore fires at the start of every
  swipe, not when a drag is abandoned.
- `ReactHorizontalScrollView` emits `onScrollEndDrag` only on `ACTION_UP` while
  dragging. A drag that a parent view takes over, or that ends in
  `ACTION_CANCEL`, sends no end event. The pagers release a held page-back after
  `PAGER_HELD_DRAG_MS` (`src/utils/pagerTiming.ts`) without scroll events.
- Fabric flattens a plain `View` inside a horizontal `ScrollView` even when the
  parent sets `collapsableChildren`, because `AndroidHorizontalScrollContentView`
  ignores it. A view that must stay native, such as a scroll anchor, needs
  `collapsable={false}`. On iOS the content view is a plain `View`, which honours
  `collapsableChildren`.

## LegendList

- `onViewableItemsChanged` fires only when the set of visible pages changes.
  Settling back onto the page you started from sends nothing.
- The public `onScroll` is deferred on web only.
- `maintainVisibleContentPosition` anchors on an internal `ScrollAdjust` view.
  If Fabric flattens it (see Android above), paging after a resize briefly shows
  a blank page. See LegendApp/legend-list#619.

## Verifying a pager change

Unit tests use a recording harness, not real scroll physics. Confirm gesture
changes on a device or emulator. In the native example (`examples/native`), the
development build shows **Narrow** (resizes the calendar) and **Keep date**
(ignores `onChangeDate`, so the pager pages back). To measure a short glitch,
record the screen and run `node scripts/device-frames.mjs <clip.mp4>`.
