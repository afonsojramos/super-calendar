import { render } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import type { CalendarEvent } from "../../types";

// Capture the props handed to the virtualized list, and render only the active
// page through `renderItem`. The real LegendList can't lay out under Jest (no
// measured dimensions), so it never mounts page content; this stand-in does,
// while still exposing the props we assert on.
const lastListProps = () => (globalThis as { __listProps?: Record<string, unknown> }).__listProps;
jest.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: (props: any) => {
    (globalThis as any).__listProps = props;
    const index = props.initialScrollIndex ?? 0;
    const item = props.data?.[index];
    return item === undefined ? null : props.renderItem({ item, index });
  },
}));

import { Calendar } from "../Calendar";
import { DefaultEvent } from "../DefaultEvent";
import { TimeGrid } from "../TimeGrid";

type WithId = { id: string };
const event: CalendarEvent<WithId> = {
  id: "1",
  start: new Date(2026, 0, 6, 9, 0, 0),
  end: new Date(2026, 0, 6, 10, 0, 0),
  title: "Standup",
};

const noop = () => {};

describe("TimeGrid event updates", () => {
  // Pages are virtualized by date, so a list item only repaints when its key,
  // data, or extraData changes. A moved event changes none of those — so without
  // feeding `events` to the list as extraData, a committed drag/menu move leaves
  // the stale position on screen (the box only appears to move until the next
  // grab snaps it back). Guard the wiring that makes external updates repaint.
  it("feeds the current events to the list as extraData", () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const events = [event];
    const { rerender, getByLabelText, queryByLabelText } = render(
      <Calendar mode="day" date={date} events={events} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(events);
    expect(getByLabelText(/Standup, 09:00 to 10:00/)).toBeTruthy();

    const moved: CalendarEvent<WithId> = {
      ...event,
      start: new Date(2026, 0, 6, 11, 0, 0),
      end: new Date(2026, 0, 6, 12, 0, 0),
    };
    const movedEvents = [moved];
    rerender(
      <Calendar
        mode="day"
        date={date}
        events={movedEvents}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );

    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(movedEvents);
    expect(getByLabelText(/Standup, 11:00 to 12:00/)).toBeTruthy();
    expect(queryByLabelText(/Standup, 09:00 to 10:00/)).toBeNull();
  });
});

describe("TimeGrid all-day lane", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);
  const allDayEvent: CalendarEvent<WithId> = {
    id: "h1",
    start: new Date(2026, 0, 6),
    end: new Date(2026, 0, 7),
    title: "Holiday",
    allDay: true,
  };

  it("renders the all-day lane by default", () => {
    const { getByText } = render(
      <Calendar
        mode="day"
        date={date}
        events={[allDayEvent]}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(getByText("Holiday")).toBeTruthy();
  });

  it("hides the lane (and its events) when showAllDayEventCell is false", () => {
    const { queryByText } = render(
      <Calendar
        mode="day"
        date={date}
        events={[allDayEvent]}
        showAllDayEventCell={false}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(queryByText("Holiday")).toBeNull();
  });
});

describe("TimeGrid business hours", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);

  it("shades the closed hours around the open window (two bands)", () => {
    const { getAllByTestId } = render(
      <Calendar
        mode="day"
        date={date}
        events={[]}
        businessHours={() => ({ start: 9, end: 17 })}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    // Closed before 09:00 and after 17:00.
    expect(getAllByTestId("business-hours-shade", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("shades the whole day when closed (null)", () => {
    const { getAllByTestId } = render(
      <Calendar
        mode="day"
        date={date}
        events={[]}
        businessHours={() => null}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(getAllByTestId("business-hours-shade", { includeHiddenElements: true })).toHaveLength(1);
  });

  it("shades nothing without a businessHours callback", () => {
    const { queryAllByTestId } = render(
      <Calendar mode="day" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect(queryAllByTestId("business-hours-shade", { includeHiddenElements: true })).toHaveLength(
      0,
    );
  });

  it("hands each closed band to renderBusinessHours and drops the themed tint", () => {
    const { getAllByTestId, getByText } = render(
      <Calendar
        mode="day"
        date={date}
        events={[]}
        businessHours={() => ({ start: 9, end: 17 })}
        renderBusinessHours={({ start, end }) => <Text>{`closed ${start}-${end}`}</Text>}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    // The bands before open and after close render the custom content...
    expect(getByText("closed 0-9", { includeHiddenElements: true })).toBeTruthy();
    expect(getByText("closed 17-24", { includeHiddenElements: true })).toBeTruthy();
    // ...and the built-in tint steps aside for it.
    for (const band of getAllByTestId("business-hours-shade", { includeHiddenElements: true })) {
      expect(StyleSheet.flatten(band.props.style).backgroundColor).toBeUndefined();
    }
  });

  it("uses eventAccessibilityLabel to override a timed event's label", () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const { getByLabelText, queryByLabelText } = render(
      <Calendar
        mode="day"
        date={date}
        events={[event]}
        onChangeDate={noop}
        onPressEvent={noop}
        eventAccessibilityLabel={(e, ctx) => `Custom: ${e.title} (${ctx.mode})`}
      />,
    );
    expect(getByLabelText("Custom: Standup (day)")).toBeTruthy();
    expect(queryByLabelText(/Standup, 09:00 to 10:00/)).toBeNull();
  });
});

describe("TimeGrid column header", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0); // Tue 6 Jan 2026

  it("themes the header weekday, day number, and badge", () => {
    const { getByText, getAllByTestId } = render(
      <Calendar
        mode="week"
        date={date}
        events={[]}
        onChangeDate={noop}
        onPressEvent={noop}
        theme={{
          text: {
            dayNumber: { fontSize: 19 },
            columnHeaderWeekday: { fontSize: 12, color: "#101010" },
          },
          containers: { columnHeaderBadge: { width: 40, height: 40 } },
        }}
      />,
    );
    const { StyleSheet } = require("react-native");
    const number = getByText("6");
    expect(StyleSheet.flatten(number.props.style).fontSize).toBe(19);
    const weekday = getByText("Tue");
    const weekdayStyle = StyleSheet.flatten(weekday.props.style);
    expect(weekdayStyle.fontSize).toBe(12);
    // A themed colour wins over the built-in muted colour.
    expect(weekdayStyle.color).toBe("#101010");
    const [badge] = getAllByTestId("column-header-badge");
    expect(StyleSheet.flatten(badge.props.style).width).toBe(40);
  });

  it("announces the full date on a pressable header and fires onPressDateHeader", () => {
    const onPressDateHeader = jest.fn();
    const { getByLabelText } = render(
      <Calendar
        mode="week"
        date={date}
        events={[]}
        onChangeDate={noop}
        onPressEvent={noop}
        onPressDateHeader={onPressDateHeader}
      />,
    );
    const { fireEvent } = require("@testing-library/react-native");
    fireEvent.press(getByLabelText("Tuesday 6 January"));
    expect(onPressDateHeader).toHaveBeenCalledTimes(1);
    expect((onPressDateHeader.mock.calls[0][0] as Date).getDate()).toBe(6);
  });

  it("exposes each day column as a labelled header when not interactive", () => {
    const { getByRole } = render(
      <Calendar mode="week" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    // A screen reader still perceives the column's date (previously the static
    // header let only the terse "Tue"/"6" child labels speak).
    expect(getByRole("header", { name: "Tuesday 6 January" })).toBeTruthy();
  });
});

describe("TimeGrid slot styling", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);
  const gridProps = () => ({
    mode: "day" as const,
    date,
    events: [event],
    cellHeight: { value: 48 } as never,
    weekStartsOn: 1 as const,
    renderEvent: DefaultEvent,
    keyExtractor: (_e: CalendarEvent<WithId>, i: number) => String(i),
    onChangeDate: noop,
    onPressEvent: noop,
  });

  it("passes slot classes to the header and hour labels, dropping their themed styles", () => {
    const { UNSAFE_getAllByProps, getAllByText } = render(
      <TimeGrid
        {...gridProps()}
        classNames={{ hourLabel: "text-slate-400", columnHeaderWeekday: "uppercase" }}
      />,
    );
    const hourLabel = getAllByText("06:00")[0];
    expect(hourLabel.props.className).toBe("text-slate-400");
    // Themed muted colour dropped; structural width kept.
    const flat = StyleSheet.flatten(hourLabel.props.style) as Record<string, unknown>;
    expect(flat.color).toBeUndefined();
    expect(flat.width).toBeGreaterThan(0);
    expect(UNSAFE_getAllByProps({ className: "uppercase" }).length).toBeGreaterThan(0);
  });

  it("merges per-slot style overrides over the themed look", () => {
    const { getAllByText } = render(
      <TimeGrid {...gridProps()} styles={{ hourLabel: { color: "tomato" } }} />,
    );
    const hourLabel = getAllByText("06:00")[0];
    expect(hourLabel.props.className).toBeUndefined();
    const flat = StyleSheet.flatten(hourLabel.props.style) as Record<string, unknown>;
    expect(flat.color).toBe("tomato");
  });
});
