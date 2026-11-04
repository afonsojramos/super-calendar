import { vi } from "vitest";
import type { CalendarEvent, CalendarMode } from "@super-calendar/core/vanilla";
import { flush } from "solid-js";
import {
  Agenda,
  Calendar,
  DatePicker,
  DateRangePicker,
  MonthList,
  MonthView,
  ResourceTimeline,
  TimeGrid,
  YearView,
} from "../index";
import { click, key, mount, mountProps, pointer } from "../../../../tests/support/solid-render";

const date = new Date(2026, 6, 15);
const event: CalendarEvent = {
  title: "Planning",
  start: new Date(2026, 6, 15, 9),
  end: new Date(2026, 6, 15, 10),
};
const events = [event];

describe("Solid views", () => {
  it.each<CalendarMode>(["month", "week", "day", "3days", "custom", "schedule", "year"])(
    "renders calendar mode %s",
    (mode) => {
      const view = mount(() => <Calendar date={date} mode={mode} events={events} now={date} />);
      expect(view.container.textContent).not.toBe("");
      if (mode !== "year") expect(view.getAllByText("Planning").length).toBeGreaterThan(0);
    },
  );

  it("updates mounted month cells without losing keyboard focus", () => {
    const onPressDay = vi.fn();
    const view = mountProps(MonthView, { date, onPressDay, selectedDates: [] as Date[] });
    const cell = view.container.querySelector<HTMLElement>('[data-day][tabindex="0"]')!;
    cell.focus();
    key(cell, "ArrowRight");
    const next = view.getByRole("gridcell", { name: "Thursday, 2 July 2026" });
    expect(document.activeElement).toBe(next);
    view.update({ selectedDates: [new Date(2026, 6, 2)] });
    expect(view.getByRole("gridcell", { name: "Thursday, 2 July 2026" })).toBe(next);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("aria-selected")).toBe("true");
    click(next);
    expect(onPressDay).toHaveBeenCalledWith(new Date(2026, 6, 2));
  });

  it("updates virtualized month chip dimensions with a stable events array", () => {
    const view = mountProps(MonthList, {
      date,
      events,
      pastMonths: 0,
      futureMonths: 0,
      chipHeight: 18,
      chipGap: 2,
    });
    const chip = view.getByText("Planning");
    expect(chip.style.height).toBe("18px");
    view.update({ chipHeight: 30, chipGap: 7 });
    expect(view.getByText("Planning")).toBe(chip);
    expect(chip.style.height).toBe("30px");
    expect(view.container.querySelector<HTMLElement>('[data-day="2026-07-15"]')?.style.gap).toBe(
      "7px",
    );
  });

  it("bounds the mounted month count for a large date range", () => {
    const view = mount(() => <MonthList date={date} pastMonths={0} futureMonths={1000} />);
    expect(view.container.querySelectorAll("[data-virtual-row]").length).toBeLessThan(10);
  });

  it("moves a timed event while keeping its captured DOM element mounted", () => {
    const onDragEvent = vi.fn();
    const view = mount(() => (
      <TimeGrid date={date} events={events} hourHeight={48} onDragEvent={onDragEvent} now={date} />
    ));
    const box = view.getByText("Planning").closest<HTMLElement>('[data-slot="event"]')!;
    pointer(box, "down", { clientX: 200, clientY: 300, button: 0 });
    pointer(box, "move", { clientX: 200, clientY: 396 });
    expect(view.getByText("Planning").closest('[data-slot="event"]')).toBe(box);
    pointer(box, "up", { clientX: 200, clientY: 396 });
    expect(onDragEvent).toHaveBeenCalledWith(
      event,
      new Date(2026, 6, 15, 11),
      new Date(2026, 6, 15, 12),
    );
  });

  it("updates agenda content and styling in existing virtual rows", () => {
    const view = mountProps(Agenda, { events, theme: { eventText: "red" } });
    expect(view.getByText("Planning").parentElement?.style.color).toBe("red");
    view.update({ events: [{ ...event, title: "Updated" }], theme: { eventText: "blue" } });
    expect(view.getByText("Updated").parentElement?.style.color).toBe("blue");
  });

  it("preserves the active calendar view when event data and callbacks change", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = mountProps(Calendar, {
      date,
      mode: "day" as CalendarMode,
      events,
      now: date,
      onPressEvent: first,
    });
    const box = view.getByText("Planning").closest('[data-slot="event"]');
    view.update({ events: [{ ...event, title: "Updated" }], onPressEvent: second });
    expect(view.getByText("Updated").closest('[data-slot="event"]')).toBe(box);
    click(view.getByText("Updated"));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("renders and changes resource orientation", () => {
    const view = mountProps(ResourceTimeline, {
      date,
      resources: [{ id: "a", title: "Room A" }],
      events,
      resourceId: () => "a",
      orientation: "horizontal" as "horizontal" | "vertical",
      now: date,
    });
    expect(view.getByText("Planning")).toBeTruthy();
    view.update({ orientation: "vertical" });
    expect(view.getByText("Room A")).toBeTruthy();
    expect(view.getByText("Planning")).toBeTruthy();
  });

  it("opens and dismisses both picker popovers", () => {
    for (const View of [DatePicker, DateRangePicker]) {
      const view = mount(() => <View value={null} onChange={() => {}} />);
      click(view.getByRole("button"));
      expect(view.getByRole("dialog")).toBeTruthy();
      key(view.getByRole("dialog"), "Escape");
      expect(view.queryByRole("dialog")).toBeNull();
      view.dispose();
    }
    flush();
  });

  it("updates year selection", () => {
    const view = mountProps(YearView, { date, selectedDates: [] as Date[] });
    view.update({ selectedDates: [date] });
    expect(view.container.querySelectorAll('[data-selected=""]').length).toBeGreaterThan(0);
  });
});
