import { act, fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { TimeGrid } from "../TimeGrid";

const day = new Date(2026, 5, 26);
const events: CalendarEvent[] = [
  { title: "Focus", start: new Date(2026, 5, 26, 14), end: new Date(2026, 5, 26, 16) },
];

describe("DOM time grid edge paging by pointer type", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    { pointerType: "touch", pages: false },
    { pointerType: "pen", pages: false },
    { pointerType: "mouse", pages: true },
  ])("allows paging only with a mouse: $pointerType", ({ pointerType, pages }) => {
    const onChangeDate = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="week"
        events={events}
        onDragEvent={jest.fn()}
        onChangeDate={onChangeDate}
      />,
    );
    const box = getByText("Focus").closest('[role="button"]');
    const columns = box?.parentElement?.parentElement;
    if (!(box instanceof HTMLElement) || !(columns instanceof HTMLElement)) {
      throw new Error("Missing grid geometry");
    }
    jest.spyOn(columns, "getBoundingClientRect").mockReturnValue({
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
      jest.advanceTimersByTime(600);
    });
    expect(onChangeDate).toHaveBeenCalledTimes(pages ? 1 : 0);
    act(() => {
      jest.advanceTimersByTime(1800);
    });
    expect(onChangeDate).toHaveBeenCalledTimes(pages ? 4 : 0);
    fireEvent.pointerUp(document.body, { ...point, clientX: 690, clientY: 348 });
  });
});
