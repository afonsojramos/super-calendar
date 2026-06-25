import { render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";

const event: CalendarEvent = {
  start: new Date(2026, 0, 1, 9, 0, 0),
  end: new Date(2026, 0, 1, 10, 30, 0),
  title: "Standup",
};

describe("DefaultEvent", () => {
  it("renders the title on the timed grid", () => {
    const { getByText } = render(<DefaultEvent event={event} mode="week" onPress={() => {}} />);
    expect(getByText("Standup")).toBeTruthy();
  });

  it("announces the title and time range to screen readers", () => {
    const { getByLabelText } = render(
      <DefaultEvent event={event} mode="week" onPress={() => {}} />,
    );
    expect(getByLabelText("Standup, 09:00 to 10:30")).toBeTruthy();
  });

  it("announces all-day events and renders the title in month cells", () => {
    const { getByText, getByLabelText } = render(
      <DefaultEvent event={{ ...event, allDay: true }} mode="month" isAllDay onPress={() => {}} />,
    );
    expect(getByText("Standup")).toBeTruthy();
    expect(getByLabelText("Standup, all day")).toBeTruthy();
  });

  it("shows 'All day' instead of a time range for an all-day event in the schedule", () => {
    const { getByText, queryByText } = render(
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

  it("honours a custom allDayLabel in the schedule, visibly and for screen readers", () => {
    const { getByText, getByLabelText } = render(
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
});
