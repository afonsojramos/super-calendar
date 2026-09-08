import { act, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
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

  it("centers a lone title line vertically and keeps taller chips top-aligned", () => {
    const mixed: CalendarEvent[] = [
      { title: "Quick", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 9, 30) },
      ...events, // Focus, 2h: title + time fit, stays top-aligned
    ];
    const { getByText } = render(<TimeGrid date={day} mode="day" events={mixed} hourHeight={48} />);
    // The 24px box fits exactly one title line and no time: centered.
    const quickBox = getByText("Quick").parentElement as HTMLElement;
    expect(quickBox.style.justifyContent).toBe("center");
    const focusBox = getByText("Focus").parentElement as HTMLElement;
    expect(focusBox.style.justifyContent).toBe("");
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

  it("resizes from the top edge: moves the start, keeps the end fixed", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Focus"));
    // The top handle is the ns-resize strip pinned to the box's top edge.
    const topHandle = Array.from(box.querySelectorAll<HTMLElement>('div[style*="ns-resize"]')).find(
      (h) => h.style.top === "0px",
    )!;
    // Drag the top down 48px = +1h at 48px/hour: 14:00–16:00 -> 15:00–16:00.
    fireEvent.pointerDown(topHandle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(topHandle, { clientY: 348, pointerId: 1 });
    fireEvent.pointerUp(topHandle, { clientY: 348, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getHours()).toBe(15);
    expect(end.getHours()).toBe(16);
  });

  it("durationEditable:false keeps an event movable but removes its resize handles", () => {
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={[{ ...events[0], durationEditable: false }]}
        hourHeight={48}
        onDragEvent={jest.fn()}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    expect(box.querySelectorAll('div[style*="ns-resize"]')).toHaveLength(0);
    expect(box.style.cursor).toBe("grab");
  });

  it("eventOverlap={false} rejects a drag that would collide with another event", () => {
    const onDragEvent = jest.fn();
    const two: CalendarEvent[] = [
      { title: "A", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 10, 0) },
      { title: "B", start: new Date(2026, 5, 26, 12, 0), end: new Date(2026, 5, 26, 13, 0) },
    ];
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={two}
        hourHeight={48}
        eventOverlap={false}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("A"));
    // Drag A (09:00) down 3h to 12:00, landing on B -> rejected, handler not called.
    fireEvent.pointerDown(box, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 244, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 244, pointerId: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("eventOverlap={false} still allows a drag to a free slot", () => {
    const onDragEvent = jest.fn();
    const two: CalendarEvent[] = [
      { title: "A", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 10, 0) },
      { title: "B", start: new Date(2026, 5, 26, 12, 0), end: new Date(2026, 5, 26, 13, 0) },
    ];
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={two}
        hourHeight={48}
        eventOverlap={false}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("A"));
    // Drag A down 5h to 14:00, a free slot -> committed.
    fireEvent.pointerDown(box, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 340, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 340, pointerId: 1 });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
  });

  it("startEditable:false keeps an event resizable but not movable", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={[{ ...events[0], startEditable: false }]}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    expect(box.style.cursor).toBe("pointer");
    expect(box.querySelectorAll('div[style*="ns-resize"]').length).toBeGreaterThan(0);
    // A drag on the body does not move it.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 204, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 204, pointerId: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("tints weekend columns by default and drops the tint with highlightWeekends=false", () => {
    const { container, rerender } = render(
      <TimeGrid date={day} mode="week" events={[]} hourHeight={48} />,
    );
    const weekendCols = () => Array.from(container.querySelectorAll<HTMLElement>("[data-weekend]"));
    expect(weekendCols().length).toBeGreaterThan(0);
    expect(weekendCols().every((el) => el.style.background !== "")).toBe(true);

    rerender(
      <TimeGrid date={day} mode="week" events={[]} hourHeight={48} highlightWeekends={false} />,
    );
    expect(weekendCols().every((el) => el.style.background === "")).toBe(true);
  });

  it("locks an event with draggable:false: drag is a no-op, taps still fire", () => {
    const onDragEvent = jest.fn();
    const onPressEvent = jest.fn();
    const locked: CalendarEvent[] = [{ ...events[0], draggable: false }];
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={locked}
        hourHeight={48}
        onDragEvent={onDragEvent}
        onPressEvent={onPressEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    // A locked event stays a plain pointer target, not a grab handle.
    expect(box.style.cursor).toBe("pointer");
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 204, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 204, pointerId: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
    // Taps are unaffected: clicking still selects the event.
    fireEvent.click(box);
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("drag-moves an event to another day column, keeping its time and duration", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="week" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Focus"));
    // jsdom has no layout, so give the day column a real width for the
    // horizontal day math.
    const column = box.parentElement as HTMLElement;
    column.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
    // Drag one column to the right with no vertical movement: same time, +1 day.
    fireEvent.pointerDown(box, { clientX: 50, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 150, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: 150, clientY: 300, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getDate()).toBe(27);
    expect(start.getHours()).toBe(14);
    expect(end.getDate()).toBe(27);
    expect(end.getHours()).toBe(16);
  });

  it("drag-moves an event past the end of the day, continuing it on the next one", () => {
    const onDragEvent = jest.fn();
    const late: CalendarEvent[] = [
      { title: "Gig", start: new Date(2026, 5, 26, 19, 0), end: new Date(2026, 5, 26, 23, 0) },
    ];
    const { getByText } = render(
      <TimeGrid date={day} mode="week" events={late} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Gig"));
    // Down 96px = 2h at 48px/hour: 19:00–23:00 -> 21:00 on the 26th to 01:00 on
    // the 27th. The end is free to run past midnight; only the start is held in
    // the day it was dropped on.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 396, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 396, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getDate(), start.getHours()]).toEqual([26, 21]);
    expect([end.getDate(), end.getHours()]).toEqual([27, 1]);
  });

  it("holds a moved start inside the day, one snap step before its end", () => {
    const onDragEvent = jest.fn();
    const late: CalendarEvent[] = [
      { title: "Gig", start: new Date(2026, 5, 26, 19, 0), end: new Date(2026, 5, 26, 23, 0) },
    ];
    const { getByText } = render(
      <TimeGrid date={day} mode="week" events={late} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Gig"));
    // Far past the bottom of the grid: the start stops at 23:45 (24:00 less one
    // 15-minute step) rather than rolling the whole event onto the next day.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 1500, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 1500, pointerId: 1 });

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([26, 23, 45]);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([27, 3, 45]);
  });

  it("does not preview a next-day spill for an event that only leaves the visible window", () => {
    const onDragEvent = jest.fn();
    // The window ends at 18:00, so this event already runs past the bottom of the
    // grid without touching midnight. Moving it must not claim it spills.
    const late: CalendarEvent[] = [
      { title: "Shift", start: new Date(2026, 5, 26, 15, 0), end: new Date(2026, 5, 26, 19, 0) },
    ];
    const { getByText, container } = render(
      <TimeGrid
        date={day}
        mode="week"
        events={late}
        hourHeight={48}
        minHour={8}
        maxHour={18}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("Shift"));
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 348, pointerId: 1 });
    expect(container.querySelectorAll("[data-dragging]")).toHaveLength(1);
    fireEvent.pointerUp(box, { clientY: 348, pointerId: 1 });

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getDate(), start.getHours()]).toEqual([26, 16]);
    expect([end.getDate(), end.getHours()]).toEqual([26, 20]);
  });

  it("anchors the next-day preview at midnight, not at the top of the visible window", () => {
    const late: CalendarEvent[] = [
      { title: "Gig", start: new Date(2026, 5, 26, 22, 0), end: new Date(2026, 5, 26, 23, 0) },
    ];
    const { getByText, container } = render(
      <TimeGrid
        date={day}
        mode="week"
        events={late}
        hourHeight={48}
        minHour={8}
        onDragEvent={jest.fn()}
      />,
    );
    const box = wrapperOf(getByText("Gig"));
    // Down 96px = 2h: 22:00–23:00 -> 00:00–01:00 on the 27th. The tail belongs at
    // midnight, which is 8 hours (384px) above the 08:00 top of this grid.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 396, pointerId: 1 });
    const preview = [...container.querySelectorAll("[data-dragging]")].find((el) =>
      el.hasAttribute("aria-hidden"),
    ) as HTMLElement;
    expect(preview.style.top).toBe("-384px");
    fireEvent.pointerUp(box, { clientY: 396, pointerId: 1 });
  });

  it("keeps a multi-day event whole when one of its day segments is dragged", () => {
    const onDragEvent = jest.fn();
    const trip: CalendarEvent[] = [
      { title: "Trip", start: new Date(2026, 5, 24, 17, 0), end: new Date(2026, 5, 26, 21, 0) },
    ];
    const { getAllByText } = render(
      <TimeGrid date={day} mode="week" events={trip} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    // The middle segment (the 25th) owns neither the real start nor the real end.
    const box = wrapperOf(getAllByText("Trip")[1]);
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 348, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 348, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    // The whole event slides an hour later; the days outside the dragged
    // segment survive instead of being clipped to it.
    expect([start.getDate(), start.getHours()]).toEqual([24, 18]);
    expect([end.getDate(), end.getHours()]).toEqual([26, 22]);
  });

  it.each([0, 1, 2])(
    "moves every multi-day preview segment when segment %i is grabbed",
    (segment) => {
      const trip: CalendarEvent = {
        title: "Trip",
        start: new Date(2026, 5, 24, 17),
        end: new Date(2026, 5, 26, 21),
      };
      const onDragEvent = jest.fn();
      const grid = (events: CalendarEvent[]) => (
        <TimeGrid
          date={day}
          mode="week"
          events={events}
          hourHeight={48}
          onDragEvent={onDragEvent}
        />
      );
      const { container, getAllByText, rerender } = render(grid([trip]));
      const originals = getAllByText("Trip").map(wrapperOf);
      const box = originals[segment];
      box.parentElement!.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
      fireEvent.pointerDown(box, { clientX: 150, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 50, clientY: 348, pointerId: 1 });

      const previews = [...container.querySelectorAll<HTMLElement>("[data-dragging]")];
      expect(
        previews.map((preview) => new Date(preview.parentElement!.dataset.date!).getDate()),
      ).toEqual([23, 24, 25]);
      expect(previews.map((preview) => [preview.style.top, preview.style.height])).toEqual([
        ["864px", "288px"],
        ["0px", "1152px"],
        ["0px", "1056px"],
      ]);
      expect(originals.every((original) => original.style.visibility === "hidden")).toBe(true);
      expect(onDragEvent).not.toHaveBeenCalled();
      rerender(grid([{ ...trip }]));
      expect(originals.every((original) => original.style.visibility === "hidden")).toBe(true);

      fireEvent.pointerUp(box, { clientX: 50, clientY: 348, pointerId: 1 });
      expect(onDragEvent).toHaveBeenCalledWith(
        trip,
        new Date(2026, 5, 23, 18),
        new Date(2026, 5, 25, 22),
      );
      expect(container.querySelectorAll("[data-dragging]")).toHaveLength(0);
      expect(originals.every((original) => original.style.visibility !== "hidden")).toBe(true);
    },
  );

  it("restores all multi-day segments when a move is cancelled", () => {
    const trip: CalendarEvent = {
      title: "Trip",
      start: new Date(2026, 5, 24, 22),
      end: new Date(2026, 5, 26, 10),
    };
    const onDragEvent = jest.fn();
    const { container, getAllByText } = render(
      <TimeGrid date={day} mode="week" events={[trip]} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const originals = getAllByText("Trip").map(wrapperOf);
    fireEvent.pointerDown(originals[0], { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(originals[0], { clientY: 348, pointerId: 1 });
    fireEvent.pointerCancel(originals[0], { pointerId: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(container.querySelectorAll("[data-dragging]")).toHaveLength(0);
    expect(originals.every((original) => original.style.visibility !== "hidden")).toBe(true);
  });

  it("keeps the held event when another event is inserted during a multi-day move", () => {
    const trip: CalendarEvent = {
      title: "Trip",
      start: new Date(2026, 5, 24, 17),
      end: new Date(2026, 5, 26, 21),
    };
    const onDragEvent = jest.fn();
    const grid = (events: CalendarEvent[]) => (
      <TimeGrid date={day} mode="week" events={events} hourHeight={48} onDragEvent={onDragEvent} />
    );
    const { container, getAllByText, getByText, rerender } = render(grid([trip]));
    const box = wrapperOf(getAllByText("Trip")[0]);
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 348, pointerId: 1 });
    rerender(
      grid([
        { title: "Earlier", start: new Date(2026, 5, 24, 10), end: new Date(2026, 5, 24, 11) },
        { ...trip },
      ]),
    );
    const earlier = wrapperOf(getByText("Earlier"));
    expect(earlier.style.top).toBe("480px");
    expect(earlier.hasAttribute("data-dragging")).toBe(false);
    const previews = [...container.querySelectorAll("[data-dragging]")];
    expect(previews).toHaveLength(3);
    expect(previews.every((preview) => preview.textContent?.includes("Trip"))).toBe(true);
    fireEvent.pointerUp(box, { clientY: 348, pointerId: 1 });
    expect(onDragEvent).toHaveBeenCalledWith(
      trip,
      new Date(2026, 5, 24, 18),
      new Date(2026, 5, 26, 22),
    );
  });

  it("offers the bottom resize grip only on the segment that owns the event's end", () => {
    const trip: CalendarEvent[] = [
      { title: "Trip", start: new Date(2026, 5, 24, 22, 0), end: new Date(2026, 5, 26, 10, 0) },
    ];
    const { getAllByText } = render(
      <TimeGrid date={day} mode="week" events={trip} hourHeight={48} onDragEvent={jest.fn()} />,
    );
    const bottomGrip = (box: HTMLElement) =>
      Array.from(box.querySelectorAll<HTMLElement>('div[style*="ns-resize"]')).filter(
        (el) => el.style.bottom === "0px",
      );
    // The 24th's and 25th's segments end at the day boundary, not at the event's
    // end, so dragging their bottom edge would move an end the user can't see.
    expect(bottomGrip(wrapperOf(getAllByText("Trip")[0]))).toHaveLength(0);
    expect(bottomGrip(wrapperOf(getAllByText("Trip")[1]))).toHaveLength(0);
    // The 26th's segment owns the real end and keeps its grip.
    expect(bottomGrip(wrapperOf(getAllByText("Trip")[2]))).toHaveLength(1);
  });

  it("drags the tail of a midnight-spanning event earlier, moving the whole event", () => {
    const onDragEvent = jest.fn();
    // 22:00 on the 26th to 02:00 on the 27th, so the 27th's segment is a 00:00
    // continuation: its top edge is where the layout clipped it, not the start.
    const overnight: CalendarEvent[] = [
      { title: "Night", start: new Date(2026, 5, 26, 22, 0), end: new Date(2026, 5, 27, 2, 0) },
    ];
    const { getAllByText } = render(
      <TimeGrid
        date={day}
        mode="week"
        events={overnight}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    const tail = wrapperOf(getAllByText("Night")[1]);
    // Up 48px = 1h. Held at 00:00 the drag would be a no-op; the whole event
    // must shift an hour earlier instead.
    fireEvent.pointerDown(tail, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(tail, { clientY: 252, pointerId: 1 });
    fireEvent.pointerUp(tail, { clientY: 252, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getDate(), start.getHours()]).toEqual([26, 21]);
    expect([end.getDate(), end.getHours()]).toEqual([27, 1]);
  });

  it("preserves a sub-step event's duration through a drag", () => {
    const onDragEvent = jest.fn();
    // Shorter than the layout's minimum box, so it is drawn as 15 minutes. The
    // commit must move it, not stretch it to what it was drawn as.
    const tiny: CalendarEvent[] = [
      { title: "Ping", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 9, 5) },
    ];
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={tiny} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Ping"));
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 324, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 324, pointerId: 1 });

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getHours(), start.getMinutes()]).toEqual([9, 30]);
    expect([end.getHours(), end.getMinutes()]).toEqual([9, 35]);
  });

  it("survives a zero dragStepMinutes instead of committing an invalid date", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={events}
        hourHeight={48}
        dragStepMinutes={0}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    // A zero step would divide by zero in the snap and put NaN through the whole
    // commit; it falls back to a one-minute step, as on the native renderer.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 348, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 348, pointerId: 1 });

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(Number.isNaN(start.getTime())).toBe(false);
    expect([start.getHours(), end.getHours()]).toEqual([15, 17]);
  });

  it("clamps a cross-day drag to the edges of the visible week", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="week" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Focus"));
    const column = box.parentElement as HTMLElement;
    column.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
    // The event sits on Friday the 26th; the default Sunday-start week runs
    // 21–27. Ten columns right (raw +10) must clamp to Saturday the 27th.
    fireEvent.pointerDown(box, { clientX: 50, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 1050, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: 1050, clientY: 300, pointerId: 1 });
    expect((onDragEvent.mock.calls[0][1] as Date).getDate()).toBe(27);

    // And ten columns left (raw -10) must clamp to Sunday the 21st.
    fireEvent.pointerDown(box, { clientX: 50, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: -950, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: -950, clientY: 300, pointerId: 1 });
    expect((onDragEvent.mock.calls[1][1] as Date).getDate()).toBe(21);
  });

  it("maps a cross-day drag to the target column, not a calendar-day offset, when a day is hidden", () => {
    const onDragEvent = jest.fn();
    // Hide Wednesday (the 24th). The Sunday-start week 21–27 then shows the
    // columns [21, 22, 23, 25, 26, 27]; the Friday event sits at column index 4.
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="week"
        hiddenDays={[3]}
        events={events}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    const column = box.parentElement as HTMLElement;
    column.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
    // Two columns left lands on the 23rd (Tue), skipping the hidden 24th. A
    // naive addDays(day, -2) would wrongly land on the hidden Wednesday.
    fireEvent.pointerDown(box, { clientX: 50, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: -150, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(box, { clientX: -150, clientY: 300, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getDate()).toBe(23);
    expect(start.getHours()).toBe(14);
    expect(end.getDate()).toBe(23);
    expect(end.getHours()).toBe(16);
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

  it("hands each closed band to renderBusinessHours and drops the themed tint", () => {
    const { container, getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        hourHeight={48}
        businessHours={() => ({ start: 9, end: 17 })}
        renderBusinessHours={({ start, end }) => <span>{`closed ${start}-${end}`}</span>}
      />,
    );
    // The bands before open and after close render the custom content...
    expect(getByText("closed 0-9")).toBeTruthy();
    expect(getByText("closed 17-24")).toBeTruthy();
    // ...and the built-in tint steps aside for it.
    for (const band of container.querySelectorAll<HTMLElement>('[data-slot="businessHours"]')) {
      expect(band.style.background).toBe("");
    }
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

  it("advances the now-indicator as the wall clock ticks", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 26, 9, 0, 0));
    try {
      const { container } = render(<TimeGrid date={day} mode="day" hourHeight={60} />);
      const nowTop = () =>
        (container.querySelector('[data-slot="nowIndicator"]') as HTMLElement).style.top;
      // 09:00 at 60px/hour → 540px.
      expect(nowTop()).toBe("540px");
      act(() => {
        // Advancing the timer also advances the fake clock by 60s, landing on 10:30.
        jest.setSystemTime(new Date(2026, 5, 26, 10, 29, 0));
        jest.advanceTimersByTime(60_000);
      });
      // The minute tick re-read the clock: 10:30 → 630px, not frozen at 540.
      expect(nowTop()).toBe("630px");
    } finally {
      jest.useRealTimers();
    }
  });

  describe("minHour / maxHour / hideHours", () => {
    it("renders only the hours inside [minHour, maxHour) and offsets events by minHour", () => {
      const { container, getByText } = render(
        <TimeGrid date={day} mode="day" events={events} hourHeight={60} minHour={8} maxHour={18} />,
      );
      const labels = [...container.querySelectorAll('[data-slot="hourLabel"]')];
      // Hours 8…17 inclusive → 10 labels; the first shown hour is 08:00, not 00:00.
      expect(labels).toHaveLength(10);
      expect(labels[0].textContent).toBe("08:00");
      expect(labels.at(-1)?.textContent).toBe("17:00");
      // The 14:00 event sits at (14 − 8) × 60 = 360px.
      expect(wrapperOf(getByText("Focus")).style.top).toBe("360px");
    });

    it("drops events that fall entirely outside the window", () => {
      const early: CalendarEvent[] = [
        { title: "Dawn", start: new Date(2026, 5, 26, 5, 0), end: new Date(2026, 5, 26, 6, 0) },
      ];
      const { queryByText } = render(
        <TimeGrid date={day} mode="day" events={early} hourHeight={60} minHour={8} maxHour={18} />,
      );
      expect(queryByText("Dawn")).toBeNull();
    });

    it("maps pointer position to time using minHour", () => {
      const onPressCell = jest.fn();
      const { container } = render(
        <TimeGrid
          date={day}
          mode="day"
          hourHeight={60}
          minHour={8}
          maxHour={18}
          onPressCell={onPressCell}
        />,
      );
      const col = container.querySelector<HTMLElement>('[style*="border-left"]')!;
      // 120px down at 60px/hour, window starting at 08:00 → 10:00.
      fireEvent.pointerDown(col, { clientY: 120, pointerId: 1, button: 0 });
      fireEvent.pointerUp(col, { clientY: 120, pointerId: 1 });
      expect((onPressCell.mock.calls[0][0] as Date).getHours()).toBe(10);
    });

    it("hides the hour axis with hideHours while keeping the grid lines", () => {
      const { container } = render(
        <TimeGrid date={day} mode="day" events={events} hourHeight={48} hideHours />,
      );
      expect(container.querySelector('[data-slot="hourGutter"]')).toBeNull();
      expect(container.querySelector('[data-slot="hourLabel"]')).toBeNull();
      expect(container.querySelector('[data-slot="gridLines"]')).toBeTruthy();
    });

    it("does not teleport an event taller than the visible window when dragged", () => {
      // Regression: `windowEnd - duration` fell below `windowStart`, inverting the
      // clamp so any drag jumped the event to a fixed wrong time.
      const onDragEvent = jest.fn();
      const tall: CalendarEvent[] = [
        { title: "Shift", start: new Date(2026, 5, 26, 8, 0), end: new Date(2026, 5, 26, 18, 0) },
      ];
      const { getByText } = render(
        <TimeGrid
          date={day}
          mode="day"
          events={tall}
          hourHeight={60}
          minHour={8}
          maxHour={17}
          onDragEvent={onDragEvent}
        />,
      );
      const box = wrapperOf(getByText("Shift"));
      fireEvent.pointerDown(box, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(box, { clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(box, { clientY: 40, pointerId: 1 });

      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
      // Pinned at the window start (08:00), duration intact — not teleported to 07:00.
      expect(start.getHours()).toBe(8);
      expect(end.getHours()).toBe(18);
    });

    it("hides the now-indicator when the clock is outside the window", () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 5, 26, 6, 0, 0));
      try {
        const { container } = render(
          <TimeGrid date={day} mode="day" hourHeight={60} minHour={8} maxHour={18} />,
        );
        expect(container.querySelector('[data-slot="nowIndicator"]')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("week numbers", () => {
    it("shows the ISO week number of the first visible day when enabled", () => {
      const { container } = render(
        // Mon 13 Jul 2026 is in ISO week 29.
        <TimeGrid date={new Date(2026, 6, 15)} mode="week" weekStartsOn={1} showWeekNumber />,
      );
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("W29");
    });

    it("uses the ISO week of the visible Thursday for a Sunday-start week", () => {
      // Sun 7 – Sat 13 Jan 2024: days[0] (Sunday) is ISO week 1, but the Mon–Sat
      // body is ISO week 2. Referencing the Thursday shows the week the row reads as.
      const { container } = render(
        <TimeGrid date={new Date(2024, 0, 10)} mode="week" weekStartsOn={0} showWeekNumber />,
      );
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("W2");
    });

    it("respects a custom weekNumberPrefix and defaults to hidden", () => {
      const { container, rerender } = render(
        <TimeGrid date={new Date(2026, 6, 15)} mode="week" weekStartsOn={1} />,
      );
      // Off by default.
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("");
      rerender(
        <TimeGrid
          date={new Date(2026, 6, 15)}
          mode="week"
          weekStartsOn={1}
          showWeekNumber
          weekNumberPrefix="Week "
        />,
      );
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("Week 29");
    });
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

  describe("keyboard event navigation", () => {
    // Mon 13 Jul 2026 has two events; Tue 14 has one. Week starts Monday.
    const weekEvents: CalendarEvent[] = [
      { title: "A", start: new Date(2026, 6, 13, 9), end: new Date(2026, 6, 13, 10) },
      { title: "B", start: new Date(2026, 6, 13, 14), end: new Date(2026, 6, 13, 15) },
      { title: "C", start: new Date(2026, 6, 14, 11), end: new Date(2026, 6, 14, 12) },
    ];
    const renderWeek = (extra = {}) =>
      render(
        <TimeGrid
          mode="week"
          date={new Date(2026, 6, 15)}
          events={weekEvents}
          weekStartsOn={1}
          hourHeight={48}
          keyboardEventNavigation
          {...extra}
        />,
      );

    it("keeps every event tabbable (additive, not roving) so screen readers keep access", () => {
      const { getByText } = renderWeek();
      // All events remain tab stops; arrow keys are an addition, not a replacement.
      expect(wrapperOf(getByText("A")).tabIndex).toBe(0);
      expect(wrapperOf(getByText("B")).tabIndex).toBe(0);
      expect(wrapperOf(getByText("C")).tabIndex).toBe(0);
    });

    it("ArrowDown / ArrowUp step through a day's events by time", () => {
      const { getByText } = renderWeek();
      const a = wrapperOf(getByText("A"));
      const b = wrapperOf(getByText("B"));
      fireEvent.keyDown(a, { key: "ArrowDown" });
      expect(document.activeElement).toBe(b);
      fireEvent.keyDown(b, { key: "ArrowUp" });
      expect(document.activeElement).toBe(a);
    });

    it("ArrowRight jumps to the nearest-in-time event in the next day", () => {
      const { getByText } = renderWeek();
      const b = wrapperOf(getByText("B")); // Mon 14:00
      const c = wrapperOf(getByText("C")); // Tue 11:00 (only event that day)
      fireEvent.keyDown(b, { key: "ArrowRight" });
      expect(document.activeElement).toBe(c);
      fireEvent.keyDown(c, { key: "ArrowLeft" });
      // Back to Monday, nearest to 11:00 is A (09:00) over B (14:00).
      expect(document.activeElement).toBe(wrapperOf(getByText("A")));
    });

    it("Home / End go to the day's first / last event", () => {
      const { getByText } = renderWeek();
      const a = wrapperOf(getByText("A"));
      const b = wrapperOf(getByText("B"));
      fireEvent.keyDown(a, { key: "End" });
      expect(document.activeElement).toBe(b);
      fireEvent.keyDown(b, { key: "Home" });
      expect(document.activeElement).toBe(a);
    });

    it("still activates an event with Enter", () => {
      const onPressEvent = jest.fn();
      const { getByText } = renderWeek({ onPressEvent });
      fireEvent.keyDown(wrapperOf(getByText("A")), { key: "Enter" });
      expect(onPressEvent).toHaveBeenCalledTimes(1);
      expect((onPressEvent.mock.calls[0][0] as CalendarEvent).title).toBe("A");
    });
  });

  describe("accessibility", () => {
    it("exposes each day column's full date to assistive tech, even when not interactive", () => {
      const { getByText } = render(<TimeGrid mode="day" date={new Date(2026, 6, 15)} />);
      // Wed 15 Jul 2026: the visually-hidden accessible label carries the full date.
      expect(getByText("Wednesday, 15 July 2026")).toBeTruthy();
    });

    it("makes the date header a real labeled button when onPressDateHeader is set", () => {
      const onPressDateHeader = jest.fn();
      const { getByRole } = render(
        <TimeGrid mode="day" date={new Date(2026, 6, 15)} onPressDateHeader={onPressDateHeader} />,
      );
      const button = getByRole("button", { name: "Wednesday, 15 July 2026" });
      fireEvent.click(button);
      expect(onPressDateHeader).toHaveBeenCalledTimes(1);
    });

    it("does not render the non-interactive header as a button", () => {
      const { queryByRole } = render(<TimeGrid mode="day" date={new Date(2026, 6, 15)} />);
      expect(queryByRole("button", { name: "Wednesday, 15 July 2026" })).toBeNull();
    });
  });

  it("tints the weekend columns with the weekend background", () => {
    // Week of Mon 6 – Sun 12 July 2026; Sat 11 and Sun 12 are the weekend.
    const { container } = render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 6, 8)}
        weekStartsOn={1}
        theme={{ weekendBackground: "#F6F7F9" }}
      />,
    );
    const weekend = [...container.querySelectorAll('[data-slot="dayColumn"][data-weekend]')];
    expect(weekend).toHaveLength(2);
    expect((weekend[0] as HTMLElement).style.background).toBe("rgb(246, 247, 249)");
    // Weekdays carry no weekend tint.
    const weekdays = container.querySelectorAll('[data-slot="dayColumn"]:not([data-weekend])');
    expect(weekdays).toHaveLength(5);
  });
});

describe("dom TimeGrid background events", () => {
  it("shades a background event's range instead of rendering a box", () => {
    const withBackground: CalendarEvent[] = [
      ...events,
      {
        title: "Maintenance",
        start: new Date(2026, 5, 26, 9),
        end: new Date(2026, 5, 26, 12),
        display: "background",
      },
    ];
    const { container, queryByText } = render(
      <TimeGrid date={day} mode="day" events={withBackground} hourHeight={48} />,
    );
    const band = container.querySelector('[data-slot="backgroundEvent"]') as HTMLElement;
    expect(band).toBeTruthy();
    // 09:00 at 48px/hour from midnight → 432px top, 3h → 144px tall.
    expect(band.style.top).toBe("432px");
    expect(band.style.height).toBe("144px");
    // No event box for it, and it takes no overlap column from the timed event.
    expect(queryByText("Maintenance")).toBeNull();
    const focus = container.querySelectorAll('[data-slot="event"]');
    expect(focus).toHaveLength(1);
  });
});

describe("dom TimeGrid hiddenDays", () => {
  it("renders a five-column week when weekends are hidden", () => {
    const { queryByText, getByText } = render(
      <TimeGrid date={day} mode="week" events={events} hourHeight={48} hiddenDays={[0, 6]} />,
    );
    // 26 June 2026 is a Friday; Saturday 27 and Sunday 21 disappear.
    expect(getByText("26")).toBeTruthy();
    expect(queryByText("27")).toBeNull();
    expect(queryByText("21")).toBeNull();
  });
});

describe("dom TimeGrid edge auto-advance", () => {
  // The flex row that holds the columns; stub its rect so the edge zones resolve
  // (jsdom has no layout). box -> column -> columns row.
  const stubColumns = (box: HTMLElement) => {
    const column = box.parentElement as HTMLElement;
    column.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
    const row = column.parentElement as HTMLElement;
    row.getBoundingClientRect = () => ({ left: 0, right: 700, width: 700 }) as DOMRect;
  };

  afterEach(() => {
    // Remove the elementFromPoint stub some tests install.
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it("pages to the next period after dwelling on the right edge", () => {
    jest.useFakeTimers();
    try {
      const onChangeDate = jest.fn();
      const onDragEvent = jest.fn();
      const { getByText } = render(
        <TimeGrid
          date={day}
          mode="week"
          events={events}
          hourHeight={48}
          onDragEvent={onDragEvent}
          onChangeDate={onChangeDate}
        />,
      );
      const box = wrapperOf(getByText("Focus"));
      stubColumns(box);
      fireEvent.pointerDown(box, { clientX: 350, clientY: 300, pointerId: 1 });
      // Move into the right edge zone (>= 700 - 32).
      fireEvent.pointerMove(box, { clientX: 690, clientY: 300, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(onChangeDate).toHaveBeenCalledTimes(1);
      // A week steps 7 days forward.
      const next = onChangeDate.mock.calls[0][0] as Date;
      expect(next.getTime()).toBe(new Date(2026, 6, 3).getTime());
      fireEvent.pointerUp(box, { clientX: 690, clientY: 300, pointerId: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it("pages to the previous period after dwelling on the left edge", () => {
    jest.useFakeTimers();
    try {
      const onChangeDate = jest.fn();
      const { getByText } = render(
        <TimeGrid
          date={day}
          mode="week"
          events={events}
          hourHeight={48}
          onDragEvent={jest.fn()}
          onChangeDate={onChangeDate}
        />,
      );
      const box = wrapperOf(getByText("Focus"));
      stubColumns(box);
      fireEvent.pointerDown(box, { clientX: 350, clientY: 300, pointerId: 1 });
      // Into the left edge zone (<= gutter(56) + 32 = 88).
      fireEvent.pointerMove(box, { clientX: 40, clientY: 300, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(onChangeDate).toHaveBeenCalledTimes(1);
      expect((onChangeDate.mock.calls[0][0] as Date).getTime()).toBe(
        new Date(2026, 5, 19).getTime(),
      );
      fireEvent.pointerUp(box, { clientX: 40, clientY: 300, pointerId: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps paging while the pointer is held at the edge", () => {
    jest.useFakeTimers();
    try {
      const onChangeDate = jest.fn();
      const Controlled = () => {
        const [d, setD] = useState(day);
        return (
          <TimeGrid
            date={d}
            mode="week"
            events={events}
            hourHeight={48}
            onDragEvent={jest.fn()}
            onChangeDate={(next) => {
              onChangeDate(next);
              setD(next);
            }}
          />
        );
      };
      const { getByText } = render(<Controlled />);
      const box = wrapperOf(getByText("Focus"));
      stubColumns(box);
      fireEvent.pointerDown(box, { clientX: 350, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 690, clientY: 300, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      // Two successive weeks: +7 then +14 from the anchor.
      expect(onChangeDate).toHaveBeenCalledTimes(2);
      expect((onChangeDate.mock.calls[0][0] as Date).getTime()).toBe(
        new Date(2026, 6, 3).getTime(),
      );
      expect((onChangeDate.mock.calls[1][0] as Date).getTime()).toBe(
        new Date(2026, 6, 10).getTime(),
      );
      fireEvent.pointerUp(box, { clientX: 690, clientY: 300, pointerId: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not page if the pointer leaves the edge before the dwell elapses", () => {
    jest.useFakeTimers();
    try {
      const onChangeDate = jest.fn();
      const { getByText } = render(
        <TimeGrid
          date={day}
          mode="week"
          events={events}
          hourHeight={48}
          onDragEvent={jest.fn()}
          onChangeDate={onChangeDate}
        />,
      );
      const box = wrapperOf(getByText("Focus"));
      stubColumns(box);
      fireEvent.pointerDown(box, { clientX: 350, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 690, clientY: 300, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      // Back to the center before the 600ms dwell completes.
      fireEvent.pointerMove(box, { clientX: 350, clientY: 300, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      expect(onChangeDate).not.toHaveBeenCalled();
      fireEvent.pointerUp(box, { clientX: 350, clientY: 300, pointerId: 1 });
    } finally {
      jest.useRealTimers();
    }
  });

  it("commits the drop on a day in the newly revealed week", () => {
    jest.useFakeTimers();
    try {
      const onDragEvent = jest.fn();
      const Controlled = () => {
        const [d, setD] = useState(day);
        return (
          <TimeGrid
            date={d}
            mode="week"
            events={events}
            hourHeight={48}
            onDragEvent={onDragEvent}
            onChangeDate={setD}
          />
        );
      };
      const { getByText, container } = render(<Controlled />);
      const box = wrapperOf(getByText("Focus"));
      stubColumns(box);
      fireEvent.pointerDown(box, { clientX: 350, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 690, clientY: 300, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      // Paging +7 anchors the week on 3 Jul (Sun-start week 28 Jun - 4 Jul); drop
      // on Wed 1 Jul via the hit-test, keeping the 14:00-16:00 time and duration.
      const targetIso = new Date(2026, 6, 1).toISOString();
      const targetCol = container.querySelector(`[data-date="${targetIso}"]`) as HTMLElement;
      expect(targetCol).toBeTruthy();
      (document as { elementFromPoint?: unknown }).elementFromPoint = () => targetCol;
      // The origin box has unmounted with the page change, so the release is
      // dispatched at the document level (where the transport listens).
      fireEvent.pointerUp(document.body, { clientX: 690, clientY: 300, pointerId: 1 });

      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
      expect(start.getTime()).toBe(new Date(2026, 6, 1, 14, 0).getTime());
      expect(end.getTime()).toBe(new Date(2026, 6, 1, 16, 0).getTime());
    } finally {
      jest.useRealTimers();
    }
  });

  it("snaps back when dropped off the grid after paging", () => {
    jest.useFakeTimers();
    try {
      const onDragEvent = jest.fn();
      const Controlled = () => {
        const [d, setD] = useState(day);
        return (
          <TimeGrid
            date={d}
            mode="week"
            events={events}
            hourHeight={48}
            onDragEvent={onDragEvent}
            onChangeDate={setD}
          />
        );
      };
      const { getByText } = render(<Controlled />);
      const box = wrapperOf(getByText("Focus"));
      stubColumns(box);
      fireEvent.pointerDown(box, { clientX: 350, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 690, clientY: 300, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      // Dropped where no column is (e.g. over the header): no commit.
      (document as { elementFromPoint?: unknown }).elementFromPoint = () => null;
      fireEvent.pointerUp(document.body, { clientX: 690, clientY: 300, pointerId: 1 });
      expect(onDragEvent).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("dom TimeGrid event box sizing", () => {
  // 15 minutes at 48px/hour is 12px, under the default 14px floor.
  const quarter: CalendarEvent[] = [
    { title: "Quarter", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 9, 15) },
  ];
  const probe = () => {
    const seen: number[] = [];
    const ProbeEvent = ({ boxHeight }: { boxHeight?: number }) => {
      if (boxHeight !== undefined) seen.push(boxHeight);
      return <div>Quarter</div>;
    };
    return { ProbeEvent, seen };
  };

  it("floors a short event's box and boxHeight at 14px by default", () => {
    const { ProbeEvent, seen } = probe();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={quarter} hourHeight={48} renderEvent={ProbeEvent} />,
    );
    expect(getByText("Quarter").parentElement!.style.height).toBe("14px");
    // The renderer may run more than once per mount; every call sees the floor.
    expect(new Set(seen)).toEqual(new Set([14]));
  });

  it("minEventHeight lowers the floor so the box follows the duration", () => {
    const { ProbeEvent, seen } = probe();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={quarter}
        hourHeight={48}
        renderEvent={ProbeEvent}
        minEventHeight={0}
      />,
    );
    expect(getByText("Quarter").parentElement!.style.height).toBe("12px");
    expect(new Set(seen)).toEqual(new Set([12]));
  });

  it("insets the box by eventGap (default 1px) and lets 0 fill the column", () => {
    const boxInset = (eventGap?: number) => {
      const { getByText, unmount } = render(
        <TimeGrid date={day} mode="day" events={events} hourHeight={48} eventGap={eventGap} />,
      );
      const { left, width } = wrapperOf(getByText("Focus")).style;
      unmount();
      return { left, width };
    };
    expect(boxInset()).toEqual({ left: "calc(0% + 1px)", width: "calc(100% - 2px)" });
    expect(boxInset(0)).toEqual({ left: "calc(0% + 0px)", width: "calc(100% - 0px)" });
    expect(boxInset(4)).toEqual({ left: "calc(0% + 4px)", width: "calc(100% - 8px)" });
  });
});
