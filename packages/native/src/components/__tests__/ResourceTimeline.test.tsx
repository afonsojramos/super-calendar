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
    const { getByLabelText, getAllByLabelText } = render(
      <ResourceTimeline
        date={at(0)}
        resources={resources}
        events={events}
        onDragEvent={onDragEvent}
        onPressEvent={onPressEvent}
      />,
    );
    // Each bar exposes a resize handle for the edge-resize gesture.
    expect(getAllByLabelText(/^Resize /)).toHaveLength(events.length);
    // Tapping the bar still fires onPressEvent (long-press is what starts a drag).
    fireEvent.press(getByLabelText("Standup"));
    expect(onPressEvent).toHaveBeenCalledTimes(1);
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
