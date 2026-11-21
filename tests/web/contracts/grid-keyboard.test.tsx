import { vi } from "vitest";
import { addMonths, addWeeks, addYears, format } from "date-fns";
import type { WeekStartsOn } from "@super-calendar/core/vanilla";
import {
  act,
  Calendar,
  DateRangePicker,
  fireEvent,
  MonthView,
  MultiWeekView,
  render,
  rendererName,
  YearView,
} from "@calendar-test/renderer";

// The WAI-ARIA grid pattern as each web grid documents it. Today is Wednesday
// 15 July 2026, the next day is unavailable, and weeks start on Monday.
const today = new Date(2026, 6, 15);
const selected = new Date(2026, 6, 20);
const weekStartsOn: WeekStartsOn = 1;
const isDateDisabled = (day: Date) => day.getMonth() === 6 && day.getDate() === 16;

type Key = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";
type Paging = (date: Date, direction: 1 | -1) => Date;

interface Mounted {
  /** The grid that shows July 2026. */
  grid: () => HTMLElement;
  /** Applies a controlled date change. */
  setDate: (date: Date) => void;
}

interface GridRow {
  name: string;
  mount: (options: { selected?: Date; onChangeDate?: () => void }) => Mounted;
  /** How the selected day is exposed: `aria-selected`, or the day's label. */
  selection: "aria-selected" | "label";
  /** Where each key moves focus, starting from today; null without a roving tab stop. */
  keys: Array<[Key, string]> | null;
  /** The `onChangeDate` step for PageDown and PageUp. */
  paging?: Paging;
}

// Month grids clamp to the month: Home/End reach its first/last day, and
// unavailable days stay reachable. The docs do not promise these three; they pin
// current behaviour, so changing it (week-row Home/End, crossing into the next
// month, skipping unavailable days) means updating these steps on purpose.
const monthKeys: Array<[Key, string]> = [
  ["ArrowRight", "2026-07-16"],
  ["ArrowLeft", "2026-07-15"],
  ["ArrowDown", "2026-07-22"],
  ["ArrowUp", "2026-07-15"],
  ["End", "2026-07-31"],
  ["ArrowDown", "2026-07-31"],
  ["Home", "2026-07-01"],
  ["ArrowLeft", "2026-07-01"],
];
// Multi-week rows skip unavailable days and keep Home/End inside the displayed weeks.
const multiWeekKeys: Array<[Key, string]> = [
  ["ArrowRight", "2026-07-17"],
  ["ArrowLeft", "2026-07-15"],
  ["ArrowDown", "2026-07-22"],
  ["ArrowUp", "2026-07-15"],
  ["End", "2026-07-26"],
  ["ArrowDown", "2026-07-26"],
  ["Home", "2026-07-13"],
  ["ArrowUp", "2026-07-13"],
];

function mountCalendar(props: Parameters<typeof Calendar>[0], name?: string): Mounted {
  const view = render(Calendar, props);
  return {
    grid: () => (name ? view.getByRole("grid", { name }) : view.getByRole("grid")),
    setDate: (date) => view.rerender({ ...props, date }),
  };
}

const rows: GridRow[] = [
  {
    name: "MonthView",
    selection: "aria-selected",
    keys: monthKeys,
    mount: ({ selected }) => {
      const view = render(MonthView, {
        date: today,
        weekStartsOn,
        isDateDisabled,
        selectedDates: selected ? [selected] : undefined,
      });
      return { grid: () => view.getByRole("grid"), setDate: () => {} };
    },
  },
  {
    name: "MonthView with events",
    selection: "label",
    keys: monthKeys,
    mount: ({ selected }) => {
      const view = render(MonthView, {
        date: today,
        events: [],
        keyboardDayNavigation: true,
        weekStartsOn,
        isDateDisabled,
        selectedDates: selected ? [selected] : undefined,
      });
      return { grid: () => view.getByRole("grid"), setDate: () => {} };
    },
  },
  {
    name: "MultiWeekView",
    selection: "label",
    keys: multiWeekKeys,
    mount: ({ selected }) => {
      const view = render(MultiWeekView, {
        date: today,
        numberOfWeeks: 2,
        keyboardDayNavigation: true,
        weekStartsOn,
        isDateDisabled,
        selectedDates: selected ? [selected] : undefined,
      });
      return { grid: () => view.getByRole("grid"), setDate: () => {} };
    },
  },
  {
    name: "YearView",
    selection: "label",
    keys: null,
    mount: ({ selected }) => {
      const view = render(YearView, {
        date: today,
        weekStartsOn,
        isDateDisabled,
        selectedDates: selected ? [selected] : undefined,
        onPressDay: () => {},
      });
      return { grid: () => view.getByRole("grid", { name: "July 2026" }), setDate: () => {} };
    },
  },
  {
    name: "DateRangePicker",
    selection: "aria-selected",
    keys: monthKeys,
    mount: ({ selected }) => {
      const view = render(
        (props: { selected?: Date }) => (
          <DateRangePicker
            value={props.selected ? { start: props.selected, end: null } : null}
            onChange={() => {}}
            weekStartsOn={weekStartsOn}
            isDateDisabled={isDateDisabled}
          />
        ),
        { selected },
      );
      fireEvent.click(view.container.querySelector<HTMLElement>('[aria-haspopup="dialog"]')!);
      return { grid: () => view.getByRole("grid", { name: "July 2026" }), setDate: () => {} };
    },
  },
  {
    name: "Calendar (month)",
    selection: "label",
    keys: monthKeys,
    paging: (date, direction) => addMonths(date, direction),
    mount: ({ selected, onChangeDate }) =>
      mountCalendar({
        mode: "month",
        date: today,
        events: [],
        keyboardDayNavigation: true,
        weekStartsOn,
        isDateDisabled,
        selectedDates: selected ? [selected] : undefined,
        onChangeDate,
      }),
  },
  {
    name: "Calendar (multiweek)",
    selection: "label",
    keys: multiWeekKeys,
    paging: (date, direction) => addWeeks(date, 2 * direction),
    mount: ({ selected, onChangeDate }) =>
      mountCalendar({
        mode: "multiweek",
        numberOfWeeks: 2,
        date: today,
        events: [],
        keyboardDayNavigation: true,
        weekStartsOn,
        isDateDisabled,
        selectedDates: selected ? [selected] : undefined,
        onChangeDate,
      }),
  },
  {
    name: "Calendar (year)",
    selection: "label",
    keys: null,
    paging: (date, direction) => addYears(date, direction),
    mount: ({ selected, onChangeDate }) =>
      mountCalendar(
        {
          mode: "year",
          date: today,
          events: [],
          weekStartsOn,
          isDateDisabled,
          selectedDates: selected ? [selected] : undefined,
          onPressDay: () => {},
          onChangeDate,
        },
        "July 2026",
      ),
  },
];

const roving = rows.filter((row) => row.keys !== null);
const paging = rows.filter((row) => row.paging);

const key = (date: Date) => format(date, "yyyy-MM-dd");
const day = (grid: HTMLElement, iso: string) =>
  grid.querySelector<HTMLElement>(`[data-day="${iso}"]`)!;
// Day cells are found by label so the year view, which has no data-day, is covered too.
const labelled = (grid: HTMLElement, date: Date) =>
  grid.querySelector<HTMLElement>(
    `[role="gridcell"][aria-label^="${format(date, "EEEE, d MMMM yyyy")}"]`,
  )!;
const focused = () => document.activeElement as HTMLElement;
// What Tab can reach inside a grid.
const tabbable = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>("*")].filter(
    (element) => element.tabIndex >= 0 && !element.matches(":disabled"),
  );

describe(rendererName, () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 6, 15, 12), toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  describe("grid keyboard contract", () => {
    it.each(roving)("$name keeps one day of each grid in the tab order", ({ mount }) => {
      const { grid } = mount({});
      expect(tabbable(grid())).toEqual([day(grid(), key(today))]);
      // A picker lists several months, each with its own single tab stop.
      for (const other of document.querySelectorAll<HTMLElement>('[role="grid"]')) {
        expect(tabbable(other)).toHaveLength(1);
      }
    });

    it.each(roving)("$name moves focus with the arrow, Home and End keys", ({ mount, keys }) => {
      const { grid } = mount({});
      act(() => day(grid(), key(today)).focus());
      for (const [pressed, expected] of keys!) {
        fireEvent.keyDown(focused(), { key: pressed });
        expect(`${pressed} → ${focused().dataset.day}`).toBe(`${pressed} → ${expected}`);
        expect(tabbable(grid())).toEqual([focused()]);
      }
    });

    it.each(roving)("$name moves the tab stop to a day focused another way", ({ mount }) => {
      const { grid } = mount({});
      const target = day(grid(), "2026-07-22");
      act(() => target.focus());
      expect(focused()).toBe(target);
      expect(tabbable(grid())).toEqual([target]);
    });

    it.each(roving)(
      "$name keeps unavailable days out of the tab order with aria-disabled",
      ({ mount }) => {
        const { grid } = mount({});
        const unavailable = day(grid(), "2026-07-16");
        expect(unavailable.getAttribute("aria-disabled")).toBe("true");
        expect(unavailable.tabIndex).toBe(-1);
      },
    );

    it.each(rows)("$name marks today and the selected day", ({ mount, selection }) => {
      const { grid } = mount({ selected });
      const todayCell = labelled(grid(), today);
      const selectedCell = labelled(grid(), selected);
      expect(todayCell.hasAttribute("data-today")).toBe(true);
      expect(todayCell.getAttribute("aria-label")).toContain("today");
      expect(selectedCell.hasAttribute("data-selected")).toBe(true);
      if (selection === "aria-selected") {
        expect(selectedCell.getAttribute("aria-selected")).toBe("true");
        expect(todayCell.getAttribute("aria-selected")).toBe("false");
      } else {
        expect(selectedCell.getAttribute("aria-label")).toContain("selected");
        expect(todayCell.getAttribute("aria-label")).not.toContain("selected");
      }
    });

    it.each(paging)("$name pages with PageDown and PageUp", ({ mount, paging: step }) => {
      const onChangeDate = vi.fn();
      const { grid } = mount({ onChangeDate });
      act(() => labelled(grid(), today).focus());
      fireEvent.keyDown(focused(), { key: "PageDown" });
      fireEvent.keyDown(focused(), { key: "PageUp" });
      expect(onChangeDate.mock.calls).toEqual([
        [step!(today, 1), { reason: "keyboard" }],
        [step!(today, -1), { reason: "keyboard" }],
      ]);
    });

    it.each(paging.filter((row) => row.keys !== null))(
      "$name moves the tab stop into the new page when the date changes",
      ({ mount, paging: step }) => {
        const { grid, setDate } = mount({});
        setDate(step!(today, 1));
        expect(tabbable(grid())).toHaveLength(1);
        expect(tabbable(grid())[0].hasAttribute("data-outside")).toBe(false);
      },
    );

    it.each(paging.filter((row) => row.keys !== null))(
      "$name keeps focus on the new page's tab stop while paging",
      ({ mount, paging: step }) => {
        const onChangeDate = vi.fn();
        const { grid, setDate } = mount({ onChangeDate });
        act(() => day(grid(), key(today)).focus());
        let date = today;
        for (const [pressed, direction] of [
          ["PageDown", 1],
          ["PageDown", 1],
          ["PageUp", -1],
        ] as const) {
          fireEvent.keyDown(focused(), { key: pressed });
          date = step!(date, direction);
          expect(onChangeDate).toHaveBeenLastCalledWith(date, { reason: "keyboard" });
          setDate(date);
          const shown = focused().closest<HTMLElement>('[role="grid"]');
          expect(shown).not.toBeNull();
          expect(tabbable(shown!)).toEqual([focused()]);
        }
        expect(onChangeDate).toHaveBeenCalledTimes(3);
      },
    );

    it("leaves focus where it is when the month changes after focus left the grid", async () => {
      // August 2026 has six rows and September five, so the last row's day is removed.
      const props = { date: new Date(2026, 7, 15), weekStartsOn };
      const view = render(MonthView, props);
      act(() => day(view.getByRole("grid"), "2026-08-31").focus());
      act(() => focused().blur());
      // The month changes after the blur has been handled, as it would for a user.
      await Promise.resolve();
      expect(focused()).toBe(document.body);
      view.rerender({ ...props, date: new Date(2026, 8, 15) });
      expect(focused()).toBe(document.body);
    });

    it("leaves focus where it is when an earlier update removed the focused day", async () => {
      // March 2026 has six Monday-first rows but five Sunday-first rows, so changing
      // `weekStartsOn` removes the focused last-row day without changing the month.
      const props: { date: Date; weekStartsOn: WeekStartsOn } = {
        date: new Date(2026, 2, 15),
        weekStartsOn,
      };
      const view = render(MonthView, props);
      act(() => day(view.getByRole("grid"), "2026-03-30").focus());
      view.rerender({ ...props, weekStartsOn: 0 });
      expect(focused()).toBe(document.body);
      // Later, in another task, the app moves to the next month.
      await new Promise((resolve) => setTimeout(resolve, 0));
      view.rerender({ ...props, weekStartsOn: 0, date: new Date(2026, 3, 15) });
      expect(focused()).toBe(document.body);
    });
  });
});
