import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { rendererName, act, fireEvent, render, TimeGrid } from "@calendar-test/renderer";

describe(rendererName, () => {
  const day = new Date(2026, 5, 26);
  const events: CalendarEvent[] = [
    { title: "Focus", start: new Date(2026, 5, 26, 14), end: new Date(2026, 5, 26, 16) },
  ];

  describe("time grid edge paging by pointer type", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      { pointerType: "touch", pages: false },
      { pointerType: "pen", pages: false },
      { pointerType: "mouse", pages: true },
    ])("allows paging only with a mouse: $pointerType", ({ pointerType, pages }) => {
      const onChangeDate = vi.fn();
      const { getByText } = render(TimeGrid, {
        date: day,
        mode: "week",
        events: events,
        onDragEvent: vi.fn(),
        onChangeDate: onChangeDate,
      });
      const box = getByText("Focus").closest('[role="button"]');
      const columns = box?.parentElement?.parentElement;
      if (!(box instanceof HTMLElement) || !(columns instanceof HTMLElement)) {
        throw new Error("Missing grid geometry");
      }
      vi.spyOn(columns, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 700,
        bottom: 1200,
        width: 700,
        height: 1200,
        toJSON: () => ({}),
      });
      const point = { clientX: 350, clientY: 300, pointerId: 1, pointerType };
      fireEvent.pointerDown(box, point);
      fireEvent.pointerMove(box, { ...point, clientX: 690, clientY: 348 });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(onChangeDate).toHaveBeenCalledTimes(pages ? 1 : 0);
      act(() => {
        vi.advanceTimersByTime(1800);
      });
      expect(onChangeDate).toHaveBeenCalledTimes(pages ? 4 : 0);
      fireEvent.pointerUp(document.body, { ...point, clientX: 690, clientY: 348 });
    });
  });
});
