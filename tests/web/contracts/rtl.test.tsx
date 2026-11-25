import { vi } from "vitest";
import { format } from "date-fns";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import {
  act,
  Calendar,
  DatePicker,
  fireEvent,
  MonthList,
  MonthView,
  MultiWeekView,
  render,
  rendererName,
  TimeGrid,
  YearView,
} from "@calendar-test/renderer";

// Right-to-left layout. The day cells stay in chronological DOM order, so a
// screen reader reads them in reading order, and `dir="rtl"` on the root runs
// them right to left. Positions the browser can't mirror on its own (absolute
// offsets, pointer x, arrow keys, squared bar ends) mirror in the components.
// Weeks start on Monday; Wednesday 15 July 2026 is the anchor.
const date = new Date(2026, 6, 15);
const weekStartsOn = 1;
const day = (element: Element | null) => element?.getAttribute("data-day");
const focusedDay = () => day(document.activeElement);

// Monday 13 to Sunday 19 July. Trip covers Tuesday to Thursday; Long started the
// week before, so its bar is cut off where the week begins.
const trip: CalendarEvent = {
  title: "Trip",
  start: new Date(2026, 6, 14),
  end: new Date(2026, 6, 17),
  allDay: true,
};
const long: CalendarEvent = {
  title: "Long",
  start: new Date(2026, 6, 10),
  end: new Date(2026, 6, 15),
  allDay: true,
};
const focus: CalendarEvent = {
  title: "Focus",
  start: new Date(2026, 6, 15, 14),
  end: new Date(2026, 6, 15, 16),
};

const rootOf = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe(rendererName, () => {
  describe("root direction", () => {
    it.each([
      ["MonthView", () => render(MonthView, { date, isRTL: true })],
      ["MultiWeekView", () => render(MultiWeekView, { date, numberOfWeeks: 2, isRTL: true })],
      ["MonthList", () => render(MonthList, { date, height: 300, isRTL: true })],
      ["TimeGrid", () => render(TimeGrid, { date, mode: "week", isRTL: true })],
      ["YearView", () => render(YearView, { date, isRTL: true })],
      ["Calendar", () => render(Calendar, { date, mode: "week", events: [], isRTL: true })],
    ])("%s sets dir=rtl on its root", (_name, mount) => {
      expect(rootOf(mount().container).getAttribute("dir")).toBe("rtl");
    });

    it("sets dir=ltr without isRTL, so an RTL page does not half-mirror the grid", () => {
      const view = render(TimeGrid, { date, mode: "week" });
      expect(rootOf(view.container).getAttribute("dir")).toBe("ltr");
    });

    it("mirrors the date picker's calendar", () => {
      const view = render(DatePicker, { value: date, onChange: () => {}, isRTL: true });
      fireEvent.click(view.container.querySelector<HTMLElement>('[aria-haspopup="dialog"]')!);
      expect(view.getByRole("dialog").closest("[dir]")?.getAttribute("dir")).toBe("rtl");
    });
  });

  describe("month grid", () => {
    it("keeps days and weekday labels in chronological order", () => {
      const view = render(MonthView, { date, weekStartsOn, isRTL: true });
      const first = view.getAllByRole("row")[0];
      expect(day(first.firstElementChild)).toBe("2026-06-29");
      expect(day(first.lastElementChild)).toBe("2026-07-05");
    });

    it("anchors a spanning bar on the right of its first day", () => {
      const view = render(MonthView, { date, weekStartsOn, events: [trip], isRTL: true });
      const bar = view.getByRole("button", { name: /^Trip/ });
      expect(bar.style.right).toBe("2px");
      expect(bar.style.left).toBe("");
    });

    it("squares the right end of a bar that began the week before", () => {
      const view = render(MonthView, { date, weekStartsOn, events: [long], isRTL: true });
      // The second row, Monday 13 and Tuesday 14, holds the part that continues.
      const chip = view.getAllByText("Long")[1];
      expect(chip.style.borderTopRightRadius).toBe("0");
      expect(chip.style.borderTopLeftRadius).toBe("");
    });

    it("mirrors the arrow keys", () => {
      const view = render(MonthView, { date, weekStartsOn, isRTL: true });
      const today = view.container.querySelector<HTMLElement>('[data-day="2026-07-15"]')!;
      act(() => today.focus());
      fireEvent.keyDown(today, { key: "ArrowLeft" });
      expect(focusedDay()).toBe("2026-07-16");
      fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
      fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
      expect(focusedDay()).toBe("2026-07-14");
    });

    it("mirrors the arrow keys over multi-week rows", () => {
      const view = render(MultiWeekView, {
        date,
        numberOfWeeks: 2,
        weekStartsOn,
        keyboardDayNavigation: true,
        isRTL: true,
      });
      const today = view.container.querySelector<HTMLElement>('[data-day="2026-07-15"]')!;
      act(() => today.focus());
      fireEvent.keyDown(today, { key: "ArrowLeft" });
      expect(focusedDay()).toBe("2026-07-16");
      fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
      expect(focusedDay()).toBe("2026-07-15");
    });

    it("rounds a selected range's first day on its right", () => {
      const view = render(MonthView, {
        date,
        weekStartsOn,
        selectedRange: { start: new Date(2026, 6, 14), end: new Date(2026, 6, 16) },
        isRTL: true,
      });
      const band = view.container.querySelector<HTMLElement>(
        '[data-day="2026-07-14"] [data-band]',
      )!;
      expect(band.style.borderTopRightRadius).not.toBe("");
      expect(band.style.borderTopLeftRadius).toBe("");
    });
  });

  describe("year grid", () => {
    it("rounds a selected range's first day on its right", () => {
      const view = render(YearView, {
        date,
        weekStartsOn,
        selectedRange: { start: new Date(2026, 6, 14), end: new Date(2026, 6, 16) },
        isRTL: true,
      });
      const band = view.container.querySelector<HTMLElement>(
        '[aria-label^="Tuesday, 14 July 2026"] [data-band]',
      )!;
      expect(band.style.borderTopRightRadius).toBe("50%");
      expect(band.style.borderTopLeftRadius).not.toBe("50%");
    });
  });

  describe("time grid", () => {
    const COLUMN = 100;

    it("puts the hour labels against the grid on the left of the gutter", () => {
      const view = render(TimeGrid, { date, mode: "week", weekStartsOn, isRTL: true });
      const label = view.container.querySelector<HTMLElement>('[data-slot="hourLabel"]')!;
      expect(label.style.left).toBe("6px");
      expect(label.style.right).toBe("");
    });

    it("draws the day separators on the right of each column", () => {
      const view = render(TimeGrid, { date, mode: "week", weekStartsOn, isRTL: true });
      const column = view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
      expect(column.style.borderRight).not.toBe("");
      expect(column.style.borderLeft).toBe("");
    });

    it("places overlapping events from the right", () => {
      const second = { ...focus, title: "Second" };
      const view = render(TimeGrid, {
        date,
        mode: "week",
        weekStartsOn,
        events: [focus, second],
        isRTL: true,
      });
      const box = (title: string) =>
        view.getByText(title).closest<HTMLElement>('[data-slot="event"]')!;
      expect(box("Focus").style.right).toBe("calc(0% + 1px)");
      expect(box("Second").style.right).toBe("calc(50% + 1px)");
      expect(box("Focus").style.left).toBe("");
    });

    it("moves a timed event to the next day when dragged left", () => {
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, {
        date,
        mode: "week",
        weekStartsOn,
        events: [focus],
        onDragEvent,
        isRTL: true,
      });
      const box = view.getByText("Focus").closest<HTMLElement>('[data-slot="event"]')!;
      (box.parentElement as HTMLElement).getBoundingClientRect = () =>
        ({ width: COLUMN }) as DOMRect;
      fireEvent.pointerDown(box, { clientX: 250, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 150, clientY: 300, pointerId: 1 });
      expect(box.style.transform).toBe(`translateX(-${COLUMN}px)`);
      fireEvent.pointerUp(box, { clientX: 150, clientY: 300, pointerId: 1 });
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        focus,
        new Date(2026, 6, 16, 14),
        new Date(2026, 6, 16, 16),
      );
    });

    it("moves an all-day bar by the columns it crosses on screen", () => {
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, {
        date,
        mode: "week",
        weekStartsOn,
        events: [trip],
        onDragEvent,
        isRTL: true,
      });
      const chip = view.getByText("Trip").closest<HTMLElement>('button[data-slot="allDayEvent"]')!;
      const grid = chip.closest('[data-slot="allDayColumn"]')!.parentElement!;
      grid.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          width: 7 * COLUMN,
          right: 7 * COLUMN,
          height: 26,
          bottom: 26,
        }) as DOMRect;
      // Tuesday is the second column from the right, so it spans x 500..600.
      const at = (x: number) => ({ clientX: x, clientY: 10, pointerId: 1 });
      fireEvent.pointerDown(chip, at(550));
      fireEvent.pointerMove(chip, at(350));
      fireEvent.pointerUp(chip, at(350));
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        trip,
        new Date(2026, 6, 16),
        new Date(2026, 6, 19),
      );
    });

    it("names the screen edges of a lane bar that began the week before", () => {
      const view = render(TimeGrid, {
        date,
        mode: "week",
        weekStartsOn,
        events: [long],
        isRTL: true,
      });
      const chip = view.getByText("Long").closest<HTMLElement>('button[data-slot="allDayEvent"]')!;
      expect(chip.hasAttribute("data-continues-after")).toBe(true);
      expect(chip.hasAttribute("data-continues-before")).toBe(false);
    });

    it("mirrors the event arrow keys", () => {
      const tuesday = { ...focus, title: "Tuesday", start: new Date(2026, 6, 14, 14) };
      tuesday.end = new Date(2026, 6, 14, 15);
      const view = render(TimeGrid, {
        date,
        mode: "week",
        weekStartsOn,
        events: [tuesday, focus],
        keyboardEventNavigation: true,
        isRTL: true,
      });
      const box = (title: string) =>
        view.getByText(title).closest<HTMLElement>('[data-slot="event"]')!;
      box("Tuesday").focus();
      fireEvent.keyDown(box("Tuesday"), { key: "ArrowLeft" });
      expect(document.activeElement).toBe(box("Focus"));
      fireEvent.keyDown(box("Focus"), { key: "ArrowRight" });
      expect(document.activeElement).toBe(box("Tuesday"));
    });
  });

  describe("calendar", () => {
    it("passes isRTL to the month grid", () => {
      const view = render(Calendar, {
        date,
        mode: "month",
        weekStartsOn,
        events: [trip],
        isRTL: true,
      });
      expect(view.getByRole("button", { name: /^Trip/ }).style.right).toBe("2px");
    });

    it("keeps PageDown on the next period", () => {
      const onChangeDate = vi.fn();
      const view = render(Calendar, {
        date,
        mode: "month",
        weekStartsOn,
        events: [],
        keyboardDayNavigation: true,
        onChangeDate,
        isRTL: true,
      });
      fireEvent.keyDown(view.getByRole("grid"), { key: "PageDown" });
      expect(format(onChangeDate.mock.calls[0][0] as Date, "yyyy-MM")).toBe("2026-08");
    });
  });
});
