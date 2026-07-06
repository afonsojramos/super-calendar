import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { TimeGrid } from "../TimeGrid";

const day = new Date(2026, 5, 26);
const events: CalendarEvent[] = [
  { title: "Focus", start: new Date(2026, 5, 26, 14, 0), end: new Date(2026, 5, 26, 16, 0) },
];

// The event chip sits inside the absolutely-positioned wrapper that carries the
// pointer handlers: title div -> default-event root -> wrapper.
function wrapperOf(chip: HTMLElement): HTMLElement {
  return chip.parentElement!.parentElement!;
}

describe("dom TimeGrid", () => {
  it("renders timed events with their time label", () => {
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} />,
    );
    expect(getByText("Focus")).toBeTruthy();
    expect(getByText("14:00 - 16:00")).toBeTruthy();
  });

  it("hides the time line on a short event in a narrow multi-column view", () => {
    const short: CalendarEvent[] = [
      { title: "Quick", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 9, 30) },
    ];
    const { getByText, queryByText } = render(
      <TimeGrid date={day} mode="week" events={short} hourHeight={48} />,
    );
    expect(getByText("Quick")).toBeTruthy();
    // 30 min at 48px/h = 24px box, below the 56px threshold: title only.
    expect(queryByText("09:00 - 09:30")).toBeNull();
  });

  it("drag-moves an event and reports the snapped new times", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Focus"));
    // Drag up 96px = 2h at 48px/hour: 14:00–16:00 -> 12:00–14:00.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 204, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 204, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getHours()).toBe(12);
    expect(end.getHours()).toBe(14);
  });

  it("treats a press with no movement as a tap, not a drag", () => {
    const onDragEvent = jest.fn();
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={events}
        hourHeight={48}
        onDragEvent={onDragEvent}
        onPressEvent={onPressEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 300, pointerId: 1 });

    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps an event in place when onDragEvent rejects the drop", () => {
    const onDragEvent = jest.fn(() => false);
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Focus"));
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 204, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 204, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    // Controlled: the parent declined, so the event is still rendered (snaps back).
    expect(getByText("Focus")).toBeTruthy();
  });

  // The day column is the only element with a left border (day separator).
  function dayColumn(container: HTMLElement): HTMLElement {
    return container.querySelector<HTMLElement>('[style*="border-left"]')!;
  }

  it("sweeps out a new event from empty grid space", () => {
    const onCreateEvent = jest.fn();
    const { container } = render(
      <TimeGrid date={day} mode="day" hourHeight={48} onCreateEvent={onCreateEvent} />,
    );
    const col = dayColumn(container);
    // Drag from 0px (00:00) to 96px (02:00) at 48px/hour.
    fireEvent.pointerDown(col, { clientY: 0, pointerId: 1, button: 0 });
    fireEvent.pointerMove(col, { clientY: 96, pointerId: 1 });
    fireEvent.pointerUp(col, { clientY: 96, pointerId: 1 });

    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(2);
  });

  it("treats a stationary press on empty space as onPressCell", () => {
    const onPressCell = jest.fn();
    const { container } = render(
      <TimeGrid date={day} mode="day" hourHeight={48} onPressCell={onPressCell} />,
    );
    const col = dayColumn(container);
    fireEvent.pointerDown(col, { clientY: 96, pointerId: 1, button: 0 });
    fireEvent.pointerUp(col, { clientY: 96, pointerId: 1 });

    expect(onPressCell).toHaveBeenCalledTimes(1);
    expect((onPressCell.mock.calls[0][0] as Date).getHours()).toBe(2);
  });

  it("spreads a multi-day all-day event across every column it covers", () => {
    const wed = new Date(2026, 6, 15); // week (Mon start) = Jul 13–19
    const trip: CalendarEvent[] = [
      { title: "Trip", start: new Date(2026, 6, 14), end: new Date(2026, 6, 17), allDay: true },
    ];
    const { getAllByText } = render(
      <TimeGrid date={wed} mode="week" weekStartsOn={1} events={trip} hourHeight={48} />,
    );
    // Covers the 14th, 15th, 16th (end exclusive at midnight of the 17th).
    expect(getAllByText("Trip")).toHaveLength(3);
  });

  it("queries businessHours for each visible day", () => {
    const businessHours = jest.fn(() => ({ start: 9, end: 17 }));
    render(<TimeGrid date={day} mode="3days" weekStartsOn={1} businessHours={businessHours} />);
    expect(businessHours).toHaveBeenCalled();
  });

  it("does not make empty day columns keyboard tab stops", () => {
    const { container } = render(
      <TimeGrid date={day} mode="day" hourHeight={48} onCreateEvent={jest.fn()} />,
    );
    // Empty columns are pointer-only; keyboard focus moves through events only.
    expect(dayColumn(container).getAttribute("tabindex")).toBeNull();
  });

  it("keeps events keyboard-focusable and activatable", () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={events}
        hourHeight={48}
        onPressEvent={onPressEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    expect(box.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("hides the all-day lane when showAllDayEventCell is false", () => {
    const allDay: CalendarEvent[] = [
      { title: "Holiday", start: new Date(2026, 5, 26), end: new Date(2026, 5, 27), allDay: true },
    ];
    const { queryByText, rerender } = render(
      <TimeGrid date={day} mode="day" events={allDay} hourHeight={48} />,
    );
    expect(queryByText("all-day")).toBeTruthy();
    rerender(
      <TimeGrid
        date={day}
        mode="day"
        events={allDay}
        hourHeight={48}
        showAllDayEventCell={false}
      />,
    );
    expect(queryByText("all-day")).toBeNull();
  });

  it("uses eventAccessibilityLabel to override an event's aria-label", () => {
    const { getByLabelText, queryByLabelText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={events}
        hourHeight={48}
        eventAccessibilityLabel={(event, ctx) => `Custom: ${event.title} (${ctx.mode})`}
      />,
    );
    expect(getByLabelText("Custom: Focus (day)")).toBeTruthy();
    // The built-in "title, time range" label is replaced.
    expect(queryByLabelText("Focus, 14:00 to 16:00")).toBeNull();
  });

  describe("slot styling", () => {
    it("applies per-slot classes and drops the themed inline style so the class wins", () => {
      const { container } = render(
        <TimeGrid mode="day" date={day} events={events} classNames={{ hourLabel: "text-xs" }} />,
      );
      const label = container.querySelector('[data-slot="hourLabel"]') as HTMLElement;
      expect(label.className).toBe("text-xs");
      // Structural positioning kept; themed colour/size dropped for the class.
      expect(label.style.position).toBe("absolute");
      expect(label.style.fontSize).toBe("");
    });

    it("marks today's column header with data-today", () => {
      const { container } = render(<TimeGrid mode="day" date={new Date()} />);
      const header = container.querySelector('[data-slot="columnHeader"]') as HTMLElement;
      expect(header.hasAttribute("data-today")).toBe(true);
    });
  });
});
