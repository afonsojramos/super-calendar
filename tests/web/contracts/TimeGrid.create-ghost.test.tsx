import { vi } from "vitest";
import type { CreateGhostArgs } from "@super-calendar/core/vanilla";
import {
  rendererName,
  Calendar,
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

    it("clears the content when the sweep loses pointer capture", () => {
      const view = setup();
      view.down(96);
      view.move(300);
      fireEvent.lostPointerCapture(view.column, { pointerId: 2 });
      expect(view.content()).toBe("New event 26 02:00-26 06:15");
      fireEvent.lostPointerCapture(view.column, { pointerId: 1 });
      expect(view.ghost()).toBeNull();
      view.move(400);
      view.up(400);
      expect(view.onCreateEvent).not.toHaveBeenCalled();
      expect(view.ghost()).toBeNull();
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
      expect(view.content()).toBe("");
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
  });
});
