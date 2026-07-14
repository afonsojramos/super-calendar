import { fireEvent, render, within } from "@testing-library/react-native";
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

describe("MonthView selection", () => {
  it("announces a single selected day", () => {
    const { getByLabelText } = render(
      <MonthView {...baseProps} selectedDates={[new Date(2026, 5, 15)]} />,
    );
    expect(getByLabelText(/15 June 2026, selected/)).toBeTruthy();
  });

  it("marks both range endpoints as selected and renders a band behind the interior", () => {
    const range = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };
    const { getByLabelText } = render(<MonthView {...baseProps} selectedRange={range} />);

    expect(getByLabelText(/10 June 2026, selected/)).toBeTruthy();
    expect(getByLabelText(/14 June 2026, selected/)).toBeTruthy();

    // An interior day carries the range band (a child layer), not the badge.
    const interior = getByLabelText(/12 June 2026, 0 events/);
    const band = within(interior).getByTestId("month-range-band");
    expect(backgroundColorOf(band)).toBe(defaultTheme.colors.rangeBackground);
    expect(() => getByLabelText(/12 June 2026, selected/)).toThrow();
  });

  it("renders the band as a rounded pill by default and a full-cell fill when opted in", () => {
    const range = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };
    const radiusOf = (n: { props: { style?: unknown } }) =>
      StyleSheet.flatten(n.props.style as ViewStyle)?.borderTopLeftRadius ?? 0;

    const pill = render(<MonthView {...baseProps} selectedRange={range} />);
    const pillStart = within(pill.getByLabelText(/10 June 2026/)).getByTestId("month-range-band");
    expect(radiusOf(pillStart)).toBeGreaterThan(0); // rounded leading edge

    const fill = render(<MonthView {...baseProps} selectedRange={range} fillCellOnSelection />);
    const fillStart = within(fill.getByLabelText(/10 June 2026/)).getByTestId("month-range-band");
    expect(radiusOf(fillStart)).toBe(0); // square, fills the cell
  });

  it("leaves cells outside any selection unstyled by selection", () => {
    const { getByLabelText } = render(
      <MonthView {...baseProps} selectedDates={[new Date(2026, 5, 15)]} />,
    );
    const other = getByLabelText(/20 June 2026, 0 events/);
    expect(within(other).queryByTestId("month-range-band")).toBeNull();
  });
});

describe("MonthView grid", () => {
  const borderOf = (n: { props: { style?: unknown } }) =>
    StyleSheet.flatten(n.props.style as ViewStyle)?.borderTopWidth ?? 0;

  it("draws no day-cell grid for the events-free picker", () => {
    const { getByLabelText } = render(<MonthView {...baseProps} />); // events: []
    expect(borderOf(getByLabelText(/15 June 2026/))).toBe(0);
  });

  it("draws the day-cell grid when there are events (calendar)", () => {
    const events: CalendarEvent[] = [
      { title: "X", start: new Date(2026, 5, 15, 9), end: new Date(2026, 5, 15, 10) },
    ];
    const { getByLabelText } = render(<MonthView {...baseProps} events={events} />);
    expect(borderOf(getByLabelText(/15 June 2026/))).toBeGreaterThan(0);
  });
});

describe("MonthView renderCustomDateForMonth", () => {
  it("replaces the default date badge with the custom renderer's output", () => {
    const { getByText, queryByText } = render(
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

  it("merges theme.containers.dayCell onto every day cell", () => {
    const { getByLabelText } = render(withTheme({ containers: { dayCell: { opacity: 0.42 } } }));
    expect(styleOf(getByLabelText(/15 June 2026/)).opacity).toBe(0.42);
  });
});

describe("MonthView disabled days", () => {
  it("marks days outside the min/max range as unavailable", () => {
    const { getByLabelText } = render(
      <MonthView {...baseProps} minDate={new Date(2026, 5, 10)} maxDate={new Date(2026, 5, 20)} />,
    );
    expect(getByLabelText(/, 9 June 2026, unavailable/)).toBeTruthy();
    expect(getByLabelText(/, 21 June 2026, unavailable/)).toBeTruthy();
    // Inside the window stays available.
    expect(() => getByLabelText(/, 15 June 2026, unavailable/)).toThrow();
  });

  it("honours an isDateDisabled predicate", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <MonthView
        {...baseProps}
        isDateDisabled={(d) => d.getDate() === 12}
        onPressDay={onPressDay}
      />,
    );
    const disabled = getByLabelText(/, 12 June 2026, unavailable/);
    fireEvent.press(disabled);
    expect(onPressDay).not.toHaveBeenCalled();
  });

  it("does not select a disabled day even if passed in selectedDates", () => {
    const { getByLabelText } = render(
      <MonthView
        {...baseProps}
        selectedDates={[new Date(2026, 5, 12)]}
        isDateDisabled={(d) => d.getDate() === 12}
      />,
    );
    expect(() => getByLabelText(/, 12 June 2026, selected/)).toThrow();
  });

  it("uses eventAccessibilityLabel to override an event chip's label", () => {
    const events: CalendarEvent[] = [
      { title: "Standup", start: new Date(2026, 5, 15, 9, 0), end: new Date(2026, 5, 15, 9, 30) },
    ];
    const { getByLabelText } = render(
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

  it("passes a slot class through and drops that slot's themed styles", () => {
    const { getByText } = render(
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

  it("keeps the themed look and merges per-slot style overrides last", () => {
    const { getByText } = render(
      <MonthView {...baseProps} styles={{ title: { color: "rebeccapurple" } }} />,
    );
    const title = getByText("June 2026");
    expect(title.props.className).toBeUndefined();
    const flat = flatten(title);
    expect(flat.color).toBe("rebeccapurple");
    expect(flat.fontSize).toBe(defaultTheme.text.monthTitle.fontSize);
  });

  it("keeps a consumer calendarCellStyle even when the day slot has a class", () => {
    const { getByLabelText } = render(
      <MonthView
        {...baseProps}
        classNames={{ day: "bg-slate-50" }}
        calendarCellStyle={() => ({ backgroundColor: "papayawhip" })}
      />,
    );
    const cell = getByLabelText(/15 June 2026/);
    expect(flatten(cell).backgroundColor).toBe("papayawhip");
  });

  it("classes a state-styled slot: the badge drops its today colors for the class", () => {
    const { UNSAFE_getAllByProps } = render(
      <MonthView
        {...baseProps}
        classNames={{ dayBadge: "rounded-full bg-indigo-600" }}
        activeDate={new Date(2026, 5, 15)}
      />,
    );
    // Every day badge carries the class; none keeps the themed active-day fill,
    // because a classed slot drops its themed styles.
    const badges = UNSAFE_getAllByProps({ className: "rounded-full bg-indigo-600" });
    expect(badges.length).toBeGreaterThan(27);
    for (const badge of badges) expect(flatten(badge).backgroundColor).toBeUndefined();
  });
});
