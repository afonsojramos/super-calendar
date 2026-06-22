# react-native-bigger-calendar

A generic, themeable **month / week / day** calendar for React Native.

- 📆 Three views — month grid, week and day time-grids
- 🤏 Pinch-to-zoom on the week/day grid (UI thread, no re-renders)
- ♾️ Virtualized, snap-paging months/weeks/days via [`@legendapp/list`](https://legendapp.com/open-source/list/)
- 🧩 Bring-your-own event type (`CalendarEvent<T>`) and a `renderEvent` escape hatch
- 🎨 Fully themeable, with sensible defaults (no styling library required)

## Relationship to react-native-big-calendar

This is a ground-up reimagining inspired by the excellent
[`react-native-big-calendar`](https://github.com/acro5piano/react-native-big-calendar).
It keeps the familiar month/week/day model but is built around Reanimated and
modern list virtualization — trading framework-agnosticism for a richer,
gesture-driven experience. It's **not a fork**; the API differs, and the name is
an homage. 🙇

**What it adds**

- 🤏 **Pinch-to-zoom** time grid — row height is a Reanimated shared value, so
  zooming runs on the UI thread with zero React re-renders.
- ♾️ **Virtualized, snap-paged** months/weeks/days (via `@legendapp/list`) — swipe
  across years of dates, with native one-page paging (or opt into `freeSwipe`).
- 🧩 **Generic events + render-prop _component_** — `CalendarEvent<T>` carries your
  own fields, and `renderEvent` is a component (so it may use hooks) that
  receives the event box's live pixel height for progressive disclosure as the
  grid zooms.
- 🗓️ **Multi-day events** clipped per day, with `continuesBefore`/`continuesAfter`
  flags for continuation hints.
- ⏱️ Hour windowing (`minHour`/`maxHour`), 12-hour labels (`ampm`), tap-an-empty-
  slot (`onPressCell`), and a live now-indicator.

**Trade-offs (where react-native-big-calendar may suit you better)**

- It's **opinionated about peers**: Reanimated, Gesture Handler and
  `@legendapp/list` are required. `react-native-big-calendar` is more
  self-contained (no Reanimated/Gesture Handler).
- It focuses on month/week/day. If you need a built-in agenda/schedule view, an
  all-day event lane, or broad locale/RTL coverage today, `react-native-big-calendar`
  is more mature on those fronts.

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
import { useState } from 'react';
import { Calendar, type CalendarEvent } from 'react-native-bigger-calendar';

type MyEvent = { id: string; color: string };

const events: CalendarEvent<MyEvent>[] = [
  {
    id: '1',
    color: '#1F6FEB',
    title: 'Lecture',
    start: new Date(2026, 5, 19, 10, 0),
    end: new Date(2026, 5, 19, 11, 30),
  },
];

export function MyCalendar() {
  const [mode, setMode] = useState<'month' | 'week' | 'day'>('week');
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
        setMode('day');
      }}
    />
  );
}
```

### Custom events

The built-in renderer draws a simple titled box. Pass `renderEvent` — **a React
component**, not a callback — to take full control. Because it's rendered as a
component, it may use hooks. On the week/day grid you also receive `boxHeight`, a
Reanimated shared value tracking the live pixel height of the box (driven by
pinch-zoom), so you can reveal detail progressively without re-rendering:

```tsx
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Pressable, Text } from 'react-native';
import type { RenderEventArgs } from 'react-native-bigger-calendar';

// Define the component once (don't inline it, or it remounts every render).
function MyEvent({ event, boxHeight, onPress }: RenderEventArgs<MyEvent>) {
  const detailStyle = useAnimatedStyle(() => ({
    display: (boxHeight?.value ?? Infinity) >= 84 ? 'flex' : 'none',
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

### Theming

```tsx
<Calendar
  // ...
  theme={{
    colors: { todayBackground: '#E5484D', nowIndicator: '#E5484D' },
    text: { dayNumber: { fontSize: 24, fontWeight: '800' } },
  }}
/>
```

See `CalendarTheme` for the full set of tokens. Anything you omit falls back to
`defaultTheme`.

### Week/day grid options

```tsx
<Calendar
  mode="week"
  // ...
  minHour={7}            // window the grid to 07:00–21:00
  maxHour={21}
  ampm                   // 12-hour hour labels ("7 AM")
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

## Components

`<Calendar>` is the batteries-included entry point. The building blocks it wraps
are also exported for advanced layouts:

| Export | Description |
| --- | --- |
| `Calendar` | Top-level component; switches between month/week/day. |
| `MonthView` | A single month grid. |
| `MonthPager` | Horizontally-paged, virtualized months. |
| `TimeGrid` | Paged, pinch-zoomable week/day time-grid. |
| `DefaultEvent` | The built-in event renderer. |
| `useCalendarTheme` | Read the active theme inside a custom renderer. |

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
