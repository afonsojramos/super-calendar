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

function setup(events: CalendarEvent[] = [event]) {
  const onPressEvent = jest.fn();
  const onDragStart = jest.fn();
  const onDragEvent = jest.fn();
  const result = render(
    <TimeGrid
      date={day}
      events={events}
      hourHeight={48}
      onPressEvent={onPressEvent}
      onDragStart={onDragStart}
      onDragEvent={onDragEvent}
    />,
  );
  const box = element(result.getByText("Focus").closest('[role="button"]'));
  return { ...result, box, onPressEvent, onDragStart, onDragEvent };
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

  describe.each([false, true])("with an active drag: %s", (active) => {
    it.each(["same event", "another event", "start grip", "end grip"])(
      "rejects a second contact on the %s",
      (target) => {
        const other: CalendarEvent = {
          title: "Other",
          start: new Date(2026, 5, 26, 17),
          end: new Date(2026, 5, 26, 18),
        };
        const { box, getByText, onDragStart, onDragEvent } = setup([event, other]);
        const grips = box.querySelectorAll('[style*="ns-resize"]');
        const secondBox =
          target === "another event"
            ? element(getByText("Other").closest('[role="button"]'))
            : target === "start grip"
              ? element(grips[0])
              : target === "end grip"
                ? element(grips[1])
                : box;
        fireEvent.pointerDown(box, point);
        if (active) {
          act(() => jest.advanceTimersByTime(300));
        }
        const second = { ...point, pointerId: 2, isPrimary: false };
        fireEvent.pointerDown(secondBox, second);
        act(() => jest.advanceTimersByTime(400));
        expect(onDragStart).toHaveBeenCalledTimes(active ? 1 : 0);
        fireEvent.pointerMove(secondBox, { ...second, clientY: 348 });
        fireEvent.pointerUp(secondBox, { ...second, clientY: 348 });
        expect(onDragEvent).not.toHaveBeenCalled();

        fireEvent.pointerMove(box, { ...point, clientY: 348 });
        fireEvent.pointerUp(box, { ...point, clientY: 348 });
        expect(onDragEvent).toHaveBeenCalledTimes(active ? 1 : 0);
        if (active) {
          expect(onDragEvent).toHaveBeenCalledWith(
            event,
            new Date(2026, 5, 26, 15),
            new Date(2026, 5, 26, 17),
          );
        }
      },
    );
  });

  it("rejects a secondary touch when the primary contact began outside the grid", () => {
    const { box, onDragStart } = setup();
    fireEvent.pointerDown(document.body, point);
    const second = { ...point, pointerId: 2, isPrimary: false };
    fireEvent.pointerDown(box, second);
    act(() => jest.advanceTimersByTime(400));
    expect(onDragStart).not.toHaveBeenCalled();
    fireEvent.pointerUp(box, second);
    fireEvent.pointerUp(document.body, point);

    fireEvent.pointerDown(box, { ...point, pointerId: 3, isPrimary: true });
    act(() => jest.advanceTimersByTime(300));
    expect(onDragStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerCancel(box, { ...point, pointerId: 3 });
  });

  it("cancels a pending hold when another primary pointer type presses an event", () => {
    const { box, onDragStart } = setup();
    fireEvent.pointerDown(box, point);
    const pen = { ...point, pointerId: 2, pointerType: "pen", isPrimary: true };
    fireEvent.pointerDown(box, pen);
    act(() => jest.advanceTimersByTime(400));
    expect(onDragStart).not.toHaveBeenCalled();
    fireEvent.pointerUp(box, pen);
    fireEvent.pointerUp(box, point);
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
});
