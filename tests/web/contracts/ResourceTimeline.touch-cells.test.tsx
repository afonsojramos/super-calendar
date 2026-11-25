import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { rendererName, fireEvent, render, ResourceTimeline } from "@calendar-test/renderer";

describe(rendererName, () => {
  const day = new Date(2026, 5, 26);
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
  ];

  describe.each(["horizontal", "vertical"] as const)(
    "resource timeline %s touch cell taps",
    (orientation) => {
      const point =
        orientation === "vertical"
          ? { clientX: 40, clientY: 96, pointerId: 1, pointerType: "touch" }
          : { clientX: 160, clientY: 20, pointerId: 1, pointerType: "touch" };
      const movedPoint =
        orientation === "vertical"
          ? { ...point, clientY: point.clientY + 40 }
          : { ...point, clientX: point.clientX + 40 };

      function setup(options: { withPress?: boolean; withCreate?: boolean } = {}) {
        const onPressCell = options.withPress === false ? undefined : vi.fn();
        const onCreateEvent = options.withCreate === false ? undefined : vi.fn();
        const onPressEvent = vi.fn();
        const baseProps = {
          date: day,
          orientation,
          resources,
          events,
          startHour: 8,
          hourWidth: 80,
          hourHeight: 48,
          onPressCell,
          onCreateEvent,
          onPressEvent,
        };
        const view = render(ResourceTimeline, baseProps);
        const tracks = view.container.querySelectorAll('[data-slot="track"]');
        const track = tracks[1];
        if (!(track instanceof HTMLElement)) {
          throw new Error("Missing resource track");
        }
        return {
          track,
          tracks,
          baseProps,
          rerender: view.rerender,
          getByRole: view.getByRole,
          onPressCell,
          onCreateEvent,
          onPressEvent,
        };
      }

      it("presses a touch slot on click, after pointer-up and implicit capture release", () => {
        const { track, onPressCell, onCreateEvent } = setup();
        fireEvent.pointerDown(track, point);
        fireEvent.pointerUp(track, point);
        // Real browsers release touch's implicit pointer capture before firing click.
        fireEvent.lostPointerCapture(track, point);
        expect(onPressCell).not.toHaveBeenCalled();
        fireEvent.click(track, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
        // Horizontal: 160px / 80px = +2h from startHour 8 -> 10:00.
        // Vertical: 96px / 48px = +2h from startHour 8 -> 10:00.
        expect(onPressCell).toHaveBeenCalledExactlyOnceWith(
          new Date(2026, 5, 26, 10),
          resources[1],
        );
        expect(onCreateEvent).not.toHaveBeenCalled();
      });

      it("works in press-only mode (onPressCell without onCreateEvent)", () => {
        const { track, onPressCell } = setup({ withCreate: false });
        fireEvent.pointerDown(track, point);
        fireEvent.pointerUp(track, point);
        fireEvent.click(track, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
        expect(onPressCell).toHaveBeenCalledExactlyOnceWith(
          new Date(2026, 5, 26, 10),
          resources[1],
        );
      });

      it.each(["swipe", "pointer cancellation"])("rejects a %s", (action) => {
        const { track, onPressCell, onCreateEvent } = setup({ withCreate: false });
        fireEvent.pointerDown(track, point);
        if (action === "swipe") {
          fireEvent.pointerMove(track, movedPoint);
          fireEvent.pointerUp(track, movedPoint);
        } else {
          fireEvent.pointerCancel(track, point);
        }
        fireEvent.click(track, {
          clientX: movedPoint.clientX,
          clientY: movedPoint.clientY,
          detail: 1,
        });
        expect(onPressCell).not.toHaveBeenCalled();
        expect(onCreateEvent).toBeUndefined();
      });

      it.each(["track", "event bar"])(
        "cancels an armed touch tap when a secondary pointer touches the %s",
        (secondTarget) => {
          const { track, getByRole, onPressCell } = setup();
          fireEvent.pointerDown(track, point);
          const second =
            secondTarget === "track" ? track : getByRole("button", { name: "Standup" });
          fireEvent.pointerDown(second, { ...point, pointerId: 2, isPrimary: false });
          fireEvent.pointerUp(track, point);
          fireEvent.click(track, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
          expect(onPressCell).not.toHaveBeenCalled();
        },
      );

      it.each(["read-only", "create-only"] as const)(
        "does not arm a touch tap in %s mode even if onPressCell is added before click",
        (mode) => {
          const { track, baseProps, rerender } = setup({
            withPress: false,
            withCreate: mode === "create-only",
          });
          fireEvent.pointerDown(track, point);
          const latePress = vi.fn();
          rerender({ ...baseProps, onPressCell: latePress });
          fireEvent.pointerUp(track, point);
          fireEvent.click(track, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
          expect(latePress).not.toHaveBeenCalled();

          // A fresh touch tap after enabling onPressCell commits normally.
          fireEvent.pointerDown(track, point);
          fireEvent.pointerUp(track, point);
          fireEvent.click(track, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
          expect(latePress).toHaveBeenCalledExactlyOnceWith(
            new Date(2026, 5, 26, 10),
            resources[1],
          );
        },
      );

      it("clears an armed touch tap when onPressCell is removed before click", () => {
        const { track, baseProps, rerender, onPressCell } = setup();
        fireEvent.pointerDown(track, point);
        rerender({ ...baseProps, onPressCell: undefined });
        rerender({ ...baseProps, onPressCell });
        fireEvent.pointerUp(track, point);
        fireEvent.click(track, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
        expect(onPressCell).not.toHaveBeenCalled();
      });

      it("does not fire onPressCell when tapping an event bar", () => {
        const { getByRole, onPressCell, onPressEvent } = setup();
        const bar = getByRole("button", { name: "Standup" });
        fireEvent.pointerDown(bar, point);
        fireEvent.pointerUp(bar, point);
        fireEvent.click(bar, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
        expect(onPressEvent).toHaveBeenCalledTimes(1);
        expect(onPressCell).not.toHaveBeenCalled();
      });

      it("does not double-fire on a mouse click after a touch tap", () => {
        const { track, onPressCell } = setup();
        fireEvent.pointerDown(track, point);
        fireEvent.pointerUp(track, point);
        fireEvent.click(track, { clientX: point.clientX, clientY: point.clientY, detail: 1 });
        expect(onPressCell).toHaveBeenCalledTimes(1);

        const mouse = { ...point, pointerId: 2, pointerType: "mouse", button: 0 };
        fireEvent.pointerDown(track, mouse);
        fireEvent.pointerUp(track, mouse);
        fireEvent.click(track, { clientX: mouse.clientX, clientY: mouse.clientY, detail: 1 });
        expect(onPressCell).toHaveBeenCalledTimes(2);
      });
    },
  );
});
