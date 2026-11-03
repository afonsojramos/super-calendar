import { vi, type Mock } from "vitest";
import type { CalendarHandle } from "@super-calendar/core/vanilla";
import { flush } from "solid-js";
import {
  Calendar,
  MonthView,
  YearView,
  ResourceTimeline,
  TimeGrid,
  type ResourceTimelineProps,
} from "../index";
import { VirtualList } from "../VirtualList";
import { click, mount, mountProps, pointer } from "../../../../tests/support/solid-render";

const date = new Date(2026, 6, 15);
const event = {
  title: "Planning",
  start: new Date(2026, 6, 15, 9),
  end: new Date(2026, 6, 15, 10),
};

const enter = (target: Element, pointerId = 1) => {
  target.dispatchEvent(new PointerEvent("pointerenter", { pointerId }));
  flush();
};

it.each(["time", "resource"])("keeps %s creation owned by the pen that started it", (kind) => {
  const onCreateEvent = vi.fn();
  const view = mount(() =>
    kind === "time" ? (
      <TimeGrid
        date={date}
        now={date}
        minHour={8}
        maxHour={18}
        scrollOffsetMinutes={0}
        onCreateEvent={onCreateEvent}
      />
    ) : (
      <ResourceTimeline
        date={date}
        now={date}
        events={[]}
        resources={[{ id: "a", title: "Studio" }]}
        resourceId={() => "a"}
        startHour={8}
        endHour={18}
        hourWidth={48}
        onCreateEvent={onCreateEvent}
      />
    ),
  );
  const lane = view.container.querySelector<HTMLElement>(
    kind === "time" ? '[data-slot="dayColumn"]' : '[data-slot="track"]',
  )!;
  pointer(lane, "down", { pointerType: "pen", clientX: 48, clientY: 48 });
  pointer(lane, "down", { pointerType: "touch", pointerId: 2, clientX: 96, clientY: 96 });
  pointer(lane, "move", { pointerId: 2, clientX: 144, clientY: 144 });
  pointer(lane, "up", { pointerId: 2, clientX: 144, clientY: 144 });
  pointer(lane, "cancel", { pointerId: 2 });
  expect(onCreateEvent).not.toHaveBeenCalled();
  pointer(lane, "move", { pointerType: "pen", clientX: 144, clientY: 144 });
  pointer(lane, "up", { pointerType: "pen", clientX: 144, clientY: 144 });
  expect(onCreateEvent).toHaveBeenCalledTimes(1);
  expect(onCreateEvent.mock.calls[0].slice(0, 2)).toEqual([
    new Date(2026, 6, 15, 9),
    new Date(2026, 6, 15, 11),
  ]);
});

it.each([
  ["month", MonthView],
  ["year", YearView],
] as const)("cancels a %s sweep before a later unrelated release", (name, View) => {
  const onCreateEvent = vi.fn();
  const view = mount(() => <View date={date} events={[]} onCreateEvent={onCreateEvent} />);
  const first = view.getByRole("gridcell", {
    name: name === "month" ? "Wednesday, 15 July 2026, 0 events" : "Wednesday, 15 July 2026",
  });
  const second = view.getByRole("gridcell", {
    name: name === "month" ? "Thursday, 16 July 2026, 0 events" : "Thursday, 16 July 2026",
  });
  const sweep = () => {
    pointer(first, "down", { button: 0 });
    enter(second);
  };
  sweep();
  pointer(second, "cancel");
  pointer(window, "up");
  expect(onCreateEvent).not.toHaveBeenCalled();
  sweep();
  pointer(window, "up");
  expect(onCreateEvent).toHaveBeenCalledTimes(1);
  expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 17));
});

it.each([
  ["month", MonthView],
  ["year", YearView],
] as const)("keeps the initiating pointer in control of a %s sweep", (name, View) => {
  const onCreateEvent = vi.fn();
  const view = mount(() => <View date={date} events={[]} onCreateEvent={onCreateEvent} />);
  const first = view.getByRole("gridcell", {
    name: name === "month" ? "Wednesday, 15 July 2026, 0 events" : "Wednesday, 15 July 2026",
  });
  const second = view.getByRole("gridcell", {
    name: name === "month" ? "Thursday, 16 July 2026, 0 events" : "Thursday, 16 July 2026",
  });
  const other = view.getByRole("gridcell", {
    name: name === "month" ? "Friday, 17 July 2026, 0 events" : "Friday, 17 July 2026",
  });
  pointer(first, "down", { button: 0 });
  enter(second);
  pointer(other, "down", { button: 0, pointerId: 2, isPrimary: false });
  enter(other, 2);
  pointer(window, "up", { pointerId: 2 });
  pointer(window, "cancel", { pointerId: 2 });
  expect(onCreateEvent).not.toHaveBeenCalled();
  pointer(window, "up");
  expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 17));
});

it("cancels a moved month event before a later unrelated release", () => {
  const onDragEvent = vi.fn();
  const view = mount(() => <MonthView date={date} events={[event]} onDragEvent={onDragEvent} />);
  pointer(view.getByText("Planning").closest("button")!, "down", { button: 0 });
  const target = view.container.querySelector('[data-day="2026-07-16"]')!;
  enter(target);
  pointer(target, "cancel");
  pointer(window, "up");
  expect(onDragEvent).not.toHaveBeenCalled();
});

it("does not let a second resource contact replace or end the active drag", () => {
  const later = {
    title: "Later",
    start: new Date(2026, 6, 15, 12),
    end: new Date(2026, 6, 15, 13),
  };
  const onDragEvent = vi.fn();
  const view = mount(() => (
    <ResourceTimeline
      date={date}
      now={date}
      events={[event, later]}
      resources={[{ id: "a", title: "Studio" }]}
      resourceId={() => "a"}
      hourWidth={80}
      onDragEvent={onDragEvent}
    />
  ));
  const first = view.getByText("Planning").closest<HTMLElement>('[data-slot="event"]')!;
  const second = view.getByText("Later").closest<HTMLElement>('[data-slot="event"]')!;
  pointer(first, "down", { pointerType: "touch", clientX: 100 });
  pointer(second, "down", { pointerType: "touch", clientX: 500, pointerId: 2, isPrimary: false });
  pointer(second, "move", { pointerType: "touch", clientX: 600, pointerId: 2 });
  pointer(second, "up", { pointerType: "touch", clientX: 600, pointerId: 2 });
  pointer(second, "cancel", { pointerId: 2 });
  expect(onDragEvent).not.toHaveBeenCalled();
  pointer(first, "move", { pointerType: "touch", clientX: 180 });
  pointer(first, "up", { pointerType: "touch", clientX: 180 });
  expect(onDragEvent).toHaveBeenCalledWith(
    event,
    new Date(2026, 6, 15, 10),
    new Date(2026, 6, 15, 11),
    { id: "a", title: "Studio" },
  );
});

describe.each(["horizontal", "vertical"] as const)("%s resource event lifecycle", (orientation) => {
  const resource = { id: "a", title: "Studio" };
  const earlier = {
    title: "Earlier",
    start: new Date(2026, 6, 15, 8),
    end: new Date(2026, 6, 15, 9),
  };
  const position = (offset: number) =>
    orientation === "vertical" ? { clientY: offset } : { clientX: offset };
  const setup = () => {
    const onDragEvent = vi.fn();
    const onPressEvent = vi.fn();
    const view = mountProps<ResourceTimelineProps>(ResourceTimeline, {
      date,
      now: date,
      events: [event],
      resources: [resource],
      resourceId: () => "a",
      orientation,
      hourWidth: 80,
      hourHeight: 80,
      onDragEvent,
      onPressEvent,
    });
    return { ...view, onDragEvent, onPressEvent };
  };

  it("keeps the grabbed event when a live update inserts an earlier event", () => {
    const view = setup();
    const box = view.getByRole("button", { name: "Planning" });
    pointer(box, "down", position(100));
    view.update({ events: [earlier, event] });
    expect(view.getByRole("button", { name: "Planning" })).toBe(box);
    pointer(box, "move", position(180));
    pointer(box, "up", position(180));
    expect(view.onDragEvent).toHaveBeenCalledTimes(1);
    expect(view.onDragEvent).toHaveBeenCalledWith(
      event,
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 11),
      resource,
    );
  });

  it("cancels a removed event and lets the next event start a fresh drag", () => {
    const view = setup();
    const box = view.getByRole("button", { name: "Planning" });
    pointer(box, "down", position(100));
    pointer(box, "move", position(180));
    view.update({ events: [earlier] });
    const replacement = view.getByRole("button", { name: "Earlier" });
    pointer(replacement, "up", position(180));
    expect(view.onDragEvent).not.toHaveBeenCalled();
    pointer(replacement, "down", position(100));
    pointer(replacement, "move", position(180));
    pointer(replacement, "up", position(180));
    expect(view.onDragEvent).toHaveBeenCalledWith(
      earlier,
      new Date(2026, 6, 15, 9),
      new Date(2026, 6, 15, 10),
      resource,
    );
  });

  it("cancels creation when its resource leaves the visible lanes", () => {
    const view = setup();
    const onCreateEvent = vi.fn();
    view.update({ onCreateEvent });
    const lane = view.container.querySelector<HTMLElement>('[data-slot="track"]')!;
    pointer(lane, "down", position(80));
    pointer(lane, "move", position(160));
    const replacementResource = { id: "b", title: "Meeting room" };
    view.update({ resources: [replacementResource] });
    const replacement = view.container.querySelector<HTMLElement>('[data-slot="track"]')!;
    pointer(replacement, "up", position(160));
    expect(onCreateEvent).not.toHaveBeenCalled();
    pointer(replacement, "down", position(80));
    pointer(replacement, "move", position(160));
    pointer(replacement, "up", position(160));
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    expect(onCreateEvent.mock.calls[0][2]).toEqual(replacementResource);
  });

  it("keeps an active event in its resource when lanes are reordered", () => {
    const view = setup();
    const other = { id: "b", title: "Meeting room" };
    view.update({ resources: [resource, other] });
    const box = view.getByRole("button", { name: "Planning" });
    pointer(box, "down", position(100));
    view.update({ resources: [other, resource] });
    expect(view.getByRole("button", { name: "Planning" })).toBe(box);
    pointer(box, "move", position(180));
    pointer(box, "up", position(180));
    expect(view.onDragEvent).toHaveBeenCalledWith(
      event,
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 11),
      resource,
    );
  });

  it("captures resize on the event button and releases ownership after capture loss", () => {
    const view = setup();
    const box = view.getByRole("button", { name: "Planning" });
    const capture = vi.spyOn(box, "setPointerCapture");
    const grip = box.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    pointer(grip, "down", { ...position(100), pointerType: "touch" });
    expect(capture).toHaveBeenCalledWith(1);
    view.update({ onDragEvent: undefined });
    expect(grip.isConnected).toBe(false);
    box.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }));
    flush();
    view.update({ onDragEvent: view.onDragEvent });
    pointer(box, "down", { ...position(100), pointerType: "touch", pointerId: 2 });
    pointer(box, "move", { ...position(180), pointerType: "touch", pointerId: 2 });
    pointer(box, "up", { ...position(180), pointerType: "touch", pointerId: 2 });
    expect(view.onDragEvent).toHaveBeenCalledTimes(1);
    expect(view.onDragEvent).toHaveBeenCalledWith(
      event,
      new Date(2026, 6, 15, 10),
      new Date(2026, 6, 15, 11),
      resource,
    );
  });

  it("discards creation after capture loss and accepts a fresh pointer", () => {
    const view = setup();
    const onCreateEvent = vi.fn();
    view.update({ onCreateEvent });
    const lane = view.container.querySelector<HTMLElement>('[data-slot="track"]')!;
    pointer(lane, "down", position(80));
    pointer(lane, "move", position(160));
    lane.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }));
    flush();
    pointer(lane, "up", position(160));
    expect(onCreateEvent).not.toHaveBeenCalled();
    pointer(lane, "down", { ...position(80), pointerId: 2 });
    pointer(lane, "move", { ...position(160), pointerId: 2 });
    pointer(lane, "up", { ...position(160), pointerId: 2 });
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps locked events clickable without moving or exposing a resize grip", () => {
    const view = setup();
    const locked = { ...event, draggable: false };
    view.update({ events: [locked] });
    const box = view.getByRole("button", { name: "Planning" });
    expect(box.querySelector('[aria-hidden="true"]')).toBeNull();
    pointer(box, "down", position(100));
    pointer(box, "move", position(180));
    pointer(box, "up", position(180));
    expect(view.onDragEvent).not.toHaveBeenCalled();
    click(box);
    expect(view.onPressEvent).toHaveBeenCalledWith(locked);
  });

  it("activates draggable events by keyboard without duplicating pointer presses", () => {
    const view = setup();
    const box = view.getByRole("button", { name: "Planning" });
    click(box);
    expect(view.onPressEvent).toHaveBeenCalledTimes(1);
    pointer(box, "down", position(100));
    pointer(box, "up", position(100));
    box.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    flush();
    expect(view.onPressEvent).toHaveBeenCalledTimes(2);
    pointer(box, "down", position(100));
    pointer(box, "move", position(180));
    pointer(box, "up", position(180));
    box.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    flush();
    expect(view.onPressEvent).toHaveBeenCalledTimes(2);
    expect(view.onDragEvent).toHaveBeenCalledTimes(1);
  });
});

it("keeps an imperative calendar handle current across mode changes and disposal", () => {
  let handle!: CalendarHandle;
  const view = mountProps(Calendar, {
    date,
    now: date,
    mode: "week" as "week" | "month",
    ref: (value: CalendarHandle) => {
      handle = value;
    },
  });
  const scroll =
    view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!.parentElement!
      .parentElement!;
  handle.scrollToTime(600, { animated: false });
  expect(scroll.scrollTop).toBe(480);
  view.update({ mode: "month" });
  handle.scrollToTime(720, { animated: false });
  expect(scroll.scrollTop).toBe(480);
  view.update({ mode: "week" });
  const replacement =
    view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!.parentElement!
      .parentElement!;
  expect(replacement).not.toBe(scroll);
  handle.scrollToTime(720, { animated: false });
  expect(replacement.scrollTop).toBe(576);
  view.dispose();
  handle.scrollToTime(0, { animated: false });
  expect(replacement.scrollTop).toBe(576);
});

it("cancels a pending held press when its time grid is disposed", () => {
  vi.useFakeTimers();
  try {
    const onDragStart = vi.fn();
    const onDragEvent = vi.fn();
    const view = mount(() => (
      <TimeGrid
        date={date}
        now={date}
        events={[event]}
        onDragStart={onDragStart}
        onDragEvent={onDragEvent}
      />
    ));
    const box = view.getByText("Planning").closest<HTMLElement>('[data-slot="event"]')!;
    pointer(box, "down", { pointerType: "touch", clientY: 100 });
    view.dispose();
    vi.advanceTimersByTime(1000);
    pointer(document, "move", { pointerType: "touch", clientY: 200 });
    pointer(document, "up", { pointerType: "touch", clientY: 200 });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("updates resource hours and theme without replacing the active event", () => {
  const view = mountProps<ResourceTimelineProps>(ResourceTimeline, {
    date,
    now: date,
    events: [event],
    resources: [{ id: "a", title: "Studio" }],
    resourceId: () => "a",
    orientation: "vertical",
    hourHeight: 48,
    startHour: 7,
    endHour: 18,
    onDragEvent: vi.fn(),
    businessHours: () => null,
  });
  const box = view.getByText("Planning").closest<HTMLElement>('[data-slot="event"]')!;
  view.update({ hourHeight: 60, startHour: 8, theme: { eventText: "red" } });
  expect(view.getByText("Planning").closest('[data-slot="event"]')).toBe(box);
  expect(box.style.top).toBe("60px");
  expect(view.container.querySelector('[data-slot="businessHours"]')).toBeTruthy();
});

it("adds a live date header callback without retaining a stale branch", () => {
  const first = vi.fn();
  const second = vi.fn();
  const view = mountProps<import("../TimeGrid").TimeGridProps>(TimeGrid, {
    date,
    now: date,
    mode: "day",
  });
  expect(view.container.querySelector('[data-slot="columnHeader"]')?.getAttribute("role")).not.toBe(
    "button",
  );
  view.update({ onPressDateHeader: first });
  click(view.container.querySelector('[data-slot="columnHeader"]')!);
  expect(first).toHaveBeenCalledWith(date);
  view.update({ onPressDateHeader: second });
  click(view.container.querySelector('[data-slot="columnHeader"]')!);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledWith(date);
});

it("anchors measured virtual rows and disconnects every observer on disposal", () => {
  const original = globalThis.ResizeObserver;
  const observers: Array<{
    callback: ResizeObserverCallback;
    elements: Set<Element>;
    disconnect: Mock;
  }> = [];
  globalThis.ResizeObserver = class {
    elements = new Set<Element>();
    disconnect = vi.fn(() => this.elements.clear());
    constructor(public callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe(element: Element) {
      this.elements.add(element);
    }
    unobserve(element: Element) {
      this.elements.delete(element);
    }
  };
  try {
    const rows = Array.from({ length: 1000 }, (_, id) => ({ id, label: `Row ${id}` }));
    const view = mount(() => (
      <VirtualList
        data={rows}
        keyExtractor={(row) => String(row.id)}
        estimatedItemSize={100}
        initialScrollIndex={50}
        renderItem={(props) => <div>{props.item.label}</div>}
      />
    ));
    const viewport = view.container.querySelector<HTMLElement>("[data-virtual-list]")!;
    const anchor = view.getByText("Row 50").parentElement!;
    expect(viewport.scrollTop).toBe(5000);
    expect(view.container.querySelectorAll("[data-virtual-row]").length).toBeLessThan(12);
    const earlier = view.getByText("Row 48").parentElement!;
    vi.spyOn(earlier, "getBoundingClientRect").mockReturnValue({ height: 200 } as DOMRect);
    const observer = observers.find((item) => item.elements.has(earlier))!;
    observer.callback([], {} as ResizeObserver);
    flush();
    expect(viewport.scrollTop).toBe(5100);
    expect(anchor.style.top).toBe("5100px");
    expect(view.getByText("Row 50").parentElement).toBe(anchor);
    view.dispose();
    expect(observers.every((item) => item.disconnect.mock.calls.length === 1)).toBe(true);
  } finally {
    globalThis.ResizeObserver = original;
  }
});
