import { act, fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { TimeGrid } from "../TimeGrid";
import { Calendar } from "../Calendar";

const day = new Date(2026, 5, 26);
const event: CalendarEvent = {
  title: "Focus",
  start: new Date(2026, 5, 26, 14),
  end: new Date(2026, 5, 26, 16),
};
const point = { clientX: 350, clientY: 300, pointerId: 1, pointerType: "touch" };

function element(node: Element | null): HTMLElement {
  if (!(node instanceof HTMLElement)) {
    throw new Error("Missing grid element");
  }
  return node;
}

function setup() {
  const onPressEvent = jest.fn();
  const onDragStart = jest.fn();
  const onDragEvent = jest.fn();
  const onChangeDate = jest.fn();
  const result = render(
    <TimeGrid
      date={day}
      events={[event]}
      hourHeight={48}
      onPressEvent={onPressEvent}
      onDragStart={onDragStart}
      onDragEvent={onDragEvent}
      onChangeDate={onChangeDate}
    />,
  );
  const box = element(result.getByText("Focus").closest('[role="button"]'));
  return { ...result, box, onPressEvent, onDragStart, onDragEvent, onChangeDate };
}

describe("DOM time grid touch gestures", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(["touch", "pen"])("presses a %s tap only from the event click", (pointerType) => {
    const { box, onPressEvent, onDragStart, onDragEvent } = setup();
    fireEvent.pointerDown(box, { ...point, pointerType });
    fireEvent.pointerMove(box, { ...point, pointerType, clientY: 303 });
    fireEvent.pointerUp(box, { ...point, pointerType, clientY: 303 });
    expect(onPressEvent).not.toHaveBeenCalled();
    fireEvent.click(box, { detail: 1 });
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("leaves a swipe free to scroll and cancels the hold", () => {
    const { box, onDragStart, onDragEvent, onPressEvent } = setup();
    expect(box.style.touchAction).toBe("pan-y");
    fireEvent.pointerDown(box, point);
    fireEvent.pointerMove(box, { ...point, clientY: 320 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    const move = new Event("touchmove", { bubbles: true, cancelable: true });
    box.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    fireEvent.pointerUp(box, { ...point, clientY: 320 });
    fireEvent.click(box, { detail: 1 });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onPressEvent).not.toHaveBeenCalled();
  });

  it("presses a resize-grip tap only from the event click", () => {
    const { box, onPressEvent, onDragStart } = setup();
    const grip = element(box.querySelector('[style*="ns-resize"]'));
    fireEvent.pointerDown(grip, point);
    fireEvent.pointerUp(grip, point);
    expect(onPressEvent).not.toHaveBeenCalled();
    fireEvent.click(grip, { detail: 1 });
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("leaves a swipe that starts on a resize grip free to scroll", () => {
    const { box, onDragStart } = setup();
    const grip = element(box.querySelector('[style*="ns-resize"]'));
    expect(grip.style.touchAction).toBe("pan-y");
    fireEvent.pointerDown(grip, point);
    fireEvent.pointerMove(grip, { ...point, clientY: 350 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it("starts after 300 ms, prevents scrolling, commits a move and suppresses its click", () => {
    const { box, onDragStart, onDragEvent, onPressEvent } = setup();
    fireEvent.pointerDown(box, point);
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(onDragStart).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    const move = new Event("touchmove", { bubbles: true, cancelable: true });
    box.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(true);
    fireEvent.pointerMove(box, { ...point, clientY: 348 });
    fireEvent.pointerUp(box, { ...point, clientY: 348 });
    fireEvent.click(box, { detail: 1 });
    expect(onDragEvent).toHaveBeenCalledWith(
      event,
      new Date(2026, 5, 26, 15),
      new Date(2026, 5, 26, 17),
    );
    expect(onPressEvent).not.toHaveBeenCalled();
  });

  it("keeps a stationary hold and small jitter as a click", () => {
    const { box, onDragEvent, onPressEvent } = setup();
    fireEvent.pointerDown(box, point);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.pointerMove(box, { ...point, clientY: 304 });
    fireEvent.pointerUp(box, { ...point, clientY: 304 });
    expect(onPressEvent).not.toHaveBeenCalled();
    fireEvent.click(box, { detail: 1 });
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("does not page dates when a touch drag dwells at an edge", () => {
    const { box, onChangeDate } = setup();
    const columns = element(box.parentElement?.parentElement ?? null);
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
    fireEvent.pointerDown(box, point);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.pointerMove(box, { ...point, clientX: 690, clientY: 348 });
    act(() => {
      jest.advanceTimersByTime(2400);
    });
    expect(onChangeDate).not.toHaveBeenCalled();
    fireEvent.pointerUp(document.body, { ...point, clientX: 690, clientY: 348 });
  });

  it.each(["pointercancel", "second finger", "unmount"])(
    "cancels a pending hold on %s",
    (action) => {
      const { box, unmount, onDragStart } = setup();
      fireEvent.pointerDown(box, point);
      if (action === "pointercancel") {
        fireEvent.pointerCancel(box, point);
      } else if (action === "second finger") {
        fireEvent.pointerDown(document.body, { ...point, pointerId: 2 });
      } else {
        unmount();
      }
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(onDragStart).not.toHaveBeenCalled();
    },
  );

  it("ignores another pointer's move and release during an active drag", () => {
    const { box, onDragEvent } = setup();
    fireEvent.pointerDown(box, point);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.pointerMove(document.body, { ...point, pointerId: 2, clientY: 396 });
    fireEvent.pointerUp(document.body, { ...point, pointerId: 2 });
    expect(onDragEvent).not.toHaveBeenCalled();
    fireEvent.pointerMove(box, { ...point, clientY: 348 });
    fireEvent.pointerUp(box, { ...point, clientY: 348 });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
  });

  it("forwards configurable hold timing and tolerance from Calendar", () => {
    const onDragStart = jest.fn();
    const { getByText } = render(
      <Calendar
        date={day}
        mode="day"
        events={[event]}
        onDragEvent={jest.fn()}
        onDragStart={onDragStart}
        touchDragDelay={500}
        touchDragThreshold={12}
      />,
    );
    const box = element(getByText("Focus").closest('[role="button"]'));
    fireEvent.pointerDown(box, point);
    fireEvent.pointerMove(box, { ...point, clientY: 310 });
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(onDragStart).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerCancel(box, point);
  });

  it("cleans up an active drag on cancellation and restores scrolling", () => {
    const { box, onDragEvent } = setup();
    fireEvent.pointerDown(box, point);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    fireEvent.pointerMove(box, { ...point, clientY: 348 });
    fireEvent.pointerCancel(box, point);
    const move = new Event("touchmove", { bubbles: true, cancelable: true });
    box.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    fireEvent.pointerUp(document.body, { ...point, clientY: 348 });
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("presses an empty touch slot on click and rejects a swipe or cancelled contact", () => {
    const onPressCell = jest.fn();
    const { container } = render(<TimeGrid date={day} hourHeight={48} onPressCell={onPressCell} />);
    const column = element(container.querySelector("[data-date]"));
    fireEvent.pointerDown(column, { ...point, clientY: 96 });
    fireEvent.pointerUp(column, { ...point, clientY: 96 });
    expect(onPressCell).not.toHaveBeenCalled();
    fireEvent.click(column, { clientY: 96, detail: 1 });
    expect(onPressCell).toHaveBeenCalledWith(new Date(2026, 5, 26, 2));
    onPressCell.mockClear();
    fireEvent.pointerDown(column, point);
    fireEvent.pointerMove(column, { ...point, clientY: 350 });
    fireEvent.pointerUp(column, { ...point, clientY: 350 });
    fireEvent.click(column, { clientY: 350, detail: 1 });
    fireEvent.pointerDown(column, point);
    fireEvent.pointerCancel(column, point);
    fireEvent.click(column, { clientY: 300, detail: 1 });
    expect(onPressCell).not.toHaveBeenCalled();
  });
});
