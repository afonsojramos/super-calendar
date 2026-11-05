import { useEffect, useState } from "react";
import { fireEvent, render } from "@testing-library/react";
import type { CreateGhostArgs } from "@super-calendar/core/vanilla";
import { ResourceTimeline } from "../ResourceTimeline";
import { TimeGrid } from "../TimeGrid";

const day = new Date(2026, 5, 26);
const hours = (date: Date) => date.getHours() + date.getMinutes() / 60;

// A renderer with its own state: it must stay mounted while the range changes,
// so a draft the consumer keeps in component state survives the sweep.
function probe() {
  const mounts: number[] = [];
  const seen: string[] = [];
  function Draft({ start, end }: CreateGhostArgs) {
    const [id] = useState(() => mounts.push(mounts.length) - 1);
    useEffect(() => {
      seen.push(`${id}:${hours(start)}-${hours(end)}`);
    }, [id, start, end]);
    return <span>{`draft ${id} ${hours(start)}-${hours(end)}`}</span>;
  }
  return { Draft, mounts, seen };
}

describe("dom renderCreateGhost component lifecycle", () => {
  it("keeps a hook-using TimeGrid renderer mounted through a sweep", () => {
    const { Draft, mounts, seen } = probe();
    const { container } = render(
      <TimeGrid
        date={day}
        mode="day"
        hourHeight={48}
        onCreateEvent={() => {}}
        renderCreateGhost={Draft}
      />,
    );
    const column = container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
    fireEvent.pointerDown(column, { clientY: 96, pointerId: 1, button: 0 });
    fireEvent.pointerMove(column, { clientY: 150, pointerId: 1 });
    // Still 03:15: the same `Date`s, so the effect does not run again.
    fireEvent.pointerMove(column, { clientY: 152, pointerId: 1 });
    fireEvent.pointerMove(column, { clientY: 40, pointerId: 1 });
    expect(container.querySelector('[data-slot="createGhost"]')!.textContent).toBe(
      "draft 0 0.75-2",
    );
    expect(mounts).toEqual([0]);
    expect(seen).toEqual(["0:2-2.25", "0:2-3.25", "0:0.75-2"]);
    fireEvent.pointerUp(column, { clientY: 40, pointerId: 1 });
    // The next sweep mounts fresh content instead of reusing the last one.
    fireEvent.pointerDown(column, { clientY: 480, pointerId: 1, button: 0 });
    expect(mounts).toEqual([0, 1]);
    expect(seen.at(-1)).toBe("1:10-10.25");
  });

  it("keeps a hook-using ResourceTimeline renderer mounted through a sweep", () => {
    const { Draft, mounts, seen } = probe();
    const { container } = render(
      <ResourceTimeline
        date={day}
        events={[]}
        resources={[{ id: "a" }]}
        hourWidth={80}
        onCreateEvent={() => {}}
        renderCreateGhost={Draft}
      />,
    );
    const lane = container.querySelector<HTMLElement>('[data-slot="track"]')!;
    fireEvent.pointerDown(lane, { clientX: 80, pointerId: 1, button: 0 });
    fireEvent.pointerMove(lane, { clientX: 240, pointerId: 1 });
    fireEvent.pointerMove(lane, { clientX: 243, pointerId: 1 });
    expect(mounts).toEqual([0]);
    expect(seen).toEqual(["0:1-1.25", "0:1-3"]);
  });
});
