import { fireEvent, render } from "@testing-library/react";
import { TimeGrid } from "../TimeGrid";

const day = new Date(2026, 5, 26);
const point = { clientX: 100, clientY: 96, pointerId: 1, pointerType: "touch" };

function setup() {
  const onPressCell = jest.fn();
  const onCreateEvent = jest.fn();
  const { container } = render(
    <TimeGrid date={day} hourHeight={48} onPressCell={onPressCell} onCreateEvent={onCreateEvent} />,
  );
  const column = container.querySelector("[data-date]");
  if (!(column instanceof HTMLElement)) {
    throw new Error("Missing day column");
  }
  return { column, onPressCell, onCreateEvent };
}

describe("DOM time grid touch cell taps", () => {
  it("presses a touch slot on click, after pointer-up", () => {
    const { column, onPressCell, onCreateEvent } = setup();
    fireEvent.pointerDown(column, point);
    fireEvent.pointerUp(column, point);
    expect(onPressCell).not.toHaveBeenCalled();
    fireEvent.click(column, { clientY: 96, detail: 1 });
    expect(onPressCell).toHaveBeenCalledWith(new Date(2026, 5, 26, 2));
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it.each(["swipe", "pointer cancellation"])("rejects a %s", (action) => {
    const { column, onPressCell, onCreateEvent } = setup();
    fireEvent.pointerDown(column, point);
    if (action === "swipe") {
      fireEvent.pointerMove(column, { ...point, clientY: 150 });
      fireEvent.pointerUp(column, { ...point, clientY: 150 });
    } else {
      fireEvent.pointerCancel(column, point);
    }
    fireEvent.click(column, { clientY: 150, detail: 1 });
    expect(onPressCell).not.toHaveBeenCalled();
    expect(onCreateEvent).not.toHaveBeenCalled();
  });
});
