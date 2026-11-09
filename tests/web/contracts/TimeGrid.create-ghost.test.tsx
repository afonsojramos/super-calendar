import { vi } from "vitest";
import type { CreateGhostArgs } from "@super-calendar/core/vanilla";
import {
  rendererName,
  Calendar,
  act,
  fireEvent,
  render,
  TimeGrid,
  type TimeGridProps,
} from "@calendar-test/renderer";

// Live content inside the drag-to-create preview. The range shown while the
// pointer is held must be the range `onCreateEvent` receives on release there.
describe(rendererName, () => {
  const day = new Date(2026, 5, 26);
  const clock = (date: Date) =>
    `${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
  const label = (start: Date, end: Date) => `${clock(start)}-${clock(end)}`;
  const Draft = (props: CreateGhostArgs) => (
    <span>{`New event ${label(props.start, props.end)}`}</span>
  );
  const Other = (props: CreateGhostArgs) => <b>{`Other ${label(props.start, props.end)}`}</b>;

  function setup(extra: Partial<TimeGridProps> = {}) {
    const onCreateEvent = vi.fn();
    let props: TimeGridProps = {
      date: day,
      mode: "day",
      hourHeight: 48,
      onCreateEvent,
      renderCreateGhost: Draft,
      ...extra,
    };
    const { rerender, ...view } = render(TimeGrid, { ...props });
    const column = view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
    const ghost = () => view.container.querySelector<HTMLElement>('[data-slot="createGhost"]');
    return {
      ...view,
      column,
      ghost,
      onCreateEvent,
      // The preview's text, or null when no preview is shown.
      content: () => ghost()?.textContent ?? null,
      // The range `onCreateEvent` received, formatted like the preview.
      committed: () => {
        const [start, end] = onCreateEvent.mock.calls.at(-1) as [Date, Date];
        return `New event ${label(start, end)}`;
      },
      down: (clientY: number, pointerId = 1) =>
        fireEvent.pointerDown(column, { clientY, pointerId, button: 0 }),
      move: (clientY: number, pointerId = 1) =>
        fireEvent.pointerMove(column, { clientY, pointerId }),
      up: (clientY: number, pointerId = 1) => fireEvent.pointerUp(column, { clientY, pointerId }),
      update(next: Partial<TimeGridProps>) {
        props = { ...props, ...next };
        rerender({ ...props });
      },
    };
  }

  describe("TimeGrid renderCreateGhost", () => {
    it("shows the pressed slot as soon as the sweep begins", () => {
      const view = setup();
      // 100px at 48px/h is 02:05, which rounds to 02:00; a press spans one step.
      view.down(100);
      expect(view.content()).toBe("New event 26 02:00-26 02:15");
      expect(view.onCreateEvent).not.toHaveBeenCalled();
    });

    it("follows the sweep down and back up, ordered, and commits the shown range", () => {
      const view = setup();
      view.down(96);
      view.move(150);
      expect(view.content()).toBe("New event 26 02:00-26 03:15");
      view.move(40);
      expect(view.content()).toBe("New event 26 00:45-26 02:00");
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      const shown = view.content();
      view.up(40);
      expect(view.onCreateEvent).toHaveBeenCalledTimes(1);
      expect(view.committed()).toBe(shown);
      expect(view.ghost()).toBeNull();
    });

    it("rounds to the nearest step and keeps at least one step", () => {
      const view = setup();
      view.down(96);
      view.move(101);
      expect(view.content()).toBe("New event 26 02:00-26 02:15");
      view.up(101);
      expect(view.committed()).toBe("New event 26 02:00-26 02:15");
    });

    it.each([
      ["past the top", 96, -200, "New event 26 00:00-26 02:00"],
      ["past the bottom", 1104, 1300, "New event 26 23:00-27 00:00"],
      // The origin rounds to midnight and is held one step before it, so an
      // upward sweep from there ends at 23:45, not at midnight.
      ["up from midnight", 1150, 1104, "New event 26 23:00-26 23:45"],
    ])("clamps a sweep %s to the pressed day like the commit", (_, from, to, expected) => {
      const view = setup();
      view.down(from);
      view.move(to);
      expect(view.content()).toBe(expected);
      view.up(to);
      expect(view.committed()).toBe(expected);
    });

    it("reports the committed range past a narrowed hour window while the box stays inside", () => {
      const view = setup({ minHour: 8, maxHour: 18 });
      // 96px is 10:00; -100px is above the 08:00 edge, at 05:55, which rounds to 06:00.
      view.down(96);
      view.move(-100);
      expect(view.content()).toBe("New event 26 06:00-26 10:00");
      expect(view.ghost()!.style.top).toBe("0px");
      expect(view.ghost()!.style.height).toBe("96px");
      view.up(-100);
      expect(view.committed()).toBe("New event 26 06:00-26 10:00");
    });

    it("snaps to a custom dragStepMinutes", () => {
      const view = setup({ dragStepMinutes: 30 });
      view.down(100);
      view.move(130);
      expect(view.content()).toBe("New event 26 02:00-26 02:30");
      view.move(170);
      expect(view.content()).toBe("New event 26 02:00-26 03:30");
      view.up(170);
      expect(view.committed()).toBe("New event 26 02:00-26 03:30");
    });

    it("keeps the default preview empty without a renderer", () => {
      const view = setup({ renderCreateGhost: undefined });
      view.down(96);
      view.move(150);
      const ghost = view.ghost()!;
      expect(ghost.childElementCount).toBe(0);
      expect(ghost.hasAttribute("inert")).toBe(false);
      expect(ghost.style.overflow).toBe("");
      view.up(150);
      expect(view.onCreateEvent).toHaveBeenCalledTimes(1);
    });

    it("clips the content and keeps it out of focus and assistive tech", () => {
      const view = setup();
      view.down(96);
      view.move(150);
      const ghost = view.ghost()!;
      expect(ghost.getAttribute("aria-hidden")).toBe("true");
      expect(ghost.hasAttribute("inert")).toBe(true);
      expect(ghost.style.overflow).toBe("hidden");
      expect(ghost.style.pointerEvents).toBe("none");
    });

    it("does not render content or enable creation without onCreateEvent", () => {
      const renderCreateGhost = vi.fn(Draft);
      const onPressCell = vi.fn();
      const pressOnly = setup({ onCreateEvent: undefined, onPressCell, renderCreateGhost });
      pressOnly.down(96);
      pressOnly.move(150);
      expect(pressOnly.content()).toBe("");
      pressOnly.up(96);
      expect(onPressCell).toHaveBeenCalledTimes(1);
      pressOnly.unmount();

      const inert = setup({ onCreateEvent: undefined, renderCreateGhost });
      inert.down(96);
      inert.move(150);
      inert.up(150);
      expect(inert.ghost()).toBeNull();
      expect(renderCreateGhost).not.toHaveBeenCalled();
    });

    it("keeps a stationary press a cell press", () => {
      const onPressCell = vi.fn();
      const view = setup({ onPressCell });
      view.down(96);
      expect(view.content()).toBe("New event 26 02:00-26 02:15");
      view.up(98);
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      expect(onPressCell).toHaveBeenCalledWith(new Date(2026, 5, 26, 2));
      expect(view.ghost()).toBeNull();
    });

    it("clears the content on pointer cancellation, then starts fresh", () => {
      const view = setup();
      view.down(96);
      view.move(300);
      fireEvent.pointerCancel(view.column, { pointerId: 1 });
      expect(view.ghost()).toBeNull();
      view.up(300);
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      view.down(480);
      expect(view.content()).toBe("New event 26 10:00-26 10:15");
    });

    it.each([true, false])("Escape cancels a sweep with custom content: %s", (custom) => {
      const onPressCell = vi.fn();
      const view = setup({ renderCreateGhost: custom ? Draft : undefined, onPressCell });
      expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(true);
      view.down(96);
      view.move(300);
      fireEvent.keyDown(document, { key: "Enter" });
      expect(view.ghost()).not.toBeNull();
      expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(false);
      expect(view.ghost()).toBeNull();
      view.move(400);
      view.up(400);
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      expect(onPressCell).not.toHaveBeenCalled();
      view.down(480);
      view.move(528);
      view.up(528);
      expect(view.onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 5, 26, 10),
        new Date(2026, 5, 26, 11),
      );
    });

    it("clears the content when the sweep loses pointer capture while still pressed", () => {
      const view = setup();
      view.down(96);
      view.move(300);
      fireEvent.lostPointerCapture(view.column, { pointerId: 2, buttons: 1 });
      expect(view.content()).toBe("New event 26 02:00-26 06:15");
      fireEvent.lostPointerCapture(view.column, { pointerId: 1, buttons: 1 });
      expect(view.ghost()).toBeNull();
      view.move(400);
      view.up(400);
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      expect(view.ghost()).toBeNull();
    });

    it.each(["column", "document"])(
      "commits once when release-time capture loss precedes pointerup on the %s",
      (target) => {
        const view = setup();
        view.down(96);
        view.move(150);
        fireEvent.lostPointerCapture(view.column, { pointerId: 1, buttons: 0 });
        expect(view.onCreateEvent).not.toHaveBeenCalled();
        fireEvent.pointerUp(target === "column" ? view.column : document, {
          pointerId: 1,
          clientY: 150,
          buttons: 0,
        });
        expect(view.onCreateEvent).toHaveBeenCalledExactlyOnceWith(
          new Date(2026, 5, 26, 2),
          new Date(2026, 5, 26, 3, 15),
        );
        view.up(200);
        expect(view.onCreateEvent).toHaveBeenCalledTimes(1);
        expect(view.ghost()).toBeNull();
      },
    );

    it("ignores unrelated pointer releases and cancellations", () => {
      const view = setup();
      view.down(96);
      view.move(150);
      fireEvent.pointerUp(document, { pointerId: 2, clientY: 300 });
      fireEvent.pointerCancel(document, { pointerId: 2 });
      expect(view.content()).toBe("New event 26 02:00-26 03:15");
      fireEvent.pointerUp(document, { pointerId: 1, clientY: 150 });
      expect(view.onCreateEvent).toHaveBeenCalledTimes(1);
    });

    it("does not let a second pointer replace or move the active sweep", () => {
      const view = setup();
      view.down(96);
      view.move(150);
      fireEvent.pointerDown(view.column, { pointerId: 2, isPrimary: false, clientY: 300 });
      view.move(400, 2);
      fireEvent.pointerCancel(view.column, { pointerId: 2 });
      view.up(400, 2);
      expect(view.content()).toBe("New event 26 02:00-26 03:15");
      view.up(150);
      expect(view.onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 5, 26, 2),
        new Date(2026, 5, 26, 3, 15),
      );
    });

    it("completes a sweep when pointer capture is unavailable", () => {
      const view = setup();
      vi.spyOn(view.column, "setPointerCapture").mockImplementation(() => {
        throw new Error("Capture unavailable");
      });
      view.down(96);
      view.move(150);
      fireEvent.pointerUp(document, { pointerId: 1, clientY: 150 });
      expect(view.onCreateEvent).toHaveBeenCalledTimes(1);
      expect(view.ghost()).toBeNull();
    });

    it("uses the latest callback when a document release completes the sweep", () => {
      const view = setup();
      view.down(96);
      view.move(150);
      const next = vi.fn();
      view.update({ onCreateEvent: next });
      fireEvent.pointerUp(document, { pointerId: 1, clientY: 150 });
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 5, 26, 2),
        new Date(2026, 5, 26, 3, 15),
      );
    });

    it.each(["cancel", "Escape", "unmount", "date", "disable"])(
      "does not commit a pending release after %s",
      (reason) => {
        const view = setup();
        view.down(96);
        view.move(150);
        fireEvent.lostPointerCapture(view.column, { pointerId: 1, buttons: 0 });
        if (reason === "cancel") fireEvent.pointerCancel(document, { pointerId: 1 });
        else if (reason === "Escape") fireEvent.keyDown(document, { key: "Escape" });
        else if (reason === "unmount") view.unmount();
        else if (reason === "date") view.update({ date: new Date(2026, 5, 27) });
        else view.update({ onCreateEvent: undefined });
        fireEvent.pointerUp(document, { pointerId: 1, clientY: 150 });
        expect(view.onCreateEvent).not.toHaveBeenCalled();
        expect(view.ghost()).toBeNull();
      },
    );

    it("cancels zero-button capture loss when no release follows in the event task", async () => {
      const view = setup();
      view.down(96);
      view.move(150);
      fireEvent.lostPointerCapture(view.column, { pointerId: 1, buttons: 0 });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(view.ghost()).toBeNull();
      view.up(150);
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      view.down(480);
      view.move(528);
      view.up(528);
      expect(view.onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 5, 26, 10),
        new Date(2026, 5, 26, 11),
      );
    });

    it("re-renders the held sweep with replaced props", () => {
      const view = setup();
      view.down(100);
      view.move(170);
      expect(view.content()).toBe("New event 26 02:00-26 03:30");
      view.update({ renderCreateGhost: Other });
      expect(view.content()).toBe("Other 26 02:00-26 03:30");
      view.update({ dragStepMinutes: 60 });
      expect(view.content()).toBe("Other 26 02:00-26 04:00");
      view.update({ onCreateEvent: undefined, onPressCell: vi.fn() });
      expect(view.content()).toBeNull();
    });

    it("is forwarded by Calendar in time-grid modes", () => {
      const onCreateEvent = vi.fn();
      const view = render(Calendar, {
        date: day,
        mode: "day",
        hourHeight: 48,
        onCreateEvent,
        renderCreateGhost: Draft,
      });
      const column = view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
      fireEvent.pointerDown(column, { clientY: 96, pointerId: 1, button: 0 });
      fireEvent.pointerMove(column, { clientY: 150, pointerId: 1 });
      const ghost = view.container.querySelector<HTMLElement>('[data-slot="createGhost"]')!;
      expect(ghost.textContent).toBe("New event 26 02:00-26 03:15");
      fireEvent.pointerUp(column, { clientY: 150, pointerId: 1 });
      expect(onCreateEvent).toHaveBeenCalledWith(
        new Date(2026, 5, 26, 2),
        new Date(2026, 5, 26, 3, 15),
      );
    });

    it("cancels the sweep when its date changes", () => {
      const view = setup();
      view.down(96);
      view.move(150);
      view.update({ date: new Date(2026, 5, 27) });
      expect(view.ghost()).toBeNull();
      const column = view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
      fireEvent.pointerUp(column, { clientY: 150, pointerId: 1 });
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      fireEvent.pointerDown(column, { clientY: 480, pointerId: 1, button: 0 });
      expect(view.content()).toBe("New event 27 10:00-27 10:15");
    });

    it("does not revive a sweep after creation is disabled and re-enabled", () => {
      const view = setup();
      view.down(96);
      view.move(150);
      view.update({ onCreateEvent: undefined });
      view.up(150);
      view.update({ onCreateEvent: view.onCreateEvent });
      expect(view.ghost()).toBeNull();
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      view.down(480);
      expect(view.content()).toBe("New event 26 10:00-26 10:15");
    });
  });
});
