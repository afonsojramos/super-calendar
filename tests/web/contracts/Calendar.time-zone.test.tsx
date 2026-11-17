import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { rendererName, fireEvent, render, Calendar } from "@calendar-test/renderer";

// Asia/Kolkata is UTC+5:30 all year, so the expected instants hold in any host
// zone. 06:00-08:00 UTC is 11:30-13:30 there.
const timeZone = "Asia/Kolkata";
const date = new Date(2026, 6, 15);
const meeting: CalendarEvent = {
  title: "Meeting",
  start: new Date(Date.UTC(2026, 6, 15, 6, 0)),
  end: new Date(Date.UTC(2026, 6, 15, 8, 0)),
};
const holiday: CalendarEvent = {
  title: "Holiday",
  allDay: true,
  start: new Date(2026, 6, 15),
  end: new Date(2026, 6, 16),
};

describe(rendererName, () => {
  describe("Calendar callbacks with a timeZone", () => {
    // The event chip sits inside the absolutely-positioned wrapper that carries
    // the pointer handlers: title div -> default-event root -> wrapper.
    const wrapperOf = (chip: HTMLElement) => chip.parentElement!.parentElement!;
    const day = { mode: "day" as const, date, timeZone, hourHeight: 48, events: [meeting] };

    it("presses the consumer's own event, with its real instants", () => {
      const onPressEvent = vi.fn();
      const { getByText } = render(Calendar, { ...day, onPressEvent });
      expect(getByText("11:30 - 13:30")).toBeTruthy();
      fireEvent.click(getByText("Meeting"));
      expect(onPressEvent).toHaveBeenCalledTimes(1);
      expect(onPressEvent.mock.calls[0][0]).toBe(meeting);
    });

    it("reports a move as real instants on the consumer's event", () => {
      const onDragStart = vi.fn();
      const onDragEvent = vi.fn();
      const { getByText } = render(Calendar, { ...day, onDragStart, onDragEvent });
      const box = wrapperOf(getByText("Meeting"));
      // Down 48px = one hour later on the zone's clock.
      fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientY: 348, pointerId: 1 });
      fireEvent.pointerUp(box, { clientY: 348, pointerId: 1 });
      expect(onDragStart).toHaveBeenCalledExactlyOnceWith(meeting);
      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const [event, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
      expect(event).toBe(meeting);
      expect(start.toISOString()).toBe("2026-07-15T07:00:00.000Z");
      expect(end.toISOString()).toBe("2026-07-15T09:00:00.000Z");
    });

    it("keeps a drop rejection working through the conversion", () => {
      const onDragEvent = vi.fn(() => false);
      const { getByText } = render(Calendar, { ...day, onDragEvent });
      const box = wrapperOf(getByText("Meeting"));
      fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(box, { clientY: 348, pointerId: 1 });
      fireEvent.pointerUp(box, { clientY: 348, pointerId: 1 });
      expect(onDragEvent).toHaveReturnedWith(false);
      expect(getByText("11:30 - 13:30")).toBeTruthy();
    });

    it("reports a created time range as real instants", () => {
      const onCreateEvent = vi.fn();
      const { container } = render(Calendar, { ...day, events: [], onCreateEvent });
      const column = container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
      // 96px to 144px at 48px/hour is 02:00 to 03:00 on the zone's clock.
      fireEvent.pointerDown(column, { clientY: 96, pointerId: 1, button: 0 });
      fireEvent.pointerMove(column, { clientY: 144, pointerId: 1 });
      fireEvent.pointerUp(column, { clientY: 144, pointerId: 1 });
      expect(onCreateEvent).toHaveBeenCalledTimes(1);
      const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
      expect(start.toISOString()).toBe("2026-07-14T20:30:00.000Z");
      expect(end.toISOString()).toBe("2026-07-14T21:30:00.000Z");
    });

    it("keeps an all-day event on its own day", () => {
      const { container } = render(Calendar, {
        mode: "month",
        date,
        timeZone,
        events: [holiday],
      });
      const titles = (dayId: string) =>
        container.querySelector(`[data-day="${dayId}"]`)?.textContent ?? "";
      expect(titles("2026-07-15")).toContain("Holiday");
      expect(titles("2026-07-14")).not.toContain("Holiday");
      expect(titles("2026-07-16")).not.toContain("Holiday");
    });

    it("presses the consumer's own all-day event", () => {
      const onPressEvent = vi.fn();
      const { getByText } = render(Calendar, {
        mode: "month",
        date,
        timeZone,
        events: [holiday],
        onPressEvent,
      });
      fireEvent.click(getByText("Holiday"));
      expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(holiday);
      expect(onPressEvent.mock.calls[0][0]).toBe(holiday);
    });

    it("reports whole days as local dates, like the date prop", () => {
      const onPressDay = vi.fn();
      const onPressCell = vi.fn();
      const { container } = render(Calendar, {
        mode: "month",
        date,
        timeZone,
        events: [],
        onPressDay,
        onPressCell,
      });
      fireEvent.click(container.querySelector('[data-day="2026-07-15"]')!);
      expect(onPressDay).toHaveBeenCalledExactlyOnceWith(new Date(2026, 6, 15));
      expect(onPressCell).toHaveBeenCalledExactlyOnceWith(new Date(2026, 6, 15));
    });
  });
});
