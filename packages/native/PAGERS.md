# Native pager event facts

`MonthPager` and `TimeGrid` page with a horizontal LegendList. Their drag, settle,
and page-back logic depends on how React Native and LegendList deliver events.
Each fact below caused a bug in a pager change. Check a change against this list,
and add to it when a device run disproves an assumption.

Facts were checked against React Native 0.86 and `@legendapp/list` 3.7.

## iOS

- `onMomentumScrollEnd` also fires after a programmatic `scrollToIndex`, even a
  non-animated one. Don't read it as the end of a user gesture.
- Gesture Handler reports a cancel (`onFinalize` with `success` false) when the
  view of an active gesture leaves the window, even for a moment. Fabric mounts
  the children of a view that is not a stacking context into its nearest
  ancestor that is, and `accessibilityElementsHidden` or a non-`auto`
  `importantForAccessibility` makes a view one. A `TimeGrid` page that toggled
  those with its active state therefore moved its events to a new parent on
  every page change, and an edge drag on iOS stopped after one page. Give such a
  view `collapsable={false}` so its children keep their parent.

- `onViewableItemsChanged` can report a page the list has already left. A
  `TimeGrid` page-back sent without an animation right after animated edge
  pages reported the target and then, about 0.4 s later, the last edge page
  (3 of 3 runs on a simulator). With no pending target, that tick read as a
  swipe back to the old week. `TimeGrid` reports a tick only for the page
  nearest the live offset (a page 90% in view is within a tenth of a page of
  it). An animated page-back reported its pages in scroll order (5 of 5 runs).

## Android

- When a scroll view starts its own drag, `JSTouchDispatcher.onChildStartedNativeGesture`
  sends JavaScript a `touchcancel` and drops the remaining touch events of that
  gesture. `onTouchCancel` on a pager therefore fires at the start of every
  swipe, not when a drag is abandoned. This holds while the
  `shouldTriggerResponderTransferOnScrollAndroid` feature flag is off, its
  default in 0.86.
- A `scrollTo` without an animation does not stop an animated one still
  running: `ReactHorizontalScrollView` cancels its fling animator only when it
  starts another (`startFlingAnimator`), so the earlier animation can land last.
  A `TimeGrid` page-back after a cancel once ended a page past the event's week
  (1 of 14 runs). This race is the likely cause, inferred from the source rather
  than traced; an edge page started after the page-back would also explain it.
  The page-back is now animated and the cancel stops pending edge pages first
  (12 of 12 runs correct).
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
- LegendList hardcodes `scrollEventThrottle: 0` on the underlying `ScrollView`
  and uses `props.scrollEventThrottle` only to wrap `props.onScroll` in a JS
  throttle with an uncancelled trailing `setTimeout`; it also skips notifying
  `props.onScroll` when forwarding `onScrollEndDrag` and `onMomentumScrollEnd`.
  On Android quick swipes in `TimeGrid`, a throttled or lagged `onScroll` offset
  (e.g. `181.38` pages while the pager settled on `182.00`) caused the idle
  check to snap back a week after `onMomentumScrollEnd` or fire a redundant snap
  just before it. `TimeGrid` omits `scrollEventThrottle` on the pager list
  (matching `MonthPager`), records the settled offset and drops the idle check
  when `onMomentumScrollEnd` lands on a page, and reads the native-only
  `nativePagerOffset` shared value (never written by `TimeGrid`) in
  `realignRestingPager`.
- A programmatic `scrollToIndex` can fail to land. With **Keep date** and a long
  edge hold on an Android emulator, the grid rested on the page the drag had
  paged to while the page-back to the kept page was the pending target (1 run
  in 6; the cause is not traced). The Android idle check sends such a target
  once more when the pager rests on another page. Whether iOS, which has no idle
  check, can land the same way is not known.
- On web, the public `onScroll` is held back until the initial scroll to
  `initialScrollIndex` finishes. Native never defers it.
- A page farther than `drawDistance` from the visible one unmounts, with every
  gesture detector on it. Gesture Handler then sends that gesture's active
  handlers nothing more, not even `onFinalize`. A held edge drag in `TimeGrid`
  pages away from the event it carries, so the grid pins that page with
  `alwaysRender` until the drag ends. Without the pin, the third page dropped
  the drag and left its floating copy on screen.
- `maintainVisibleContentPosition` anchors on an internal `ScrollAdjust` view.
  If Fabric flattens it (see Android above), paging after a resize briefly shows
  a blank page. See LegendApp/legend-list#619.

## Threads

- A finger lifts on the UI thread, and the release reaches JavaScript through
  `runOnJS` later. A JavaScript timer, such as the `TimeGrid` edge dwell, can
  fire in between and page the view after the release. Reading a shared value
  from JavaScript returns the UI thread's current value, so check one the
  gesture clears on release before acting.
- `scrollToIndex` moves the list at once, but `date` and anything derived from
  it change only after the app re-renders, and an app may keep its date, which
  pages the view back. Work that runs in between, such as a drop, waits for the
  render that carries the app's answer and then uses the page `date` names. A
  state update in a transition, like the date report's, lands in that render.
- On Android (Reanimated 4.5), an animated style update that the UI thread
  works out while the app is in the background can fail to reach the view, and
  later animated updates with the same values do not resend it. A drag the
  system cancels as the app goes to the background ends then: instrumented on an
  emulator, the shared values and the box's computed style were correct (shown,
  no offset) while the box stayed hidden after the app returned. The same writes
  made in the foreground, or after the app returned, showed the box, and so did
  a later change to its `left` and `width` (the example's **Narrow**). A React
  mount reaches the view, so `TimeGrid` restores a box that a drag hid by
  mounting it afresh.

## Verifying a pager change

Unit tests use a recording harness, not real scroll physics. Confirm gesture
changes on a device or emulator. In the native example (`examples/native`), the
development build shows **Narrow** (resizes the calendar) and **Keep date**
(ignores `onChangeDate`, so the pager pages back). To measure a short glitch,
record the screen and run `node scripts/device-frames.mjs <clip.mp4>`.
