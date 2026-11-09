import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import {
  fireEvent,
  render,
  rendererName,
  TimeGrid,
  type RenderEventArgs,
} from "@calendar-test/renderer";

const date = new Date(2026, 6, 15);
const trip: CalendarEvent = {
  title: "Trip",
  start: new Date(2026, 6, 14),
  end: new Date(2026, 6, 17),
  allDay: true,
};
const Span = (props: RenderEventArgs) => (
  <span data-before={String(props.continuesBefore)} data-after={String(props.continuesAfter)}>
    {props.event.title}
  </span>
);

describe(rendererName, () => {
  it("renders a multi-day all-day event as one spanning item in week view", () => {
    const onPressEvent = vi.fn();
    const view = render(TimeGrid, {
      date: new Date(2026, 6, 15),
      mode: "week",
      weekStartsOn: 1,
      events: [trip],
      onPressEvent,
    });

    expect(view.getAllByText("Trip")).toHaveLength(1);
    fireEvent.click(view.getByText("Trip"));
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(trip);
  });

  it.each([
    { title: "Inside", start: 14, end: 17, before: false, after: false },
    { title: "Starts before", start: 11, end: 15, before: true, after: false },
    { title: "Ends after", start: 18, end: 22, before: false, after: true },
    { title: "Both edges", start: 11, end: 22, before: true, after: true },
    { title: "Exact edges", start: 13, end: 20, before: false, after: false },
  ])("passes view-edge continuation flags for $title", ({ title, start, end, before, after }) => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      events: [{ ...trip, title, start: new Date(2026, 6, start), end: new Date(2026, 6, end) }],
      renderEvent: Span,
    });
    expect(view.getAllByText(title)).toHaveLength(1);
    const content = view.getByText(title);
    expect(content.getAttribute("data-before")).toBe(String(before));
    expect(content.getAttribute("data-after")).toBe(String(after));
  });

  it("keeps one item across hidden days and omits events confined to them", () => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      hiddenDays: [3],
      events: [trip, { ...trip, title: "Hidden", start: date, end: new Date(2026, 6, 16) }],
    });
    expect(view.getAllByText("Trip")).toHaveLength(1);
    expect(view.queryByText("Hidden")).toBeNull();
  });

  it("updates the spanning item and its callback when events or visible dates change", () => {
    const onPressEvent = vi.fn();
    const props = {
      date,
      mode: "week" as const,
      weekStartsOn: 1 as const,
      events: [trip],
      onPressEvent,
    };
    const view = render(TimeGrid, props);
    const replacement = { ...trip, title: "Updated", end: new Date(2026, 6, 19) };
    view.rerender({ ...props, events: [replacement] });
    expect(view.queryByText("Trip")).toBeNull();
    expect(view.getAllByText("Updated")).toHaveLength(1);
    fireEvent.click(view.getByText("Updated"));
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(replacement);
    view.rerender({ ...props, date: new Date(2026, 6, 22), events: [replacement] });
    expect(view.container.querySelector('[data-slot="allDayLane"]')).toBeNull();
  });

  it("preserves all-day classification and excludes background and empty midnight events", () => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      events: [
        { ...trip, allDay: undefined },
        { ...trip, title: "Background", display: "background" },
        { ...trip, title: "Empty", end: trip.start },
      ],
    });
    const lane = view.container.querySelector('[data-slot="allDayLane"]');
    expect(lane?.querySelectorAll('[data-slot="allDayEvent"]')).toHaveLength(1);
    expect(view.getAllByText("Trip")).toHaveLength(1);
    expect(view.queryByText("Empty")).toBeNull();
  });
});
