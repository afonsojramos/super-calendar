# Shared web tests

Write behavior shared by React DOM and Solid in `contracts/`. Vitest discovers
each `*.test.tsx` file in both projects, compiles its JSX for that framework, and
maps `@calendar-test/renderer` to the corresponding adapter in `adapters/`.
Both runs exercise the real calendar components with the same assertions.

```tsx
import { vi } from "vitest";
import { MonthView, fireEvent, render, rendererName } from "@calendar-test/renderer";

describe(rendererName, () => {
  it("reports the selected day", () => {
    const onPressDay = vi.fn();
    const view = render(MonthView, {
      date: new Date(2026, 6, 1),
      onPressDay,
    });
    fireEvent.click(view.getByLabelText("Wednesday, 15 July 2026"));
    expect(onPressDay).toHaveBeenCalledWith(new Date(2026, 6, 15));
  });
});
```

Use `render(Component, props)` to mount and `view.rerender(props)` to replace
props. Import events and `act` from the adapter so updates flush through React
or Solid. The controlled picker and time-grid fixtures own state using each
framework's primitives. `renderNow` and `renderEventSource` expose live readers
for equivalent hook and signal behavior. Shared files are typechecked against
both adapters.

Keep assertions here and framework wiring in the adapters. Put framework-specific
lifecycle, performance, and SSR tests beside that renderer's source. Native
gesture tests stay in the native project. Avoid renderer conditionals or skips
in shared tests.

jsdom cannot measure layout. The React adapter retains the existing Legend List
row-cache stand-in; Solid uses its real virtual list. Browser checks cover real
layout, scrolling, pointer capture, and touch-action styles.

The jsdom version is pinned to 26.1.0. Releases 27.4.0, 29.1.1, and 30.1.3
retain background longhands after `style.removeProperty("background")`, even on
a plain element. Preserve the background-removal assertions when updating it.
The pointer-event setup supplies the same primary-mouse defaults to both
renderers; explicit touch, pen, and secondary-pointer values take precedence.

Run a single contract for both renderers:

```sh
pnpm exec vitest run --project dom --project solid tests/web/contracts/MonthView.test.tsx
```

Run `pnpm test:parity` for all five projects and the CI parity gate. The gate
requires every shared file to pass once for each renderer, with identical case
names and counts, including expanded parameterized tests. It rejects missing
runs, skipped cases, and duplicate runs of the same adapter.

## Browser contracts

Put behavior that needs layout, scrolling, or real pointer input in
`browser/contracts/`. These are Vitest tests too. Playwright is the browser
driver; Vitest owns discovery, lifecycle, assertions, and results.

`browser/fixtures/Fixture.tsx` is compiled for each framework using the adapters
beside it. The fixture mounts real calendar components and virtual lists. The
shared session starts an isolated Vite server, dependency cache, and browser
instance for each project, and a fresh page for each case. Browser errors and
warnings fail the test.

```sh
pnpm build
pnpm test:browser
```

The browser parity gate runs both renderers' source and built entries in Chromium,
Firefox, and WebKit, for twelve projects. The tests verify
that the browser loads the selected source or built entry. Keep assertions
shared across projects; add framework wiring to the fixture adapters. Real touch
scroll/hold tests live in `browser/contracts/chromium/` because they use Chromium's
input protocol. They must pass for all four renderer/artifact combinations;
the gate rejects missing or skipped cases in either group. WebKit testing does
not replace physical iOS or Android gesture checks.

The session uses system Chrome when available. Set `CHROME` to an executable
path to choose another Chromium installation. Install the browser engines with
`pnpm exec playwright install chromium firefox webkit` (add `--with-deps` on
Linux). Run one project while iterating:

```sh
pnpm exec vitest run --config vitest.browser.config.mts --project solid-source-webkit
```

The Solid-specific browser scripts still check server rendering and hydration.
Shared browser contracts complement those checks and the device gesture workflow.

Accessibility cases use axe alongside real keyboard and focus assertions. Axe
detects common semantic and contrast failures; it does not replace screen-reader
testing. Browser errors and application warnings fail the shared tests. Two
Firefox browser diagnostics about tracking and scroll-linked positioning are
excluded; failed module loads still fail the test.
