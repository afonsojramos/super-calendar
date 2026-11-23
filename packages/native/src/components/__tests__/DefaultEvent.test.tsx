import { render } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";

// A plain object stands in for the shared value; the Reanimated test mock
// evaluates worklets once with its current `.value`.
const boxHeightOf = (value: number) => ({ value }) as SharedValue<number>;

const event: CalendarEvent = {
  start: new Date(2026, 0, 1, 9, 0, 0),
  end: new Date(2026, 0, 1, 10, 30, 0),
  title: "Standup",
};

describe("DefaultEvent", () => {
  it("renders the title on the timed grid", async () => {
    const { getByText } = await render(
      <DefaultEvent event={event} mode="week" onPress={() => {}} />,
    );
    expect(getByText("Standup")).toBeTruthy();
  });

  it("announces the title and time range to screen readers", async () => {
    const { getByLabelText } = await render(
      <DefaultEvent event={event} mode="week" onPress={() => {}} />,
    );
    expect(getByLabelText("Standup, 09:00 to 10:30")).toBeTruthy();
  });

  it("announces all-day events and renders the title in month cells", async () => {
    const { getByText, getByLabelText } = await render(
      <DefaultEvent event={{ ...event, allDay: true }} mode="month" isAllDay onPress={() => {}} />,
    );
    expect(getByText("Standup")).toBeTruthy();
    expect(getByLabelText("Standup, all day")).toBeTruthy();
  });

  it("shows 'All day' instead of a time range for an all-day event in the schedule", async () => {
    const { getByText, queryByText } = await render(
      <DefaultEvent
        event={{ ...event, allDay: true }}
        mode="schedule"
        isAllDay
        onPress={() => {}}
      />,
    );
    expect(getByText("All day")).toBeTruthy();
    expect(queryByText(/09:00/)).toBeNull();
  });

  it("honours a custom allDayLabel in the schedule, visibly and for screen readers", async () => {
    const { getByText, getByLabelText } = await render(
      <DefaultEvent
        event={{ ...event, allDay: true }}
        mode="schedule"
        isAllDay
        allDayLabel="Ganztägig"
        onPress={() => {}}
      />,
    );
    expect(getByText("Ganztägig")).toBeTruthy();
    expect(getByLabelText("Standup, Ganztägig")).toBeTruthy();
  });

  it("centers a lone title line vertically and keeps taller chips top-aligned", async () => {
    const justifyOf = async (boxHeight: SharedValue<number>) => {
      const { getByTestId } = await render(
        <DefaultEvent event={event} mode="day" boxHeight={boxHeight} onPress={() => {}} />,
      );
      const style = StyleSheet.flatten(getByTestId("event-chip-content").props.style) as ViewStyle;
      return style.justifyContent;
    };
    // A 24px box fits exactly one title line and no time line: centered.
    expect(await justifyOf(boxHeightOf(24))).toBe("center");
    // A 96px box fits the title and the time: top-aligned as before.
    expect(await justifyOf(boxHeightOf(96))).toBe("flex-start");
  });

  it("shows inline start time, timed accessibility label, and squared continuing corners for a promoted timed bar", async () => {
    const multiDay: CalendarEvent = {
      title: "Conference",
      start: new Date(2026, 6, 14, 9, 0),
      end: new Date(2026, 6, 16, 17, 0),
      allDay: false,
    };
    const view = await render(
      <DefaultEvent
        event={multiDay}
        mode="week"
        isAllDay={false}
        inAllDayLane
        continuesAfter
        onPress={() => {}}
      />,
    );
    expect(view.getByText("09:00")).toBeTruthy();
    expect(view.getByText("Conference")).toBeTruthy();
    expect(view.queryByText("09:00 - 17:00")).toBeNull();
    expect(view.getByLabelText("Conference, 09:00 to 17:00")).toBeTruthy();
    const style = StyleSheet.flatten(view.getByRole("button").props.style);
    expect(style.borderTopLeftRadius).toBeUndefined();
    expect(style.borderTopRightRadius).toBe(0);
    expect(style.borderBottomRightRadius).toBe(0);

    // Omits the start time when continuing from before the visible range or when showTime is false.
    await view.rerender(
      <DefaultEvent
        event={multiDay}
        mode="week"
        isAllDay={false}
        inAllDayLane
        continuesBefore
        onPress={() => {}}
      />,
    );
    expect(view.queryByText("09:00")).toBeNull();
    expect(view.getByText("Conference")).toBeTruthy();
    const beforeStyle = StyleSheet.flatten(view.getByRole("button").props.style);
    expect(beforeStyle.borderTopLeftRadius).toBe(0);
    expect(beforeStyle.borderBottomLeftRadius).toBe(0);

    await view.rerender(
      <DefaultEvent
        event={multiDay}
        mode="week"
        isAllDay={false}
        inAllDayLane
        showTime={false}
        onPress={() => {}}
      />,
    );
    expect(view.queryByText("09:00")).toBeNull();
  });
});
