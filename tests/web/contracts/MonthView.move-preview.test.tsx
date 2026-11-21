import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { MonthView, MultiWeekView, fireEvent, render, rendererName } from "@calendar-test/renderer";

const date = new Date(2026, 6, 15);
// Wednesday to Friday, so a move to Saturday crosses into the next week row.
const trip: CalendarEvent = {
  title: "Trip",
  start: new Date(2026, 6, 15),
  end: new Date(2026, 6, 18),
  allDay: true,
};
const cell = (container: HTMLElement, day: string) =>
  container.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
const previews = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>("[data-dragging]"),
];
const dropDays = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>("[data-day][data-drop]")].map(
    (element) => element.dataset.day,
  );
const press = (element: HTMLElement) =>
  fireEvent.pointerDown(element, { button: 0, pointerId: 3, pointerType: "mouse" });
const enter = (element: HTMLElement) =>
  fireEvent.pointerEnter(element, { buttons: 1, pointerId: 3 });
const release = () => fireEvent.pointerUp(window, { button: 0, pointerId: 3 });
const top = (element: HTMLElement) => Number.parseFloat(element.style.top);
// React writes a zero length as "0", Solid as "0px".
const squared = (radius: string) => radius === "0" || radius === "0px";

describe(rendererName, () => {
  describe.each(["month", "multiweek"])("%s move preview", (mode) => {
    const View = mode === "month" ? MonthView : MultiWeekView;

    it("previews a multi-day move across a week boundary and tints every covered day", () => {
      const onDragEvent = vi.fn();
      const view = render(View, { date, weekStartsOn: 1, events: [trip], onDragEvent });
      const chip = view.getByRole("button", { name: /^Trip,/ });
      press(chip);
      enter(cell(view.container, "2026-07-16"));
      enter(cell(view.container, "2026-07-18"));

      // Saturday and Sunday in the first row, Monday in the next.
      const [first, second, ...rest] = previews(view.container);
      expect(rest).toHaveLength(0);
      expect(first.closest("[data-day]")).toBe(cell(view.container, "2026-07-18"));
      expect(first.style.width).toBe("calc(200% - 4px)");
      expect(second.closest("[data-day]")).toBe(cell(view.container, "2026-07-20"));
      expect(second.style.width).toBe("calc(100% - 4px)");
      for (const preview of [first, second]) {
        expect(preview.textContent).toBe("Trip");
        expect(preview.style.pointerEvents).toBe("none");
        expect(preview.getAttribute("aria-hidden")).toBe("true");
        expect(Number(preview.style.opacity)).toBeLessThan(1);
      }
      // The default chip squares the ends where the preview continues.
      const firstChip = first.firstElementChild as HTMLElement;
      const secondChip = second.firstElementChild as HTMLElement;
      expect(squared(firstChip.style.borderTopRightRadius)).toBe(true);
      expect(squared(firstChip.style.borderTopLeftRadius)).toBe(false);
      expect(squared(secondChip.style.borderTopLeftRadius)).toBe(true);
      expect(squared(secondChip.style.borderTopRightRadius)).toBe(false);

      expect(dropDays(view.container)).toEqual(["2026-07-18", "2026-07-19", "2026-07-20"]);
      for (const day of ["2026-07-18", "2026-07-19", "2026-07-20"]) {
        expect(cell(view.container, day).style.background).toBe("rgb(220, 231, 255)");
      }
      // The carried event stays in place, faded.
      expect(Number(chip.style.opacity)).toBeLessThan(1);

      release();
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        trip,
        new Date(2026, 6, 18),
        new Date(2026, 6, 21),
      );
      expect(previews(view.container)).toHaveLength(0);
      expect(dropDays(view.container)).toEqual([]);
    });

    it("removes the preview when the pointer returns to the origin day", () => {
      const view = render(View, { date, weekStartsOn: 1, events: [trip], onDragEvent: vi.fn() });
      press(view.getByRole("button", { name: /^Trip,/ }));
      enter(cell(view.container, "2026-07-16"));
      expect(previews(view.container)).toHaveLength(1);
      enter(cell(view.container, "2026-07-15"));
      expect(previews(view.container)).toHaveLength(0);
      expect(dropDays(view.container)).toEqual([]);
      release();
    });

    it.each(["Escape", "pointercancel"])("removes the preview on %s", (reason) => {
      const onDragEvent = vi.fn();
      const view = render(View, { date, weekStartsOn: 1, events: [trip], onDragEvent });
      press(view.getByRole("button", { name: /^Trip,/ }));
      enter(cell(view.container, "2026-07-17"));
      expect(previews(view.container)).toHaveLength(1);
      if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
      else fireEvent.pointerCancel(window, { pointerId: 3 });
      expect(previews(view.container)).toHaveLength(0);
      expect(dropDays(view.container)).toEqual([]);
      release();
      expect(onDragEvent).not.toHaveBeenCalled();
    });

    it("keeps the carried bar and its focus when the preview moves it to another lane", () => {
      const view = render(View, { date, weekStartsOn: 1, events: [trip], onDragEvent: vi.fn() });
      const chip = view.getByRole("button", { name: /^Trip,/ });
      chip.focus();
      press(chip);
      // Starting a day earlier, the preview takes lane 0 and the original moves down.
      enter(cell(view.container, "2026-07-14"));
      expect(top(view.getByRole("button", { name: /^Trip,/ }))).toBeGreaterThan(
        top(previews(view.container)[0]),
      );
      fireEvent.keyDown(window, { key: "Escape" });
      release();
      expect(view.getByRole("button", { name: /^Trip,/ })).toBe(chip);
      expect(document.activeElement).toBe(chip);
    });

    it("puts the preview on the lane the moved event takes, moving bars aside", () => {
      // Lunch holds lane 0 on Tuesday. Trip moved to Tuesday starts there too but
      // spans longer, so it takes lane 0 and Lunch moves below, as after the drop.
      const lunch: CalendarEvent = {
        title: "Lunch",
        start: new Date(2026, 6, 14, 12),
        end: new Date(2026, 6, 14, 13),
      };
      const view = render(View, {
        date,
        weekStartsOn: 1,
        events: [trip, lunch],
        onDragEvent: vi.fn(),
      });
      const lunchChip = view.getByRole("button", { name: /^Lunch,/ });
      const laneZero = top(lunchChip);
      press(view.getByRole("button", { name: /^Trip,/ }));
      enter(cell(view.container, "2026-07-14"));
      const [preview] = previews(view.container);
      expect(preview.closest("[data-day]")).toBe(cell(view.container, "2026-07-14"));
      expect(top(preview)).toBe(laneZero);
      expect(top(view.getByRole("button", { name: /^Lunch,/ }))).toBeGreaterThan(laneZero);
      release();
    });

    it("previews a timed event on its destination day with the consumer's chip", () => {
      const standup: CalendarEvent = {
        title: "Standup",
        start: new Date(2026, 6, 15, 9, 30),
        end: new Date(2026, 6, 15, 10, 15),
      };
      const Chip = (props: { event: CalendarEvent }) => (
        <span>{`${props.event.title} ${props.event.start.getDate()}:${props.event.start.getHours()}`}</span>
      );
      const view = render(View, {
        date,
        weekStartsOn: 1,
        events: [standup],
        renderEvent: Chip,
        onDragEvent: vi.fn(),
      });
      press(view.getByRole("button", { name: /^Standup,/ }));
      enter(cell(view.container, "2026-07-21"));
      const [preview, ...rest] = previews(view.container);
      expect(rest).toHaveLength(0);
      expect(preview.closest("[data-day]")).toBe(cell(view.container, "2026-07-21"));
      expect(preview.textContent).toBe("Standup 21:9");
      expect(dropDays(view.container)).toEqual(["2026-07-21"]);
      release();
    });
  });
});
