import { act, fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import type { CalendarEvent } from "../../types";
import { YearView } from "../YearView";

const events: CalendarEvent[] = [
  { title: "Standup", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];

describe("YearView", () => {
  it("renders all twelve months of the anchor year", async () => {
    const { getByLabelText } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} />,
    );
    expect(getByLabelText("January 2026")).toBeTruthy();
    expect(getByLabelText("December 2026")).toBeTruthy();
  });

  it("fires onPressDay with the tapped day", async () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onPressDay={onPressDay} />,
    );
    await fireEvent.press(getByLabelText(/Wednesday, 15 July 2026/));
    expect(onPressDay).toHaveBeenCalledTimes(1);
    expect(onPressDay.mock.calls[0][0].getDate()).toBe(15);
    expect(onPressDay.mock.calls[0][0].getMonth()).toBe(6);
  });

  it("marks days holding events and announces them", async () => {
    const { getByLabelText } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} events={events} />,
    );
    expect(getByLabelText(/15 July 2026.*has events/)).toBeTruthy();
  });

  it("fires onPressMonth from a month title", async () => {
    const onPressMonth = jest.fn();
    const { getByLabelText } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onPressMonth={onPressMonth} />,
    );
    await fireEvent.press(getByLabelText("March 2026"));
    expect(onPressMonth).toHaveBeenCalledTimes(1);
    expect(onPressMonth.mock.calls[0][0].getMonth()).toBe(2);
  });
});

describe("YearView selection", () => {
  it("announces selected days and marks the range interior", async () => {
    const { getByLabelText } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        selectedRange={{ start: new Date(2026, 6, 15), end: new Date(2026, 6, 17) }}
      />,
    );
    expect(getByLabelText(/15 July 2026, selected/)).toBeTruthy();
    expect(getByLabelText(/17 July 2026, selected/)).toBeTruthy();
    // An interior day is in the range but is not itself an endpoint.
    expect(getByLabelText(/Thursday, 16 July 2026$/)).toBeTruthy();
  });

  it("renders days outside minDate/maxDate as unavailable and ignores their taps", async () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        minDate={new Date(2026, 6, 10)}
        onPressDay={onPressDay}
      />,
    );
    await fireEvent.press(getByLabelText(/9 July 2026, unavailable/));
    expect(onPressDay).not.toHaveBeenCalled();
  });
});

describe("YearView drag to select", () => {
  // July 2026 with weekStartsOn 1 lays out five rows from Mon 29 June, so a
  // 140x120 mini month puts each column at 20px and each row at 24px.
  const GRID = { width: 140, height: 120 };

  type PanHandlers = Record<string, (gesture?: { x: number; y: number }) => void>;
  // One pan is built per mini month, in month order, so the current batch is
  // the last twelve gestures the mock recorded.
  const monthPan = (monthIndex: number): PanHandlers => {
    const { __gestures } = jest.requireMock("react-native-gesture-handler") as {
      __gestures: { handlers: PanHandlers }[];
    };
    return __gestures[__gestures.length - 12 + monthIndex].handlers;
  };

  it("reports the sweep live and commits an all-day range on release", async () => {
    const onSelectDrag = jest.fn();
    const onCreateEvent = jest.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    // The third row (index 2) runs Mon 13 July to Sun 19 July.
    await fireEvent(getByTestId("year-month-grid-6"), "layout", { nativeEvent: { layout: GRID } });

    await act(() => monthPan(6).onStart({ x: 50, y: 50 })); // row 2, col 2: Wed 15 July
    await act(() => monthPan(6).onUpdate({ x: 90, y: 50 })); // row 2, col 4: Fri 17 July
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 17));

    await act(() => monthPan(6).onFinalize());
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
    expect(start).toEqual(new Date(2026, 6, 15));
    expect(end).toEqual(new Date(2026, 6, 18));
  });

  it("lets the next tap through after a sweep, which leaves no press behind", async () => {
    const onPressDay = jest.fn();
    const { getByTestId, getByLabelText } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={jest.fn()}
        onPressDay={onPressDay}
      />,
    );
    await fireEvent(getByTestId("year-month-grid-6"), "layout", { nativeEvent: { layout: GRID } });

    await act(() => monthPan(6).onStart({ x: 50, y: 50 }));
    await act(() => monthPan(6).onUpdate({ x: 90, y: 50 }));
    await act(() => monthPan(6).onFinalize());

    // A pan never produces a press, so nothing consumed a "swallow the next tap"
    // flag; the tap after the sweep is a fresh interaction.
    await fireEvent.press(getByLabelText(/Monday, 20 July 2026/));
    expect(onPressDay).toHaveBeenCalledTimes(1);
  });

  it("ignores a hold that lands on a blank adjacent-month cell", async () => {
    const onSelectDrag = jest.fn();
    const onCreateEvent = jest.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    await fireEvent(getByTestId("year-month-grid-6"), "layout", { nativeEvent: { layout: GRID } });

    // Row 0, col 0 of July's mini month is Mon 29 June: drawn blank, so it can
    // neither anchor a sweep nor be swept onto.
    await act(() => monthPan(6).onStart({ x: 10, y: 10 }));
    await act(() => monthPan(6).onUpdate({ x: 50, y: 50 }));
    await act(() => monthPan(6).onFinalize());
    expect(onSelectDrag).not.toHaveBeenCalled();
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it("keeps disabled days out of the sweep", async () => {
    const onCreateEvent = jest.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        maxDate={new Date(2026, 6, 16)}
        onCreateEvent={onCreateEvent}
      />,
    );
    await fireEvent(getByTestId("year-month-grid-6"), "layout", { nativeEvent: { layout: GRID } });

    await act(() => monthPan(6).onStart({ x: 50, y: 50 })); // Wed 15 July
    await act(() => monthPan(6).onUpdate({ x: 90, y: 50 })); // Fri 17 July, past maxDate
    await act(() => monthPan(6).onFinalize());
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it("keeps one pan per mini month while a sweep is running", async () => {
    const { __gestures } = jest.requireMock("react-native-gesture-handler") as {
      __gestures: unknown[];
    };
    // The documented wiring: onSelectDrag drives state in the consumer, so every
    // swept day re-renders the parent and hands YearView fresh inline handlers.
    // Rebuilding the pan mid-drag would cancel the drag running through it.
    function Harness() {
      const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
      return (
        <YearView
          date={new Date(2026, 6, 20)}
          weekStartsOn={1}
          selectedRange={range ?? undefined}
          onSelectDrag={(start, end) => setRange({ start, end })}
          onCreateEvent={() => {}}
        />
      );
    }
    const { getByTestId } = await render(<Harness />);
    await fireEvent(getByTestId("year-month-grid-6"), "layout", { nativeEvent: { layout: GRID } });

    await act(() => monthPan(6).onStart({ x: 50, y: 50 }));
    const afterStart = __gestures.length;
    await act(() => monthPan(6).onUpdate({ x: 90, y: 50 }));
    await act(() => monthPan(6).onUpdate({ x: 110, y: 50 }));
    expect(__gestures.length).toBe(afterStart);
  });

  it("commits nothing when the hold never leaves its day", async () => {
    const onCreateEvent = jest.fn();
    const { getByTestId } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onCreateEvent={onCreateEvent} />,
    );
    await fireEvent(getByTestId("year-month-grid-6"), "layout", { nativeEvent: { layout: GRID } });

    await act(() => monthPan(6).onStart({ x: 50, y: 50 }));
    await act(() => monthPan(6).onFinalize());
    expect(onCreateEvent).not.toHaveBeenCalled();
  });
});
