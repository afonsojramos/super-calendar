import { render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";
import { MonthList } from "../MonthList";

const baseProps = {
  date: new Date(2026, 5, 15), // June 2026
  events: [] as CalendarEvent[],
  weekStartsOn: 1 as const,
  renderEvent: DefaultEvent,
  keyExtractor: (_event: CalendarEvent, index: number) => String(index),
  onPressEvent: () => {},
};

describe("MonthList", () => {
  // LegendList needs real layout to virtualize, so the scrolling month content
  // is verified in the example app; here we just guard mounting + the static
  // weekday header. The grid/selection logic is covered by MonthView and
  // buildMonthGrid tests.
  it("mounts and renders the weekday header", () => {
    const { getAllByText } = render(<MonthList {...baseProps} />);
    expect(getAllByText("Mon").length).toBeGreaterThan(0);
    expect(getAllByText("Sun").length).toBeGreaterThan(0);
  });
});
