import { render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";
import { DefaultMonthEvent } from "../DefaultMonthEvent";

const event: CalendarEvent = {
  start: new Date(2026, 0, 1, 9, 0, 0),
  end: new Date(2026, 0, 1, 10, 30, 0),
  title: "Standup",
};

describe("DefaultMonthEvent", () => {
  it("renders the event title", async () => {
    const { getByText } = await render(
      <DefaultMonthEvent event={event} mode="month" onPress={() => {}} />,
    );
    expect(getByText("Standup")).toBeTruthy();
  });

  it("announces the event to screen readers", async () => {
    const { getByLabelText } = await render(
      <DefaultMonthEvent event={event} mode="month" onPress={() => {}} />,
    );
    expect(getByLabelText(/Standup/)).toBeTruthy();
  });
});
