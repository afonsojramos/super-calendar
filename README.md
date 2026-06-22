# react-native-bigger-calendar

A generic, themeable **month / week / day** calendar for React Native.

- 📆 Three views — month grid, week and day time-grids
- 🤏 Pinch-to-zoom on the week/day grid (UI thread, no re-renders)
- ♾️ Virtualized, snap-paging months/weeks/days via [`@legendapp/list`](https://legendapp.com/open-source/list/)
- 🧩 Bring-your-own event type (`CalendarEvent<T>`) and a `renderEvent` escape hatch
- 🎨 Fully themeable, with sensible defaults (no styling library required)

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
  A dedicated all-day lane (and an explicit `allDay` flag) is not yet provided.
- **`weekStartsOn` defaults to `0` (Sunday).** Pass `1` for Monday-first.
- **Controlled `date`.** The calendar is controlled: echo `onChangeDate` back
  into the `date` prop, or paging and the "today" realign won't track.
- **External `cellHeight`.** If you own `cellHeight`, drive zoom through the
  pinch gesture. Programmatic writes outside a pinch won't propagate to
  off-screen pages until the next gesture settles.
- **Stable props.** Pass stable `renderEvent`/`keyExtractor`/`on*` references
  (module scope or `useCallback`) so the memoized inner views can skip renders.

## License

MIT
