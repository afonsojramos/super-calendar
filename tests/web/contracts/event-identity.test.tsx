import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import {
  Agenda,
  Calendar,
  MonthList,
  MonthView,
  MultiWeekView,
  ResourceTimeline,
  TimeGrid,
  fireEvent,
  render,
  rendererName,
} from "@calendar-test/renderer";

// `getEventId` keeps focus, rendered state, and a held drag on the same event
// when a refresh replaces every event object. Each refresh below also renames or
// reorders events, so neither content keys nor list positions can stand in for
// the ID.
type Item = CalendarEvent<{ id: string }>;
const getEventId = (event: Item) => event.id;
const focused = () => document.activeElement as HTMLElement | null;

describe(rendererName, () => {
  describe("TimeGrid", () => {
    const day = new Date(2026, 5, 26);
    const standup: Item = {
      id: "standup",
      title: "Standup",
      start: new Date(2026, 5, 26, 9),
      end: new Date(2026, 5, 26, 10),
    };
    const focus: Item = {
      id: "focus",
      title: "Focus",
      start: new Date(2026, 5, 26, 14),
      end: new Date(2026, 5, 26, 16),
    };
    const early: Item = {
      id: "early",
      title: "Early",
      start: new Date(2026, 5, 26, 7),
      end: new Date(2026, 5, 26, 8),
    };
    // Title div -> default event root -> the box with the pointer handlers.
    const boxOf = (view: { getByText: (text: string) => HTMLElement }, title: string) =>
      view.getByText(title).parentElement!.parentElement!;
    const setup = () => {
      const onDragEvent = vi.fn();
      const props = {
        date: day,
        mode: "day" as const,
        events: [standup, focus],
        hourHeight: 48,
        onDragEvent,
        getEventId,
      };
      const view = render(TimeGrid<{ id: string }>, props);
      const refresh = () => {
        const refreshed = { ...focus };
        view.rerender({ ...props, events: [early, { ...standup }, refreshed] });
        return refreshed;
      };
      return { view, onDragEvent, refresh };
    };

    it("keeps a held move on its event through a refresh that reorders the day", () => {
      const { view, onDragEvent, refresh } = setup();
      const box = boxOf(view, "Focus");
      fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
      // Up 96 px is two hours earlier at 48 px per hour.
      fireEvent.pointerMove(box, { clientY: 204, pointerId: 1 });
      const refreshed = refresh();
      expect(boxOf(view, "Focus").hasAttribute("data-dragging")).toBe(true);
      expect(boxOf(view, "Standup").hasAttribute("data-dragging")).toBe(false);
      fireEvent.pointerUp(document, { clientY: 204, pointerId: 1 });
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        refreshed,
        new Date(2026, 5, 26, 12),
        new Date(2026, 5, 26, 14),
      );
    });

    it("keeps a held resize on its event through a refresh that reorders the day", () => {
      const { view, onDragEvent, refresh } = setup();
      const handle = [
        ...boxOf(view, "Focus").querySelectorAll<HTMLElement>('div[style*="ns-resize"]'),
      ].find((element) => element.style.top === "0px")!;
      fireEvent.pointerDown(handle, { clientY: 300, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 348, pointerId: 1 });
      const refreshed = refresh();
      expect(boxOf(view, "Focus").hasAttribute("data-dragging")).toBe(true);
      fireEvent.pointerUp(document, { clientY: 348, pointerId: 1 });
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        refreshed,
        new Date(2026, 5, 26, 15),
        new Date(2026, 5, 26, 16),
      );
    });

    it("keeps focus on a timed event through a refresh that reorders the day", () => {
      const { view, refresh } = setup();
      boxOf(view, "Focus").focus();
      refresh();
      expect(focused()).toBe(boxOf(view, "Focus"));
    });
  });

  describe.each(["month", "multiweek"] as const)("%s view", (mode) => {
    const View = mode === "month" ? MonthView<{ id: string }> : MultiWeekView<{ id: string }>;
    const date = new Date(2026, 6, 15);
    // Wednesday to Friday.
    const trip: Item = {
      id: "trip",
      title: "Trip",
      start: new Date(2026, 6, 15),
      end: new Date(2026, 6, 18),
      allDay: true,
    };
    // Starts the same day and runs longer, so it is laid out before the trip.
    const longer: Item = {
      id: "longer",
      title: "Longer",
      start: new Date(2026, 6, 15),
      end: new Date(2026, 6, 19),
      allDay: true,
    };
    const cell = (container: HTMLElement, key: string) =>
      container.querySelector<HTMLElement>(`[data-day="${key}"]`)!;
    const setup = () => {
      const onDragEvent = vi.fn();
      const props = { date, weekStartsOn: 1 as const, events: [trip], onDragEvent, getEventId };
      const view = render(View, props);
      const refresh = () => {
        const refreshed = { ...trip, title: "Trip renamed" };
        view.rerender({ ...props, events: [longer, refreshed] });
        return refreshed;
      };
      return { view, onDragEvent, refresh };
    };

    it("keeps focus on an event bar through a refresh that renames and reorders it", () => {
      const { view, refresh } = setup();
      view.getByRole("button", { name: /^Trip,/ }).focus();
      refresh();
      expect(focused()).toBe(view.getByRole("button", { name: /^Trip renamed,/ }));
    });

    it("keeps a held move on its event through a refresh and commits the new object", () => {
      const { view, onDragEvent, refresh } = setup();
      fireEvent.pointerDown(view.getByRole("button", { name: /^Trip,/ }), {
        button: 0,
        pointerId: 3,
        pointerType: "mouse",
      });
      fireEvent.pointerEnter(cell(view.container, "2026-07-16"), { buttons: 1, pointerId: 3 });
      const refreshed = refresh();
      fireEvent.pointerEnter(cell(view.container, "2026-07-17"), { buttons: 1, pointerId: 3 });
      // The carried bar stays faded under its new title.
      const carried = view.getByRole("button", { name: /^Trip renamed,/ });
      expect(Number(carried.style.opacity)).toBeLessThan(1);
      expect(Number(view.getByRole("button", { name: /^Longer,/ }).style.opacity || 1)).toBe(1);
      fireEvent.pointerUp(window, { button: 0, pointerId: 3 });
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        refreshed,
        new Date(2026, 6, 17),
        new Date(2026, 6, 20),
      );
    });
  });

  it("keeps focus on a MonthList event through a refresh that renames and reorders it", () => {
    const trip: Item = {
      id: "trip",
      title: "Trip",
      start: new Date(2026, 6, 15),
      end: new Date(2026, 6, 18),
      allDay: true,
    };
    const props = {
      date: new Date(2026, 6, 15),
      weekStartsOn: 1 as const,
      events: [trip],
      pastMonths: 0,
      futureMonths: 0,
      height: 400,
      getEventId,
    };
    const view = render(MonthList<{ id: string }>, props);
    view.getByRole("button", { name: /^Trip,/ }).focus();
    view.rerender({
      ...props,
      events: [
        {
          id: "longer",
          title: "Longer",
          start: trip.start,
          end: new Date(2026, 6, 19),
          allDay: true,
        },
        { ...trip, title: "Trip renamed" },
      ],
    });
    expect(focused()).toBe(view.getByRole("button", { name: /^Trip renamed,/ }));
  });

  it("keeps focus on an Agenda row through a refresh that inserts an earlier event", () => {
    const lunch: Item = {
      id: "lunch",
      title: "Lunch",
      start: new Date(2026, 5, 23, 12),
      end: new Date(2026, 5, 23, 13),
    };
    const props = { events: [lunch], getEventId };
    const view = render(Agenda<{ id: string }>, props);
    const row = () => view.getByText("Lunch").closest("button")!;
    row().focus();
    view.rerender({
      ...props,
      events: [
        {
          id: "standup",
          title: "Standup",
          start: new Date(2026, 5, 23, 9),
          end: new Date(2026, 5, 23, 9, 30),
        },
        { ...lunch },
      ],
    });
    expect(focused()).toBe(row());
  });

  describe.each(["month", "schedule"] as const)("Calendar %s mode", (mode) => {
    it("keeps focus on an event through a refresh that inserts an earlier event", () => {
      const trip: Item = {
        id: "trip",
        title: "Trip",
        start: new Date(2026, 6, 15),
        end: new Date(2026, 6, 18),
        allDay: true,
      };
      const props = { date: new Date(2026, 6, 15), mode, events: [trip], getEventId };
      const view = render(Calendar<{ id: string }>, props);
      const target = () => view.getAllByText(/^Trip/)[0].closest("button")!;
      target().focus();
      view.rerender({
        ...props,
        events: [
          {
            id: "longer",
            title: "Longer",
            start: new Date(2026, 6, 15),
            end: new Date(2026, 6, 19),
            allDay: true,
          },
          { ...trip, title: "Trip renamed" },
        ],
      });
      expect(focused()).toBe(target());
      expect(target().textContent).toContain("Trip renamed");
    });
  });

  describe("ResourceTimeline", () => {
    type Booking = CalendarEvent<{ id: string; resourceId: string }>;
    const resources = [
      { id: "a", title: "Room A" },
      { id: "b", title: "Room B" },
    ];
    const standup: Booking = {
      id: "standup",
      resourceId: "a",
      title: "Standup",
      start: new Date(2026, 5, 26, 9),
      end: new Date(2026, 5, 26, 10),
    };
    const early: Booking = {
      id: "early",
      resourceId: "a",
      title: "Early",
      start: new Date(2026, 5, 26, 7),
      end: new Date(2026, 5, 26, 8),
    };
    const setup = () => {
      const onDragEvent = vi.fn();
      const props = {
        date: new Date(2026, 5, 26),
        resources,
        events: [standup],
        startHour: 0,
        hourWidth: 80,
        onDragEvent,
        getEventId: (event: Booking) => event.id,
      };
      const view = render(ResourceTimeline<{ id: string; resourceId: string }>, props);
      const bar = () => view.getByText("Standup").closest("button")!;
      const refresh = () => {
        const refreshed = { ...standup };
        view.rerender({ ...props, events: [early, refreshed] });
        return refreshed;
      };
      return { view, onDragEvent, bar, refresh };
    };

    it("keeps a held move on its booking through a refresh", () => {
      const { onDragEvent, bar, refresh } = setup();
      fireEvent.pointerDown(bar(), { clientX: 100, pointerId: 1 });
      fireEvent.pointerMove(bar(), { clientX: 180, pointerId: 1 });
      const refreshed = refresh();
      expect(bar().hasAttribute("data-dragging")).toBe(true);
      fireEvent.pointerUp(bar(), { clientX: 180, pointerId: 1 });
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        refreshed,
        new Date(2026, 5, 26, 10),
        new Date(2026, 5, 26, 11),
        resources[0],
      );
    });

    it("keeps focus on a booking through a refresh", () => {
      const { bar, refresh } = setup();
      bar().focus();
      refresh();
      expect(focused()).toBe(bar());
    });
  });
});
