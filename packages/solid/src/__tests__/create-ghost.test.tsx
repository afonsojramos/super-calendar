import { untrack } from "solid-js";
import type { CreateGhostArgs } from "@super-calendar/core/vanilla";
import { fireEvent, render } from "../../../../tests/support/solid-render";
import { ResourceTimeline } from "../ResourceTimeline";
import { TimeGrid } from "../TimeGrid";

const day = new Date(2026, 5, 26);
const hours = (date: Date) => date.getHours() + date.getMinutes() / 60;

// A renderer runs once per sweep; its props stay reactive, so the range updates
// in place without re-running the component or losing its local state.
function probe() {
  const mounts: number[] = [];
  const reads: string[] = [];
  function Draft(props: CreateGhostArgs) {
    const id = untrack(() => mounts.push(mounts.length) - 1);
    const text = () => {
      const value = `draft ${id} ${hours(props.start)}-${hours(props.end)}`;
      reads.push(value);
      return value;
    };
    return <span>{text()}</span>;
  }
  return { Draft, mounts, reads };
}

describe("Solid renderCreateGhost component lifecycle", () => {
  it("updates a TimeGrid renderer reactively through a sweep", () => {
    const { Draft, mounts, reads } = probe();
    const { container } = render(TimeGrid, {
      date: day,
      mode: "day",
      hourHeight: 48,
      onCreateEvent: () => {},
      renderCreateGhost: Draft,
    });
    const column = container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
    const ghost = () => container.querySelector('[data-slot="createGhost"]')!.textContent;
    fireEvent.pointerDown(column, { clientY: 96, pointerId: 1, button: 0 });
    expect(ghost()).toBe("draft 0 2-2.25");
    fireEvent.pointerMove(column, { clientY: 150, pointerId: 1 });
    expect(ghost()).toBe("draft 0 2-3.25");
    // Still 03:15: the range holds, so the content is not recomputed.
    fireEvent.pointerMove(column, { clientY: 152, pointerId: 1 });
    fireEvent.pointerMove(column, { clientY: 40, pointerId: 1 });
    expect(ghost()).toBe("draft 0 0.75-2");
    expect(mounts).toEqual([0]);
    expect(reads).toEqual(["draft 0 2-2.25", "draft 0 2-3.25", "draft 0 0.75-2"]);
    fireEvent.pointerUp(column, { clientY: 40, pointerId: 1 });
    fireEvent.pointerDown(column, { clientY: 480, pointerId: 1, button: 0 });
    expect(ghost()).toBe("draft 1 10-10.25");
    expect(mounts).toEqual([0, 1]);
  });

  it("updates a ResourceTimeline renderer reactively through a sweep", () => {
    const { Draft, mounts, reads } = probe();
    const { container } = render(ResourceTimeline, {
      date: day,
      events: [],
      resources: [{ id: "a" }],
      hourWidth: 80,
      onCreateEvent: () => {},
      renderCreateGhost: Draft,
    });
    const lane = container.querySelector<HTMLElement>('[data-slot="track"]')!;
    fireEvent.pointerDown(lane, { clientX: 80, pointerId: 1, button: 0 });
    fireEvent.pointerMove(lane, { clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(lane, { clientX: 243, pointerId: 1 });
    expect(container.querySelector('[data-slot="createGhost"]')!.textContent).toBe("draft 0 1-3");
    expect(mounts).toEqual([0]);
    expect(reads).toEqual(["draft 0 1-1.25", "draft 0 1-3"]);
  });
});
