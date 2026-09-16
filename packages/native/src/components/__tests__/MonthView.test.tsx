import { act, fireEvent, render, within } from "@testing-library/react-native";
import { StyleSheet, Text, type ViewStyle } from "react-native";
import { CalendarThemeProvider, defaultTheme, mergeTheme } from "../../theme";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";
import { MonthView } from "../MonthView";

const baseProps = {
  date: new Date(2026, 5, 15), // June 2026
  events: [] as CalendarEvent[],
  weekStartsOn: 0 as const,
  renderEvent: DefaultEvent,
  keyExtractor: (_event: CalendarEvent, index: number) => String(index),
  onPressEvent: () => {},
};

const backgroundColorOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as ViewStyle)?.backgroundColor;

// The absolutely-positioned wrapper a month event bar is drawn in, found from a
// node inside the chip. The chip's own box sets an opacity of its own, so the
// wrapper is identified by its positioning, not by carrying an opacity.
const barWrapperOf = (node: { parent: unknown; props: { style?: unknown } }) => {
  let current: typeof node | null = node;
  while (current) {
    const style = StyleSheet.flatten(current.props.style as ViewStyle);
    if (style?.position === "absolute") return style;
    current = current.parent as typeof node | null;
  }
  throw new Error("no absolutely-positioned bar wrapper above this node");
};

describe("MonthView selection", () => {
  it("announces a single selected day", async () => {
    const { getByLabelText } = await render(
      <MonthView {...baseProps} selectedDates={[new Date(2026, 5, 15)]} />,
    );
    expect(getByLabelText(/15 June 2026, selected/)).toBeTruthy();
  });

  it("marks both range endpoints as selected and renders a band behind the interior", async () => {
    const range = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };
    const { getByLabelText } = await render(<MonthView {...baseProps} selectedRange={range} />);

    expect(getByLabelText(/10 June 2026, selected/)).toBeTruthy();
    expect(getByLabelText(/14 June 2026, selected/)).toBeTruthy();

    // An interior day carries the range band (a child layer), not the badge.
    const interior = getByLabelText(/12 June 2026, 0 events/);
    const band = within(interior).getByTestId("month-range-band");
    expect(backgroundColorOf(band)).toBe(defaultTheme.colors.rangeBackground);
    expect(() => getByLabelText(/12 June 2026, selected/)).toThrow();
  });

  it("renders the band as a rounded pill by default and a full-cell fill when opted in", async () => {
    const range = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };
    const radiusOf = (n: { props: { style?: unknown } }) =>
      StyleSheet.flatten(n.props.style as ViewStyle)?.borderTopLeftRadius ?? 0;

    const pill = await render(<MonthView {...baseProps} selectedRange={range} />);
    const pillStart = within(pill.getByLabelText(/10 June 2026/)).getByTestId("month-range-band");
    expect(radiusOf(pillStart)).toBeGreaterThan(0); // rounded leading edge

    const fill = await render(
      <MonthView {...baseProps} selectedRange={range} fillCellOnSelection />,
    );
    const fillStart = within(fill.getByLabelText(/10 June 2026/)).getByTestId("month-range-band");
    expect(radiusOf(fillStart)).toBe(0); // square, fills the cell
  });

  it("leaves cells outside any selection unstyled by selection", async () => {
    const { getByLabelText } = await render(
      <MonthView {...baseProps} selectedDates={[new Date(2026, 5, 15)]} />,
    );
    const other = getByLabelText(/20 June 2026, 0 events/);
    expect(within(other).queryByTestId("month-range-band")).toBeNull();
  });
});

describe("MonthView grid", () => {
  const borderOf = (n: { props: { style?: unknown } }) =>
    StyleSheet.flatten(n.props.style as ViewStyle)?.borderTopWidth ?? 0;

  it("draws no day-cell grid for the events-free picker", async () => {
    const { getByLabelText } = await render(<MonthView {...baseProps} />); // events: []
    expect(borderOf(getByLabelText(/15 June 2026/))).toBe(0);
  });

  it("draws the day-cell grid when there are events (calendar)", async () => {
    const events: CalendarEvent[] = [
      { title: "X", start: new Date(2026, 5, 15, 9), end: new Date(2026, 5, 15, 10) },
    ];
    const { getByLabelText } = await render(<MonthView {...baseProps} events={events} />);
    expect(borderOf(getByLabelText(/15 June 2026/))).toBeGreaterThan(0);
  });
});

describe("MonthView weekend shading", () => {
  // Sat 20 June 2026 is a weekend day in the rendered month.
  it("tints weekend cells by default and drops the tint with highlightWeekends=false", async () => {
    const on = await render(<MonthView {...baseProps} />);
    expect(backgroundColorOf(on.getByLabelText(/Saturday, 20 June 2026/))).toBe(
      defaultTheme.colors.weekendBackground,
    );
    const off = await render(<MonthView {...baseProps} highlightWeekends={false} />);
    expect(backgroundColorOf(off.getByLabelText(/Saturday, 20 June 2026/))).toBeUndefined();
  });
});

describe("MonthView renderCustomDateForMonth", () => {
  it("replaces the default date badge with the custom renderer's output", async () => {
    const { getByText, queryByText } = await render(
      <MonthView
        {...baseProps}
        renderCustomDateForMonth={(day) => <Text>{`day-${day.getDate()}`}</Text>}
      />,
    );
    // The custom label renders for the current month's days.
    expect(getByText("day-15")).toBeTruthy();
    // The default bare day number is gone (replaced by the custom label).
    expect(queryByText("15")).toBeNull();
  });
});

describe("MonthView container theming", () => {
  const styleOf = (n: { props: { style?: unknown } }) =>
    StyleSheet.flatten(n.props.style as ViewStyle) ?? {};

  // Native components read the theme from context (as <Calendar> provides it).
  const withTheme = (containers: Parameters<typeof mergeTheme>[0]) => (
    <CalendarThemeProvider value={mergeTheme(containers)}>
      <MonthView {...baseProps} />
    </CalendarThemeProvider>
  );

  it("merges theme.containers.dayCell onto every day cell", async () => {
    const { getByLabelText } = await render(
      withTheme({ containers: { dayCell: { opacity: 0.42 } } }),
    );
    expect(styleOf(getByLabelText(/15 June 2026/)).opacity).toBe(0.42);
  });
});

describe("MonthView disabled days", () => {
  it("marks days outside the min/max range as unavailable", async () => {
    const { getByLabelText } = await render(
      <MonthView {...baseProps} minDate={new Date(2026, 5, 10)} maxDate={new Date(2026, 5, 20)} />,
    );
    expect(getByLabelText(/, 9 June 2026, unavailable/)).toBeTruthy();
    expect(getByLabelText(/, 21 June 2026, unavailable/)).toBeTruthy();
    // Inside the window stays available.
    expect(() => getByLabelText(/, 15 June 2026, unavailable/)).toThrow();
  });

  it("honours an isDateDisabled predicate", async () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = await render(
      <MonthView
        {...baseProps}
        isDateDisabled={(d) => d.getDate() === 12}
        onPressDay={onPressDay}
      />,
    );
    const disabled = getByLabelText(/, 12 June 2026, unavailable/);
    await fireEvent.press(disabled);
    expect(onPressDay).not.toHaveBeenCalled();
  });

  it("does not select a disabled day even if passed in selectedDates", async () => {
    const { getByLabelText } = await render(
      <MonthView
        {...baseProps}
        selectedDates={[new Date(2026, 5, 12)]}
        isDateDisabled={(d) => d.getDate() === 12}
      />,
    );
    expect(() => getByLabelText(/, 12 June 2026, selected/)).toThrow();
  });

  it("uses eventAccessibilityLabel to override an event chip's label", async () => {
    const events: CalendarEvent[] = [
      { title: "Standup", start: new Date(2026, 5, 15, 9, 0), end: new Date(2026, 5, 15, 9, 30) },
    ];
    const { getByLabelText } = await render(
      <MonthView
        {...baseProps}
        events={events}
        eventAccessibilityLabel={(event) => `Custom: ${event.title}`}
      />,
    );
    expect(getByLabelText("Custom: Standup")).toBeTruthy();
  });
});

describe("MonthView slot styling", () => {
  const flatten = (node: { props: { style?: unknown } }) =>
    StyleSheet.flatten(node.props.style as ViewStyle) as Record<string, unknown>;

  it("passes a slot class through and drops that slot's themed styles", async () => {
    const { getByText } = await render(
      <MonthView {...baseProps} classNames={{ title: "text-xl font-bold text-indigo-900" }} />,
    );
    const title = getByText("June 2026");
    expect(title.props.className).toBe("text-xl font-bold text-indigo-900");
    const flat = flatten(title);
    // Themed typography is dropped so the class owns the look...
    expect(flat.fontSize).toBeUndefined();
    expect(flat.color).toBeUndefined();
    // ...but the structural layout padding is kept.
    expect(flat.paddingTop).toBe(10);
  });

  it("keeps the themed look and merges per-slot style overrides last", async () => {
    const { getByText } = await render(
      <MonthView {...baseProps} styles={{ title: { color: "rebeccapurple" } }} />,
    );
    const title = getByText("June 2026");
    expect(title.props.className).toBeUndefined();
    const flat = flatten(title);
    expect(flat.color).toBe("rebeccapurple");
    expect(flat.fontSize).toBe(defaultTheme.text.monthTitle.fontSize);
  });

  it("keeps a consumer calendarCellStyle even when the day slot has a class", async () => {
    const { getByLabelText } = await render(
      <MonthView
        {...baseProps}
        classNames={{ day: "bg-slate-50" }}
        calendarCellStyle={() => ({ backgroundColor: "papayawhip" })}
      />,
    );
    const cell = getByLabelText(/15 June 2026/);
    expect(flatten(cell).backgroundColor).toBe("papayawhip");
  });

  it("classes a state-styled slot: the badge drops its today colors for the class", async () => {
    const { container } = await render(
      <MonthView
        {...baseProps}
        classNames={{ dayBadge: "rounded-full bg-indigo-600" }}
        activeDate={new Date(2026, 5, 15)}
      />,
    );
    // Every day badge carries the class; none keeps the themed active-day fill,
    // because a classed slot drops its themed styles.
    const badges = container.queryAll(
      (node) => node.props.className === "rounded-full bg-indigo-600",
    );
    expect(badges.length).toBeGreaterThan(27);
    for (const badge of badges) expect(flatten(badge).backgroundColor).toBeUndefined();
  });
});

describe("MonthView hiddenDays", () => {
  it("drops hidden weekdays from the grid and header", async () => {
    const { queryAllByText, queryByLabelText } = await render(
      <MonthView {...baseProps} hiddenDays={[0, 6]} />,
    );
    expect(queryAllByText("Sun")).toHaveLength(0);
    expect(queryAllByText("Sat")).toHaveLength(0);
    // 14 June 2026 is a Sunday: its cell is gone entirely.
    expect(queryByLabelText(/14 June 2026/)).toBeNull();
  });
});

describe("MonthView built-in more popover", () => {
  const manyEvents: CalendarEvent[] = Array.from({ length: 6 }, (_, i) => ({
    title: `Event ${i + 1}`,
    start: new Date(2026, 5, 15, 9 + i),
    end: new Date(2026, 5, 15, 10 + i),
  }));

  it("opens a popover listing the day's events when onPressMore is absent", async () => {
    const onPressEvent = jest.fn();
    const { getByText, getByRole } = await render(
      <MonthView
        {...baseProps}
        events={manyEvents}
        maxVisibleEventCount={2}
        onPressEvent={onPressEvent}
      />,
    );
    await fireEvent.press(getByText(/More/));
    expect(getByRole("header", { name: "Monday, 15 June 2026" })).toBeTruthy();
    await fireEvent.press(getByText("Event 6"));
    expect(onPressEvent).toHaveBeenCalledWith(expect.objectContaining({ title: "Event 6" }));
  });

  it("defers to a consumer onPressMore instead", async () => {
    const onPressMore = jest.fn();
    const { getByText, queryByRole } = await render(
      <MonthView
        {...baseProps}
        events={manyEvents}
        maxVisibleEventCount={2}
        onPressMore={onPressMore}
      />,
    );
    await fireEvent.press(getByText(/More/));
    expect(onPressMore).toHaveBeenCalledTimes(1);
    expect(queryByRole("header", { name: "Monday, 15 June 2026" })).toBeNull();
  });
});

describe("MonthView multi-day events", () => {
  it("draws a multi-day event as one spanning bar, not a chip per day", async () => {
    const span: CalendarEvent[] = [
      // Mon 15 -> covers 15 and 16 (end exclusive at midnight of the 17th).
      { title: "Trip", start: new Date(2026, 5, 15), end: new Date(2026, 5, 17) },
    ];
    const { getAllByText } = await render(<MonthView {...baseProps} events={span} />);
    // One bar spanning two days, not a chip repeated on each day.
    expect(getAllByText("Trip")).toHaveLength(1);
  });
});

describe("MonthView onPressCell", () => {
  it("fires with the tapped day at midnight, alongside onPressDay", async () => {
    const onPressCell = jest.fn();
    const onPressDay = jest.fn();
    const { getByLabelText } = await render(
      <MonthView {...baseProps} onPressCell={onPressCell} onPressDay={onPressDay} />,
    );
    await fireEvent.press(getByLabelText(/15 June 2026/));
    expect(onPressCell).toHaveBeenCalledWith(new Date(2026, 5, 15));
    expect(onPressDay).toHaveBeenCalledTimes(1);
  });

  it("fires on its own when only onPressCell is wired", async () => {
    const onPressCell = jest.fn();
    const { getByLabelText } = await render(<MonthView {...baseProps} onPressCell={onPressCell} />);
    await fireEvent.press(getByLabelText(/15 June 2026/));
    expect(onPressCell).toHaveBeenCalledWith(new Date(2026, 5, 15));
  });

  it("ignores a tap on a disabled day", async () => {
    const onPressCell = jest.fn();
    const { getByLabelText } = await render(
      <MonthView
        {...baseProps}
        isDateDisabled={(day) => day.getDate() === 15}
        onPressCell={onPressCell}
      />,
    );
    await fireEvent.press(getByLabelText(/15 June 2026/));
    expect(onPressCell).not.toHaveBeenCalled();
  });
});

describe("MonthView drag", () => {
  // June 2026 with weekStartsOn=0 renders five week rows starting Sun 31 May, so
  // at 700x600 each cell is 100 wide and 120 tall. Row 2 is Sun 14 - Sat 20 June.
  const GRID = { width: 700, height: 600 };
  const ROW_HEIGHT = GRID.height / 5;
  const COL_WIDTH = GRID.width / 7;
  // Vertically: inside the date badge is empty cell; just past it is the first
  // event lane, where a bar can be grabbed.
  const EMPTY_Y = 8;
  const LANE_Y = 32;
  // Column centre for a weekday, 0 = Sunday.
  const colX = (weekday: number) => weekday * COL_WIDTH + COL_WIDTH / 2;
  const rowY = (row: number, offset: number) => row * ROW_HEIGHT + offset;

  const standup: CalendarEvent = {
    title: "Standup",
    start: new Date(2026, 5, 15, 9, 30), // Mon 15 June
    end: new Date(2026, 5, 15, 10, 15),
  };

  // The pan the MonthView built for this render (the mock records every builder).
  const lastGesture = () => {
    const { __gestures } = require("react-native-gesture-handler");
    return __gestures[__gestures.length - 1];
  };

  const mount = async (ui: React.ReactElement) => {
    const view = await render(ui);
    // Test Renderer never lays out, so feed the grid its box by hand.
    await fireEvent(view.getByTestId("month-grid"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, ...GRID } },
    });
    return view;
  };

  // The gesture callbacks are invoked straight from the recording mock, outside
  // React's event system, so the preview state they set needs its own act().
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const { handlers } = lastGesture();
    await act(() => {
      handlers.onStart(from);
      handlers.onUpdate(to);
      handlers.onEnd({}, true);
    });
  };
  // Grab and move without releasing, so the in-flight preview can be inspected.
  const dragTo = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const { handlers } = lastGesture();
    await act(() => {
      handlers.onStart(from);
      handlers.onUpdate(to);
    });
  };

  it("mounts no gesture when neither drag handler is wired", async () => {
    const { __gestures } = require("react-native-gesture-handler");
    const before = __gestures.length;
    await mount(<MonthView {...baseProps} events={[standup]} />);
    expect(__gestures.length).toBe(before);
  });

  describe("to create", () => {
    it("fires onCreateEvent with the all-day span swept across empty cells", async () => {
      const onCreateEvent = jest.fn();
      await mount(<MonthView {...baseProps} events={[standup]} onCreateEvent={onCreateEvent} />);
      // Tue 16 June -> Thu 18 June, along the empty top of each cell.
      await drag({ x: colX(2), y: rowY(2, EMPTY_Y) }, { x: colX(4), y: rowY(2, EMPTY_Y) });

      expect(onCreateEvent).toHaveBeenCalledTimes(1);
      const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
      expect(start).toEqual(new Date(2026, 5, 16));
      // End is exclusive: midnight after the last swept day.
      expect(end).toEqual(new Date(2026, 5, 19));
    });

    it("commits a stationary hold as a single all-day event", async () => {
      const onCreateEvent = jest.fn();
      await mount(<MonthView {...baseProps} events={[standup]} onCreateEvent={onCreateEvent} />);
      const point = { x: colX(2), y: rowY(2, EMPTY_Y) };
      await drag(point, point);

      const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
      expect(start).toEqual(new Date(2026, 5, 16));
      expect(end).toEqual(new Date(2026, 5, 17));
    });

    it("sweeps backwards to the same ordered span", async () => {
      const onCreateEvent = jest.fn();
      await mount(<MonthView {...baseProps} events={[standup]} onCreateEvent={onCreateEvent} />);
      await drag({ x: colX(4), y: rowY(2, EMPTY_Y) }, { x: colX(2), y: rowY(2, EMPTY_Y) });

      const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
      expect(start).toEqual(new Date(2026, 5, 16));
      expect(end).toEqual(new Date(2026, 5, 19));
    });

    it("tints every day of the span while the sweep is in flight", async () => {
      const view = await mount(
        <MonthView {...baseProps} events={[standup]} onCreateEvent={() => {}} />,
      );
      await dragTo({ x: colX(2), y: rowY(2, EMPTY_Y) }, { x: colX(4), y: rowY(2, EMPTY_Y) });

      for (const day of [/16 June 2026/, /17 June 2026/, /18 June 2026/]) {
        expect(backgroundColorOf(view.getByLabelText(day))).toBe(
          defaultTheme.colors.rangeBackground,
        );
      }
      // The day just outside the sweep keeps its own background.
      expect(backgroundColorOf(view.getByLabelText(/19 June 2026/))).toBeUndefined();
    });

    it("does not start on a disabled day", async () => {
      const onCreateEvent = jest.fn();
      await mount(
        <MonthView
          {...baseProps}
          events={[standup]}
          isDateDisabled={(day) => day.getDate() === 16}
          onCreateEvent={onCreateEvent}
        />,
      );
      await drag({ x: colX(2), y: rowY(2, EMPTY_Y) }, { x: colX(4), y: rowY(2, EMPTY_Y) });
      expect(onCreateEvent).not.toHaveBeenCalled();
    });
  });

  describe("to select", () => {
    it("reports the swept span live, ordered, as the drag crosses days", async () => {
      const onSelectDrag = jest.fn();
      await mount(<MonthView {...baseProps} events={[standup]} onSelectDrag={onSelectDrag} />);
      const { handlers } = lastGesture();
      await act(() => {
        handlers.onStart({ x: colX(2), y: rowY(2, EMPTY_Y) }); // Tue 16 June
        handlers.onUpdate({ x: colX(4), y: rowY(2, EMPTY_Y) }); // Thu 18 June
      });
      // Inclusive endpoints, unlike onCreateEvent's exclusive end.
      expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 5, 16), new Date(2026, 5, 18));
      await act(() => {
        handlers.onUpdate({ x: colX(0), y: rowY(2, EMPTY_Y) }); // back to Sun 14 June
      });
      expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 5, 14), new Date(2026, 5, 16));
    });

    it("enables the sweep on its own, without onCreateEvent", async () => {
      const onSelectDrag = jest.fn();
      const { __gestures } = require("react-native-gesture-handler");
      const before = __gestures.length;
      await mount(<MonthView {...baseProps} events={[standup]} onSelectDrag={onSelectDrag} />);
      expect(__gestures.length).toBeGreaterThan(before);
      await drag({ x: colX(2), y: rowY(2, EMPTY_Y) }, { x: colX(3), y: rowY(2, EMPTY_Y) });
      expect(onSelectDrag).toHaveBeenCalled();
    });

    it("stays quiet while an event is being carried to another day", async () => {
      const onSelectDrag = jest.fn();
      await mount(
        <MonthView
          {...baseProps}
          events={[standup]}
          onSelectDrag={onSelectDrag}
          onDragEvent={jest.fn()}
        />,
      );
      // Grab the bar itself (the lane row), not the empty space above it.
      await drag({ x: colX(1), y: rowY(2, LANE_Y) }, { x: colX(3), y: rowY(2, LANE_Y) });
      expect(onSelectDrag).not.toHaveBeenCalled();
    });
  });

  describe("to reschedule", () => {
    it("fires onDragEvent with both ends shifted by the days dragged", async () => {
      const onDragEvent = jest.fn();
      const onDragStart = jest.fn();
      await mount(
        <MonthView
          {...baseProps}
          events={[standup]}
          onDragEvent={onDragEvent}
          onDragStart={onDragStart}
        />,
      );
      // Grab the bar on Mon 15 June and drop it on Thu 18 June.
      await drag({ x: colX(1), y: rowY(2, LANE_Y) }, { x: colX(4), y: rowY(2, LANE_Y) });

      expect(onDragStart).toHaveBeenCalledWith(standup);
      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const [event, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
      expect(event).toBe(standup);
      // The time of day and the 45-minute duration survive the move.
      expect(start).toEqual(new Date(2026, 5, 18, 9, 30));
      expect(end).toEqual(new Date(2026, 5, 18, 10, 15));
    });

    it("carries an event into another week row", async () => {
      const onDragEvent = jest.fn();
      await mount(<MonthView {...baseProps} events={[standup]} onDragEvent={onDragEvent} />);
      // Row 3 is Sun 21 - Sat 27 June; the same weekday there is Mon 22 June.
      await drag({ x: colX(1), y: rowY(2, LANE_Y) }, { x: colX(1), y: rowY(3, LANE_Y) });

      const [, start] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
      expect(start).toEqual(new Date(2026, 5, 22, 9, 30));
    });

    it("commits nothing when the drop lands back on the day it started", async () => {
      const onDragEvent = jest.fn();
      await mount(<MonthView {...baseProps} events={[standup]} onDragEvent={onDragEvent} />);
      const point = { x: colX(1), y: rowY(2, LANE_Y) };
      await drag(point, point);
      expect(onDragEvent).not.toHaveBeenCalled();
    });

    it("does not pick up an event locked with draggable: false", async () => {
      const onDragEvent = jest.fn();
      await mount(
        <MonthView
          {...baseProps}
          events={[{ ...standup, draggable: false }]}
          onDragEvent={onDragEvent}
        />,
      );
      await drag({ x: colX(1), y: rowY(2, LANE_Y) }, { x: colX(4), y: rowY(2, LANE_Y) });
      expect(onDragEvent).not.toHaveBeenCalled();
    });

    it("honours eventStartEditable={false} as the grid-wide lock", async () => {
      const onDragEvent = jest.fn();
      await mount(
        <MonthView
          {...baseProps}
          events={[standup]}
          eventStartEditable={false}
          onDragEvent={onDragEvent}
        />,
      );
      await drag({ x: colX(1), y: rowY(2, LANE_Y) }, { x: colX(4), y: rowY(2, LANE_Y) });
      expect(onDragEvent).not.toHaveBeenCalled();
    });

    it("rejects a drop onto an overlapping event when eventOverlap is false", async () => {
      const onDragEvent = jest.fn();
      const clash: CalendarEvent = {
        title: "Clash",
        start: new Date(2026, 5, 18, 9, 30),
        end: new Date(2026, 5, 18, 10, 15),
      };
      await mount(
        <MonthView
          {...baseProps}
          events={[standup, clash]}
          eventOverlap={false}
          onDragEvent={onDragEvent}
        />,
      );
      await drag({ x: colX(1), y: rowY(2, LANE_Y) }, { x: colX(4), y: rowY(2, LANE_Y) });
      expect(onDragEvent).not.toHaveBeenCalled();
    });

    it("fades the carried bar and tints only the day it would land on", async () => {
      const view = await mount(
        <MonthView {...baseProps} events={[standup]} onDragEvent={() => {}} />,
      );
      await dragTo({ x: colX(1), y: rowY(2, LANE_Y) }, { x: colX(4), y: rowY(2, LANE_Y) });

      expect(backgroundColorOf(view.getByLabelText(/18 June 2026/))).toBe(
        defaultTheme.colors.rangeBackground,
      );
      // Not the day it came from, and not an untouched day in between.
      expect(backgroundColorOf(view.getByLabelText(/15 June 2026/))).toBeUndefined();
      expect(backgroundColorOf(view.getByLabelText(/17 June 2026/))).toBeUndefined();
      const bar = barWrapperOf(view.getByText("Standup"));
      expect(bar.opacity).toBeLessThan(1);
      // Non-interactive mid-drag, so the sweep reaches the cells underneath.
      expect(bar.pointerEvents).toBe("none");
    });

    it("sweeps a new span instead when the grab misses every bar", async () => {
      const onCreateEvent = jest.fn();
      const onDragEvent = jest.fn();
      await mount(
        <MonthView
          {...baseProps}
          events={[standup]}
          onCreateEvent={onCreateEvent}
          onDragEvent={onDragEvent}
        />,
      );
      // Same lane row, but a column the bar does not cover.
      await drag({ x: colX(3), y: rowY(2, LANE_Y) }, { x: colX(5), y: rowY(2, LANE_Y) });
      expect(onDragEvent).not.toHaveBeenCalled();
      expect(onCreateEvent).toHaveBeenCalledTimes(1);
    });
  });
});
