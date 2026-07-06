import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";

// Legend List needs measured layout to page through `renderItem`, which jsdom
// can't provide. Render every item synchronously so the tests exercise the row
// grouping and the default row renderer.
jest.mock("@legendapp/list/react", () => ({
  __esModule: true,
  LegendList: (props: {
    data?: unknown[];
    renderItem: (arg: { item: unknown; index: number }) => unknown;
  }) => (props.data ?? []).map((item, index) => props.renderItem({ item, index })),
}));

import { Agenda } from "../Agenda";

const events: CalendarEvent[] = [
  // Out of order on purpose: the agenda sorts by start.
  { title: "Lunch", start: new Date(2026, 5, 23, 12, 0), end: new Date(2026, 5, 23, 13, 0) },
  { title: "Standup", start: new Date(2026, 5, 23, 9, 0), end: new Date(2026, 5, 23, 9, 30) },
  { title: "Review", start: new Date(2026, 5, 24, 15, 0), end: new Date(2026, 5, 24, 16, 0) },
];

describe("dom Agenda", () => {
  it("groups events under a day header and sorts them by start", () => {
    const { getByText, getAllByText } = render(<Agenda events={events} />);
    // Two distinct day headers (23rd and 24th of June 2026).
    expect(getByText("Tuesday, 23 June")).toBeTruthy();
    expect(getByText("Wednesday, 24 June")).toBeTruthy();
    // The default row shows the time range and the title.
    expect(getByText("09:00 - 09:30")).toBeTruthy();
    expect(getByText("Standup")).toBeTruthy();
    expect(getAllByText(/^\d{2}:\d{2} - \d{2}:\d{2}$/)).toHaveLength(3);
  });

  it("renders an all-day event with the all-day label", () => {
    const allDay: CalendarEvent[] = [
      { title: "Holiday", start: new Date(2026, 5, 23), end: new Date(2026, 5, 24), allDay: true },
    ];
    const { getByText } = render(<Agenda events={allDay} />);
    expect(getByText("All day")).toBeTruthy();
  });

  it("fires onPressEvent when a row is clicked", () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(<Agenda events={events} onPressEvent={onPressEvent} />);
    fireEvent.click(getByText("Standup"));
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(onPressEvent.mock.calls[0][0].title).toBe("Standup");
  });

  it("fires onPressDay from a day header", () => {
    const onPressDay = jest.fn();
    const { getByText } = render(<Agenda events={events} onPressDay={onPressDay} />);
    fireEvent.click(getByText("Tuesday, 23 June"));
    expect(onPressDay).toHaveBeenCalledTimes(1);
    expect((onPressDay.mock.calls[0][0] as Date).getDate()).toBe(23);
  });

  it("shows an empty state when there are no events", () => {
    const { getByText } = render(<Agenda events={[]} />);
    expect(getByText("No events")).toBeTruthy();
  });

  it("applies a per-slot class to the empty state and drops its themed inline style", () => {
    const { getByText } = render(<Agenda events={[]} classNames={{ empty: "text-gray-400" }} />);
    const empty = getByText("No events");
    expect(empty.className).toBe("text-gray-400");
    expect(empty.style.fontSize).toBe("");
  });
});
