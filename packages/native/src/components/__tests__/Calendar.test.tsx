import { render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";

// The real LegendList can't lay out under Jest (no measured dimensions). This
// stand-in renders the active page through `renderItem` so page content mounts.
jest.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: (props: any) => {
    const index = props.initialScrollIndex ?? 0;
    const item = props.data?.[index];
    return item === undefined ? null : props.renderItem({ item, index });
  },
}));

import { Calendar } from "../Calendar";

const noop = () => {};

describe("Calendar recurrence + timeZone", () => {
  it("auto-expands a recurring event so a later occurrence shows on its day", () => {
    const daily: CalendarEvent[] = [
      {
        title: "Daily",
        start: new Date(2026, 6, 15, 9, 0), // Wed 15 Jul 2026
        end: new Date(2026, 6, 15, 10, 0),
        recurrence: { freq: "daily" },
      },
    ];
    // View three days on: the occurrence only exists via auto-expansion.
    const { getByLabelText } = render(
      <Calendar
        mode="day"
        date={new Date(2026, 6, 18)}
        events={daily}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(getByLabelText(/Daily, 09:00 to 10:00/)).toBeTruthy();
  });

  it("renders events in the given IANA time zone", () => {
    // Absolute instant so the shift is device-tz-independent: 06:00–08:00 UTC is
    // 11:30–13:30 in Asia/Kolkata (UTC+5:30, no DST).
    const call: CalendarEvent[] = [
      {
        title: "Call",
        start: new Date(Date.UTC(2026, 6, 15, 6, 0)),
        end: new Date(Date.UTC(2026, 6, 15, 8, 0)),
      },
    ];
    const { getByLabelText } = render(
      <Calendar
        mode="day"
        date={new Date(2026, 6, 15)}
        events={call}
        timeZone="Asia/Kolkata"
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(getByLabelText(/Call, 11:30 to 13:30/)).toBeTruthy();
  });
});
