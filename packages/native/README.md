# @super-calendar/native

[![npm](https://img.shields.io/npm/v/@super-calendar/native?style=flat-square&color=1F6FEB)](https://www.npmjs.com/package/@super-calendar/native) [![JSR](https://img.shields.io/jsr/v/@super-calendar/native?style=flat-square&label=JSR&color=F7DF1E)](https://jsr.io/@super-calendar/native) [![npmx](https://img.shields.io/badge/npmx-view-8A2BE2?style=flat-square)](https://npmx.dev/package/@super-calendar/native)

The React Native renderer for [super-calendar](https://github.com/afonsojramos/super-calendar): a gesture-driven, virtualized **month / week / day** calendar and date picker. Runs on iOS, Android, and web (web via [react-native-web](https://necolas.github.io/react-native-web/)).

- 📆 Month grid plus day / 3-day / week / custom-N time grids and an agenda
- 🤏 Pinch-to-zoom week/day grid (UI thread, no re-renders)
- ✋ Drag to select, create, and move: by time on the week/day grid, by whole days on the month and year grids
- ♾️ Virtualized, snap-paging views via [`@legendapp/list`](https://legendapp.com/open-source/list/)
- 🧩 Bring-your-own event type (`CalendarEvent<T>`) and a `renderEvent` escape hatch
- 🪝 Headless `useMonthGrid` and `useDateRange` for fully custom UIs
- 🎨 Themeable, with a `darkTheme` preset

## Install

```sh
npm install @super-calendar/native
```

Also on [JSR](https://jsr.io/@super-calendar/native): `deno add jsr:@super-calendar/native`.

Peer dependencies: `@legendapp/list` (>=3), `date-fns` (>=3), `react` (>=19), `react-native` (>=0.74 <2), `react-native-gesture-handler` (>=2), `react-native-reanimated` (>=4), and `react-native-worklets` (>=0.8).

For a picker-only bundle that does not require Reanimated, import from the `@super-calendar/native/picker` subpath.

## Usage

```tsx
import { useState } from "react";
import { Calendar, type CalendarEvent } from "@super-calendar/native";

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
  const [mode, setMode] = useState<"month" | "week" | "day">("week");
  const [date, setDate] = useState(new Date());

  return (
    <Calendar
      mode={mode}
      date={date}
      events={events}
      weekStartsOn={1}
      onChangeDate={setDate}
      onPressEvent={(event) => console.log(event.id)}
      onPressDay={(day) => {
        setDate(day);
        setMode("day");
      }}
    />
  );
}
```

## Multi-week grids

Use `mode="multiweek"` with `numberOfWeeks` (default `2`) for consecutive full
week rows without hourly slots. The first week contains `date` and aligns to
`weekStartsOn`. Navigation moves by the full number of weeks. `hiddenDays` only
shortens rows; `custom` views remain hourly even above seven columns.

```tsx
import { useState } from "react";
import { Calendar } from "@super-calendar/native";

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
      onPressEvent={(event) => console.log(event.title)}
    />
  );
}
```

`MultiWeekView` exposes a standalone window with the month grid's event bars,
overflow, selection, drag interactions, and styling. Pass expanded events to it;
`Calendar` handles recurrence and time zones. Custom event renderers receive
`mode: "multiweek"`. Rows scroll vertically when the container is too short.
Counts must be positive safe integers whose date span is representable; invalid
counts or dates throw `RangeError`. Rows are materialized, so larger counts need
more space. `MonthView` and `MonthPager` retain their month-only behavior.

Keep `events` stable during unrelated UI updates. With recurrence or `timeZone`,
replacing the array rebuilds displayed events and cancels a held move on web. See
[keep event data stable](https://super-calendar.afonsojramos.me/guides/events#keep-event-data-stable).

## Moving events

Pass `onDragEvent` and update your event state with the returned `start` and `end`.
On the time grid, dragging any segment of a multi-day event previews the whole
range moving together and preserves its duration. Drag a resize grip to change
only the start or end. See the [dragging guide](https://super-calendar.afonsojramos.me/guides/dragging).

After edge paging, the floating event's horizontal centre selects the destination
day, and its top edge selects the time.

Set an event's `dragHandleColor` to colour its resize grips in `TimeGrid` and
`ResourceTimeline` (both orientations). It defaults to `theme.colors.eventText`.
`showDragHandle={false}` still hides the time-grid grips.
You can toggle it after mounting without replacing the `events` array.

## Creating events

Pass `onCreateEvent` to long-press and sweep out a new event. To show a draft in
the preview while it is swept, add a `renderCreateGhost` component. It receives
the `start` and `end` that `onCreateEvent` would get on release and updates each
time the sweep crosses a snap step:

```tsx
import { Calendar, type CreateGhostArgs } from "@super-calendar/native";
import { format } from "date-fns";
import { Text } from "react-native";

function DraftPreview({ start, end }: CreateGhostArgs) {
  return <Text>{`New event ${format(start, "HH:mm")} - ${format(end, "HH:mm")}`}</Text>;
}

<Calendar mode="week" /* ... */ onCreateEvent={createEvent} renderCreateGhost={DraftPreview} />;
```

`TimeGrid` and `ResourceTimeline` accept the same prop; `ResourceTimeline` also
passes the lane's `resource`. The preview geometry stays on the UI thread, and
the content is clipped to it and hidden from screen readers.
A cancelled gesture clears the preview without calling `onCreateEvent`.

`MonthView`, `MultiWeekView`, `MonthPager`, and `Calendar` in `month` or
`multiweek` mode also accept `renderCreateGhost`. These views pass the full
all-day range, with an exclusive end, and render one copy per covered week row.
Use date labels rather than times for this content. The preview updates when
the sweep reaches another day, uses `chipHeight`, `chipGap`, and the
`createGhost` slot, and overlays a visible event lane without changing the row
height. Content is clipped, ignores pointer input, and is hidden from screen
readers. On React Native Web, it also stays out of the tab order. Both the renderer and `onCreateEvent` are required; together they also
show the event-grid layout in an empty month. Omitting the renderer preserves
the existing day highlight.

## Styling with Tailwind

Every styleable part is a named slot that accepts a class (resolved by a Tailwind runtime such as [uniwind](https://docs.uniwind.dev) or NativeWind) and/or a style override. A classed slot drops its built-in themed styles, so your classes own the look:

```tsx
<Calendar
  mode="month"
  date={date}
  events={events}
  classNames={{
    title: "text-center text-xl font-bold text-indigo-900",
    weekday: "uppercase tracking-wider text-indigo-400",
  }}
  styles={{ more: { color: "#6366F1" } }}
  onChangeDate={setDate}
  onPressEvent={(event) => console.log(event.id)}
/>
```

See the [styling guide](https://super-calendar.afonsojramos.me/guides/styling) for the slot list and the uniwind setup.

`chipHeight` and `chipGap` configure month lanes and overflow rows on `Calendar`,
`MonthView`, and `MonthList`. Native `MonthPager` forwards them too. DOM defaults
remain 18 px height and 2 px gaps; native height keeps its theme default.
Changing either dimension updates already mounted list and pager months.
See the [month guide](https://super-calendar.afonsojramos.me/guides/month-view).

## Documentation

See the [full documentation](https://super-calendar.afonsojramos.me) and the [quickstart](https://super-calendar.afonsojramos.me/quickstart), including theming, recurring events, time zones, and the headless picker.

## License

MIT
