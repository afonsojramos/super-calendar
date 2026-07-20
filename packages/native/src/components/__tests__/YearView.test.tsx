import { fireEvent, render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";
import { YearView } from "../YearView";

const events: CalendarEvent[] = [
  { title: "Standup", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];

describe("YearView", () => {
  it("renders all twelve months of the anchor year", () => {
    const { getByLabelText } = render(<YearView date={new Date(2026, 6, 20)} weekStartsOn={1} />);
    expect(getByLabelText("January 2026")).toBeTruthy();
    expect(getByLabelText("December 2026")).toBeTruthy();
  });

  it("fires onPressDay with the tapped day", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onPressDay={onPressDay} />,
    );
    fireEvent.press(getByLabelText(/Wednesday, 15 July 2026/));
    expect(onPressDay).toHaveBeenCalledTimes(1);
    expect(onPressDay.mock.calls[0][0].getDate()).toBe(15);
    expect(onPressDay.mock.calls[0][0].getMonth()).toBe(6);
  });

  it("marks days holding events and announces them", () => {
    const { getByLabelText } = render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} events={events} />,
    );
    expect(getByLabelText(/15 July 2026.*has events/)).toBeTruthy();
  });

  it("fires onPressMonth from a month title", () => {
    const onPressMonth = jest.fn();
    const { getByLabelText } = render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onPressMonth={onPressMonth} />,
    );
    fireEvent.press(getByLabelText("March 2026"));
    expect(onPressMonth).toHaveBeenCalledTimes(1);
    expect(onPressMonth.mock.calls[0][0].getMonth()).toBe(2);
  });
});
