import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
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

describe("ResourceTimeline vertical orientation", () => {
  it("renders resource columns with the hour axis down the side", () => {
    const { getByText } = render(
      <ResourceTimeline
        date={at(0)}
        orientation="vertical"
        resources={resources}
        events={events}
        startHour={8}
        endHour={18}
      />,
    );
    expect(getByText("Room A")).toBeTruthy();
    expect(getByText("Room B")).toBeTruthy();
    expect(getByText("Standup")).toBeTruthy();
    expect(getByText("08:00")).toBeTruthy();
    expect(getByText("17:00")).toBeTruthy();
  });

  it("keeps the screen-reader move and resize actions on vertical bars", () => {
    const onDragEvent = jest.fn();
    const { getAllByRole } = render(
      <ResourceTimeline
        date={at(0)}
        orientation="vertical"
        resources={resources}
        events={events}
        onDragEvent={onDragEvent}
      />,
    );
    const bar = getAllByRole("button")[0];
    const names = (bar.props.accessibilityActions ?? []).map((a: { name: string }) => a.name);
    expect(names).toEqual(["move-later", "move-earlier", "extend", "shrink"]);
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "move-later" } });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
  });

  it("fires onPressEvent for a tapped vertical bar", () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <ResourceTimeline
        date={at(0)}
        orientation="vertical"
        resources={resources}
        events={events}
        onPressEvent={onPressEvent}
      />,
    );
    fireEvent.press(getByText("Standup"));
    expect(onPressEvent).toHaveBeenCalledWith(expect.objectContaining({ title: "Standup" }));
  });

  it("lays a draggable vertical bar out by time with the resize grip at the bottom", () => {
    const onDragEvent = jest.fn();
    const { getAllByTestId, getByText } = render(
      <ResourceTimeline
        date={at(0)}
        orientation="vertical"
        resources={resources}
        events={events}
        startHour={8}
        hourHeight={48}
        onDragEvent={onDragEvent}
      />,
    );
    // Standup 09:00–10:00, startHour 8 → top 48px, height 48px, full lane width.
    const title = getByText("Standup");
    let box: (typeof title)["parent"] = title.parent;
    let flat: Record<string, unknown> = {};
    while (box) {
      flat = (StyleSheet.flatten(box.props.style) ?? {}) as Record<string, unknown>;
      if (flat.position === "absolute") break;
      box = box.parent;
    }
    expect(flat.top).toBe(48);
    expect(flat.width).toBe("100%");
    // The grip moved to the bottom edge for the vertical axis. It's a purely
    // visual affordance hidden from assistive tech, so opt hidden elements in.
    const grip = getAllByTestId("resource-resize-grip", { includeHiddenElements: true })[0];
    const gripFlat = StyleSheet.flatten(grip.props.style) as Record<string, unknown>;
    expect(gripFlat.bottom).toBe(1);
    expect(gripFlat.height).toBe(4);
  });
});
