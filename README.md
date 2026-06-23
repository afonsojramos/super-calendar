<h1 align="center">react-native-bigger-calendar</h1>

<p align="center">A generic, themeable <strong>month / week / day</strong> calendar for React Native.</p>

<p align="center">
  <a href="https://npmx.dev/package/react-native-bigger-calendar"><img alt="npm version" src="https://img.shields.io/npm/v/react-native-bigger-calendar?style=flat-square&amp;color=1F6FEB" /></a>
  <a href="https://npmx.dev/package/react-native-bigger-calendar"><img alt="downloads per month" src="https://img.shields.io/npm/dm/react-native-bigger-calendar?style=flat-square" /></a>
  <a href="https://github.com/afonsojramos/react-native-bigger-calendar/actions/workflows/ci.yml"><img alt="CI status" src="https://img.shields.io/github/actions/workflow/status/afonsojramos/react-native-bigger-calendar/ci.yml?branch=main&amp;style=flat-square&amp;label=CI" /></a>
  <a href="#license"><img alt="MIT license" src="https://img.shields.io/npm/l/react-native-bigger-calendar?style=flat-square" /></a>
</p>

<p align="center">
  <img alt="Month, week, 3-day, day and schedule views of react-native-bigger-calendar" src="./.github/assets/preview.png" />
</p>

- 📆 Month grid plus day / 3-day / week / custom-N time-grids
- 🤏 Zoomable week/day grid: pinch on iOS & Android, Ctrl/Cmd + scroll on web (UI thread, no re-renders)
- ♾️ Virtualized, snap-paging months/weeks/days via [`@legendapp/list`](https://legendapp.com/open-source/list/)
- 🧩 Bring-your-own event type (`CalendarEvent<T>`) and a `renderEvent` escape hatch
- 🎨 Fully themeable, with sensible defaults (no styling library required)
- 🌐 Runs on iOS, Android and web (web via [react-native-web](https://necolas.github.io/react-native-web/); see [Web](#web))

## Relationship to react-native-big-calendar

This is a ground-up reimagining inspired by the excellent
[`react-native-big-calendar`](https://github.com/acro5piano/react-native-big-calendar).
It keeps the familiar month/week/day model but is built around Reanimated and
modern list virtualization — trading framework-agnosticism for a richer,
gesture-driven experience. It's **not a fork**; the API differs, and the name is
an homage. 🙇

**What it adds over react-native-big-calendar**

- 🤏 **Pinch-to-zoom** time grid — row height is a Reanimated shared value, so
  zooming runs on the UI thread with zero React re-renders.
- ♾️ **Virtualized, snap-paged** views (via `@legendapp/list`) — swipe across
  years of dates, with native one-page paging (or opt into `freeSwipe`).
- 🧩 **Generic events + render-prop _component_** — `CalendarEvent<T>` carries your
  own fields, and `renderEvent` is a component (so it may use hooks) that receives
  the event box's live pixel height for progressive disclosure as the grid zooms.

**Feature parity.** It also covers the rest of react-native-big-calendar's
surface: month / day / 3-day / week / **custom N-day** (and `weekEndsOn`
partial-weeks) / **agenda (`schedule`)** modes, **all-day events** (lane +
`allDay` flag), multi-day clipping, `minHour`/`maxHour`, `ampm` (hour axis and
event times), `showTime`, `timeslots`, `hideHours`, `showWeekNumber`,
`weekNumberPrefix`, `hourComponent`, `sortedMonthView`, `moreLabel`,
`showAdjacentMonths`, `showSixWeeks`, `disableMonthEventCellPress`, a default
month weekday header (`renderHeaderForMonthView`), `activeDate`, per-event
`disabled`, `onPress`/`onLongPress` for events, cells and date headers,
`onChangeDateRange`, `resetPageOnPressCell`, `swipeEnabled`,
`verticalScrollEnabled`, `showVerticalScrollIndicator`, an agenda
`itemSeparatorComponent`, `eventCellStyle`, `calendarCellStyle`, a
`headerComponent` slot, date-fns `locale`, right-to-left column order (`isRTL`),
and theming. Text styling that big-calendar exposes via `calendarCellTextStyle`
is covered by `CalendarTheme.text`; overlapping events are laid out in
side-by-side columns automatically.

**Trade-offs (where react-native-big-calendar may suit you better)**

- It's **opinionated about peers**: Reanimated, Gesture Handler and
  `@legendapp/list` are required. `react-native-big-calendar` is more
  self-contained (no Reanimated/Gesture Handler).
- **RTL** is cosmetic (`isRTL` reverses the day-column order, like
  big-calendar's): the hour gutter stays on the left and paging follows the
  system scroll direction. Enable React Native's `I18nManager` for full RTL.

## Install

```sh
npm install react-native-bigger-calendar
```

### Peer dependencies

This library relies on the following being installed in your app:

```sh
npm install react-native-reanimated react-native-gesture-handler @legendapp/list
```

Make sure Reanimated and Gesture Handler are set up per their own docs (Babel
plugin, `GestureHandlerRootView` at the root of your app).

## Usage

```tsx
import { useState } from "react";
import { Calendar, type CalendarEvent } from "react-native-bigger-calendar";

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

### Custom events

The built-in renderer draws a simple titled box. Pass `renderEvent` — **a React
component**, not a callback — to take full control. Because it's rendered as a
component, it may use hooks. The same renderer is used in **every** mode — month
chips, the all-day lane, the timed grid and the schedule list — and always
receives `isAllDay` (plus `continuesBefore`/`continuesAfter` for clipped
multi-day segments on the grid), so one component covers them all. On the
week/day grid you also receive `boxHeight`, a Reanimated shared value tracking
the live pixel height of the box (driven by pinch-zoom), so you can reveal
detail progressively without re-rendering:

```tsx
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Pressable, Text } from "react-native";
import type { RenderEventArgs } from "react-native-bigger-calendar";

// Define the component once (don't inline it, or it remounts every render).
function MyEvent({ event, boxHeight, onPress }: RenderEventArgs<MyEvent>) {
  const detailStyle = useAnimatedStyle(() => ({
    display: (boxHeight?.value ?? Infinity) >= 84 ? "flex" : "none",
  }));
  return (
    <Pressable style={{ flex: 1, backgroundColor: event.color }} onPress={onPress}>
      <Text>{event.title}</Text>
      <Animated.View style={detailStyle}>
        <Text>{event.start.toLocaleTimeString()}</Text>
      </Animated.View>
    </Pressable>
  );
}

<Calendar /* ... */ renderEvent={MyEvent} />;
```

The built-in renderer hard-clips a title that overflows its box. Pass
`ellipsizeTitle` to `<Calendar>` for a trailing ellipsis (…) instead.

### Drag to move and resize

Pass `onDragEvent` to make events draggable on the week/day grid (iOS & Android).
**Long-press an event** to pick it up and move it; **drag the grip at its bottom
edge** to resize. The handler receives the new `start`/`end`, snapped to
`dragStepMinutes` (default 15) — update your own event state in response:

```tsx
<Calendar
  /* ... */
  onDragEvent={(event, start, end) =>
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, start, end } : e)))
  }
/>
```

### Recurring events

Give an event a `recurrence` rule and expand it into concrete occurrences for the
range you're showing with `expandRecurringEvents`. The calendar doesn't expand
recurrences itself, so you control the window (and can memoize it):

```tsx
import { Calendar, expandRecurringEvents } from "react-native-bigger-calendar";

const events = [
  // Every weekday standup, 20 occurrences:
  {
    title: "Standup",
    start,
    end,
    recurrence: { freq: "weekly", weekdays: [1, 2, 3, 4, 5], count: 20 },
  },
];

const visible = expandRecurringEvents(events, rangeStart, rangeEnd);
<Calendar /* ... */ events={visible} />;
```

Rules support `freq` (`daily`/`weekly`/`monthly`/`yearly`), `interval`, `count`,
`until`, and `weekdays` (for `weekly`). Each occurrence keeps the original
duration and fields; non-recurring events pass through unchanged.

### Time zones

Events lay out from their local wall-clock time. To display them in a specific
IANA zone regardless of the device, run them through `eventsInTimeZone` (or a
single date through `toZonedTime`). It's DST-correct via `Intl`:

```tsx
import { Calendar, eventsInTimeZone } from "react-native-bigger-calendar";

// Render every event at its New York wall-clock time.
<Calendar /* ... */ events={eventsInTimeZone(events, "America/New_York")} />;
```

The returned dates are for display only — they carry the zone's wall clock, not
the original instant, so keep your source events around for editing/saving.

### Theming

```tsx
<Calendar
  // ...
  theme={{
    colors: { todayBackground: "#E5484D", nowIndicator: "#E5484D" },
    text: { dayNumber: { fontSize: 24, fontWeight: "800" } },
  }}
/>
```

See `CalendarTheme` for the full set of tokens. Anything you omit falls back to
`defaultTheme`.

For dark mode, pass the built-in `darkTheme` (switch on the system scheme with
`useColorScheme()`):

```tsx
import { Calendar, darkTheme, defaultTheme } from "react-native-bigger-calendar";
import { useColorScheme } from "react-native";

const scheme = useColorScheme();
<Calendar /* ... */ theme={scheme === "dark" ? darkTheme : defaultTheme} />;
```

### Modes

`mode` is one of `month`, `week`, `day`, `3days`, `custom`, or `schedule`. For
`custom`, set `numberOfDays` (e.g. `mode="custom" numberOfDays={5}` for a
work-week). Day/3-day/custom views page by their column count; `week` pages by
the calendar week. `schedule` is a vertical, day-grouped agenda list of the
events you pass (no time grid).

### Month view

Each day cell shows as many event chips as its height allows and collapses the
rest into a `+N more` label (tap it via `onPressMore`). The fit is measured at
runtime, so taller grids (fewer week rows, larger screens) show more.

```tsx
<Calendar mode="month" /* ... */ />          // auto-fit (default)
<Calendar mode="month" maxVisibleEventCount={3} /* ... */ /> // fixed cap
```

Pass `maxVisibleEventCount` for a fixed cap instead — recommended when you pass a
custom `renderEvent`, since auto-fit assumes the built-in chip height. Customize
the overflow text with `moreLabel` (e.g. `"+{moreCount}"`).

### Localization

Pass a date-fns [`Locale`](https://date-fns.org/docs/I18n) to localize weekday and
date labels:

```tsx
import { fr } from "date-fns/locale";

<Calendar /* ... */ locale={fr} weekStartsOn={1} />;
```

Pass `isRTL` to reverse the day-column order in every view (month grid, week/day
grid and the all-day lane). It's cosmetic — the hour gutter stays on the left and
paging follows the system scroll direction — so enable React Native's
`I18nManager` alongside it for full right-to-left behaviour.

```tsx
<Calendar /* ... */ isRTL locale={ar} weekStartsOn={6} />
```

### Week/day grid options

```tsx
<Calendar
  mode="week"
  // ...
  minHour={7} // window the grid to 07:00–21:00
  maxHour={21}
  ampm // 12-hour hour labels ("7 AM")
  onPressCell={(date) => createEventAt(date)} // tap empty space -> date+time
/>
```

- `minHour` / `maxHour` clamp the visible hours (defaults `0` / `24`); events and
  the now-line outside the window are hidden, and the initial scroll is adjusted.
- `ampm` switches hour labels to 12-hour AM/PM (default 24h).
- `onPressCell(date)` fires when empty grid space is tapped, with the date+time
  under the touch — handy for "create event". (Event taps still go to `onPressEvent`.)
- **Long-press** mirrors every tap: `onLongPressEvent(event)`, `onLongPressCell(date)`
  (week/day), and `onLongPressDay(date)` (month). All optional.
- **All-day events** render in a lane above the time grid (and as chips in month
  cells), excluded from the timed columns. Mark an event `allDay: true`, or it's
  inferred when it spans whole days (midnight-to-midnight). `renderEvent` receives
  `isAllDay` so you can style the chip. The lane is hidden when there are none.
- `freeSwipe` (default `false`) controls paging: by default one day/week/month
  moves per swipe; set it to allow a fling to carry across several pages (still
  snapping to a page boundary). Applies to all modes.

### Web

The calendar runs on [react-native-web](https://necolas.github.io/react-native-web/);
its dependencies (`@legendapp/list` v3, Reanimated and Gesture Handler) all
support web. Add the web peers to your app:

```sh
npx expo install react-dom react-native-web @expo/metro-runtime
```

All modes render and navigate. Two touch gestures are remapped for web:
horizontal swipe paging becomes **←** / **→** arrow-key paging (previous / next
page), and pinch-to-zoom on the week/day grid becomes **Ctrl/Cmd + scroll**. The
runnable [`example/`](./example) builds with `expo start --web`.

## Components

`<Calendar>` is the batteries-included entry point. The building blocks it wraps
are also exported for advanced layouts:

| Export             | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `Calendar`         | Top-level component; switches between month/week/day. |
| `MonthView`        | A single month grid.                                  |
| `MonthPager`       | Horizontally-paged, virtualized months.               |
| `TimeGrid`         | Paged, pinch-zoomable week/day time-grid.             |
| `DefaultEvent`     | The built-in event renderer.                          |
| `useCalendarTheme` | Read the active theme inside a custom renderer.       |

## Notes & limitations

- **Multi-day events** are supported: pass one event and it appears on every day
  it spans. On the week/day grid each day shows the clipped segment (so a
  23:00→01:00 event renders 23:00–24:00, then 00:00–01:00), and `renderEvent`
  receives `continuesBefore`/`continuesAfter` so you can draw continuation hints.
  All-day events (an explicit `allDay` flag or a midnight-to-midnight span) render
  in a dedicated lane above the time grid.
- **`weekStartsOn` defaults to `0` (Sunday).** Pass `1` for Monday-first.
- **Controlled `date`.** The calendar is controlled: echo `onChangeDate` back
  into the `date` prop, or paging and the "today" realign won't track.
- **External `cellHeight`.** If you own `cellHeight`, drive zoom through the
  pinch gesture. Programmatic writes outside a pinch won't propagate to
  off-screen pages until the next gesture settles.
- **Stable props.** Pass stable `renderEvent`/`keyExtractor`/`on*` references
  (module scope or `useCallback`) so the memoized inner views can skip renders.

## Example app

A runnable Expo demo lives in [`example/`](./example) — month/week/day modes, a
multi-day event, drill-into-day on tap, and one-page paging.

```sh
cd example
npm install
npx expo run:ios   # or: npx expo run:android
```

It consumes the library straight from `../src` (via the example's
`metro.config.js`), so edits to the package hot-reload into the demo. A custom
dev build is required (Reanimated worklets aren't available in Expo Go).

## License

MIT
