import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import {
  rendererName,
  cleanup,
  fireEvent,
  render,
  ResourceTimeline,
  TimeGrid,
} from "@calendar-test/renderer";

describe(rendererName, () => {
  afterEach(() => cleanup());

  const date = new Date(2026, 6, 15);
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 6, day, hour, minute);
  const planning: CalendarEvent = { title: "Planning", start: at(15, 9), end: at(15, 10) };
  const menu = (view: { getByRole: HTMLElementQuery }) =>
    view.getByRole("button", { name: "Edit events" });
  const trigger = (view: { getByRole: HTMLElementQuery }, title: string) => {
    if (menu(view).getAttribute("aria-expanded") !== "true") fireEvent.click(menu(view));
    return view.getByRole("button", { name: `Move or resize ${title}` });
  };
  const actionNames = (dialog: HTMLElement) =>
    [...dialog.querySelectorAll("button")].map((button) => button.textContent);
  const action = (dialog: HTMLElement, name: string) =>
    [...dialog.querySelectorAll("button")].find((button) => button.textContent === name)!;
  type HTMLElementQuery = (role: string, options?: { name?: string }) => HTMLElement;
  const untypedEventId = (id: unknown) => {
    // JavaScript consumers can return values outside the TypeScript contract.
    // @ts-expect-error Exercise the public callback's runtime boundary.
    const getEventId: () => string | number = () => id;
    return getEventId;
  };

  describe("TimeGrid actions", () => {
    const grid = (props: Partial<Parameters<typeof TimeGrid>[0]> = {}) => ({
      date,
      mode: "week" as const,
      weekStartsOn: 1 as const,
      height: 400,
      events: [planning],
      ...props,
    });

    it("distinguishes multi-day events by their ending dates", () => {
      const view = render(
        TimeGrid,
        grid({
          onDragEvent: vi.fn(),
          events: [
            { ...planning, end: at(16, 10) },
            { ...planning, end: at(17, 10) },
          ],
        }),
      );
      fireEvent.click(menu(view));
      const choices = view.getAllByRole("button", { name: "Move or resize Planning" });
      expect(choices[0].textContent).toContain("2026-07-16");
      expect(choices[1].textContent).toContain("2026-07-17");
      fireEvent.click(choices[1]);
      expect(view.getByRole("dialog").textContent).toContain("2026-07-17");
    });

    it("announces repeated rejections and clears the message after an accepted edit", () => {
      const onDragEvent = vi.fn(() => false);
      const view = render(
        TimeGrid,
        grid({ onDragEvent, labels: { eventChangeRejected: "Change refused" } }),
      );
      fireEvent.click(trigger(view, "Planning"));
      const status = view.getByRole("status");
      expect(status.textContent).toBe("");
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
      expect(status.textContent).toBe("Change refused");
      const previous = status.firstChild;
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
      expect(status.textContent).toBe("Change refused");
      expect(status.firstChild).not.toBe(previous);
      onDragEvent.mockReturnValue(true);
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes earlier"));
      expect(status.textContent).toBe("");
    });

    it("follows a stable ID across full refreshes without confusing numeric and string IDs", () => {
      const onDragEvent = vi.fn();
      const original = { ...planning, id: 0 };
      const other = { ...planning, title: "Other", id: "0" };
      const props = {
        date,
        mode: "week" as const,
        events: [original, other],
        onDragEvent,
        getEventId: (event: CalendarEvent<{ id: string | number }>) => event.id,
      };
      const view = render(TimeGrid<{ id: string | number }>, props);
      fireEvent.click(trigger(view, "Planning"));
      const refreshed = { ...original, title: "Refreshed", start: at(15, 11), end: at(15, 12) };
      view.rerender({ ...props, events: [{ ...other }, refreshed] });
      expect(view.getByRole("dialog").textContent).toContain("Refreshed");
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
      expect(onDragEvent).toHaveBeenLastCalledWith(refreshed, at(15, 11, 15), at(15, 12, 15));
      view.rerender({ ...props, events: [{ ...refreshed }, { ...refreshed }] });
      expect(view.queryByRole("dialog")).toBeNull();
    });

    it("closes safely if the stable ID getter is removed", () => {
      const props = grid({ onDragEvent: vi.fn(), getEventId: () => "planning" });
      const view = render(TimeGrid, props);
      fireEvent.click(trigger(view, "Planning"));
      view.rerender({ ...props, getEventId: undefined });
      expect(view.queryByRole("dialog")).toBeNull();
      expect(view.container.contains(document.activeElement)).toBe(true);
    });

    it.each([undefined, null, true, { missing: true }])(
      "refuses an invalid event ID on opening: %j",
      (id) => {
        const onDragEvent = vi.fn();
        const view = render(TimeGrid, grid({ onDragEvent, getEventId: untypedEventId(id) }));
        fireEvent.click(trigger(view, "Planning"));
        expect(view.queryByRole("dialog")).toBeNull();
        expect(onDragEvent).not.toHaveBeenCalled();
        expect(view.container.contains(document.activeElement)).toBe(true);
      },
    );

    it("never edits a different event with the same missing ID", () => {
      const onDragEvent = vi.fn();
      const props = grid({ onDragEvent, getEventId: untypedEventId(undefined) });
      const view = render(TimeGrid, props);
      fireEvent.click(trigger(view, "Planning"));
      view.rerender({ ...props, events: [{ ...planning, title: "Different event" }] });
      const move = view.queryByRole("button", { name: "Move 15 minutes later" });
      if (move) fireEvent.click(move);
      expect(onDragEvent).not.toHaveBeenCalled();
      expect(view.queryByRole("dialog")).toBeNull();
      expect(view.container.contains(document.activeElement)).toBe(true);
    });

    it.each([{ allDay: true }, { display: "background" as const }])(
      "closes when a stable event becomes a non-editable time-grid item: %j",
      (change) => {
        const onDragEvent = vi.fn();
        const props = grid({ onDragEvent, getEventId: () => "planning" });
        const view = render(TimeGrid, props);
        fireEvent.click(trigger(view, "Planning"));
        view.rerender({ ...props, events: [{ ...planning, ...change }] });
        expect(view.queryByRole("dialog")).toBeNull();
        expect(onDragEvent).not.toHaveBeenCalled();
        expect(view.container.contains(document.activeElement)).toBe(true);
      },
    );

    it("commits a step through onDragEvent without pressing the event", () => {
      const onDragEvent = vi.fn();
      const onPressEvent = vi.fn();
      const onDragStart = vi.fn();
      const view = render(TimeGrid, grid({ onDragEvent, onPressEvent, onDragStart }));
      const button = trigger(view, "Planning");
      expect(button.getAttribute("aria-haspopup")).toBe("dialog");
      expect(menu(view).getAttribute("aria-expanded")).toBe("true");
      fireEvent.pointerDown(button, { pointerId: 1, button: 0 });
      fireEvent.click(button);
      const dialog = view.getByRole("dialog");
      expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
      expect(dialog.textContent).toContain("Planning, 09:00 to 10:00");
      expect(actionNames(dialog)).toEqual([
        "Move 15 minutes later",
        "Move 15 minutes earlier",
        "Extend by 15 minutes",
        "Shorten by 15 minutes",
        "Move to next week",
        "Move to previous week",
        "Close",
      ]);
      expect(document.activeElement).toBe(action(dialog, "Move 15 minutes later"));
      fireEvent.click(action(dialog, "Move 15 minutes later"));
      expect(onDragEvent).toHaveBeenCalledWith(planning, at(15, 9, 15), at(15, 10, 15));
      fireEvent.click(action(dialog, "Move to next week"));
      expect(onDragEvent).toHaveBeenLastCalledWith(planning, at(22, 9), at(22, 10));
      expect(onPressEvent).not.toHaveBeenCalled();
      expect(onDragStart).not.toHaveBeenCalled();
    });

    it("follows the consumer's replacement event and closes when it is removed", () => {
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, grid({ onDragEvent }));
      fireEvent.click(trigger(view, "Planning"));
      fireEvent.click(action(view.getByRole("dialog"), "Extend by 15 minutes"));
      const extended = { ...planning, end: at(15, 10, 15) };
      view.rerender(grid({ onDragEvent, events: [extended] }));
      const dialog = view.getByRole("dialog");
      expect(dialog.textContent).toContain("Planning, 09:00 to 10:15");
      fireEvent.click(action(dialog, "Extend by 15 minutes"));
      expect(onDragEvent).toHaveBeenLastCalledWith(extended, at(15, 9), at(15, 10, 30));
      view.rerender(grid({ onDragEvent, events: [] }));
      expect(view.queryByRole("dialog")).toBeNull();
      expect(document.body.contains(document.activeElement)).toBe(true);
    });

    it("closes when editing is turned off while open", () => {
      const view = render(TimeGrid, grid({ onDragEvent: vi.fn() }));
      fireEvent.click(trigger(view, "Planning"));
      view.rerender(grid({}));
      expect(view.queryByRole("dialog")).toBeNull();
      expect(view.queryByRole("button", { name: "Move or resize Planning" })).toBeNull();
      expect(document.activeElement).not.toBe(document.body);
      expect(view.container.contains(document.activeElement)).toBe(true);
    });

    it("follows the changed event instead of an existing event with matching times", () => {
      const existing = { ...planning, start: at(15, 9, 15), end: at(15, 10, 15) };
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, grid({ onDragEvent, events: [existing, planning] }));
      fireEvent.click(menu(view));
      fireEvent.click(view.getAllByRole("button", { name: "Move or resize Planning" })[0]);
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
      expect(onDragEvent.mock.calls[0][0]).toBe(planning);
      const moved = { ...planning, start: existing.start, end: existing.end };
      view.rerender(grid({ onDragEvent, events: [existing, moved] }));
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
      expect(onDragEvent.mock.calls[1][0]).toBe(moved);
    });

    it("closes instead of guessing between ambiguous replacement events", () => {
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, grid({ onDragEvent }));
      fireEvent.click(trigger(view, "Planning"));
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
      const moved = { ...planning, start: at(15, 9, 15), end: at(15, 10, 15) };
      view.rerender(grid({ onDragEvent, events: [moved, { ...moved }] }));
      expect(view.queryByRole("dialog")).toBeNull();
    });

    it("closes when a refresh replaces other events as well as the edited event", () => {
      const existing = { ...planning, start: at(15, 9, 15), end: at(15, 10, 15) };
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, grid({ onDragEvent, events: [existing, planning] }));
      fireEvent.click(menu(view));
      fireEvent.click(view.getAllByRole("button", { name: "Move or resize Planning" })[0]);
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
      view.rerender(grid({ onDragEvent, events: [{ ...existing }, { ...planning }] }));
      expect(view.queryByRole("dialog")).toBeNull();
    });

    it.each([
      ["morning", at(15, 7), at(15, 9)],
      ["overnight", at(15, 22), at(16, 10)],
    ] as const)(
      "keeps actions on the first visible part of a clipped %s event",
      (title, start, end) => {
        const event = { title, start, end };
        const view = render(
          TimeGrid,
          grid({ onDragEvent: vi.fn(), minHour: 8, maxHour: 18, events: [event] }),
        );
        const button = trigger(view, title);
        expect(view.getAllByRole("button", { name: `Move or resize ${title}` })).toHaveLength(1);
        fireEvent.click(button);
        expect(view.getByRole("dialog")).toBeTruthy();
      },
    );

    it("keeps a rejected change open and unchanged", () => {
      const onDragEvent = vi.fn(() => false);
      const view = render(TimeGrid, grid({ onDragEvent }));
      fireEvent.click(trigger(view, "Planning"));
      fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes earlier"));
      expect(onDragEvent).toHaveBeenCalledWith(planning, at(15, 8, 45), at(15, 9, 45));
      expect(view.getByRole("dialog").textContent).toContain("Planning, 09:00 to 10:00");
    });

    it("refuses moves onto another event when eventOverlap is false", () => {
      const standup = { title: "Standup", start: at(15, 10), end: at(15, 10, 30) };
      const onDragEvent = vi.fn();
      const view = render(
        TimeGrid,
        grid({ onDragEvent, eventOverlap: false, events: [planning, standup] }),
      );
      fireEvent.click(trigger(view, "Planning"));
      const dialog = view.getByRole("dialog");
      fireEvent.click(action(dialog, "Move 15 minutes later"));
      fireEvent.click(action(dialog, "Extend by 15 minutes"));
      expect(onDragEvent).not.toHaveBeenCalled();
      fireEvent.click(action(dialog, "Move 15 minutes earlier"));
      expect(onDragEvent).toHaveBeenCalledWith(planning, at(15, 8, 45), at(15, 9, 45));
    });

    it("keeps resizes at one step or longer", () => {
      const short = { title: "Short", start: at(15, 9), end: at(15, 9, 15) };
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, grid({ onDragEvent, events: [short] }));
      fireEvent.click(trigger(view, "Short"));
      const shorten = action(view.getByRole("dialog"), "Shorten by 15 minutes");
      expect(shorten.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(shorten);
      expect(onDragEvent).not.toHaveBeenCalled();
      expect(
        action(view.getByRole("dialog"), "Extend by 15 minutes").hasAttribute("aria-disabled"),
      ).toBe(false);
    });

    it("offers only what an event may change", () => {
      const view = render(
        TimeGrid,
        grid({
          onDragEvent: vi.fn(),
          eventDurationEditable: false,
          events: [
            { ...planning, title: "Moves" },
            {
              ...planning,
              title: "Resizes",
              start: at(16, 9),
              end: at(16, 10),
              startEditable: false,
              durationEditable: true,
            },
            { ...planning, title: "Locked", start: at(17, 9), end: at(17, 10), draggable: false },
          ],
        }),
      );
      expect(view.queryByRole("button", { name: "Move or resize Locked" })).toBeNull();
      fireEvent.click(trigger(view, "Moves"));
      expect(actionNames(view.getByRole("dialog"))).toEqual([
        "Move 15 minutes later",
        "Move 15 minutes earlier",
        "Move to next week",
        "Move to previous week",
        "Close",
      ]);
      fireEvent.click(action(view.getByRole("dialog"), "Close"));
      expect(view.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(menu(view));
      fireEvent.click(trigger(view, "Resizes"));
      expect(actionNames(view.getByRole("dialog"))).toEqual([
        "Extend by 15 minutes",
        "Shorten by 15 minutes",
        "Close",
      ]);
    });

    it("closes on Escape and returns focus to its button", () => {
      const view = render(TimeGrid, grid({ onDragEvent: vi.fn(), dragStepMinutes: 30 }));
      fireEvent.click(trigger(view, "Planning"));
      const dialog = view.getByRole("dialog");
      expect(action(dialog, "Move 30 minutes later")).toBeTruthy();
      fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
      expect(document.activeElement).toBe(action(dialog, "Move 30 minutes earlier"));
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(view.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(menu(view));
    });

    it.each(["remove", "disable"])(
      "restores focus when %s removes a focused event choice",
      (change) => {
        const onDragEvent = vi.fn();
        const view = render(TimeGrid, grid({ onDragEvent }));
        trigger(view, "Planning").focus();
        view.rerender(grid(change === "remove" ? { onDragEvent, events: [] } : {}));
        expect(document.activeElement).not.toBe(document.body);
        expect(view.container.contains(document.activeElement)).toBe(true);
      },
    );

    it("keeps the focused event when choices are reordered", () => {
      const first = { ...planning, title: "Alpha" };
      const second = { ...planning, title: "Beta" };
      const onDragEvent = vi.fn();
      const view = render(TimeGrid, grid({ onDragEvent, events: [first, second] }));
      trigger(view, "Alpha").focus();
      view.rerender(grid({ onDragEvent, events: [second, first] }));
      expect(document.activeElement).toBe(trigger(view, "Alpha"));
    });

    it("uses translated action labels", () => {
      const view = render(
        TimeGrid,
        grid({
          onDragEvent: vi.fn(),
          labels: { eventActions: (title) => `Editar ${title}`, close: "Fechar" },
        }),
      );
      fireEvent.click(menu(view));
      fireEvent.click(view.getByRole("button", { name: "Editar Planning" }));
      const dialog = view.getByRole("dialog");
      expect(dialog.textContent).toContain("Editar Planning");
      expect(action(dialog, "Fechar")).toBeTruthy();
    });
  });

  describe.each(["horizontal", "vertical"] as const)(
    "ResourceTimeline %s actions",
    (orientation) => {
      const resources = [
        { id: "a", title: "Room A" },
        { id: "b", title: "Room B" },
      ];
      type Booking = CalendarEvent<{ resourceId: string }>;
      const booking: Booking = { ...planning, resourceId: "a" };
      const board = (
        props: Partial<Parameters<typeof ResourceTimeline<{ resourceId: string }>>[0]>,
      ) => ({
        date,
        orientation,
        resources,
        events: [booking],
        ...props,
      });

      it("shows ending dates and rejection feedback for multi-day bookings", () => {
        const onDragEvent = vi.fn(() => false);
        const view = render(
          ResourceTimeline<{ resourceId: string }>,
          board({ onDragEvent, events: [{ ...booking, end: at(17, 10) }] }),
        );
        fireEvent.click(trigger(view, "Planning"));
        expect(view.getByRole("dialog").textContent).toContain("2026-07-17");
        fireEvent.click(action(view.getByRole("dialog"), "Move to Room B"));
        expect(view.getByRole("status").textContent).toBe("This change is not allowed.");
      });

      it("keeps a stable booking selected when every event is refreshed", () => {
        const onDragEvent = vi.fn();
        const original = { ...booking, id: "booking" };
        const props = {
          date,
          orientation,
          resources,
          events: [original],
          onDragEvent,
          getEventId: (event: CalendarEvent<{ resourceId: string; id: string }>) => event.id,
        };
        const view = render(ResourceTimeline<{ resourceId: string; id: string }>, props);
        fireEvent.click(trigger(view, "Planning"));
        const refreshed = { ...original, resourceId: "b" };
        view.rerender({ ...props, events: [refreshed] });
        expect(view.getByRole("dialog").textContent).toContain("Room B");
        fireEvent.click(action(view.getByRole("dialog"), "Move to Room A"));
        expect(onDragEvent).toHaveBeenCalledWith(
          refreshed,
          refreshed.start,
          refreshed.end,
          resources[0],
        );
        view.rerender({ ...props, events: [] });
        expect(view.queryByRole("dialog")).toBeNull();
      });

      it.each([undefined, null, true, { missing: true }])(
        "refuses an invalid booking ID on opening: %j",
        (id) => {
          const onDragEvent = vi.fn();
          const view = render(
            ResourceTimeline<{ resourceId: string }>,
            board({ onDragEvent, getEventId: untypedEventId(id) }),
          );
          fireEvent.click(trigger(view, "Planning"));
          expect(view.queryByRole("dialog")).toBeNull();
          expect(onDragEvent).not.toHaveBeenCalled();
          expect(view.container.contains(document.activeElement)).toBe(true);
        },
      );

      it("never edits a different booking with the same missing ID", () => {
        const onDragEvent = vi.fn();
        const props = board({ onDragEvent, getEventId: untypedEventId(undefined) });
        const view = render(ResourceTimeline<{ resourceId: string }>, props);
        fireEvent.click(trigger(view, "Planning"));
        view.rerender({ ...props, events: [{ ...booking, title: "Different booking" }] });
        const move = view.queryByRole("button", { name: "Move 15 minutes later" });
        if (move) fireEvent.click(move);
        expect(onDragEvent).not.toHaveBeenCalled();
        expect(view.queryByRole("dialog")).toBeNull();
        expect(view.container.contains(document.activeElement)).toBe(true);
      });

      it.each([{ allDay: true }, { display: "background" as const }])(
        "closes when a stable booking becomes a non-editable board item: %j",
        (change) => {
          const onDragEvent = vi.fn();
          const props = board({ onDragEvent, getEventId: () => "booking" });
          const view = render(ResourceTimeline<{ resourceId: string }>, props);
          fireEvent.click(trigger(view, "Planning"));
          view.rerender({ ...props, events: [{ ...booking, ...change }] });
          expect(view.queryByRole("dialog")).toBeNull();
          expect(onDragEvent).not.toHaveBeenCalled();
          expect(view.container.contains(document.activeElement)).toBe(true);
        },
      );

      it("moves an event across lanes and in time", () => {
        const onDragEvent = vi.fn();
        const onPressEvent = vi.fn();
        const view = render(
          ResourceTimeline<{ resourceId: string }>,
          board({ onDragEvent, onPressEvent }),
        );
        fireEvent.click(trigger(view, "Planning"));
        const dialog = view.getByRole("dialog");
        expect(actionNames(dialog)).toEqual([
          "Move 15 minutes later",
          "Move 15 minutes earlier",
          "Extend by 15 minutes",
          "Shorten by 15 minutes",
          "Move to Room B",
          "Close",
        ]);
        fireEvent.click(action(dialog, "Move to Room B"));
        expect(onDragEvent).toHaveBeenCalledWith(booking, booking.start, booking.end, resources[1]);
        const moved = { ...booking, resourceId: "b" };
        view.rerender(board({ onDragEvent, onPressEvent, events: [moved] }));
        expect(actionNames(view.getByRole("dialog"))).toContain("Move to Room A");
        expect(view.getByRole("dialog").textContent).toContain("Room B, 2026-07-15");
        fireEvent.click(action(view.getByRole("dialog"), "Shorten by 15 minutes"));
        expect(onDragEvent).toHaveBeenLastCalledWith(moved, at(15, 9), at(15, 9, 45), resources[1]);
        expect(onPressEvent).not.toHaveBeenCalled();
      });

      it("closes when the event's lane goes away and hides locked bars", () => {
        const view = render(
          ResourceTimeline<{ resourceId: string }>,
          board({
            onDragEvent: vi.fn(),
            events: [booking, { ...booking, title: "Locked", resourceId: "b", draggable: false }],
          }),
        );
        expect(view.queryByRole("button", { name: "Move or resize Locked" })).toBeNull();
        fireEvent.click(trigger(view, "Planning"));
        view.rerender(board({ onDragEvent: vi.fn(), resources: [resources[1]] }));
        expect(view.queryByRole("dialog")).toBeNull();
      });

      it("keeps a rejected move open", () => {
        const onDragEvent = vi.fn(() => false);
        const view = render(ResourceTimeline<{ resourceId: string }>, board({ onDragEvent }));
        fireEvent.click(trigger(view, "Planning"));
        fireEvent.click(action(view.getByRole("dialog"), "Move 15 minutes later"));
        expect(onDragEvent).toHaveBeenCalledWith(
          booking,
          at(15, 9, 15),
          at(15, 10, 15),
          resources[0],
        );
        expect(view.getByRole("dialog").textContent).toContain("Planning, 09:00 to 10:00");
      });

      it("follows a moved booking instead of an existing matching booking in its new lane", () => {
        const existing = { ...booking, resourceId: "b" };
        const onDragEvent = vi.fn();
        const view = render(
          ResourceTimeline<{ resourceId: string }>,
          board({ onDragEvent, events: [existing, booking] }),
        );
        fireEvent.click(menu(view));
        fireEvent.click(view.getAllByRole("button", { name: "Move or resize Planning" })[0]);
        fireEvent.click(action(view.getByRole("dialog"), "Move to Room B"));
        expect(onDragEvent.mock.calls[0][0]).toBe(booking);
        const moved = { ...booking, resourceId: "b" };
        view.rerender(board({ onDragEvent, events: [existing, moved] }));
        fireEvent.click(action(view.getByRole("dialog"), "Extend by 15 minutes"));
        expect(onDragEvent.mock.calls[1][0]).toBe(moved);
      });

      it("returns focus to the calendar when its last event disappears", () => {
        const onDragEvent = vi.fn();
        const view = render(ResourceTimeline<{ resourceId: string }>, board({ onDragEvent }));
        fireEvent.click(trigger(view, "Planning"));
        expect(view.getByRole("dialog").contains(document.activeElement)).toBe(true);
        view.rerender(board({ onDragEvent, events: [] }));
        expect(view.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).not.toBe(document.body);
        expect(view.container.contains(document.activeElement)).toBe(true);
      });
    },
  );
});
