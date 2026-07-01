# @super-calendar/native

[![npm](https://img.shields.io/npm/v/@super-calendar/native?style=flat-square&color=1F6FEB)](https://www.npmjs.com/package/@super-calendar/native) [![JSR](https://img.shields.io/jsr/v/@super-calendar/native?style=flat-square&label=JSR&color=F7DF1E)](https://jsr.io/@super-calendar/native)

The React Native renderer for [super-calendar](https://github.com/afonsojramos/react-native-super-calendar): a gesture-driven, virtualized **month / week / day** calendar and date picker. Runs on iOS, Android, and web (web via [react-native-web](https://necolas.github.io/react-native-web/)).

- 📆 Month grid plus day / 3-day / week / custom-N time grids and an agenda
- 🤏 Pinch-to-zoom week/day grid (UI thread, no re-renders)
- ♾️ Virtualized, snap-paging views via [`@legendapp/list`](https://legendapp.com/open-source/list/)
- 🧩 Bring-your-own event type (`CalendarEvent<T>`) and a `renderEvent` escape hatch
- 🪝 Headless `useMonthGrid` and `useDateRange` for fully custom UIs
- 🎨 Themeable, with a `darkTheme` preset

## Install

```sh
npm install @super-calendar/native
```

Also on [JSR](https://jsr.io/@super-calendar/native): `deno add jsr:@super-calendar/native`.

Peer dependencies: `@legendapp/list` (>=3), `date-fns` (>=3), `react` (>=19), `react-native` (>=0.85), `react-native-gesture-handler` (>=2), `react-native-reanimated` (>=4), and `react-native-worklets` (>=0.8).

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

## Documentation

See the [full documentation](https://super-calendar.afonsojramos.me) and the [quickstart](https://super-calendar.afonsojramos.me/quickstart), including theming, recurring events, time zones, and the headless picker.

## License

MIT
