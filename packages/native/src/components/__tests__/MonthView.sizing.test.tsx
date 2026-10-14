import { render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";
import { MonthView } from "../MonthView";

const events: CalendarEvent[] = [
  { title: "Trip", start: new Date(2026, 6, 15), end: new Date(2026, 6, 18), allDay: true },
  { title: "Meeting", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
  { title: "Lunch", start: new Date(2026, 6, 15, 12), end: new Date(2026, 6, 15, 13) },
];

function styleValue(style: unknown, name: string): unknown {
  if (Array.isArray(style)) {
    for (const entry of [...style].reverse()) {
      const value = styleValue(entry, name);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }
  if (typeof style === "object" && style !== null) {
    const value: unknown = Reflect.get(style, name);
    return value;
  }
  return undefined;
}

describe("native month chip dimensions", () => {
  it("applies the gap to day rows and the chip height to overflow", async () => {
    const { getByLabelText } = await render(
      <MonthView
        date={new Date(2026, 6, 1)}
        events={events}
        weekStartsOn={0}
        renderEvent={DefaultEvent}
        keyExtractor={(event) => event.title ?? ""}
        onPressEvent={() => {}}
        chipHeight={44}
        chipGap={6}
        maxVisibleEventCount={2}
      />,
    );
    expect(getByLabelText(/15 July 2026, 3 events/)).toHaveStyle({ gap: 6 });
    expect(getByLabelText(/1 more events, 15 July/)).toHaveStyle({ height: 44 });
  });

  it("positions and sizes a spanning bar with the same chip metrics", async () => {
    const { getByText } = await render(
      <MonthView
        date={new Date(2026, 6, 1)}
        events={events}
        weekStartsOn={0}
        renderEvent={DefaultEvent}
        keyExtractor={(event) => event.title ?? ""}
        onPressEvent={() => {}}
        chipHeight={44}
        chipGap={6}
        maxVisibleEventCount={2}
      />,
    );
    let node = getByText("Trip");
    while (node.parent) {
      if (styleValue(node.props.style, "position") === "absolute") {
        expect(styleValue(node.props.style, "height")).toBe(44);
        expect(styleValue(node.props.style, "top")).toBe(34);
        return;
      }
      node = node.parent;
    }
    throw new Error("Missing spanning bar");
  });
});
