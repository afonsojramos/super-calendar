# @super-calendar/dom

[![npm](https://img.shields.io/npm/v/@super-calendar/dom?style=flat-square&color=1F6FEB)](https://www.npmjs.com/package/@super-calendar/dom) [![JSR](https://img.shields.io/jsr/v/@super-calendar/dom?style=flat-square&label=JSR&color=F7DF1E)](https://jsr.io/@super-calendar/dom) [![npmx](https://img.shields.io/badge/npmx-view-8A2BE2?style=flat-square)](https://npmx.dev/package/@super-calendar/dom)

The react-dom renderer for [super-calendar](https://github.com/afonsojramos/super-calendar): a virtualized **month / week / day** calendar and date picker built from real DOM components. No React Native, no react-native-web.

It is built on the headless [`@super-calendar/core`](https://www.npmjs.com/package/@super-calendar/core) and Legend List's DOM renderer.

## Install

```sh
npm install @super-calendar/dom
```

Also on [JSR](https://jsr.io/@super-calendar/dom): `deno add jsr:@super-calendar/dom`.

Peer dependencies: `@legendapp/list` (>=3), `date-fns` (>=3), `react` (>=19), and `react-dom` (>=19).

## Usage

```tsx
import { useState } from "react";
import { Calendar, type CalendarEvent } from "@super-calendar/dom";

type MyEvent = { id: string; color: string };

const events: CalendarEvent<MyEvent>[] = [
  {
    id: "1",
    color: "#1F6FEB",
    title: "Lecture",
    start: new Date(2026, 5, 19, 10, 0),
    end: new Date(2026, 5, 19, 11, 30),
  },
];

export function MyCalendar() {
  const [date, setDate] = useState(new Date());

  return (
    <Calendar
      mode="week"
      date={date}
      events={events}
      weekStartsOn={1}
      onPressDay={setDate}
      onPressEvent={(event) => console.log(event.id)}
    />
  );
}
```

For a custom picker, pair the headless hooks (`useDateRange`, `useMonthGrid`) with `MonthList` and `TimeGrid`, all re-exported from this package.

`DatePicker` and `DateRangePicker` apply `theme` to both the popover chrome and
the calendar inside it. Theme updates apply while open, and per-slot styles take
precedence. Setting `disabled` closes an open popover; re-enabling the field
leaves it closed until you open it again.

`MonthList` applies callback, date-constraint, theme, and slot updates to mounted
months, including when `date` and `events` keep the same references.

## Touch event gestures

Touch and pen on `TimeGrid` wait for a 300 ms hold within 8 px before dragging.
A tap presses the event from its click; a vertical swipe scrolls the grid.
Additional contacts cancel pending holds and cannot take over an active drag.
Set `touchDragDelay` and `touchDragThreshold` on `TimeGrid` or `Calendar` to adjust
the hold. Mouse drag and resize retain their existing behavior. See the
[dragging guide](https://super-calendar.afonsojramos.me/guides/dragging).

## Multi-week grids

Use `mode="multiweek"` with `numberOfWeeks` (default `2`) for consecutive full
week rows without hourly slots. The first week contains `date` and aligns to
`weekStartsOn`. Navigation moves by the full number of weeks. `hiddenDays` only
shortens rows; `custom` views remain hourly even above seven columns.

```tsx
import { useState } from "react";
import { Calendar } from "@super-calendar/dom";

export function MultiWeekCalendar() {
  const [date, setDate] = useState(new Date(2026, 11, 28));
  return (
    <Calendar
      mode="multiweek"
      numberOfWeeks={3}
      weekStartsOn={1}
      date={date}
      onChangeDate={setDate}
      events={[]}
      height={480}
    />
  );
}
```

`MultiWeekView` exposes a standalone window with the month grid's event bars,
overflow, selection, drag interactions, and styling. Pass expanded events to it;
`Calendar` handles recurrence and time zones. Custom event renderers receive
`mode: "multiweek"`. Rows scroll vertically when the container is too short.
Event chips and overflow buttons default to 24 pixels high; use `chipHeight` to customize them.
Counts must be positive safe integers whose date span is representable; invalid
counts or dates throw `RangeError`. Rows are materialized, so larger counts need
more space. `MonthView` retains its month-only behavior.

In month and multi-week grids, Escape or cancellation of the active pointer
ends a create or move gesture without committing. Release and cancellation events from other pointers do not end that gesture.

In the multi-week web grid, a quick touch swipe scrolls. Hold a day or event for
400 ms, then drag to create or move. Mouse input starts immediately. Cancelling
the pointer or changing the displayed window cancels the hold or drag.

Keep `events` stable during unrelated UI updates. With recurrence or `timeZone`,
replacing the array rebuilds displayed events and cancels a held move. See
[keep event data stable](https://super-calendar.afonsojramos.me/guides/events#keep-event-data-stable).

## Moving events

Pass `onDragEvent` and update your event state with the returned `start` and `end`.

Time-grid edge paging requires a mouse drag. Touch and pen remain within the
visible period, so resting near an edge cannot repeatedly change the date.
See the [dragging guide](https://super-calendar.afonsojramos.me/guides/dragging).

On the time grid, dragging any segment of a multi-day event previews the whole
range moving together and preserves its duration. Drag a resize grip to change
only the start or end. See the [dragging guide](https://super-calendar.afonsojramos.me/guides/dragging).

In `TimeGrid` and `ResourceTimeline`, choose **Edit events**, then an event,
to open move and resize actions (one `dragStepMinutes` step,
a page, or a neighbouring lane) for keyboard, click, and tap users. The actions
call `onDragEvent` with the same bounds as a drop. Rejected edits show a polite
status message, customizable with `labels.eventChangeRejected`. Long choosers
scroll without shrinking their choices. Titles without spaces wrap. The centered
dialog and chooser include both dates for multi-day events. Pass `getEventId` to `Calendar`,
`TimeGrid`, or `ResourceTimeline` to keep editing across full data refreshes.
Return a stable, unique string or number per event or recurring occurrence;
missing, invalid, or duplicate IDs close the dialog. Without this prop, full
refreshes close it. See
[Move and resize actions](https://super-calendar.afonsojramos.me/guides/accessibility#move-and-resize-actions-web).

`ResourceTimeline` supports keyboard event activation in both orientations.
`draggable: false` keeps an event clickable while preventing moves and resizes.
Active gestures retain the original event through live insertions and reordering;
removing the event or lane, losing capture, or unmounting cancels the gesture.

## Month chip dimensions

`chipHeight` and `chipGap` configure month lanes and overflow rows on `Calendar`,
`MonthView`, and `MonthList`. Native `MonthPager` forwards them too. DOM defaults
remain 18 px height and 2 px gaps; native height keeps its theme default.
Changing either dimension updates already mounted list and pager months.
See the [month guide](https://super-calendar.afonsojramos.me/guides/month-view).

## Styling

Out of the box the calendar is fully styled from the theme, no stylesheet required. To restyle a specific part with **Tailwind** or your own CSS, every element is a named slot: pass `classNames` (or `styles`) per slot, and use `data-*` state variants like `data-[today]:`.

```tsx
<Calendar
  mode="month"
  date={date}
  classNames={{
    title: "text-center text-xl font-bold",
    dayBadge: "rounded-full data-[today]:bg-indigo-600 data-[today]:text-white",
  }}
/>
```

A slot's structural layout is always kept; only its themed look steps aside for your class, so the class wins over the inline default. See the [styling guide](https://super-calendar.afonsojramos.me/guides/styling).

On the time grid, an empty-slot touch tap calls `onPressCell` from the column's
click. Swipes and cancelled contacts do not press the slot. Mouse and pen retain
drag-to-create behavior. See the [DOM guide](https://super-calendar.afonsojramos.me/guides/dom).

The drag-to-create preview snaps to the same range as `onCreateEvent`, starting
with one slot on press. It stays within the visible hours of the pressed column,
with its border inside the column. `dragStepMinutes` sets the snap interval.
Short previews use `minEventHeight`, like committed events. Clipping to the
visible hours takes priority at the column edges.

`TimeGrid` completes creation on pointer release even if capture is lost just
before it. Capture loss without a matching release and pointer cancellation
cancel the sweep. If a release outside the window is missed, a new press cancels
the stale sweep before starting another interaction. Text selection and native
browser dragging are disabled only while a mouse or pen sweep is active.

`MonthView`, `MultiWeekView`, and `Calendar` in month and multi-week modes also
accept `renderCreateGhost`. It receives the full all-day range with an exclusive
end, once per covered row. Use date labels for this content. The preview follows
`chipHeight` and `chipGap`, uses the `createGhost` slot, and requires
`onCreateEvent`. It is clipped, noninteractive, and hidden from assistive
technology. Empty months use the event-grid layout when both props are set.
Set `keyboardDayNavigation` to keep arrow-key day navigation in that layout,
including before the first event exists.

Pass `renderCreateGhost` to `TimeGrid`, `Calendar`, or `ResourceTimeline` to draw
a draft inside that preview. Define the component once, outside render:

```tsx
import { TimeGrid, type CreateGhostArgs } from "@super-calendar/dom";
import { format } from "date-fns";

function DraftPreview({ start, end }: CreateGhostArgs) {
  return <strong>{`New event ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`}</strong>;
}

<TimeGrid date={date} events={events} onCreateEvent={create} renderCreateGhost={DraftPreview} />;
```

`start` and `end` are the range `onCreateEvent` would receive on release, which
can extend past a narrowed `minHour`/`maxHour` window. The content is clipped to
the preview, non-interactive, and hidden from assistive tech.
The range follows scrolling and zooming during a held sweep, even without another pointer move.

## Documentation

See the [full documentation](https://super-calendar.afonsojramos.me), the [quickstart](https://super-calendar.afonsojramos.me/quickstart), and the [API reference](https://super-calendar.afonsojramos.me/reference/api).

## License

MIT
