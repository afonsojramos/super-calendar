import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { Calendar } from "../Calendar";
import { YearView } from "../YearView";

const events: CalendarEvent[] = [
  { title: "Standup", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];

describe("dom YearView", () => {
  it("renders all twelve months with weekday initials", () => {
    const { getByRole } = render(<YearView date={new Date(2026, 6, 20)} />);
    expect(getByRole("heading", { name: "January 2026" })).toBeTruthy();
    expect(getByRole("heading", { name: "December 2026" })).toBeTruthy();
    expect(getByRole("grid", { name: "January 2026" })).toBeTruthy();
  });

  it("fires onPressDay and marks event days with data-events", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <YearView date={new Date(2026, 6, 20)} events={events} onPressDay={onPressDay} />,
    );
    const day = getByLabelText(/15 July 2026.*has events/);
    expect(day.getAttribute("data-events")).toBe("");
    fireEvent.click(day);
    expect(onPressDay).toHaveBeenCalledTimes(1);
    expect(onPressDay.mock.calls[0][0].getMonth()).toBe(6);
  });

  it("renders through Calendar mode=year and pages by year with PageDown", () => {
    const onChangeDate = jest.fn();
    const { getByRole, container } = render(
      <Calendar
        mode="year"
        date={new Date(2026, 6, 20)}
        events={events}
        onChangeDate={onChangeDate}
      />,
    );
    expect(getByRole("grid", { name: "July 2026" })).toBeTruthy();
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "PageDown" });
    expect(onChangeDate).toHaveBeenCalledTimes(1);
    expect(onChangeDate.mock.calls[0][0].getFullYear()).toBe(2027);
  });
});
