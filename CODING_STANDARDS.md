# Coding standards for review

Use these checks when reviewing code. For each check that applies to the diff, identify the behavior the evidence covers and flag any gap.

## Interaction lifecycle

- On mount, check that interaction state, DOM refs, timers, and Reanimated shared values start in sync. Verify the first interaction with each optional callback present or absent.
- With the view mounted, enable and disable optional callbacks by switching between `undefined` and a function. Replace a function with a new identity. Check that handlers use the latest callback and that pending work stops when the feature is disabled.
- Toggle `isRTL` and `orientation` during an interaction. Check that geometry, pointer ownership, and pending work update together or that the interaction cancels cleanly.
- Remove a lane or item while a gesture or timer owns it. In React DOM, check `isConnected` before using a retained node. In Solid, check that `onCleanup` within the `<For>` item releases its refs, timers, and gesture state. Repeat at view unmount. Only the removed owner should be affected.
- Introduce a second contact with `isPrimary === false` during a pending hold and an active drag. Check that it cannot take over the primary contact or commit an action. Exercise both a second contact on the same item and one on another item.

## Interactions after a rebase

After each rebase onto `main`, check the touched files against each row. Exercise the applicable cases together when they share state in the same files.

| Case                 | What to verify                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getEventId` refresh | Replace event objects mid-interaction while keeping their IDs. The active event retains its identity, and the commit callback receives the refreshed object. |
| `isRTL`              | Exercise both directions. Visual movement and hit-testing agree with the logical date, and paging settles on the expected date.                              |
| **Keep date**        | Hold at the edge of the native TimeGrid while the example ignores `onChangeDate`. After the interaction ends, the pager settles on the controlled date.      |
| **Narrow**           | Resize the native example while the pager is resting and during an interaction. The page stays aligned, and hit-testing uses the new width.                  |

## Solid 2 reactivity

- The compute phase of `createEffect` uses `_equals: false`. For effects that bind DOM listeners, check that `createMemo` supplies callback-presence booleans. Changing callback identity alone should leave listeners in place, and invocation should read the latest callback.
- Solid's `spread` does not handle `on:*` event namespaces. Check that namespaced listeners use explicit JSX attributes such as `on:pointerdown`, or that direct DOM bindings have matching cleanup.
- Server rendering and initial hydration must create the same number and order of reactive owners that allocate hydration IDs. Check branches that depend on browser globals or layout. Verify the changed path with the Solid hydration checks in [the web test guide](tests/web/README.md).

## Browser event order

Require real Chromium contracts in [the Chromium contract directory](tests/web/browser/contracts/chromium/) for touch or pointer-capture changes. Under the W3C Pointer Events rules, implicit release after `pointerup` can fire `lostpointercapture` before `click`. jsdom does not reproduce that sequence. Check that ordinary capture loss preserves the pending tap and that `pointercancel` clears it. Verify the callback count and that a subsequent gesture still works.

## Library contracts

- Treat package `exports`, their types, and their entry points as public contracts. Check compatibility for consumers of each affected condition. Packaging changes need `attw` and `publint` evidence. For Solid's ESM-only package, check the `solid` source condition and both built entries, `browser` and default, after compiler or packaging changes.
- The `date-fns` peer range is `>=3`. Verify changed calls and their behavior with both v3 and v4.
- Native animation runs in Reanimated v4 worklets. Check worklet boundaries and UI-thread shared values. Use `runOnJS` to call JavaScript from a worklet. Check that a timer or queued callback cannot act on a gesture the UI thread has already released or cancelled.
- When a public export or behavior changes, verify that the guides in `docs/`, [the API reference](docs/reference/api.mdx), and the affected package `README.md` match the exported types and behavior.
