import { vi } from "vitest";
import { createSignal, flush } from "solid-js";
import { createDateRange, createMonthGrid, createNow } from "../state";
import { DatePicker, DateRangePicker } from "../index";
import { click, mount, mountProps } from "../../../../tests/support/solid-render";

describe("Solid reactive state", () => {
  it("orders range endpoints and observes changing constraints", () => {
    const [minDate, setMinDate] = createSignal(new Date(2026, 6, 10));
    let range!: ReturnType<typeof createDateRange>;
    mount(() => {
      range = createDateRange(() => ({ minDate: minDate() }));
      return null;
    });
    range.onPressDate(new Date(2026, 6, 15));
    flush();
    range.onPressDate(new Date(2026, 6, 12));
    flush();
    expect(range.range()).toEqual({ start: new Date(2026, 6, 12), end: new Date(2026, 6, 15) });
    setMinDate(new Date(2026, 6, 20));
    flush();
    range.selectRange(new Date(2026, 6, 18), new Date(2026, 6, 22));
    flush();
    expect(range.range()?.start.getDate()).toBe(12);
    range.reset();
    flush();
    expect(range.range()).toBeNull();
  });

  it("recomputes headless grids when weekday visibility changes", () => {
    const [hiddenDays, setHiddenDays] = createSignal<number[]>([]);
    let grid!: ReturnType<typeof createMonthGrid>;
    mount(() => {
      grid = createMonthGrid(
        () => new Date(2026, 6, 15),
        () => ({ hiddenDays: hiddenDays() }),
      );
      return null;
    });
    expect(grid().weekdays).toHaveLength(7);
    setHiddenDays([0, 6]);
    flush();
    expect(grid().weekdays).toHaveLength(5);
    setHiddenDays([0, 1, 2, 3, 4, 5, 6]);
    flush();
    // Core treats hiding every weekday as invalid and falls back to all seven.
    expect(grid().weekdays).toHaveLength(7);
  });

  it("ticks, pins the clock, changes display zones, and cleans up", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
      const [fixed, setFixed] = createSignal<Date | undefined>();
      const [timeZone, setTimeZone] = createSignal("UTC");
      let now!: ReturnType<typeof createNow>;
      const view = mount(() => {
        now = createNow(() => ({ now: fixed(), timeZone: timeZone(), tickMs: 1000 }));
        return null;
      });
      expect(now().getHours()).toBe(12);
      vi.advanceTimersByTime(60_000);
      flush();
      expect(now().getMinutes()).toBe(1);
      setFixed(new Date("2026-07-15T10:00:00Z"));
      setTimeZone("America/New_York");
      flush();
      expect(now().getHours()).toBe(6);
      const stopped = now().getTime();
      vi.advanceTimersByTime(60_000);
      flush();
      expect(now().getTime()).toBe(stopped);
      view.dispose();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Solid picker state", () => {
  it("selects a day, updates a controlled label, and closes", () => {
    const onChange = vi.fn();
    const view = mountProps(DatePicker, { value: new Date(2026, 6, 15), onChange });
    click(view.getByRole("button", { name: /15 Jul 2026/ }));
    const day = view.getByRole("gridcell", { name: "Thursday, 16 July 2026" });
    click(day);
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 6, 16));
    expect(view.queryByRole("dialog")).toBeNull();
    view.update({ value: new Date(2026, 6, 16) });
    expect(view.getByRole("button", { name: /16 Jul 2026/ })).toBeTruthy();
  });

  it("keeps an incomplete range open and closes after its second endpoint", () => {
    const onChange = vi.fn();
    const view = mountProps(DateRangePicker, {
      value: { start: new Date(2026, 6, 15), end: null as Date | null },
      onChange,
    });
    click(view.getByRole("button"));
    click(view.getByRole("gridcell", { name: "Friday, 17 July 2026" }));
    expect(onChange).toHaveBeenCalledWith({
      start: new Date(2026, 6, 15),
      end: new Date(2026, 6, 17),
    });
    expect(view.queryByRole("dialog")).toBeNull();
  });
});
