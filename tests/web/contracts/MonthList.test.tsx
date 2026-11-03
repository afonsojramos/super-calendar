import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import {
  rendererName,
  fireEvent,
  render,
  MonthList,
  type MonthListProps,
} from "@calendar-test/renderer";

describe(rendererName, () => {
  const anchor = new Date(2026, 6, 15);

  describe("MonthList", () => {
    it("renders the weekday header in the configured week order", () => {
      const { container } = render(MonthList, {
        date: anchor,
        weekStartsOn: 1,
        pastMonths: 0,
        futureMonths: 0,
        height: 400,
      });
      expect(
        [...container.querySelectorAll('[data-slot="weekday"]')].map((day) => day.textContent),
      ).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    });

    it("renders event chips for the anchor month via the prebuilt index", () => {
      const events: CalendarEvent[] = [
        { title: "Sync", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
      ];
      const { getByText } = render(MonthList, {
        date: anchor,
        weekStartsOn: 1,
        events: events,
        pastMonths: 0,
        futureMonths: 0,
        height: 400,
      });
      expect(getByText("Sync")).toBeTruthy();
    });

    it("fires onPressDay with the clicked day", () => {
      const onPressDay = vi.fn();
      const { getByLabelText } = render(MonthList, {
        date: anchor,
        weekStartsOn: 1,
        pastMonths: 0,
        futureMonths: 0,
        height: 400,
        onPressDay: onPressDay,
      });
      fireEvent.click(getByLabelText("Wednesday, 15 July 2026"));
      expect(onPressDay).toHaveBeenCalledTimes(1);
      expect((onPressDay.mock.calls[0][0] as Date).getDate()).toBe(15);
    });

    it("uses replacement callbacks with stable date and events", () => {
      const events: CalendarEvent[] = [];
      const props = { date: anchor, events, pastMonths: 0, futureMonths: 0 };
      const previous = vi.fn();
      const current = vi.fn();
      const view = render(MonthList, { ...props, onPressDay: previous });

      view.rerender({ ...props, onPressDay: current });
      fireEvent.click(view.getByLabelText(/^Wednesday, 15 July 2026/));

      expect(current).toHaveBeenCalledExactlyOnceWith(anchor);
      expect(previous).not.toHaveBeenCalled();
    });

    it.each([
      { name: "minimum date", constraint: { minDate: new Date(2026, 6, 16) } },
      { name: "maximum date", constraint: { maxDate: new Date(2026, 6, 14) } },
      {
        name: "disabled dates",
        constraint: { isDateDisabled: (day: Date) => day.getDate() === 15 },
      },
    ])("updates mounted days when $name changes", ({ constraint }) => {
      const events: CalendarEvent[] = [];
      const onPressDay = vi.fn();
      const props = { date: anchor, events, pastMonths: 0, futureMonths: 0, onPressDay };
      const view = render(MonthList, props);

      view.rerender({ ...props, ...constraint });
      const day = view.getByLabelText(/^Wednesday, 15 July 2026/);
      expect(day.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(day);
      expect(onPressDay).not.toHaveBeenCalled();

      view.rerender(props);
      fireEvent.click(view.getByLabelText(/^Wednesday, 15 July 2026/));
      expect(onPressDay).toHaveBeenCalledExactlyOnceWith(anchor);
    });

    it("updates mounted day styling with stable date and selection", () => {
      const selectedDates = [anchor];
      const props: MonthListProps = { date: anchor, selectedDates, pastMonths: 0, futureMonths: 0 };
      const view = render(MonthList, props);
      const day = () => view.getByLabelText(/^Wednesday, 15 July 2026/);

      view.rerender({ ...props, theme: { cellHeight: 80, selectedBackground: "red" } });
      expect(day().style.height).toBe("80px");
      expect(day().querySelector<HTMLElement>('[data-slot="dayBadge"]')?.style.background).toBe(
        "red",
      );

      view.rerender({ ...props, styles: { day: { color: "purple" } } });
      expect(day().style.color).toBe("purple");
      expect(day().style.height).toBe("48px");
    });

    it("updates mounted chips when only their dimensions change", () => {
      const events: CalendarEvent[] = [
        { title: "Sync", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
      ];
      const props = { date: anchor, events, pastMonths: 0, futureMonths: 0, height: 400 };
      const { container, getByText, rerender } = render(MonthList, {
        ...props,
        chipHeight: 20,
        chipGap: 2,
      });
      const gap = () => container.querySelector<HTMLElement>('[data-day="2026-07-15"]')?.style.gap;
      expect(getByText("Sync").style.height).toBe("20px");
      expect(gap()).toBe("2px");

      rerender({ ...props, chipHeight: 44, chipGap: 2 });
      expect(getByText("Sync").style.height).toBe("44px");

      rerender({ ...props, chipHeight: 44, chipGap: 6 });
      expect(gap()).toBe("6px");
    });
  });
});
