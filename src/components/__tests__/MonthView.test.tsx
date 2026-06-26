import { fireEvent, render, within } from "@testing-library/react-native";
import { StyleSheet, Text, type ViewStyle } from "react-native";
import { defaultTheme } from "../../theme";
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
});
