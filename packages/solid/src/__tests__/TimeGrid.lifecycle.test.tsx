import { untrack } from "solid-js";
import { render } from "../../../../tests/support/solid-render";
import { TimeGrid, type SolidRenderEventArgs } from "../TimeGrid";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
const day = new Date(2026, 5, 26);
describe("Solid TimeGrid background band keys", () => {
  it("keeps a later band mounted when an earlier one is removed", () => {
    const mounts: string[] = [];
    const Band = (props: SolidRenderEventArgs) => {
      untrack(() => mounts.push(props.event.title ?? ""));
      return <span>{props.event.title}</span>;
    };
    const first: CalendarEvent = {
      title: "First",
      start: new Date(2026, 5, 26, 8),
      end: new Date(2026, 5, 26, 9),
      display: "background",
    };
    const second: CalendarEvent = {
      title: "Second",
      start: new Date(2026, 5, 26, 10),
      end: new Date(2026, 5, 26, 11),
      display: "background",
    };
    const { rerender } = render(TimeGrid, {
      date: day,
      mode: "day",
      events: [first, second],
      hourHeight: 48,
      renderBackgroundEvent: Band,
    });
    rerender({
      date: day,
      mode: "day",
      events: [second],
      hourHeight: 48,
      renderBackgroundEvent: Band,
    });
    expect(mounts).toEqual(["First", "Second"]);
  });
});
