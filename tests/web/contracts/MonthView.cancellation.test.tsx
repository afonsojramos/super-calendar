import { vi } from "vitest";
import { MonthView, MultiWeekView, fireEvent, render, rendererName } from "@calendar-test/renderer";

const date = new Date(2026, 6, 15);
const day = (container: HTMLElement, number: number) =>
  container.querySelector<HTMLElement>(`[data-day="2026-07-${number}"]`)!;
const press = (element: HTMLElement) =>
  fireEvent.pointerDown(element, { button: 0, pointerId: 7, pointerType: "mouse" });
const move = (element: HTMLElement) =>
  fireEvent.pointerEnter(element, { buttons: 1, pointerId: 7 });
const release = (pointerId = 7) => fireEvent.pointerUp(window, { button: 0, pointerId });

describe(rendererName, () => {
  describe.each(["month", "multiweek"])("%s drag cancellation", (mode) => {
    it.each(["Escape", "pointercancel"])(
      "cancels creation on %s and accepts the next sweep",
      (reason) => {
        const onCreateEvent = vi.fn();
        const view = render(mode === "month" ? MonthView : MultiWeekView, {
          date,
          events: [],
          onCreateEvent,
        });
        press(day(view.container, 15));
        move(day(view.container, 16));
        expect(view.container.querySelectorAll("[data-day][data-creating]")).toHaveLength(2);
        if (reason === "Escape") fireEvent.keyDown(window, { key: "Escape" });
        else fireEvent.pointerCancel(window, { pointerId: 7 });
        expect(view.container.querySelectorAll("[data-day][data-creating]")).toHaveLength(0);
        release();
        expect(onCreateEvent).not.toHaveBeenCalled();
        press(day(view.container, 17));
        move(day(view.container, 18));
        release();
        expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
          new Date(2026, 6, 17),
          new Date(2026, 6, 19),
        );
      },
    );
    it.each(["pointercancel", "pointerup"])("ignores another pointer's %s", (type) => {
      const onCreateEvent = vi.fn();
      const view = render(mode === "month" ? MonthView : MultiWeekView, {
        date,
        events: [],
        onCreateEvent,
      });
      press(day(view.container, 15));
      move(day(view.container, 16));
      if (type === "pointercancel") fireEvent.pointerCancel(window, { pointerId: 8 });
      else release(8);
      expect(onCreateEvent).not.toHaveBeenCalled();
      expect(view.container.querySelectorAll("[data-day][data-creating]")).toHaveLength(2);
      release();
      expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 6, 15),
        new Date(2026, 6, 17),
      );
    });
    it("cancels an event move on Escape", () => {
      const event = {
        title: "Existing",
        start: new Date(2026, 6, 15),
        end: new Date(2026, 6, 16),
        allDay: true,
      };
      const onDragEvent = vi.fn();
      const view = render(mode === "month" ? MonthView : MultiWeekView, {
        date,
        events: [event],
        onDragEvent,
      });
      press(view.getByRole("button", { name: /^Existing,/ }));
      move(day(view.container, 16));
      expect(view.container.querySelectorAll("[data-day][data-drop]")).toHaveLength(1);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(view.container.querySelectorAll("[data-day][data-drop]")).toHaveLength(0);
      release();
      expect(onDragEvent).not.toHaveBeenCalled();
    });
  });
});
