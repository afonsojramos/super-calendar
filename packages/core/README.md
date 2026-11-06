# @super-calendar/core

[![npm](https://img.shields.io/npm/v/@super-calendar/core?style=flat-square&color=1F6FEB)](https://www.npmjs.com/package/@super-calendar/core) [![JSR](https://img.shields.io/jsr/v/@super-calendar/core?style=flat-square&label=JSR&color=F7DF1E)](https://jsr.io/@super-calendar/core) [![npmx](https://img.shields.io/badge/npmx-view-8A2BE2?style=flat-square)](https://npmx.dev/package/@super-calendar/core)

The render-agnostic core of [super-calendar](https://github.com/afonsojramos/super-calendar): date math, the selection model, event layout, the month-grid builder, the headless hooks, and the neutral theme tokens.

It imports nothing from React Native, react-dom, Reanimated, Gesture Handler, or Legend List, so it bundles into any renderer. Use it to drive your own UI, or pair it with [`@super-calendar/dom`](https://www.npmjs.com/package/@super-calendar/dom) (react-dom) or [`@super-calendar/native`](https://www.npmjs.com/package/@super-calendar/native) (React Native).

## Install

```sh
npm install @super-calendar/core
```

Also on [JSR](https://jsr.io/@super-calendar/core): `deno add jsr:@super-calendar/core`.

Peer dependencies: `date-fns` (>=3) and optional `react` (>=18).
The root entry includes React hooks and requires React at runtime. Use
`@super-calendar/core/vanilla` for pure logic without React:

```ts
import { buildMonthGrid, layoutDayEvents, nextDateRange } from "@super-calendar/core/vanilla";
```

The vanilla entry exports the pure types, date calculations, selection, layout,
recurrence, time-zone, iCalendar, presentation, and theme-token utilities. It
also exports the framework-independent `loadEventSource` loader. It excludes
React hooks and providers. Existing root imports remain supported.
`@super-calendar/solid` uses this entry for its Solid 2 renderer.

## Usage

Build a fully custom month grid from the headless `useMonthGrid` hook. It returns the weeks, the weekday headers, and per-day state for you to render however you like.

```tsx
import { useMonthGrid } from "@super-calendar/core";

function MyGrid({ month }: { month: Date }) {
  const { weeks, weekdays } = useMonthGrid(month, { weekStartsOn: 1 });

  return weeks.map((week) =>
    week.days.map((day) => (
      // day carries isToday / isSelected / isInRange / isDisabled / isCurrentMonth
      <DayCell key={day.date.toISOString()} day={day} />
    )),
  );
}
```

Manage single, multiple, or range selection with `useDateRange`:

```ts
import { useDateRange } from "@super-calendar/core";

const range = useDateRange({ minDate: new Date() });
```

For a custom time-grid drag, `clampMoveStartMinutes` keeps the moved event's
start inside the visible hour window while allowing its unchanged duration to
carry the end past midnight:

```ts
import { clampMoveStartMinutes } from "@super-calendar/core";

const startMinutes = clampMoveStartMinutes(rawStartMinutes, minHour, maxHour, snapMinutes);
```

To position your own marks on a time grid, `wallClockHours(date, dayStart, nextDayStart)`
returns the fractional clock hour, clamped to the day. It matches `layoutDayEvents`,
which places events by clock time so they line up with the hour labels on a
daylight saving change day. `clockHoursBetween(from, to)` returns how many rows a
span covers.

Use `resolveDraggedBounds` to commit a move or resize. Equal start and end deltas
move the event while preserving elapsed duration, including across daylight
saving changes. For a resize, pass zero for the edge you want to keep fixed.

`CalendarEvent<T>` includes an optional `dragHandleColor: string` for the native
renderer's time-grid and resource-timeline resize grips. When omitted, those
grips use `theme.colors.eventText`. Core preserves the field without interpreting it.

`CalendarLabels` supplies shared accessibility and editing text. The optional
`editEvents` and `eventActions(title)` fields name the web event chooser and its
move and resize dialog. `eventChangeRejected` supplies the web dialog's rejection
message (default "This change is not allowed."). `resolveCalendarLabels` fills omitted labels with English
defaults from `defaultCalendarLabels`.

## Multi-week grids

`buildMultiWeekGrid` is available from both core entries. It builds consecutive
full weeks without month padding or hourly slots.

```ts
import { buildMultiWeekGrid } from "@super-calendar/core/vanilla";

const grid = buildMultiWeekGrid(new Date(2026, 11, 28), {
  numberOfWeeks: 3,
  weekStartsOn: 1,
  hiddenDays: [0, 6],
});
console.log(grid.weeks, grid.period, grid.visibleRange);
```

`numberOfWeeks` defaults to `2` and must be a positive safe integer. Invalid
dates, invalid counts, and spans outside JavaScript's date range throw
`RangeError` before allocating rows. The builder materializes O(7 × N) days.
`period` covers full weeks; `visibleRange` gives the chronological visible
endpoints after hidden weekdays. Both use `{ start, endExclusive }`. RTL reverses
row display only. `MultiWeekGridDay` has the month builder's day state without
`isCurrentMonth`; `MultiWeekGridWeek.id` uses the unfiltered week start.
`getViewDays` and `viewDayCount` reject `multiweek`, so use this builder for it.

## Recurrence limits

Recurring-event expansion stops at JavaScript's date limits and omits occurrences
whose end would overflow.

## Event sources

`loadEventSource({ source, format?, map?, signal? })` loads one JSON or iCalendar
batch without React. Import it from `@super-calendar/core/vanilla` or the root
entry. `source` accepts a URL or an async function returning events. URL requests
accept an `AbortSignal`. The loader rejects HTTP errors and malformed JSON events;
the default mapper revives `start`, `end`, and recurrence dates. Custom mappers
receive an unknown array and own their validation and date conversion.

The React `useEventSource(source, options?)` hook adds `events`, `loading`,
`error`, and `refetch`. A failed refresh keeps the last successful batch.
`refetchIntervalMs` enables polling for finite values greater than zero and no
larger than `2147483647` ms. Other values disable it. Unmounting aborts
pending URL requests, stops polling, and disables retained `refetch` callbacks.
Solid consumers use `createEventSource` from `@super-calendar/solid`.

## Documentation

See the [full documentation](https://super-calendar.afonsojramos.me) and the [API reference](https://super-calendar.afonsojramos.me/reference/api).

## License

MIT
