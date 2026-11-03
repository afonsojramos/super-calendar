import { vi } from "vitest";
import {
  rendererName,
  fireEvent,
  render,
  ResourceTimeline,
  type ResourceTimelineProps,
} from "@calendar-test/renderer";

describe(rendererName, () => {
  const date = new Date(2026, 6, 15);
  const event = {
    title: "Planning",
    start: new Date(2026, 6, 15, 9),
    end: new Date(2026, 6, 15, 10),
  };
  const click = fireEvent.click;
  function pointer(
    target: Element,
    kind: "down" | "move" | "up" | "cancel",
    options: PointerEventInit = {},
  ) {
    fireEvent(
      target,
      new PointerEvent(`pointer${kind}`, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        ...options,
      }),
    );
  }
  describe.each(["horizontal", "vertical"] as const)(
    "%s resource event lifecycle",
    (orientation) => {
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
        let props: ResourceTimelineProps = {
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
        };
        const { rerender, ...view } = render(ResourceTimeline, { ...props });
        return {
          ...view,
          onDragEvent,
          onPressEvent,
          update(next: Partial<ResourceTimelineProps>) {
            props = { ...props, ...next };
            rerender({ ...props });
          },
        };
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

      it.each(["move", "resize", "create"])(
        "uses current resource details when committing %s",
        (kind) => {
          const view = setup();
          const onCreateEvent = vi.fn();
          view.update({ onCreateEvent });
          const box = view.getByRole("button", { name: "Planning" });
          const target =
            kind === "create"
              ? view.container.querySelector<HTMLElement>('[data-slot="track"]')!
              : kind === "resize"
                ? box.querySelector<HTMLElement>('[aria-hidden="true"]')!
                : box;
          pointer(target, "down", position(100));
          const updated = { ...resource, title: "Updated studio" };
          view.update({ resources: [updated] });
          pointer(target, "move", position(180));
          pointer(target, "up", position(180));
          const callback = kind === "create" ? onCreateEvent : view.onDragEvent;
          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback.mock.calls[0].at(-1)).toBe(updated);
        },
      );

      it("keeps event dragging owned by the pointer that started it", () => {
        const view = setup();
        const box = view.getByRole("button", { name: "Planning" });
        pointer(box, "down", { ...position(100), pointerId: 1 });
        pointer(box, "down", { ...position(500), pointerId: 2 });
        pointer(box, "move", { ...position(580), pointerId: 2 });
        pointer(box, "up", { ...position(580), pointerId: 2 });
        pointer(box, "cancel", { pointerId: 2 });
        expect(view.onDragEvent).not.toHaveBeenCalled();
        expect(view.onPressEvent).not.toHaveBeenCalled();
        pointer(box, "move", { ...position(180), pointerId: 1 });
        pointer(box, "up", { ...position(180), pointerId: 1 });
        expect(view.onDragEvent).toHaveBeenCalledTimes(1);
        expect(view.onDragEvent).toHaveBeenCalledWith(
          event,
          new Date(2026, 6, 15, 10),
          new Date(2026, 6, 15, 11),
          resource,
        );
      });

      it.each(["press", "move"])(
        "does not repeat a %s when its callback disables editing",
        (kind) => {
          const view = setup();
          const onPressEvent = vi.fn(() => view.update({ onDragEvent: undefined }));
          const onDragEvent = vi.fn(() => view.update({ onDragEvent: undefined }));
          view.update({ onPressEvent, onDragEvent });
          const box = view.getByRole("button", { name: "Planning" });
          pointer(box, "down", position(100));
          if (kind === "move") pointer(box, "move", position(180));
          pointer(box, "up", position(kind === "move" ? 180 : 100));
          click(box, { detail: 1 });
          expect(onPressEvent).toHaveBeenCalledTimes(kind === "press" ? 1 : 0);
          expect(onDragEvent).toHaveBeenCalledTimes(kind === "move" ? 1 : 0);
          pointer(box, "down", position(100));
          pointer(box, "up", position(100));
          click(box, { detail: 1 });
          expect(onPressEvent).toHaveBeenCalledTimes(kind === "press" ? 2 : 1);
        },
      );

      it("keeps creation owned by the pointer that started it", () => {
        const view = setup();
        const onCreateEvent = vi.fn();
        view.update({ onCreateEvent });
        const lane = view.container.querySelector<HTMLElement>('[data-slot="track"]')!;
        pointer(lane, "down", { ...position(80), pointerId: 1 });
        pointer(lane, "down", { ...position(400), pointerId: 2 });
        pointer(lane, "move", { ...position(480), pointerId: 2 });
        pointer(lane, "up", { ...position(480), pointerId: 2 });
        pointer(lane, "cancel", { pointerId: 2 });
        expect(onCreateEvent).not.toHaveBeenCalled();
        pointer(lane, "move", { ...position(160), pointerId: 1 });
        pointer(lane, "up", { ...position(160), pointerId: 1 });
        expect(onCreateEvent).toHaveBeenCalledTimes(1);
        expect(onCreateEvent).toHaveBeenCalledWith(
          new Date(2026, 6, 15, 1),
          new Date(2026, 6, 15, 2),
          resource,
        );
      });

      it.each([{ button: 2 }, { isPrimary: false }])("ignores non-primary starts %j", (options) => {
        const view = setup();
        const onCreateEvent = vi.fn();
        view.update({ onCreateEvent });
        const box = view.getByRole("button", { name: "Planning" });
        const lane = view.container.querySelector<HTMLElement>('[data-slot="track"]')!;
        for (const target of [box, lane]) {
          pointer(target, "down", { ...position(100), ...options });
          pointer(target, "move", position(180));
          pointer(target, "up", position(180));
        }
        expect(view.onDragEvent).not.toHaveBeenCalled();
        expect(view.onPressEvent).not.toHaveBeenCalled();
        expect(onCreateEvent).not.toHaveBeenCalled();
      });

      it.each(["event", "create"])("releases %s capture on unmount", (kind) => {
        const view = setup();
        const onCreateEvent = vi.fn();
        view.update({ onCreateEvent });
        const target =
          kind === "event"
            ? view.getByRole("button", { name: "Planning" })
            : view.container.querySelector<HTMLElement>('[data-slot="track"]')!;
        const release = vi.spyOn(target, "releasePointerCapture");
        pointer(target, "down", position(100));
        pointer(target, "move", position(180));
        view.unmount();
        expect(release).toHaveBeenCalledWith(1);
        expect(view.onDragEvent).not.toHaveBeenCalled();
        expect(onCreateEvent).not.toHaveBeenCalled();
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
        fireEvent(box, new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }));
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
        fireEvent(lane, new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }));
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
        fireEvent.click(box, { detail: 1 });
        expect(view.onPressEvent).toHaveBeenCalledTimes(2);
        pointer(box, "down", position(100));
        pointer(box, "move", position(180));
        pointer(box, "up", position(180));
        fireEvent.click(box, { detail: 1 });
        expect(view.onPressEvent).toHaveBeenCalledTimes(2);
        expect(view.onDragEvent).toHaveBeenCalledTimes(1);
      });
    },
  );
});
