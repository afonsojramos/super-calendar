import {
  buildMonthGrid,
  isDateSelectable,
  nextDateRange,
  toZonedTime,
  type DateRange,
  type DateSelectionConstraints,
  type UseMonthGridOptions,
} from "@super-calendar/core/vanilla";
import { startOfDay } from "date-fns";
import { createEffect, createMemo, createSignal, untrack, type Accessor } from "solid-js";

export interface NowOptions {
  enabled?: boolean;
  now?: Date;
  timeZone?: string;
  tickMs?: number;
}

/** A clock accessor that follows reactive overrides and stops ticking on disposal. */
export function createNow(options: Accessor<NowOptions> = () => ({})): Accessor<Date> {
  const [instant, setInstant] = createSignal(untrack(() => new Date()));
  createEffect(options, (value) => {
    if (value.enabled === false || value.now) return;
    setInstant(new Date());
    const timer = setInterval(() => setInstant(new Date()), value.tickMs ?? 60_000);
    return () => clearInterval(timer);
  });
  return createMemo(() => {
    const value = options();
    const now = value.now ?? instant();
    return value.timeZone ? toZonedTime(now, value.timeZone) : now;
  });
}

export interface DateRangeOptions extends DateSelectionConstraints {
  initialRange?: DateRange | null;
}

/** Reactive range selection. Pass a getter so constraints can change after mounting. */
export function createDateRange(options: Accessor<DateRangeOptions> = () => ({})) {
  const [range, setRange] = createSignal(untrack(() => options().initialRange ?? null));
  return {
    range,
    setRange,
    reset: () => setRange(null),
    onPressDate: (date: Date) => setRange((current) => nextDateRange(current, date, options())),
    selectRange: (a: Date, b: Date) => {
      if (!isDateSelectable(a, options()) || !isDateSelectable(b, options())) return;
      const [start, end] = a <= b ? [a, b] : [b, a];
      setRange({ start: startOfDay(start), end: startOfDay(end) });
    },
  };
}

/** A reactive, renderer-independent month grid. */
export function createMonthGrid(
  month: Accessor<Date>,
  options: Accessor<UseMonthGridOptions> = () => ({}),
) {
  return createMemo(() => buildMonthGrid(month(), options()));
}
