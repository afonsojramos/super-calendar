import { fireEvent, render } from "../../../../tests/support/solid-render";
import { Calendar } from "../Calendar";

const date = new Date(2026, 6, 15);
const daily = [
  {
    title: "Daily",
    start: new Date(2026, 6, 13, 9),
    end: new Date(2026, 6, 13, 10),
    recurrence: { freq: "daily" as const },
  },
];
describe("Solid Calendar schedule virtualization", () => {
  it("auto-expands recurring events in schedule mode over a forward window", () => {
    const { container, getAllByText } = render(Calendar, {
      mode: "schedule",
      date,
      events: daily,
      renderScheduleEvent: (props) => (
        <time datetime={props.event.start.toISOString()}>{props.event.title}</time>
      ),
    });
    const scroller = container.querySelector<HTMLDivElement>("[data-virtual-list]")!;
    const occurrences = new Set<string | null>();
    // Traverse the real virtualized agenda so offscreen occurrences count too.
    for (let top = 0; top <= 6000; top += 440) {
      fireEvent.scroll(scroller, { target: { scrollTop: top } });
      const visible = getAllByText("Daily");
      expect(visible.length).toBeLessThan(15);
      for (const event of visible) occurrences.add(event.getAttribute("datetime"));
    }
    expect(occurrences.size).toBeGreaterThan(30);
  });
});
