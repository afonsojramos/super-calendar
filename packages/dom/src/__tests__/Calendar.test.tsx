import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";

// Legend List (used by the schedule agenda) needs measured layout jsdom can't
// provide; render every row synchronously so schedule mode is testable.
jest.mock("@legendapp/list/react", () => ({
  __esModule: true,
  LegendList: (props: {
    data?: unknown[];
    renderItem: (arg: { item: unknown; index: number }) => unknown;
  }) => (props.data ?? []).map((item, index) => props.renderItem({ item, index })),
}));

import { Calendar } from "../Calendar";

const date = new Date(2026, 6, 15);
// A 2-hour event: tall enough that the time grid keeps its time label visible.
const events: CalendarEvent[] = [
  { title: "Standup", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 11) },
];

describe("dom Calendar", () => {
  it("renders a month grid in month mode", () => {
    const { getByText, queryByText } = render(
      <Calendar mode="month" date={date} events={events} weekStartsOn={1} />,
    );
    expect(getByText("July 2026")).toBeTruthy(); // month title (MonthView)
    expect(getByText("Standup")).toBeTruthy(); // chip
    expect(queryByText("09:00 - 11:00")).toBeNull(); // no time-grid label in month mode
  });

  it("renders a time grid in week mode", () => {
    const { getByText } = render(
      <Calendar mode="week" date={date} events={events} weekStartsOn={1} hourHeight={48} />,
    );
    expect(getByText("Standup")).toBeTruthy();
    expect(getByText("09:00 - 11:00")).toBeTruthy(); // time-grid label
  });

  it("defaults to the week time grid", () => {
    const { getByText } = render(<Calendar date={date} events={events} hourHeight={48} />);
    expect(getByText("09:00 - 11:00")).toBeTruthy();
  });

  it("forwards per-slot classNames to the active view", () => {
    // Month mode → MonthView's `title` slot.
    const month = render(
      <Calendar mode="month" date={date} weekStartsOn={1} classNames={{ title: "text-center" }} />,
    );
    expect((month.getByText("July 2026") as HTMLElement).className).toBe("text-center");

    // Week mode → TimeGrid's `hourLabel` slot.
    const week = render(
      <Calendar mode="week" date={date} weekStartsOn={1} classNames={{ hourLabel: "text-xs" }} />,
    );
    const label = week.container.querySelector('[data-slot="hourLabel"]') as HTMLElement;
    expect(label.className).toBe("text-xs");
  });

  describe("keyboard paging via onChangeDate", () => {
    it("pages by the view span with PageDown / PageUp in a time-grid mode", () => {
      const onChangeDate = jest.fn();
      const { container } = render(
        <Calendar
          mode="week"
          date={date}
          weekStartsOn={1}
          onChangeDate={onChangeDate}
          hourHeight={48}
        />,
      );
      // A keydown from the focused grid bubbles to the paging wrapper.
      fireEvent.keyDown(container.firstElementChild!, { key: "PageDown" });
      expect((onChangeDate.mock.calls[0][0] as Date).getDate()).toBe(22); // +1 week from 15 Jul
      fireEvent.keyDown(container.firstElementChild!, { key: "PageUp" });
      expect((onChangeDate.mock.calls[1][0] as Date).getDate()).toBe(8); // −1 week
    });

    it("pages by a month in month mode", () => {
      const onChangeDate = jest.fn();
      const { container } = render(
        <Calendar mode="month" date={date} weekStartsOn={1} onChangeDate={onChangeDate} />,
      );
      fireEvent.keyDown(container.firstElementChild!, { key: "PageDown" });
      expect((onChangeDate.mock.calls[0][0] as Date).getMonth()).toBe(7); // Jul → Aug
    });

    it("ignores the paging keys when onChangeDate is not provided", () => {
      const onChangeDate = jest.fn();
      const { container } = render(
        <Calendar mode="week" date={date} weekStartsOn={1} hourHeight={48} />,
      );
      fireEvent.keyDown(container.firstElementChild!, { key: "PageDown" });
      expect(onChangeDate).not.toHaveBeenCalled();
    });
  });

  describe("recurrence + timeZone", () => {
    const daily: CalendarEvent[] = [
      {
        title: "Daily",
        start: new Date(2026, 6, 13, 9), // Mon 13 Jul 2026
        end: new Date(2026, 6, 13, 10),
        recurrence: { freq: "daily" },
      },
    ];

    it("auto-expands a recurring event across the visible week", () => {
      const { getAllByText } = render(
        <Calendar mode="week" date={date} events={daily} weekStartsOn={1} hourHeight={48} />,
      );
      // One occurrence per day across the Mon–Sun week.
      expect(getAllByText("Daily")).toHaveLength(7);
    });

    it("auto-expands a recurring event across the visible month grid", () => {
      const { getAllByText } = render(
        <Calendar mode="month" date={date} events={daily} weekStartsOn={1} />,
      );
      // A daily rule fills the grid; far more than the single un-expanded seed
      // (the exact count depends on MonthView's per-cell "+N more" cap).
      expect(getAllByText("Daily").length).toBeGreaterThan(10);
    });

    it("auto-expands recurring events in schedule mode over a forward window", () => {
      const { getAllByText } = render(<Calendar mode="schedule" date={date} events={daily} />);
      // A daily rule fills the ~3-month agenda look-ahead, not a single stray row.
      expect(getAllByText("Daily").length).toBeGreaterThan(30);
    });

    it("widens the expansion window so a time-zone shift doesn't drop an edge day", () => {
      // A daily 22:00 event shifted +5:30 into Asia/Kolkata lands each occurrence on
      // the next calendar day; without widening, the first visible column loses its
      // event (its source day sits just outside the un-widened range).
      const late: CalendarEvent[] = [
        {
          title: "Late",
          start: new Date(2026, 6, 1, 22), // starts well before the visible week
          end: new Date(2026, 6, 1, 23),
          recurrence: { freq: "daily" },
        },
      ];
      const { getAllByText } = render(
        <Calendar
          mode="week"
          date={date}
          events={late}
          weekStartsOn={1}
          timeZone="Asia/Kolkata"
          hourHeight={48}
        />,
      );
      // All seven visible days keep their occurrence.
      expect(getAllByText("Late")).toHaveLength(7);
    });

    it("renders events in the given IANA time zone", () => {
      // Authored as an absolute instant so the shift is device-tz-independent.
      // 06:00–08:00 UTC in Asia/Kolkata (UTC+5:30, no DST) is 11:30–13:30.
      const inst: CalendarEvent[] = [
        {
          title: "Call",
          start: new Date(Date.UTC(2026, 6, 15, 6, 0)),
          end: new Date(Date.UTC(2026, 6, 15, 8, 0)),
        },
      ];
      const { getByText } = render(
        <Calendar
          mode="day"
          date={new Date(2026, 6, 15)}
          events={inst}
          timeZone="Asia/Kolkata"
          hourHeight={48}
        />,
      );
      expect(getByText("11:30 - 13:30")).toBeTruthy();
    });
  });
});
