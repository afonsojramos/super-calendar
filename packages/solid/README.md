# @super-calendar/solid

Calendar views and date pickers for Solid 2. The renderer uses Solid signals and
the React-free `@super-calendar/core/vanilla` entry. It does not require React,
React DOM, React Native, or Legend List.

This package is experimental and targets `solid-js@2.0.0-rc.20` and
`@solidjs/web@2.0.0-rc.20`. Install both exact versions. Solid 1 is not supported.

## Install

```sh
pnpm add @super-calendar/solid@experimental solid-js@2.0.0-rc.20 @solidjs/web@2.0.0-rc.20 date-fns
pnpm add -D @solidjs/vite-plugin@3.0.0-next.55 vite@^8
```

Configure the Solid 2 Vite plugin:

```ts
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";

export default defineConfig({ plugins: [solid({ ssr: true })] });
```

In `tsconfig.json`, set `jsx` to `preserve` and `jsxImportSource` to `@solidjs/web`.
Use `date-fns` 3 or 4. The package is ESM.

## Render a calendar

```tsx
import { createSignal } from "solid-js";
import { Calendar, type CalendarEvent } from "@super-calendar/solid";

export function Schedule() {
  const [date, setDate] = createSignal(new Date(2026, 10, 2));
  const [events, setEvents] = createSignal<CalendarEvent[]>([
    { title: "Planning", start: new Date(2026, 10, 2, 9), end: new Date(2026, 10, 2, 10) },
  ]);

  return (
    <Calendar
      date={date()}
      mode="week"
      events={events()}
      height={600}
      onChangeDate={setDate}
      onDragEvent={(event, start, end) => {
        setEvents((current) =>
          current.map((item) => (item === event ? { ...item, start, end } : item)),
        );
      }}
    />
  );
}
```

`Calendar` supports `month`, `week`, `day`, `3days`, `custom`, `schedule`, and
`year`. It expands recurring events and applies `timeZone`. Direct views accept
already expanded events, matching the React DOM renderer.

The exported components are `Calendar`, `TimeGrid`, `MonthView`, `MonthList`,
`YearView`, `Agenda`, `ResourceTimeline`, `DatePicker`, and `DateRangePicker`.
`MonthList` and `Agenda` measure and virtualize their rows. `ResourceTimeline`
supports horizontal and vertical layouts.

`MonthList` applies callback, date-constraint, theme, and slot updates to mounted
months, including when `date` and `events` keep the same references.

The web renderers share prop names, pointer gestures, keyboard navigation, and
the `classNames`/`styles` slot contract. Solid render callbacks return
`JSX.Element` from `@solidjs/web`. Read callback props inside JSX so updates remain
reactive. `ref` on `Calendar` or `TimeGrid` receives a `CalendarHandle` with
`scrollToTime(minutes, options?)`.

Only the pointer that starts a drag can move, finish, or cancel it. An additional
contact cancels a touch hold that has not started dragging yet.
Cancellation discards pending moves and event creation. `onSelectDrag` reports
selection live, so it does not roll back selection updates on cancellation.

`ResourceTimeline` keeps the grabbed event when other events are inserted or
reordered. Removing or replacing that event cancels its drag. Locked events
(`draggable: false`) remain clickable and keyboard accessible in both orientations.
In `TimeGrid` and `ResourceTimeline`, choose **Edit events**, then an event,
to open move and resize actions, committed through `onDragEvent`
like a drop. Rejected edits show a polite status message, customizable with
`labels.eventChangeRejected`. The chooser and dialog include both dates for
multi-day events. Pass `getEventId` to `Calendar`, `TimeGrid`, or `ResourceTimeline`
to keep editing across full data refreshes. Return a stable, unique string or
number per event or recurring occurrence; missing or duplicate IDs close the
dialog. Without this prop, full refreshes close it. See
[Move and resize actions](https://super-calendar.afonsojramos.me/guides/accessibility#move-and-resize-actions-web).
Removing a resource cancels creation in its lane. Losing pointer capture cancels
the active interaction.

## Select dates

```tsx
import { createSignal } from "solid-js";
import { MonthView, createDateRange } from "@super-calendar/solid";

export function Dates() {
  const [month] = createSignal(new Date(2026, 10, 1));
  const selection = createDateRange(() => ({ minDate: month() }));
  return (
    <MonthView
      date={month()}
      minDate={month()}
      selectedRange={selection.range() ?? undefined}
      onPressDay={selection.onPressDate}
      onSelectDrag={selection.selectRange}
    />
  );
}
```

`createDateRange(options?)` returns `range`, `setRange`, `onPressDate`,
`selectRange`, and `reset`. `range` is an accessor. Pass an options accessor for
reactive `minDate`, `maxDate`, or `isDateDisabled` constraints. `initialRange` is
read once.

`createMonthGrid(month, options?)` accepts accessors and returns an accessor for
the pure month-grid data. `createNow(options?)` returns a clock accessor and
cleans up its timer on disposal. Create these inside a Solid component or root.

`DatePicker` and `DateRangePicker` apply `theme` to both the popover chrome and
the calendar inside it. Theme updates apply while open, and per-slot styles take
precedence. Setting `disabled` closes an open popover; re-enabling the field
leaves it closed until you open it again. Opening a picker moves focus to the
selected day, and `Escape` returns it to the field.

## Load events

```tsx
import { Calendar, createEventSource } from "@super-calendar/solid";

export function Feed(props: { url: string; date: Date }) {
  const feed = createEventSource(
    () => props.url,
    () => ({ refetchIntervalMs: 60_000 }),
  );
  return (
    <>
      <button disabled={feed.loading()} onClick={() => void feed.refetch()}>
        Refresh
      </button>
      <p role="status">{feed.error()?.message}</p>
      <Calendar date={props.date} events={feed.events()} />
    </>
  );
}
```

`createEventSource(source, options?)` takes accessors. The source is a JSON/ICS
URL or an async function returning events. Options are `format`, `map`, and
`refetchIntervalMs`. Finite intervals greater than zero and no larger than
`2147483647` ms enable polling; other values disable it.
JSON feeds require an array with valid `start`/`end` date strings.
Recurrence `until`, `exdates`, and `rdates` are revived too. A custom `map` owns
validation and conversion of its event fields.

Source and options changes reload the feed. Previous events stay available during
loading or errors. Disposal aborts pending URL requests and stops polling; stale
custom-function results are ignored, and retained `refetch` calls do nothing.
Server rendering does not fetch. Use `loadEventSource({ source, format?, map?, signal? })`
to load one batch yourself, including on a server.

## Style the views

Use `theme` with `defaultSolidTheme`, `darkSolidTheme`, or
`mergeSolidTheme(overrides)`. `className` and `style` target the root element.
`classNames` and `styles` target named slots. A slot class replaces its themed
styles while retaining structural layout. Inline slot overrides apply last.
Numeric CSS lengths use pixels; unitless properties and CSS variables stay
unitless. No stylesheet import is required.

## Server rendering

The `solid` export condition exposes JSX source for your app's Solid compiler.
The Vite plugin compiles that source for the client or server. Enable `ssr: true`
when hydrating server HTML. The package also includes precompiled hydratable
browser and server entries for tools that use the `browser` or default condition.

Use matching initial dates, events, locale, and time zone on both sides. Pass a
fixed `now` when the clock must match during hydration. The server does not start
timers or access the DOM.

## Integration examples and troubleshooting

The [Solid guide](https://super-calendar.afonsojramos.me/guides/solid) includes
complete examples for controlled date pickers, resource bookings, and custom
events. `Calendar` uses `renderTimeEvent`, `renderMonthEvent`, and
`renderScheduleEvent`; direct views use `renderEvent`.

If updates stop, read accessors in JSX and update event arrays with signal
setters. Keep custom renderer props reactive by reading `props.event` in JSX.
For compilation errors, check the exact peer versions and compiler setup above.
For hydration mismatches, use `hydrate` with matching initial data and include
`generateHydrationScript()` before the client entry. See
[troubleshooting](https://super-calendar.afonsojramos.me/guides/solid#troubleshoot-an-integration).

## Run the example

From the repository root:

```sh
pnpm build
pnpm --filter @super-calendar/example-solid dev
```

Open `/` for client rendering or `/ssr` for server rendering and hydration.
Use `?view=month`, `?view=months`, or another view name to start in that view.
`pnpm test:solid:browser` starts its own server and isolated headless Chrome to
check both routes, gestures, pickers, and virtual scrolling.
`pnpm test:solid:browser:dist` repeats those checks against the built client and
server entries, plus the built React DOM resource timeline.
The **feed** view loads a local JSON feed and supports manual refresh.
`pnpm test:parity` runs all five Vitest projects. Shared web behavior tests live in
[`tests/web/contracts`](../../tests/web/README.md) and execute against both React
DOM and Solid through framework adapters. CI requires both runs to pass with the
same cases. Framework-specific checks remain separate, including React commit
counts, Solid renderer lifetimes, and SSR.

After `pnpm build`, run `pnpm test:browser` for shared React DOM/Solid browser
contracts. Vitest runs each case against both source and built packages, using
Playwright to drive Chrome. These checks cover live props, disabled pickers,
virtual scrolling, pointer capture, touch scrolling, and drag cancellation.
