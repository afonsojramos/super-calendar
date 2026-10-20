/**
 * @jest-environment ./tests/timezone-environment.js
 * @jest-environment-options {"timeZone": "America/New_York"}
 */
import { act, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import type { CalendarEvent } from "@super-calendar/core";
import { ResourceTimeline } from "../ResourceTimeline";
import { TimeGrid } from "../TimeGrid";

// New York clocks go back at 02:00 on 1 Nov 2026, so the day has 25 hours and
// 01:00-02:00 happens twice: first in EDT (UTC-4), then in EST (UTC-5).
const day = new Date(2026, 10, 1);
const est = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 5, minutes));

// title div -> default-event root -> positioned wrapper with the pointer handlers.
function wrapperOf(chip: HTMLElement): HTMLElement {
  return chip.parentElement!.parentElement!;
}

function dragDown(box: HTMLElement, px: number) {
  fireEvent.pointerDown(box, { clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(box, { clientY: 100 + px, pointerId: 1 });
  fireEvent.pointerUp(box, { clientY: 100 + px, pointerId: 1 });
}

describe("dom TimeGrid on a DST change day", () => {
  it("draws an event after the change in its clock-time row", () => {
    const events: CalendarEvent[] = [
      { title: "Late", start: new Date(2026, 10, 1, 10), end: new Date(2026, 10, 1, 11) },
    ];
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} />,
    );
    expect(wrapperOf(getByText("Late")).style.top).toBe(`${10 * 48}px`);
  });

  it("drops a move across the change at the clock time of the target row", () => {
    const events: CalendarEvent[] = [
      { title: "Early", start: new Date(2026, 10, 1, 0, 30), end: new Date(2026, 10, 1, 1, 0) },
    ];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    // Down 96px = two rows: 00:30 -> 02:30.
    dragDown(wrapperOf(getByText("Early")), 96);

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getHours(), start.getMinutes()]).toEqual([2, 30]);
    expect([end.getHours(), end.getMinutes()]).toEqual([3, 0]);
  });

  it("moves an event in the repeated hour from its own occurrence", () => {
    const events: CalendarEvent[] = [{ title: "Second", start: est(1, 30), end: est(2, 0) }];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    // Down 96px = two rows: 01:30 EST -> 03:30 EST.
    dragDown(wrapperOf(getByText("Second")), 96);

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start).toEqual(est(3, 30));
    expect(end).toEqual(est(4, 0));
  });
});

describe("dom ResourceTimeline on a DST change day", () => {
  it("keeps a moved event's elapsed duration", () => {
    // 01:00 EDT to 02:00 EST: two hours long, though the clock shows one.
    const events: CalendarEvent<{ resourceId: string }>[] = [
      { title: "Shift", resourceId: "a", start: new Date(2026, 10, 1, 1), end: est(2) },
    ];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={day}
        resources={[{ id: "a", title: "Room A" }]}
        events={events}
        startHour={0}
        hourWidth={80}
        onDragEvent={onDragEvent}
      />,
    );
    const bar = getByText("Shift").closest("button") as HTMLElement;
    // Right 160px = two hours: 01:00 -> 03:00.
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 260, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 260, pointerId: 1 });

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start).toEqual(est(3));
    expect(end).toEqual(est(5));
  });
});

describe("dom drags in the repeated hour and across a change", () => {
  it("leaves a same-row drag of a repeated-hour event on its occurrence", () => {
    const events: CalendarEvent[] = [{ title: "Second", start: est(1, 30), end: est(2, 0) }];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    dragDown(wrapperOf(getByText("Second")), 1);

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start).toEqual(est(1, 30));
    expect(end).toEqual(est(2, 0));
  });

  it("previews a move into a spring-forward change at the height it commits", () => {
    // 8 Mar 2026: 02:00 EST jumps to 03:00 EDT.
    const spring = new Date(2026, 2, 8);
    const events: CalendarEvent[] = [
      { title: "Hour", start: new Date(2026, 2, 8, 4), end: new Date(2026, 2, 8, 5) },
    ];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={spring}
        mode="day"
        events={events}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("Hour"));
    const restingHeight = parseFloat(box.style.height);
    // Up 120px = 2.5 rows: 04:00 -> 01:30, so the hour runs 01:30 EST to 03:30 EDT.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 180, pointerId: 1 });
    expect(parseFloat(wrapperOf(getByText("Hour")).style.height)).toBe(restingHeight + 48);
    fireEvent.pointerUp(box, { clientY: 180, pointerId: 1 });

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getHours(), start.getMinutes()]).toEqual([1, 30]);
    expect([end.getHours(), end.getMinutes()]).toEqual([3, 30]);
  });

  it("extends a timeline event whose clock runs backwards", () => {
    // 01:30 EDT to 01:00 EST: 30 minutes, drawn 01:30-02:00.
    const events: CalendarEvent<{ resourceId: string }>[] = [
      {
        title: "Backwards",
        resourceId: "a",
        start: new Date(Date.UTC(2026, 10, 1, 5, 30)),
        end: est(1),
      },
    ];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={day}
        resources={[{ id: "a", title: "Room A" }]}
        events={events}
        startHour={0}
        hourWidth={80}
        onDragEvent={onDragEvent}
      />,
    );
    const bar = getByText("Backwards").closest("button") as HTMLElement;
    const handle = bar.querySelector("span[aria-hidden]") as HTMLElement;
    // Right 20px = 15 minutes: the drawn 02:00 edge moves to 02:15.
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 120, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, , end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(end).toEqual(est(2, 15));
  });
});

describe("dom drag previews on DST change days", () => {
  it("previews a drop on a skipped hour where it commits", () => {
    // 8 Mar 2026: 02:00 EST jumps to 03:00 EDT, so 02:30 doesn't exist.
    const spring = new Date(2026, 2, 8);
    const events: CalendarEvent[] = [
      { title: "Hour", start: new Date(2026, 2, 8, 4), end: new Date(2026, 2, 8, 5) },
    ];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={spring}
        mode="day"
        events={events}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    const box = wrapperOf(getByText("Hour"));
    // Up 72px = 1.5 rows: 04:00 -> 02:30, which the clock skips to 03:30.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 228, pointerId: 1 });
    expect(wrapperOf(getByText("Hour")).style.top).toBe(`${3.5 * 48}px`);
    fireEvent.pointerUp(box, { clientY: 228, pointerId: 1 });

    const [, start] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect([start.getHours(), start.getMinutes()]).toEqual([3, 30]);
  });

  it("previews a timeline move at the width it commits", () => {
    // 01:00 EDT to 02:00 EST: two hours long, one hour wide on the axis.
    const events: CalendarEvent<{ resourceId: string }>[] = [
      { title: "Shift", resourceId: "a", start: new Date(2026, 10, 1, 1), end: est(2) },
    ];
    const { getByText } = render(
      <ResourceTimeline
        date={day}
        resources={[{ id: "a", title: "Room A" }]}
        events={events}
        startHour={0}
        hourWidth={80}
        onDragEvent={jest.fn()}
      />,
    );
    const bar = getByText("Shift").closest("button") as HTMLElement;
    const restingWidth = parseFloat(bar.style.width);
    // Right 160px = two hours: 01:00 -> 03:00, after the change, so two hours wide.
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 260, pointerId: 1 });
    expect(parseFloat((getByText("Shift").closest("button") as HTMLElement).style.width)).toBe(
      restingWidth + 80,
    );
  });
});

describe("dom drag edge cases on DST change days", () => {
  it("drops a paged move at the requested row, not the skipped-hour preview", () => {
    jest.useFakeTimers();
    try {
      // Monday-start week of 2-8 Mar 2026, so Sunday 8 Mar (spring forward) is
      // the last column and the box reaches the right edge without changing day.
      const events: CalendarEvent[] = [
        { title: "Hour", start: new Date(2026, 2, 8, 4), end: new Date(2026, 2, 8, 5) },
      ];
      const onDragEvent = jest.fn();
      const Controlled = () => {
        const [date, setDate] = useState(new Date(2026, 2, 8));
        return (
          <TimeGrid
            date={date}
            mode="week"
            weekStartsOn={1}
            events={events}
            hourHeight={48}
            onDragEvent={onDragEvent}
            onChangeDate={setDate}
          />
        );
      };
      const { getByText, container } = render(<Controlled />);
      const box = wrapperOf(getByText("Hour"));
      const column = box.parentElement as HTMLElement;
      column.getBoundingClientRect = () => ({ width: 100 }) as DOMRect;
      const row = column.parentElement as HTMLElement;
      row.getBoundingClientRect = () => ({ left: 0, right: 700, width: 700 }) as DOMRect;
      // Up 72px = 1.5 rows toward 02:30, which 8 Mar skips, then dwell on the
      // right edge to page to the next week.
      fireEvent.pointerDown(box, { clientX: 650, clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 690, clientY: 228, pointerId: 1 });
      act(() => {
        jest.advanceTimersByTime(600);
      });
      // Drop on Sunday 15 Mar, where 02:30 exists.
      const target = container.querySelector(
        `[data-date="${new Date(2026, 2, 15).toISOString()}"]`,
      ) as HTMLElement;
      expect(target).toBeTruthy();
      (document as { elementFromPoint?: unknown }).elementFromPoint = () => target;
      fireEvent.pointerUp(document.body, { clientX: 690, clientY: 228, pointerId: 1 });

      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const [, start] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
      expect(start).toEqual(new Date(2026, 2, 15, 2, 30));
    } finally {
      delete (document as { elementFromPoint?: unknown }).elementFromPoint;
      jest.useRealTimers();
    }
  });

  it("previews a moved short event at the height it commits", () => {
    // 01:00 EDT to 01:03 EST: 63 minutes long, but 3 on the clock, so the
    // layout pads it to the minimum box. Moved past the change it covers 63.
    const events: CalendarEvent[] = [
      { title: "Short", start: new Date(2026, 10, 1, 1), end: est(1, 3) },
    ];
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={jest.fn()} />,
    );
    const box = wrapperOf(getByText("Short"));
    // Down 96px = two rows: 01:00 EDT -> 03:00 EST.
    fireEvent.pointerDown(box, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 196, pointerId: 1 });
    const preview = wrapperOf(getByText("Short"));
    expect(parseFloat(preview.style.height)).toBeCloseTo((63 / 60) * 48, 1);
  });
});

describe("dom resizes and compressed moves in the repeated hour", () => {
  const edt = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 4, minutes));

  it("shrinks a backwards event from its drawn bottom edge", () => {
    // 01:30 EDT to 01:00 EST, drawn 01:30-02:00.
    const events: CalendarEvent[] = [{ title: "Back", start: edt(1, 30), end: est(1) }];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Back"));
    const bottomHandle = Array.from(
      box.querySelectorAll<HTMLElement>('div[style*="ns-resize"]'),
    ).find((h) => h.style.top !== "0px")!;
    // Up 12px = 15 minutes: the 02:00 edge moves to 01:45.
    fireEvent.pointerDown(bottomHandle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bottomHandle, { clientY: 288, pointerId: 1 });
    fireEvent.pointerUp(bottomHandle, { clientY: 288, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start).toEqual(edt(1, 30));
    expect(end).toEqual(edt(1, 45));
  });

  it("shrinks a backwards timeline event from its drawn edge", () => {
    const events: CalendarEvent<{ resourceId: string }>[] = [
      { title: "Back", resourceId: "a", start: edt(1, 30), end: est(1) },
    ];
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={day}
        resources={[{ id: "a", title: "Room A" }]}
        events={events}
        startHour={0}
        hourWidth={80}
        onDragEvent={onDragEvent}
      />,
    );
    const bar = getByText("Back").closest("button") as HTMLElement;
    const handle = bar.querySelector("span[aria-hidden]") as HTMLElement;
    // Left 20px = 15 minutes.
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 80, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 80, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, , end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(end).toEqual(edt(1, 45));
  });

  it("previews a timeline move that compresses an event at the minimum width", () => {
    // 00:00-01:03 EDT moved an hour later covers 3 clock minutes, drawn as 15.
    const events: CalendarEvent<{ resourceId: string }>[] = [
      { title: "Squeeze", resourceId: "a", start: edt(0), end: edt(1, 3) },
    ];
    const { getByText } = render(
      <ResourceTimeline
        date={day}
        resources={[{ id: "a", title: "Room A" }]}
        events={events}
        startHour={0}
        hourWidth={80}
        onDragEvent={jest.fn()}
      />,
    );
    const bar = getByText("Squeeze").closest("button") as HTMLElement;
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 180, pointerId: 1 });
    expect(parseFloat((getByText("Squeeze").closest("button") as HTMLElement).style.width)).toBe(
      20,
    );
  });
});

describe("dom drags of an event whose clock runs backwards", () => {
  const edt = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 10, 1, hours + 4, minutes));
  // 01:30 EDT to 01:00 EST: 30 minutes, drawn 01:30-02:00.
  const events: CalendarEvent[] = [{ title: "Back", start: edt(1, 30), end: est(1) }];

  it("previews and commits a move at its real duration", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Back"));
    // Down 96px = two rows: 01:30 EDT -> 03:30 EST.
    fireEvent.pointerDown(box, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 196, pointerId: 1 });
    expect(parseFloat(wrapperOf(getByText("Back")).style.height)).toBe(24);
    fireEvent.pointerUp(box, { clientY: 196, pointerId: 1 });

    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start).toEqual(est(3, 30));
    expect(end).toEqual(est(4));
  });

  it("extends the drawn bottom edge to the row it is dragged to", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const bottomHandle = Array.from(
      wrapperOf(getByText("Back")).querySelectorAll<HTMLElement>('div[style*="ns-resize"]'),
    ).find((h) => h.style.top !== "0px")!;
    // Down 48px = one row: the 02:00 edge moves to 03:00.
    fireEvent.pointerDown(bottomHandle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(bottomHandle, { clientY: 348, pointerId: 1 });
    fireEvent.pointerUp(bottomHandle, { clientY: 348, pointerId: 1 });

    const [, , end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(end).toEqual(est(3));
  });
});
