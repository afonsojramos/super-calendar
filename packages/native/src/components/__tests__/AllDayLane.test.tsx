import { fireEvent, render } from "@testing-library/react-native";
import { Pressable, Text, StyleSheet } from "react-native";
import { vi } from "vitest";
import { AllDayLane } from "../AllDayLane";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { SlotStylesProvider } from "../../utils/slots";

const days = Array.from({ length: 7 }, (_, index) => new Date(2026, 6, 13 + index));
const trip: CalendarEvent = {
  title: "Trip",
  start: days[1],
  end: days[4],
  allDay: true,
};
const Span = (props: RenderEventArgs) => (
  <Pressable onPress={props.onPress} onLongPress={props.onLongPress}>
    <Text>{props.event.title}</Text>
    <Text>{`${props.event.title}: ${props.continuesBefore},${props.continuesAfter}`}</Text>
  </Pressable>
);
const props = {
  days,
  events: [trip],
  mode: "week" as const,
  dayWidth: 50,
  renderEvent: Span,
  keyExtractor: (event: CalendarEvent) => event.title ?? event.start.toISOString(),
  onPressEvent: vi.fn(),
};

describe("AllDayLane spans", () => {
  it("renders one full-width span with original press and long-press event identity", async () => {
    const onPressEvent = vi.fn();
    const onLongPressEvent = vi.fn();
    const view = await render(
      <SlotStylesProvider classNames={{ allDayColumn: "span" }}>
        <AllDayLane {...props} onPressEvent={onPressEvent} onLongPressEvent={onLongPressEvent} />
      </SlotStylesProvider>,
    );
    expect(view.getAllByText("Trip")).toHaveLength(1);
    expect(view.getByText("Trip: false,false")).toBeTruthy();
    const columns = view.container.queryAll((node) => node.props.className === "span");
    expect(columns).toHaveLength(1);
    expect(StyleSheet.flatten(columns[0].props.style).width).toBe(150);
    await fireEvent.press(view.getByText("Trip"));
    await fireEvent(view.getByText("Trip"), "longPress");
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(trip);
    expect(onLongPressEvent).toHaveBeenCalledExactlyOnceWith(trip);
  });

  it("clips at the visible edges and reports continuation only beyond them", async () => {
    const view = await render(
      <AllDayLane
        {...props}
        events={[
          { ...trip, title: "Before", start: new Date(2026, 6, 10), end: days[2] },
          { ...trip, title: "After", start: days[5], end: new Date(2026, 6, 23) },
        ]}
      />,
    );
    expect(view.getAllByText("Before")).toHaveLength(1);
    expect(view.getByText("Before: true,false")).toBeTruthy();
    expect(view.getAllByText("After")).toHaveLength(1);
    expect(view.getByText("After: false,true")).toBeTruthy();
  });

  it("uses only visible columns and keeps empty pages measurable", async () => {
    const onLayout = vi.fn();
    const visibleDays = days.filter((day) => day.getDay() !== 3);
    const view = await render(
      <SlotStylesProvider classNames={{ allDayLane: "lane", allDayColumn: "span" }}>
        <AllDayLane {...props} days={visibleDays} onLayout={onLayout} />
      </SlotStylesProvider>,
    );
    expect(view.getAllByText("Trip")).toHaveLength(1);
    expect(
      StyleSheet.flatten(
        view.container.queryAll((node) => node.props.className === "span")[0].props.style,
      ).width,
    ).toBe(100);
    await view.rerender(
      <SlotStylesProvider classNames={{ allDayLane: "lane", allDayColumn: "span" }}>
        <AllDayLane {...props} events={[]} onLayout={onLayout} />
      </SlotStylesProvider>,
    );
    expect(view.container.queryAll((node) => node.props.className === "span")).toHaveLength(0);
    const lane = view.container.queryAll((node) => node.props.className === "lane")[0];
    await fireEvent(lane, "layout", {
      nativeEvent: { layout: { width: 350, height: 0, x: 0, y: 0 } },
    });
    expect(onLayout).toHaveBeenCalledTimes(1);
  });
});
