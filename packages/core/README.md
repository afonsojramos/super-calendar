# @super-calendar/core

[![npm](https://img.shields.io/npm/v/@super-calendar/core?style=flat-square&color=1F6FEB)](https://www.npmjs.com/package/@super-calendar/core) [![JSR](https://img.shields.io/jsr/v/@super-calendar/core?style=flat-square&label=JSR&color=F7DF1E)](https://jsr.io/@super-calendar/core)

The render-agnostic core of [super-calendar](https://github.com/afonsojramos/react-native-super-calendar): date math, the selection model, event layout, the month-grid builder, the headless hooks, and the neutral theme tokens.

It imports nothing from React Native, react-dom, Reanimated, Gesture Handler, or Legend List, so it bundles into any renderer. Use it to drive your own UI, or pair it with [`@super-calendar/dom`](https://www.npmjs.com/package/@super-calendar/dom) (react-dom) or [`@super-calendar/native`](https://www.npmjs.com/package/@super-calendar/native) (React Native).

## Install

```sh
npm install @super-calendar/core
```

Also on [JSR](https://jsr.io/@super-calendar/core): `deno add jsr:@super-calendar/core`.

Peer dependencies: `date-fns` (>=3) and `react` (>=19).

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

const range = useDateRange({ mode: "range" });
```

## Documentation

See the [full documentation](https://super-calendar.afonsojramos.me) and the [API reference](https://super-calendar.afonsojramos.me/reference/api).

## License

MIT
