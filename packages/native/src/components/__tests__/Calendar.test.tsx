import { LegendList } from "@legendapp/list/react-native";
import { RefreshControl } from "react-native";
import { render } from "./renderGrid";
import type { CalendarEvent } from "../../types";

// The real LegendList can't lay out under Jest (no measured dimensions). This
// stand-in renders the active page through `renderItem` so page content mounts.
jest.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: jest.fn((props: any) => {
    const index = props.initialScrollIndex ?? 0;
    const item = props.data?.[index];
    return item === undefined ? null : props.renderItem({ item, index });
  }),
}));

import { Calendar } from "../Calendar";

const noop = () => {};

describe("Calendar recurrence + timeZone", () => {
  it("auto-expands a recurring event so a later occurrence shows on its day", async () => {
    const daily: CalendarEvent[] = [
      {
        title: "Daily",
        start: new Date(2026, 6, 15, 9, 0), // Wed 15 Jul 2026
        end: new Date(2026, 6, 15, 10, 0),
        recurrence: { freq: "daily" },
      },
    ];
    // View three days on: the occurrence only exists via auto-expansion.
    const { getByLabelText } = await render(
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

  it("renders events in the given IANA time zone", async () => {
    // Absolute instant so the shift is device-tz-independent: 06:00–08:00 UTC is
    // 11:30–13:30 in Asia/Kolkata (UTC+5:30, no DST).
    const call: CalendarEvent[] = [
      {
        title: "Call",
        start: new Date(Date.UTC(2026, 6, 15, 6, 0)),
        end: new Date(Date.UTC(2026, 6, 15, 8, 0)),
      },
    ];
    const { getByLabelText } = await render(
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

  it("exposes move/resize actions on a draggable event and reschedules via them", async () => {
    const onDragEvent = jest.fn();
    const { getByLabelText } = await render(
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
      "move-next-page",
      "move-previous-page",
    ]);

    // "Move later" shifts both edges by one snap step, preserving the duration.
    await fireEvent(el, "accessibilityAction", { nativeEvent: { actionName: "move-later" } });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getTime()).toBeGreaterThan(new Date(2026, 0, 6, 9, 0).getTime());
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000);

    // "Extend" grows the end only, so the event gets longer.
    await fireEvent(el, "accessibilityAction", { nativeEvent: { actionName: "extend" } });
    const [, extStart, extEnd] = onDragEvent.mock.calls[1] as [CalendarEvent, Date, Date];
    expect(extStart.getTime()).toBe(new Date(2026, 0, 6, 9, 0).getTime());
    expect(extEnd.getTime()).toBeGreaterThan(new Date(2026, 0, 6, 10, 0).getTime());
  });

  it("omits the actions on a non-draggable event", async () => {
    const { getByLabelText } = await render(
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
  it("forwards classNames to the month view's slots", async () => {
    const { container } = await render(
      <Calendar
        mode="month"
        date={new Date(2026, 5, 15)}
        events={[]}
        classNames={{ weekday: "uppercase text-indigo-400" }}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    // Each of the seven weekday labels forwards the class to its host element.
    expect(
      container.queryAll((node) => node.props.className === "uppercase text-indigo-400").length,
    ).toBeGreaterThanOrEqual(7);
  });

  it("forwards classNames to the agenda's slots in schedule mode", async () => {
    const { container } = await render(
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
    expect(
      container.queryAll((node) => node.props.className === "text-lg font-bold").length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("Calendar refreshControl", () => {
  const standup: CalendarEvent = {
    title: "Standup",
    start: new Date(2026, 0, 6, 9, 0),
    end: new Date(2026, 0, 6, 9, 30),
  };
  const control = <RefreshControl refreshing={false} onRefresh={noop} />;

  it("hands the control to the schedule list", async () => {
    await render(
      <Calendar
        mode="schedule"
        date={new Date(2026, 0, 6)}
        events={[standup]}
        refreshControl={control}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const listProps = jest.mocked(LegendList).mock.calls.at(-1)?.[0];
    expect(listProps?.recycleItems).toBe(false);
    expect(listProps?.refreshControl).toBe(control);
  });

  it("hands the control to the week grid's scroll view", async () => {
    const { container } = await render(
      <Calendar
        mode="week"
        date={new Date(2026, 0, 6)}
        events={[standup]}
        refreshControl={control}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    // The grid's vertical scroll view is the one with a scroll throttle.
    const scrollers = container.queryAll((node) => node.props.scrollEventThrottle === 16);
    expect(scrollers.some((node) => node.props.refreshControl === control)).toBe(true);
  });

  it("hands the control to the year view's scroll view", async () => {
    const { container } = await render(
      <Calendar
        mode="year"
        date={new Date(2026, 0, 6)}
        events={[standup]}
        refreshControl={control}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const scrollers = container.queryAll((node) => node.type === "RCTScrollView");
    expect(scrollers.some((node) => node.props.refreshControl === control)).toBe(true);
  });
});
