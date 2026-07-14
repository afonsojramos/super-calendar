import { fireEvent, render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";
import { ResourceTimeline } from "../ResourceTimeline";

const at = (h: number, m = 0): Date => new Date(2026, 0, 1, h, m, 0, 0);

type ResourceEvent = CalendarEvent & { resourceId?: string };

const resources = [
  { id: "a", title: "Room A" },
  { id: "b", title: "Room B" },
];

const events: ResourceEvent[] = [
  { title: "Standup", start: at(9), end: at(10), resourceId: "a" },
  { title: "Interview", start: at(11), end: at(12), resourceId: "b" },
];

describe("ResourceTimeline", () => {
  it("renders a labelled row per resource and each event in its lane", () => {
    const { getByText } = render(
      <ResourceTimeline date={at(0)} resources={resources} events={events} />,
    );
    expect(getByText("Room A")).toBeTruthy();
    expect(getByText("Room B")).toBeTruthy();
    expect(getByText("Standup")).toBeTruthy();
    expect(getByText("Interview")).toBeTruthy();
  });

  it("falls back to the resource id when it has no title", () => {
    const { getByText } = render(
      <ResourceTimeline date={at(0)} resources={[{ id: "solo" }]} events={[]} />,
    );
    expect(getByText("solo")).toBeTruthy();
  });

  it("fires onPressEvent with the tapped event", () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={at(0)}
        resources={resources}
        events={events}
        onPressEvent={onPressEvent}
      />,
    );
    fireEvent.press(getByText("Interview"));
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(onPressEvent.mock.calls[0][0].title).toBe("Interview");
  });

  it("renders a resize grip per event and still taps when onDragEvent is set", () => {
    const onDragEvent = jest.fn();
    const onPressEvent = jest.fn();
    const { getByLabelText, getAllByTestId } = render(
      <ResourceTimeline
        date={at(0)}
        resources={resources}
        events={events}
        onDragEvent={onDragEvent}
        onPressEvent={onPressEvent}
      />,
    );
    // Each bar exposes a resize handle for the edge-resize gesture. It's hidden
    // from accessibility (so it needs includeHiddenElements) — screen readers use
    // the bar's extend/shorten actions instead.
    expect(getAllByTestId("resource-resize-grip", { includeHiddenElements: true })).toHaveLength(
      events.length,
    );
    // Tapping the bar still fires onPressEvent (long-press is what starts a drag).
    fireEvent.press(getByLabelText("Standup"));
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("exposes screen-reader move and resize actions on the draggable bar", () => {
    const onDragEvent = jest.fn();
    const { getByLabelText } = render(
      <ResourceTimeline
        date={at(0)}
        resources={resources}
        events={events}
        onDragEvent={onDragEvent}
      />,
    );
    // The accessible bar carries all four actions (the resize grip isn't focusable).
    const bar = getByLabelText("Standup");
    expect((bar.props.accessibilityActions ?? []).map((a: { name: string }) => a.name)).toEqual([
      "move-later",
      "move-earlier",
      "extend",
      "shrink",
    ]);

    // "Move later" reschedules via onDragEvent, preserving the duration.
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "move-later" } });
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getTime()).toBeGreaterThan(at(9).getTime());
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);

    // "Extend" grows the end only.
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "extend" } });
    const [, s2, e2] = onDragEvent.mock.calls[1] as [CalendarEvent, Date, Date];
    expect(s2.getTime()).toBe(at(9).getTime());
    expect(e2.getTime()).toBeGreaterThan(at(10).getTime());
  });

  it("renders the hour axis with the configured window", () => {
    const { getByText, queryByText } = render(
      <ResourceTimeline
        date={at(0)}
        resources={resources}
        events={[]}
        startHour={8}
        endHour={18}
      />,
    );
    expect(getByText("08:00")).toBeTruthy();
    expect(getByText("17:00")).toBeTruthy();
    // Outside the window is not drawn.
    expect(queryByText("07:00")).toBeNull();
    expect(queryByText("18:00")).toBeNull();
  });
});
