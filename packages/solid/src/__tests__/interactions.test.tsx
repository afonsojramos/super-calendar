import { vi } from "vitest";
import { flush } from "solid-js";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { Calendar, MonthView, ResourceTimeline, TimeGrid } from "../index";
import { click, key, mount, mountProps, pointer } from "../../../../tests/support/solid-render";

const date = new Date(2026, 6, 15);
const at = (hour: number, minute = 0) => new Date(2026, 6, 15, hour, minute);
const event: CalendarEvent = { title: "Planning", start: at(9), end: at(11) };
const boxOf = (element: HTMLElement) => element.closest<HTMLElement>('[data-slot="event"]')!;
const rect = (width: number, height: number, x = 0, y = 0): DOMRect => ({
  width,
  height,
  x,
  y,
  top: y,
  left: x,
  right: x + width,
  bottom: y + height,
  toJSON: () => ({ width, height, x, y }),
});

describe("Solid time-grid interactions", () => {
  it.each(["top", "bottom"] as const)("resizes the %s edge without remounting", (edge) => {
    const onDragEvent = vi.fn();
    const view = mount(() => (
      <TimeGrid date={date} events={[event]} hourHeight={48} now={date} onDragEvent={onDragEvent} />
    ));
    const box = boxOf(view.getByText("Planning"));
    const handle = [...box.querySelectorAll<HTMLElement>('div[style*="ns-resize"]')].find(
      (node) => node.style[edge] === "0px",
    )!;
    expect(handle).toBeTruthy();
    pointer(handle, "down", { clientY: 300 });
    pointer(handle, "move", { clientY: 348 });
    expect(boxOf(view.getByText("Planning"))).toBe(box);
    pointer(handle, "up", { clientY: 348 });
    expect(onDragEvent).toHaveBeenCalledWith(
      event,
      at(edge === "top" ? 10 : 9),
      at(edge === "bottom" ? 12 : 11),
    );
  });

  it("cancels a move without committing it", () => {
    const onDragEvent = vi.fn();
    const view = mount(() => (
      <TimeGrid date={date} events={[event]} now={date} onDragEvent={onDragEvent} />
    ));
    const box = boxOf(view.getByText("Planning"));
    pointer(box, "down", { clientY: 100 });
    pointer(box, "move", { clientY: 196 });
    pointer(box, "cancel", { clientY: 196 });
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(box.hasAttribute("data-dragging")).toBe(false);
  });

  it("rejects overlap and follows an updated overlap policy", () => {
    const onDragEvent = vi.fn();
    const events = [event, { title: "Busy", start: at(12), end: at(14) }];
    const view = mountProps(TimeGrid, {
      date,
      events,
      now: date,
      onDragEvent,
      eventOverlap: false,
    });
    const drag = () => {
      const box = boxOf(view.getByText("Planning"));
      pointer(box, "down", { clientY: 100 });
      pointer(box, "move", { clientY: 244 });
      pointer(box, "up", { clientY: 244 });
    };
    drag();
    expect(onDragEvent).not.toHaveBeenCalled();
    view.update({ eventOverlap: true });
    drag();
    expect(onDragEvent).toHaveBeenCalledWith(event, at(12), at(14));
  });

  it("updates resize permissions on an existing event", () => {
    const view = mountProps<import("../TimeGrid").TimeGridProps>(TimeGrid, {
      date,
      now: date,
      events: [event],
      onDragEvent: vi.fn(),
    });
    const box = boxOf(view.getByText("Planning"));
    expect(box.querySelectorAll('div[style*="ns-resize"]')).toHaveLength(2);
    view.update({ events: [{ ...event, durationEditable: false }] });
    expect(boxOf(view.getByText("Planning"))).toBe(box);
    expect(box.querySelectorAll('div[style*="ns-resize"]')).toHaveLength(0);
    expect(box.style.cursor).toBe("grab");
  });

  it("creates and cancels swept ranges within a cropped hour window", () => {
    const onCreateEvent = vi.fn();
    const view = mount(() => (
      <TimeGrid
        date={date}
        now={date}
        minHour={8}
        maxHour={16}
        scrollOffsetMinutes={0}
        onCreateEvent={onCreateEvent}
      />
    ));
    const column = view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
    vi.spyOn(column, "getBoundingClientRect").mockReturnValue(rect(300, 384));
    pointer(column, "down", { clientY: 48 });
    pointer(column, "move", { clientY: 144 });
    expect(view.container.querySelector('[data-slot="createGhost"]')).toBeTruthy();
    pointer(column, "up", { clientY: 144 });
    expect(onCreateEvent).toHaveBeenCalledWith(at(9), at(11));
    onCreateEvent.mockClear();
    pointer(column, "down", { clientY: 48 });
    pointer(column, "move", { clientY: 96 });
    pointer(column, "cancel", { clientY: 96 });
    expect(onCreateEvent).not.toHaveBeenCalled();
    expect(view.container.querySelector('[data-slot="createGhost"]')).toBeNull();
  });

  it("keeps touch scrolling separate from a held drag and ignores a second contact", () => {
    vi.useFakeTimers();
    try {
      const onDragEvent = vi.fn();
      const onDragStart = vi.fn();
      const view = mount(() => (
        <TimeGrid
          date={date}
          events={[event]}
          now={date}
          onDragEvent={onDragEvent}
          onDragStart={onDragStart}
          touchDragDelay={300}
        />
      ));
      const box = boxOf(view.getByText("Planning"));
      pointer(box, "down", { pointerType: "touch", clientY: 100 });
      pointer(document, "move", { pointerType: "touch", clientY: 120 });
      vi.advanceTimersByTime(350);
      flush();
      expect(onDragStart).not.toHaveBeenCalled();
      pointer(document, "up", { pointerType: "touch", clientY: 120 });
      pointer(box, "down", { pointerType: "touch", clientY: 100 });
      pointer(box, "down", { pointerType: "touch", pointerId: 2, isPrimary: false, clientY: 100 });
      vi.advanceTimersByTime(350);
      flush();
      expect(onDragStart).not.toHaveBeenCalled();
      pointer(document, "up", { pointerType: "touch", clientY: 100 });
      pointer(document, "up", {
        pointerType: "touch",
        pointerId: 2,
        isPrimary: false,
        clientY: 100,
      });
      pointer(box, "down", { pointerType: "touch", clientY: 100 });
      vi.advanceTimersByTime(350);
      flush();
      expect(onDragStart).toHaveBeenCalledTimes(1);
      pointer(box, "down", { pointerType: "touch", pointerId: 2, isPrimary: false, clientY: 100 });
      pointer(document, "move", { pointerType: "touch", clientY: 148 });
      pointer(document, "up", { pointerType: "touch", clientY: 148 });
      expect(onDragEvent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces a custom event component and reacts to theme and class changes", () => {
    const custom = (props: { event: CalendarEvent }) => <span>Custom {props.event.title}</span>;
    const view = mountProps(TimeGrid, {
      date,
      events: [event],
      now: date,
      renderEvent: custom,
      theme: { text: "red" },
      classNames: {} as { eventBox?: string },
    });
    expect(view.getByText("Custom Planning")).toBeTruthy();
    view.update({
      renderEvent: (props) => <span>Changed {props.event.title}</span>,
      theme: { text: "blue" },
    });
    expect(view.getByText("Changed Planning")).toBeTruthy();
    expect(view.container.firstElementChild?.getAttribute("style")).toContain("blue");
  });

  it("moves focus between events and invokes the latest callback", () => {
    const onPressEvent = vi.fn();
    const view = mount(() => (
      <TimeGrid
        date={date}
        events={[event, { title: "Later", start: at(14), end: at(15) }]}
        now={date}
        keyboardEventNavigation
        onPressEvent={onPressEvent}
      />
    ));
    const first = boxOf(view.getByText("Planning"));
    first.focus();
    key(first, "ArrowDown");
    const second = boxOf(view.getByText("Later"));
    expect(document.activeElement).toBe(second);
    key(second, "Enter");
    expect(onPressEvent).toHaveBeenCalledWith(expect.objectContaining({ title: "Later" }));
  });

  it("renders background bands and business hours without making them event buttons", () => {
    const view = mount(() => (
      <TimeGrid
        date={date}
        now={at(9, 30)}
        events={[event, { title: "Closed", start: at(12), end: at(13), display: "background" }]}
        businessHours={() => ({ start: 9, end: 17 })}
      />
    ));
    expect(view.container.querySelectorAll('[data-slot="businessHours"]').length).toBeGreaterThan(
      0,
    );
    expect(view.container.querySelectorAll('[data-slot="backgroundEvent"]')).toHaveLength(1);
    expect(view.queryByRole("button", { name: /Closed/ })).toBeNull();
    expect(view.container.querySelector<HTMLElement>('[data-slot="nowIndicator"]')?.style.top).toBe(
      "456px",
    );
  });
});

describe("Solid month interactions", () => {
  it("opens the overflow dialog, selects an event, and returns focus", () => {
    const onPressEvent = vi.fn();
    const events = Array.from({ length: 5 }, (_, i) => ({ ...event, title: `Event ${i}` }));
    const view = mount(() => (
      <MonthView date={date} events={events} maxVisibleEventCount={2} onPressEvent={onPressEvent} />
    ));
    const more = view.getByRole("button", { name: /more/ });
    click(more);
    const dialog = view.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    click(dialog.querySelector("button")!);
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("moves an event between day cells and suppresses its trailing click", () => {
    const onDragEvent = vi.fn();
    const onPressEvent = vi.fn();
    const view = mount(() => (
      <MonthView
        date={date}
        events={[event]}
        onDragEvent={onDragEvent}
        onPressEvent={onPressEvent}
      />
    ));
    const chip = view.getByText("Planning").closest("button")!;
    const day = view.container.querySelector<HTMLElement>('[data-day="2026-07-16"]')!;
    pointer(chip, "down", { button: 0 });
    day.dispatchEvent(new PointerEvent("pointerenter", { pointerId: 1 }));
    flush();
    pointer(window, "up");
    click(chip);
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    expect(onDragEvent.mock.calls[0][1].getDate()).toBe(16);
    expect(onPressEvent).not.toHaveBeenCalled();
  });

  it("expands recurrence and pages from the controlled calendar", () => {
    const onChangeDate = vi.fn();
    const view = mount(() => (
      <Calendar
        date={date}
        mode="week"
        now={date}
        events={[{ ...event, recurrence: { freq: "daily", count: 3 } }]}
        onChangeDate={onChangeDate}
      />
    ));
    expect(view.getAllByText("Planning")).toHaveLength(3);
    key(view.getAllByText("Planning")[0], "PageDown");
    expect(onChangeDate).toHaveBeenCalledWith(new Date(2026, 6, 22));
  });
});

describe("Solid resource interactions", () => {
  it.each(["horizontal", "vertical"] as const)(
    "moves and resizes a resource event in %s orientation",
    (orientation) => {
      const onDragEvent = vi.fn();
      const resources = [{ id: "a", title: "Room A" }];
      const view = mount(() => (
        <ResourceTimeline
          date={date}
          events={[event]}
          resources={resources}
          resourceId={() => "a"}
          orientation={orientation}
          hourWidth={48}
          hourHeight={48}
          now={date}
          onDragEvent={onDragEvent}
        />
      ));
      const box = view.getByText("Planning").closest("button")!;
      const start = { clientX: 100, clientY: 100 };
      const end =
        orientation === "horizontal"
          ? { clientX: 148, clientY: 100 }
          : { clientX: 100, clientY: 148 };
      pointer(box, "down", start);
      pointer(box, "move", end);
      expect(view.getByText("Planning").closest("button")).toBe(box);
      pointer(box, "up", end);
      expect(onDragEvent).toHaveBeenCalledWith(event, at(10), at(12), resources[0]);
      onDragEvent.mockClear();
      const handle = box.querySelector("span[aria-hidden]")!;
      pointer(handle, "down", start);
      pointer(handle, "move", end);
      pointer(handle, "up", end);
      expect(onDragEvent).toHaveBeenCalledWith(event, at(9), at(12), resources[0]);
    },
  );
});
