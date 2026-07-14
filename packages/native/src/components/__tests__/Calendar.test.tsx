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

describe("Calendar screen-reader event actions", () => {
  const { fireEvent } = require("@testing-library/react-native");
  const events: CalendarEvent[] = [
    { title: "Standup", start: new Date(2026, 0, 6, 9, 0), end: new Date(2026, 0, 6, 10, 0) },
  ];

  it("exposes move/resize actions on a draggable event and reschedules via them", () => {
    const onDragEvent = jest.fn();
    const { getByLabelText } = render(
      <Calendar
        mode="day"
        date={new Date(2026, 0, 6)}
        events={events}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />,
    );
    const el = getByLabelText(/Standup, 09:00 to 10:00/);
    expect((el.props.accessibilityActions ?? []).map((a: { name: string }) => a.name)).toEqual([
      "move-later",
      "move-earlier",
      "extend",
      "shrink",
    ]);

    // "Move later" shifts both edges by one snap step, preserving the duration.
    fireEvent(el, "accessibilityAction", { nativeEvent: { actionName: "move-later" } });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getTime()).toBeGreaterThan(new Date(2026, 0, 6, 9, 0).getTime());
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);

    // "Extend" grows the end only, so the event gets longer.
    fireEvent(el, "accessibilityAction", { nativeEvent: { actionName: "extend" } });
    const [, extStart, extEnd] = onDragEvent.mock.calls[1] as [CalendarEvent, Date, Date];
    expect(extStart.getTime()).toBe(new Date(2026, 0, 6, 9, 0).getTime());
    expect(extEnd.getTime()).toBeGreaterThan(new Date(2026, 0, 6, 10, 0).getTime());
  });

  it("omits the actions on a non-draggable event", () => {
    const { getByLabelText } = render(
      <Calendar
        mode="day"
        date={new Date(2026, 0, 6)}
        events={events}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(getByLabelText(/Standup, 09:00 to 10:00/).props.accessibilityActions).toBeUndefined();
  });
});

describe("Calendar slot styling", () => {
  it("forwards classNames to the month view's slots", () => {
    const { UNSAFE_getAllByProps } = render(
      <Calendar
        mode="month"
        date={new Date(2026, 5, 15)}
        events={[]}
        classNames={{ weekday: "uppercase text-indigo-400" }}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    // Both the composite and host element match per label; 7 weekday labels.
    expect(
      UNSAFE_getAllByProps({ className: "uppercase text-indigo-400" }).length,
    ).toBeGreaterThanOrEqual(7);
  });

  it("forwards classNames to the agenda's slots in schedule mode", () => {
    const { UNSAFE_getAllByProps } = render(
      <Calendar
        mode="schedule"
        date={new Date(2026, 0, 6)}
        events={[
          {
            title: "Standup",
            start: new Date(2026, 0, 6, 9, 0),
            end: new Date(2026, 0, 6, 9, 30),
          },
        ]}
        classNames={{ dayHeader: "text-lg font-bold" }}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(UNSAFE_getAllByProps({ className: "text-lg font-bold" }).length).toBeGreaterThanOrEqual(
      1,
    );
  });
});
