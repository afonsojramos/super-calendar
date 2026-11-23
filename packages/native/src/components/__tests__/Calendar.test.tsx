import { vi } from "vitest";
import { LegendList } from "@legendapp/list/react-native";
import { act, fireEvent } from "@testing-library/react-native";
import { createRef } from "react";
import { eventsInTimeZone, type CalendarHandle } from "@super-calendar/core";
import { RefreshControl } from "react-native";
import { render } from "../../../../../tests/support/native-time-grid";
import type { CalendarEvent } from "../../types";

// The real LegendList can't lay out in the test renderer (no measured dimensions). This
// stand-in renders the active page through `renderItem` so page content mounts.
vi.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: vi.fn((props: any) => {
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
  const events: CalendarEvent[] = [
    { title: "Standup", start: new Date(2026, 0, 6, 9, 0), end: new Date(2026, 0, 6, 10, 0) },
  ];

  it("exposes move/resize actions on a draggable event and reschedules via them", async () => {
    const onDragEvent = vi.fn();
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
    const listProps = vi.mocked(LegendList).mock.calls.at(-1)?.[0];
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
    // The year's scroll view tracks its offset with a scroll throttle.
    const scrollers = container.queryAll((node) => node.props.scrollEventThrottle === 16);
    expect(scrollers.some((node) => node.props.refreshControl === control)).toBe(true);
  });
});

describe("Calendar ref", () => {
  it("forwards scrollToTime to the time grid, and is a no-op off the grid", async () => {
    (globalThis as { __scrollToCalls?: unknown[] }).__scrollToCalls = [];
    const ref = createRef<CalendarHandle>();
    const calendar = (mode: "week" | "month") => (
      <Calendar
        ref={ref}
        mode={mode}
        date={new Date(2026, 6, 15)}
        events={[]}
        hourHeight={48}
        onChangeDate={noop}
        onPressEvent={noop}
      />
    );
    const { rerender } = await render(calendar("week"));
    await act(() => ref.current!.scrollToTime(9 * 60, { animated: false }));
    expect((globalThis as { __scrollToCalls?: unknown[] }).__scrollToCalls).toEqual([
      { y: 9 * 48, animated: false },
    ]);
    await rerender(calendar("month"));
    expect(() => ref.current!.scrollToTime(9 * 60)).not.toThrow();
  });
});

describe("Calendar today highlight", () => {
  // 22:00 UTC on 12 November is already the 13th in Tokyo, whatever zone the
  // tests run in.
  const now = new Date("2026-11-12T22:00:00Z");
  const props = {
    date: new Date(2026, 10, 12),
    events: [] as CalendarEvent[],
    onChangeDate: noop,
    onPressEvent: noop,
    now,
    timeZone: "Asia/Tokyo",
  };

  it.each(["month", "multiweek", "year", "week"] as const)(
    "marks the zone's current day as today in %s mode",
    async (mode) => {
      const { getAllByLabelText, queryAllByLabelText } = await render(
        <Calendar {...props} mode={mode} />,
      );
      expect(getAllByLabelText(/13 November.*, today/i)).toHaveLength(1);
      expect(queryAllByLabelText(/, today/i)).toHaveLength(1);
    },
  );

  it("marks the week header's today without the now indicator", async () => {
    const { getAllByLabelText, queryAllByLabelText } = await render(
      <Calendar {...props} mode="week" showNowIndicator={false} />,
    );
    expect(getAllByLabelText(/13 November.*, today/i)).toHaveLength(1);
    expect(queryAllByLabelText(/, today/i)).toHaveLength(1);
  });

  it("follows a pinned now without a timeZone", async () => {
    const { getAllByLabelText } = await render(
      <Calendar {...props} mode="month" timeZone={undefined} now={new Date(2026, 10, 20, 12)} />,
    );
    expect(getAllByLabelText(/20 November.*, today/i)).toHaveLength(1);
  });
});

describe("Calendar callbacks with a timeZone", () => {
  // Asia/Kolkata is UTC+5:30 all year: 06:00-08:00 UTC is 11:30-13:30 there.
  const meeting: CalendarEvent = {
    title: "Meeting",
    start: new Date(Date.UTC(2026, 6, 15, 6, 0)),
    end: new Date(Date.UTC(2026, 6, 15, 8, 0)),
  };
  const holiday: CalendarEvent = {
    title: "Holiday",
    allDay: true,
    start: new Date(2026, 6, 15),
    end: new Date(2026, 6, 16),
  };
  const props = {
    date: new Date(2026, 6, 15),
    timeZone: "Asia/Kolkata",
    onChangeDate: noop,
    onPressEvent: noop,
  };

  it("presses the consumer's own event", async () => {
    const onPressEvent = vi.fn();
    const onLongPressEvent = vi.fn();
    const { getByLabelText } = await render(
      <Calendar
        {...props}
        mode="day"
        events={[meeting]}
        onPressEvent={onPressEvent}
        onLongPressEvent={onLongPressEvent}
      />,
    );
    const el = getByLabelText(/Meeting, 11:30 to 13:30/);
    await fireEvent.press(el);
    expect(onPressEvent).toHaveBeenCalledTimes(1);
    expect(onPressEvent.mock.calls[0][0]).toBe(meeting);
    await fireEvent(el, "longPress");
    expect(onLongPressEvent.mock.calls[0][0]).toBe(meeting);
  });

  it("leaves events the consumer zoned themselves untouched without a timeZone", async () => {
    const [zoned] = eventsInTimeZone([meeting], "Asia/Kolkata");
    const onPressEvent = vi.fn();
    const { getByLabelText } = await render(
      <Calendar
        {...props}
        timeZone={undefined}
        mode="day"
        events={[zoned]}
        onPressEvent={onPressEvent}
      />,
    );
    await fireEvent.press(getByLabelText(/Meeting, 11:30 to 13:30/));
    expect(onPressEvent.mock.calls[0][0]).toBe(zoned);
  });

  it("reports a move and a resize as real instants on the consumer's event", async () => {
    const onDragEvent = vi.fn();
    const { getByLabelText } = await render(
      <Calendar {...props} mode="day" events={[meeting]} onDragEvent={onDragEvent} />,
    );
    const el = getByLabelText(/Meeting, 11:30 to 13:30/);
    await fireEvent(el, "accessibilityAction", { nativeEvent: { actionName: "move-later" } });
    const [moved, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(moved).toBe(meeting);
    expect(start.toISOString()).toBe("2026-07-15T06:15:00.000Z");
    expect(end.toISOString()).toBe("2026-07-15T08:15:00.000Z");

    await fireEvent(el, "accessibilityAction", { nativeEvent: { actionName: "extend" } });
    const [, sameStart, later] = onDragEvent.mock.calls[1] as [CalendarEvent, Date, Date];
    // The untouched edge is the event's own start, not a round-tripped copy.
    expect(sameStart).toBe(meeting.start);
    expect(later.toISOString()).toBe("2026-07-15T08:15:00.000Z");
  });

  it("repeats a recurring event on the zone's clock across its DST change", async () => {
    // 09:00 in New York from 30 October; clocks there go back on 1 November.
    const standup: CalendarEvent = {
      title: "Standup",
      start: new Date("2026-10-30T13:00:00Z"),
      end: new Date("2026-10-30T14:00:00Z"),
      recurrence: { freq: "daily" },
    };
    const onPressEvent = vi.fn();
    const { getByLabelText } = await render(
      <Calendar
        {...props}
        mode="day"
        date={new Date(2026, 10, 2)}
        timeZone="America/New_York"
        events={[standup]}
        onPressEvent={onPressEvent}
      />,
    );
    await fireEvent.press(getByLabelText(/Standup, 09:00 to 10:00/));
    expect(onPressEvent.mock.calls[0][0].start.toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("keeps an all-day event on its own day and presses the consumer's event", async () => {
    const onPressEvent = vi.fn();
    const { getAllByText } = await render(
      <Calendar {...props} mode="week" events={[holiday]} onPressEvent={onPressEvent} />,
    );
    const chips = getAllByText("Holiday");
    expect(chips).toHaveLength(1);
    await fireEvent.press(chips[0]);
    expect(onPressEvent.mock.calls[0][0]).toBe(holiday);
  });
});
