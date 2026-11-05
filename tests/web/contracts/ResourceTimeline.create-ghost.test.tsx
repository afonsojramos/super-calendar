import { vi } from "vitest";
import type { CreateGhostArgs } from "@super-calendar/core/vanilla";
import {
  rendererName,
  fireEvent,
  render,
  ResourceTimeline,
  type ResourceTimelineProps,
} from "@calendar-test/renderer";

// Live content inside the resource timeline's drag-to-create preview, along
// either axis. The range shown while the pointer is held must be the range
// `onCreateEvent` receives on release there.
describe(rendererName, () => {
  const date = new Date(2026, 6, 15);
  const clock = (value: Date) =>
    `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  type Args = CreateGhostArgs & { resource: { id: string; title?: string } };
  const Draft = (props: Args) => (
    <span>{`${props.resource.title} ${clock(props.start)}-${clock(props.end)}`}</span>
  );

  describe.each(["horizontal", "vertical"] as const)("%s renderCreateGhost", (orientation) => {
    const resources = [
      { id: "a", title: "Studio" },
      { id: "b", title: "Booth" },
    ];
    const at = (offset: number, pointerId = 1) =>
      orientation === "vertical"
        ? { clientY: offset, pointerId, button: 0 }
        : { clientX: offset, pointerId, button: 0 };

    function setup(extra: Partial<ResourceTimelineProps> = {}) {
      const onCreateEvent = vi.fn();
      let props: ResourceTimelineProps = {
        date,
        now: date,
        events: [],
        resources,
        orientation,
        hourWidth: 80,
        hourHeight: 80,
        onCreateEvent,
        renderCreateGhost: Draft,
        ...extra,
      };
      const view = render(ResourceTimeline, props);
      const lanes = view.container.querySelectorAll<HTMLElement>('[data-slot="track"]');
      const ghost = () => view.container.querySelector<HTMLElement>('[data-slot="createGhost"]');
      return {
        ...view,
        lanes,
        ghost,
        onCreateEvent,
        content: () => ghost()?.textContent ?? null,
        update(next: Partial<ResourceTimelineProps>) {
          props = { ...props, ...next };
          view.rerender(props);
        },
      };
    }

    it("shows the lane's resource and live range, then commits the shown range", () => {
      const view = setup();
      const lane = view.lanes[1];
      // 80px per hour: 100px is 01:15.
      fireEvent.pointerDown(lane, at(100));
      expect(view.content()).toBe("Booth 01:15-01:30");
      fireEvent.pointerMove(lane, at(250));
      expect(view.content()).toBe("Booth 01:15-03:15");
      fireEvent.pointerMove(lane, at(20));
      expect(view.content()).toBe("Booth 00:15-01:15");
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      fireEvent.pointerUp(lane, at(20));
      expect(view.onCreateEvent).toHaveBeenCalledWith(
        new Date(2026, 6, 15, 0, 15),
        new Date(2026, 6, 15, 1, 15),
        resources[1],
      );
      expect(view.ghost()).toBeNull();
    });

    it("clips the content and keeps it out of focus and assistive tech", () => {
      const view = setup();
      fireEvent.pointerDown(view.lanes[0], at(100));
      fireEvent.pointerMove(view.lanes[0], at(250));
      const ghost = view.ghost()!;
      expect(ghost.getAttribute("aria-hidden")).toBe("true");
      expect(ghost.hasAttribute("inert")).toBe(true);
      expect(ghost.style.overflow).toBe("hidden");
    });

    it("keeps the default preview empty without a renderer", () => {
      const view = setup({ renderCreateGhost: undefined });
      fireEvent.pointerDown(view.lanes[0], at(100));
      fireEvent.pointerMove(view.lanes[0], at(250));
      expect(view.ghost()!.childElementCount).toBe(0);
      expect(view.ghost()!.hasAttribute("inert")).toBe(false);
    });

    it("does not render or create without onCreateEvent", () => {
      const renderCreateGhost = vi.fn(Draft);
      const onPressCell = vi.fn();
      const view = setup({ onCreateEvent: undefined, onPressCell, renderCreateGhost });
      fireEvent.pointerDown(view.lanes[0], at(100));
      fireEvent.pointerMove(view.lanes[0], at(250));
      expect(view.ghost()).toBeNull();
      fireEvent.pointerUp(view.lanes[0], at(100));
      expect(onPressCell).toHaveBeenCalledTimes(1);
      expect(renderCreateGhost).not.toHaveBeenCalled();
    });

    it.each(["pointerCancel", "lostPointerCapture"] as const)(
      "clears the content on %s and starts fresh",
      (kind) => {
        const view = setup();
        const lane = view.lanes[0];
        fireEvent.pointerDown(lane, at(100));
        fireEvent.pointerMove(lane, at(250));
        fireEvent[kind](lane, { pointerId: 1 });
        expect(view.ghost()).toBeNull();
        fireEvent.pointerUp(lane, at(250));
        expect(view.onCreateEvent).not.toHaveBeenCalled();
        fireEvent.pointerDown(view.lanes[1], at(400));
        expect(view.content()).toBe("Booth 05:00-05:15");
      },
    );

    it.each([true, false])("Escape cancels a sweep with custom content: %s", (custom) => {
      const onPressCell = vi.fn();
      const view = setup({ renderCreateGhost: custom ? Draft : undefined, onPressCell });
      expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(true);
      const lane = view.lanes[0];
      fireEvent.pointerDown(lane, at(100));
      fireEvent.pointerMove(lane, at(250));
      fireEvent.keyDown(document, { key: "Enter" });
      expect(view.ghost()).not.toBeNull();
      expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(false);
      expect(view.ghost()).toBeNull();
      fireEvent.pointerMove(lane, at(300));
      fireEvent.pointerUp(lane, at(300));
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      expect(onPressCell).not.toHaveBeenCalled();
      fireEvent.pointerDown(view.lanes[1], at(400));
      fireEvent.pointerMove(view.lanes[1], at(480));
      fireEvent.pointerUp(view.lanes[1], at(480));
      expect(view.onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 6, 15, 5),
        new Date(2026, 6, 15, 6),
        resources[1],
      );
    });

    it.each([true, false])(
      "does not revive a disabled sweep, released while disabled: %s",
      (released) => {
        const view = setup();
        fireEvent.pointerDown(view.lanes[0], at(100));
        fireEvent.pointerMove(view.lanes[0], at(250));
        view.update({ onCreateEvent: undefined });
        if (released) fireEvent.pointerUp(view.lanes[0], at(250));
        view.update({ onCreateEvent: view.onCreateEvent });
        expect(view.ghost()).toBeNull();
        fireEvent.pointerUp(view.lanes[0], at(250));
        expect(view.onCreateEvent).not.toHaveBeenCalled();
        fireEvent.pointerDown(view.lanes[1], at(400));
        expect(view.content()).toBe("Booth 05:00-05:15");
      },
    );

    it("cancels a held draft when the date changes", () => {
      const view = setup();
      fireEvent.pointerDown(view.lanes[0], at(100));
      fireEvent.pointerMove(view.lanes[0], at(250));
      view.update({ date: new Date(2026, 6, 16) });
      expect(view.ghost()).toBeNull();
      fireEvent.pointerUp(view.lanes[0], at(250));
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      fireEvent.pointerDown(view.lanes[1], at(400));
      fireEvent.pointerMove(view.lanes[1], at(480));
      fireEvent.pointerUp(view.lanes[1], at(480));
      expect(view.onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 6, 16, 5),
        new Date(2026, 6, 16, 6),
        resources[1],
      );
    });
  });
});
