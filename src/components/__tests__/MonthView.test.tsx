import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, type ViewStyle } from "react-native";
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

  it("marks both range endpoints as selected and fills the interior with the range band", () => {
    const range = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 14) };
    const { getByLabelText } = render(<MonthView {...baseProps} selectedRange={range} />);

    expect(getByLabelText(/10 June 2026, selected/)).toBeTruthy();
    expect(getByLabelText(/14 June 2026, selected/)).toBeTruthy();

    // An interior day carries the range band, not the "selected" badge.
    const interior = getByLabelText(/12 June 2026, 0 events/);
    expect(backgroundColorOf(interior)).toBe(defaultTheme.colors.rangeBackground);
    expect(() => getByLabelText(/12 June 2026, selected/)).toThrow();
  });

  it("leaves cells outside any selection unstyled by selection", () => {
    const { getByLabelText } = render(
      <MonthView {...baseProps} selectedDates={[new Date(2026, 5, 15)]} />,
    );
    const other = getByLabelText(/20 June 2026, 0 events/);
    expect(backgroundColorOf(other)).not.toBe(defaultTheme.colors.rangeBackground);
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
