import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { ResourceTimeline } from "../ResourceTimeline";

const date = new Date(2026, 5, 26);
const resources = [
  { id: "a", title: "Room A" },
  { id: "b", title: "Room B" },
];
type WithResource = { id: string; resourceId: string };
const events: CalendarEvent<WithResource>[] = [
  {
    id: "1",
    resourceId: "a",
    title: "Standup",
    start: new Date(2026, 5, 26, 9),
    end: new Date(2026, 5, 26, 10),
  },
  {
    id: "2",
    resourceId: "b",
    title: "Review",
    start: new Date(2026, 5, 26, 11),
    end: new Date(2026, 5, 26, 12),
  },
];

describe("dom ResourceTimeline", () => {
  it("renders a row per resource with its label", () => {
    const { getByText } = render(
      <ResourceTimeline date={date} resources={resources} events={events} />,
    );
    expect(getByText("Room A")).toBeTruthy();
    expect(getByText("Room B")).toBeTruthy();
  });

  it("places each event in its resource's row", () => {
    const { container } = render(
      <ResourceTimeline date={date} resources={resources} events={events} hourWidth={80} />,
    );
    const rows = container.querySelectorAll('[data-slot="row"]');
    expect(rows).toHaveLength(2);
    // Room A's row (first) has the Standup event; Room B's has Review.
    expect(rows[0].textContent).toContain("Standup");
    expect(rows[1].textContent).toContain("Review");
  });

  it("positions an event by its start hour and duration", () => {
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        hourWidth={80}
      />,
    );
    // Standup: 09:00–10:00, startHour 8 → left = (9-8)*80 = 80px, width = 1h*80 = 80px.
    const bar = getByText("Standup").closest("button") as HTMLElement;
    expect(bar.style.left).toBe("80px");
    expect(bar.style.width).toBe("80px");
  });

  it("stacks overlapping events in the same row into sub-lanes", () => {
    const overlap: CalendarEvent<WithResource>[] = [
      {
        id: "1",
        resourceId: "a",
        title: "One",
        start: new Date(2026, 5, 26, 9),
        end: new Date(2026, 5, 26, 11),
      },
      {
        id: "2",
        resourceId: "a",
        title: "Two",
        start: new Date(2026, 5, 26, 10),
        end: new Date(2026, 5, 26, 12),
      },
    ];
    const { getByText } = render(
      <ResourceTimeline date={date} resources={resources} events={overlap} rowHeight={56} />,
    );
    const one = getByText("One").closest("button") as HTMLElement;
    const two = getByText("Two").closest("button") as HTMLElement;
    // Two overlapping events → two sub-lanes of half height at different tops.
    expect(one.style.height).toBe("28px");
    expect(two.style.height).toBe("28px");
    expect(one.style.top).not.toBe(two.style.top);
  });

  it("fires onPressEvent when a bar is clicked", () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        onPressEvent={onPressEvent}
      />,
    );
    fireEvent.click(getByText("Standup"));
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(onPressEvent.mock.calls[0][0].title).toBe("Standup");
  });

  it("drags an event along the axis and reports the new start/end", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={0}
        hourWidth={80}
        onDragEvent={onDragEvent}
      />,
    );
    const bar = getByText("Standup").closest("button") as HTMLElement;
    // Standup 09:00–10:00; drag +80px = +1h → 10:00–11:00.
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 180, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 180, pointerId: 1 });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0];
    expect((start as Date).getHours()).toBe(10);
    expect((end as Date).getHours()).toBe(11);
  });

  it("treats a click without movement as a press, not a drag", () => {
    const onDragEvent = jest.fn();
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        onDragEvent={onDragEvent}
        onPressEvent={onPressEvent}
      />,
    );
    const bar = getByText("Standup").closest("button") as HTMLElement;
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 100, pointerId: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("supports a custom resourceId accessor", () => {
    const custom: CalendarEvent<{ id: string; room: string }>[] = [
      {
        id: "1",
        room: "b",
        title: "Custom",
        start: new Date(2026, 5, 26, 9),
        end: new Date(2026, 5, 26, 10),
      },
    ];
    const { container } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={custom}
        resourceId={(e) => (e as { room?: string }).room}
      />,
    );
    const rows = container.querySelectorAll('[data-slot="row"]');
    expect(rows[1].textContent).toContain("Custom"); // Room B row
    expect(rows[0].textContent).not.toContain("Custom");
  });
});

describe("dom ResourceTimeline vertical orientation", () => {
  it("lays resources out as columns with time flowing down", () => {
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        orientation="vertical"
        resources={resources}
        events={events}
        startHour={8}
        hourHeight={48}
      />,
    );
    // Standup: 09:00–10:00, startHour 8 → top = (9-8)*48 = 48px, height = 1h*48.
    const bar = getByText("Standup").closest("button") as HTMLElement;
    expect(bar.style.top).toBe("48px");
    expect(bar.style.height).toBe("48px");
    // The column flexes, so the lane is a percentage, not a pixel offset.
    expect(bar.style.width).toBe("100%");
  });

  it("drags an event down the time axis and reports the new start/end", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        orientation="vertical"
        resources={resources}
        events={events}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    // Standup 09:00–10:00; drag +96px = +2h at 48px/hour → 11:00–12:00.
    const bar = getByText("Standup").closest("button") as HTMLElement;
    fireEvent.pointerDown(bar, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: 196, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientY: 196, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [unknown, Date, Date];
    expect(start.getHours()).toBe(11);
    expect(end.getHours()).toBe(12);
  });

  it("resizes from the bottom edge along the time axis", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        orientation="vertical"
        resources={resources}
        events={events}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    // The resize handle is the span inside the bar; drag it +48px = +1h.
    const bar = getByText("Standup").closest("button") as HTMLElement;
    const handle = bar.querySelector("span[aria-hidden]") as HTMLElement;
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: 148, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientY: 148, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [unknown, Date, Date];
    // Start unchanged, end extended by an hour: 09:00–11:00.
    expect(start.getHours()).toBe(9);
    expect(end.getHours()).toBe(11);
  });
});

describe("dom ResourceTimeline cell interactions", () => {
  it("sweeps empty lane space into onCreateEvent with the lane's resource", () => {
    const onCreateEvent = jest.fn();
    const { container } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        hourWidth={80}
        onCreateEvent={onCreateEvent}
      />,
    );
    const track = container.querySelectorAll('[data-slot="track"]')[0] as HTMLElement;
    // Sweep 80px → 240px at 80px/hour from 08:00: 09:00 → 11:00.
    fireEvent.pointerDown(track, { clientX: 80, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 240, pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 240, pointerId: 1 });

    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    const [start, end, resource] = onCreateEvent.mock.calls[0] as [Date, Date, { id: string }];
    expect(start.getHours()).toBe(9);
    expect(end.getHours()).toBe(11);
    expect(resource.id).toBe("a");
  });

  it("treats a click without movement as onPressCell with the snapped time", () => {
    const onPressCell = jest.fn();
    const { container } = render(
      <ResourceTimeline
        date={date}
        orientation="vertical"
        resources={resources}
        events={events}
        startHour={8}
        hourHeight={48}
        onPressCell={onPressCell}
      />,
    );
    // Second lane (Room B), 72px down at 48px/hour from 08:00 → 09:30.
    const track = container.querySelectorAll('[data-slot="track"]')[1] as HTMLElement;
    fireEvent.pointerDown(track, { clientY: 72, pointerId: 1 });
    fireEvent.pointerUp(track, { clientY: 72, pointerId: 1 });

    expect(onPressCell).toHaveBeenCalledTimes(1);
    const [at, resource] = onPressCell.mock.calls[0] as [Date, { id: string }];
    expect(at.getHours()).toBe(9);
    expect(at.getMinutes()).toBe(30);
    expect(resource.id).toBe("b");
  });

  it("does not start a create when the pointer goes down on a bar", () => {
    const onCreateEvent = jest.fn();
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        hourWidth={80}
        onCreateEvent={onCreateEvent}
        onPressEvent={onPressEvent}
      />,
    );
    // Pointer down on the bar bubbles to the track, but the target !== currentTarget
    // guard rejects it, so no create is swept and the bar's click still presses.
    const bar = getByText("Standup").closest("button") as HTMLElement;
    fireEvent.pointerDown(bar, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 220, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 220, pointerId: 1 });
    fireEvent.click(bar);
    expect(onCreateEvent).not.toHaveBeenCalled();
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("ignores touch pointers so the board stays free to scroll", () => {
    const onPressCell = jest.fn();
    const onCreateEvent = jest.fn();
    const { container } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        hourWidth={80}
        onPressCell={onPressCell}
        onCreateEvent={onCreateEvent}
      />,
    );
    const track = container.querySelectorAll('[data-slot="track"]')[0] as HTMLElement;
    fireEvent.pointerDown(track, { clientX: 80, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(track, { clientX: 240, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(track, { clientX: 240, pointerId: 1, pointerType: "touch" });
    expect(onPressCell).not.toHaveBeenCalled();
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it("does not commit a create when the gesture is cancelled", () => {
    const onCreateEvent = jest.fn();
    const { container } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        hourWidth={80}
        onCreateEvent={onCreateEvent}
      />,
    );
    const track = container.querySelectorAll('[data-slot="track"]')[0] as HTMLElement;
    fireEvent.pointerDown(track, { clientX: 80, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 240, pointerId: 1 });
    fireEvent.pointerCancel(track, { pointerId: 1 });
    fireEvent.pointerUp(track, { clientX: 240, pointerId: 1 });
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it("previews no create ghost in press-only mode (onPressCell without onCreateEvent)", () => {
    const onPressCell = jest.fn();
    const { container } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        hourWidth={80}
        onPressCell={onPressCell}
      />,
    );
    const track = container.querySelectorAll('[data-slot="track"]')[0] as HTMLElement;
    // Sweeping with a mouse in press-only mode must not paint a create ghost; the
    // drag still resolves to a press at the start via the pointer path.
    fireEvent.pointerDown(track, { clientX: 80, pointerId: 1 });
    fireEvent.pointerMove(track, { clientX: 240, pointerId: 1 });
    expect(container.querySelectorAll('[data-slot="createGhost"]')).toHaveLength(0);
    fireEvent.pointerUp(track, { clientX: 240, pointerId: 1 });
    expect(onPressCell).toHaveBeenCalledTimes(1);
  });

  it("shades closed hours per lane from businessHours", () => {
    const { container } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        endHour={20}
        hourWidth={80}
        businessHours={(_d, resource) => (resource.id === "a" ? { start: 9, end: 17 } : null)}
      />,
    );
    const bands = container.querySelectorAll('[data-slot="businessHours"]');
    // Room A: before-open + after-close; Room B: closed all day (one full band).
    expect(bands).toHaveLength(3);
    const first = bands[0] as HTMLElement;
    expect(first.style.left).toBe("0px");
    expect(first.style.width).toBe("80px"); // 08:00–09:00 at 80px/hour
  });

  it("hands each closed band and its resource to renderBusinessHours, dropping the tint", () => {
    const { container, getByText } = render(
      <ResourceTimeline
        date={date}
        resources={resources}
        events={events}
        startHour={8}
        endHour={20}
        hourWidth={80}
        businessHours={(_d, resource) => (resource.id === "a" ? { start: 9, end: 17 } : null)}
        renderBusinessHours={({ start, end, resource }) => (
          <span>{`${resource.id} closed ${start}-${end}`}</span>
        )}
      />,
    );
    expect(getByText("a closed 8-9")).toBeTruthy();
    expect(getByText("a closed 17-20")).toBeTruthy();
    expect(getByText("b closed 8-20")).toBeTruthy();
    for (const band of container.querySelectorAll<HTMLElement>('[data-slot="businessHours"]')) {
      expect(band.style.background).toBe("");
    }
  });
});

describe("dom ResourceTimeline now indicator", () => {
  it("draws one line per lane when the board shows the now instant's day", () => {
    const now = new Date(2026, 5, 26, 10, 30);
    const { container } = render(
      <ResourceTimeline date={date} resources={resources} events={events} now={now} />,
    );
    expect(container.querySelectorAll('[data-slot="nowIndicator"]')).toHaveLength(2);
  });
});
