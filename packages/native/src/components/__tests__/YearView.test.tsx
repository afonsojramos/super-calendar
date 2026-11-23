import * as gestureHandlerMock from "react-native-gesture-handler";
import * as reanimatedMock from "react-native-reanimated";
import { vi } from "vitest";
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
    const onPressDay = vi.fn();
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
    const onPressMonth = vi.fn();
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
    const onPressDay = vi.fn();
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
  // The sweep places a mini month by its own box and its week rows inside it.
  const layOutJuly = async (getByTestId: (id: string) => { parent: unknown }) => {
    const grid = getByTestId("year-month-grid-6");
    await fireEvent(grid.parent as never, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 160, height: 180 } },
    });
    await fireEvent(grid as never, "layout", { nativeEvent: { layout: { x: 0, y: 0, ...GRID } } });
  };

  type PanHandlers = Record<string, (gesture?: { x: number; y: number }) => void>;
  // One pan is built per mini month, in month order, so the current batch is
  // the last twelve gestures the mock recorded.
  const monthPan = (monthIndex: number): PanHandlers => {
    const { __gestures } = gestureHandlerMock as unknown as {
      __gestures: { handlers: PanHandlers }[];
    };
    return __gestures[__gestures.length - 12 + monthIndex].handlers;
  };

  it("reports the sweep live and commits an all-day range on release", async () => {
    const onSelectDrag = vi.fn();
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    // The third row (index 2) runs Mon 13 July to Sun 19 July.
    await layOutJuly(getByTestId);

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
    const onPressDay = vi.fn();
    const { getByTestId, getByLabelText } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={vi.fn()}
        onPressDay={onPressDay}
      />,
    );
    await layOutJuly(getByTestId);

    await act(() => monthPan(6).onStart({ x: 50, y: 50 }));
    await act(() => monthPan(6).onUpdate({ x: 90, y: 50 }));
    await act(() => monthPan(6).onFinalize());

    // A pan never produces a press, so nothing consumed a "swallow the next tap"
    // flag; the tap after the sweep is a fresh interaction.
    await fireEvent.press(getByLabelText(/Monday, 20 July 2026/));
    expect(onPressDay).toHaveBeenCalledTimes(1);
  });

  it("ignores a hold that lands on a blank adjacent-month cell", async () => {
    const onSelectDrag = vi.fn();
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    await layOutJuly(getByTestId);

    // Row 0, col 0 of July's mini month is Mon 29 June: drawn blank, so it can
    // neither anchor a sweep nor be swept onto.
    await act(() => monthPan(6).onStart({ x: 10, y: 10 }));
    await act(() => monthPan(6).onUpdate({ x: 50, y: 50 }));
    await act(() => monthPan(6).onFinalize());
    expect(onSelectDrag).not.toHaveBeenCalled();
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it("keeps disabled days out of the sweep", async () => {
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        maxDate={new Date(2026, 6, 16)}
        onCreateEvent={onCreateEvent}
      />,
    );
    await layOutJuly(getByTestId);

    await act(() => monthPan(6).onStart({ x: 50, y: 50 })); // Wed 15 July
    await act(() => monthPan(6).onUpdate({ x: 90, y: 50 })); // Fri 17 July, past maxDate
    await act(() => monthPan(6).onFinalize());
    expect(onCreateEvent).not.toHaveBeenCalled();
  });

  it("keeps one pan per mini month while a sweep is running", async () => {
    const { __gestures } = gestureHandlerMock as unknown as {
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
    await layOutJuly(getByTestId);

    await act(() => monthPan(6).onStart({ x: 50, y: 50 }));
    const afterStart = __gestures.length;
    await act(() => monthPan(6).onUpdate({ x: 90, y: 50 }));
    await act(() => monthPan(6).onUpdate({ x: 110, y: 50 }));
    expect(__gestures.length).toBe(afterStart);
  });

  it("commits nothing when the hold never leaves its day", async () => {
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onCreateEvent={onCreateEvent} />,
    );
    await layOutJuly(getByTestId);

    await act(() => monthPan(6).onStart({ x: 50, y: 50 }));
    await act(() => monthPan(6).onFinalize());
    expect(onCreateEvent).not.toHaveBeenCalled();
  });
});

describe("YearView sweep across mini months", () => {
  // Before the scroll view measures, the grid lays the months out three to a row.
  // Each mini month gets a 160x180 box, with its week rows (20px cells) below
  // the title and weekday initials.
  const CELL = 20;
  const monthOrigin = (month: number) => ({ x: (month % 3) * 160, y: Math.floor(month / 3) * 180 });
  const GRID_OFFSET = { x: 10, y: 40 };
  // Week rows per month in 2026 with weekStartsOn 1.
  const ROWS: Record<number, number> = { 3: 5, 6: 5, 7: 6, 8: 5, 9: 5 };
  // A point in the year grid, from a mini month and an offset inside its week rows.
  const inGrid = (month: number, x: number, y: number) => ({
    x: monthOrigin(month).x + GRID_OFFSET.x + x,
    y: monthOrigin(month).y + GRID_OFFSET.y + y,
  });
  // The centre of one day cell, in year-grid space.
  const cell = (month: number, row: number, col: number) =>
    inGrid(month, col * CELL + CELL / 2, row * CELL + CELL / 2);

  type PanHandlers = Record<string, (gesture?: { x: number; y: number }) => void>;
  const monthPan = (monthIndex: number): PanHandlers => {
    const { __gestures } = gestureHandlerMock as unknown as {
      __gestures: { handlers: PanHandlers }[];
    };
    return __gestures[__gestures.length - 12 + monthIndex].handlers;
  };
  const animation = reanimatedMock as unknown as {
    __jsQueue: Array<() => void>;
    __deferRunOnJS: (enabled: boolean) => void;
  };
  afterEach(() => animation.__deferRunOnJS(false));

  // A pan reports points relative to the mini month it started on.
  const panPoint = (from: number, point: { x: number; y: number }) => {
    const origin = inGrid(from, 0, 0);
    return { x: point.x - origin.x, y: point.y - origin.y };
  };
  const sweep = (from: number) => ({
    start: (point: { x: number; y: number }) =>
      act(() => monthPan(from).onStart(panPoint(from, point))),
    move: (point: { x: number; y: number }) =>
      act(() => monthPan(from).onUpdate(panPoint(from, point))),
    release: () => act(() => monthPan(from).onFinalize()),
  });

  const layOut = async (getByTestId: (id: string) => { parent: unknown }) => {
    for (const month of [3, 6, 7, 8, 9]) {
      const grid = getByTestId(`year-month-grid-${month}`);
      const { x, y } = monthOrigin(month);
      await fireEvent(grid.parent as never, "layout", {
        nativeEvent: { layout: { x, y, width: 160, height: 180 } },
      });
      await fireEvent(grid as never, "layout", {
        nativeEvent: {
          layout: { ...GRID_OFFSET, width: 7 * CELL, height: ROWS[month] * CELL },
        },
      });
    }
  };

  it("carries a sweep from one mini month into the next", async () => {
    const onSelectDrag = vi.fn();
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    await layOut(getByTestId);

    const july = sweep(6);
    await july.start(cell(6, 4, 4)); // Fri 31 July
    await july.move(cell(7, 1, 0)); // Mon 3 August
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 6, 31), new Date(2026, 7, 3));

    await july.release();
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 6, 31), new Date(2026, 7, 4));
  });

  it("follows a sweep back into earlier months and down a row of months", async () => {
    const onSelectDrag = vi.fn();
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    await layOut(getByTestId);

    const august = sweep(7);
    await august.start(cell(7, 1, 0)); // Mon 3 August
    await august.move(cell(6, 4, 2)); // Wed 29 July, back a month
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 6, 29), new Date(2026, 7, 3));
    await august.move(cell(7, 1, 2)); // Wed 5 August, back where it started
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 7, 3), new Date(2026, 7, 5));
    await august.move(cell(9, 1, 0)); // Mon 5 October, a row of months down
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 7, 3), new Date(2026, 9, 5));

    await august.release();
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 7, 3), new Date(2026, 9, 6));
  });

  it("holds the last day over a gap, a blank padding day or a disabled day", async () => {
    const onSelectDrag = vi.fn();
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        isDateDisabled={(day) => day.getMonth() === 7 && day.getDate() === 4}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    await layOut(getByTestId);

    const july = sweep(6);
    await july.start(cell(6, 4, 2)); // Wed 29 July
    await july.move(inGrid(6, 7 * CELL + 8, 30)); // the gap between July and August
    await july.move(inGrid(7, 30, -10)); // August's weekday initials
    await july.move(cell(7, 0, 0)); // Mon 27 July, drawn blank in August
    expect(onSelectDrag).not.toHaveBeenCalled();

    await july.move(cell(7, 0, 5)); // Sat 1 August
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 6, 29), new Date(2026, 7, 1));
    await july.move(cell(7, 1, 1)); // Tue 4 August, disabled
    await july.move(inGrid(7, 7 * CELL + 8, 30)); // the gap past August
    expect(onSelectDrag).toHaveBeenCalledTimes(1);

    // Released over the gap, the sweep keeps the last day it crossed.
    await july.release();
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 6, 29), new Date(2026, 7, 2));
  });

  it("crosses to JavaScript only when the hovered day changes", async () => {
    const onSelectDrag = vi.fn();
    const { getByTestId } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onSelectDrag={onSelectDrag} />,
    );
    await layOut(getByTestId);

    const july = sweep(6);
    await july.start(cell(6, 4, 4)); // Fri 31 July
    animation.__deferRunOnJS(true);
    const friday = cell(6, 4, 4);
    await july.move({ x: friday.x + 3, y: friday.y }); // still Fri 31 July
    await july.move(inGrid(6, 7 * CELL + 8, 90)); // the gap
    expect(animation.__jsQueue).toHaveLength(0);

    await july.move(cell(7, 1, 0)); // Mon 3 August
    await july.move(cell(7, 1, 0));
    expect(animation.__jsQueue).toHaveLength(1);
    await act(() => {
      for (const deliver of animation.__jsQueue.splice(0)) deliver();
    });
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 6, 31), new Date(2026, 7, 3));
    animation.__deferRunOnJS(false);
    await july.release();
  });

  const deliver = () =>
    act(() => {
      for (const send of animation.__jsQueue.splice(0)) send();
    });

  it("lands on the day under the finger when days arrive faster than renders", async () => {
    const onSelectDrag = vi.fn();
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView
        date={new Date(2026, 6, 20)}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />,
    );
    await layOut(getByTestId);

    const july = sweep(6);
    await july.start(cell(6, 2, 2)); // Wed 15 July
    await july.move(cell(6, 2, 3)); // Thu 16 July
    animation.__deferRunOnJS(true);
    await july.move(cell(6, 2, 4)); // Fri 17 July
    await july.move(cell(6, 2, 3)); // back to Thu 16 July
    await deliver(); // both steps reach JavaScript before React renders
    animation.__deferRunOnJS(false);
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 16));

    await july.release();
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 17));
  });

  it("commits a sweep whose first step arrives before its start renders", async () => {
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onCreateEvent={onCreateEvent} />,
    );
    await layOut(getByTestId);

    const july = sweep(6);
    animation.__deferRunOnJS(true);
    await july.start(cell(6, 2, 2)); // Wed 15 July
    await july.move(cell(6, 2, 4)); // Fri 17 July
    await deliver();
    animation.__deferRunOnJS(false);

    await july.release();
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 18));
  });

  it("ignores months scrolled out of view", async () => {
    const onSelectDrag = vi.fn();
    const { getByTestId } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onSelectDrag={onSelectDrag} />,
    );
    await layOut(getByTestId);
    // The month view, the year grid, then the scroll view.
    const scroll = (
      getByTestId("year-month-grid-6") as unknown as { parent: { parent: { parent: never } } }
    ).parent.parent.parent;
    await fireEvent(scroll, "layout", { nativeEvent: { layout: { width: 480, height: 300 } } });
    await fireEvent(scroll, "scroll", { nativeEvent: { contentOffset: { x: 0, y: 300 } } });

    const july = sweep(6);
    await july.start(cell(6, 2, 2)); // Wed 15 July
    // Mon 6 April sits above the visible band, under whatever covers the scroll view.
    await july.move(cell(3, 1, 0));
    expect(onSelectDrag).not.toHaveBeenCalled();
    await july.move(cell(3, 4, 0)); // Mon 27 April, in view
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 3, 27), new Date(2026, 6, 15));
    await july.release();
  });

  it("sweeps when the handler arrives after the year has laid out", async () => {
    const onSelectDrag = vi.fn();
    const { getByTestId, rerender } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} />,
    );
    await layOut(getByTestId);
    await rerender(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onSelectDrag={onSelectDrag} />,
    );

    const july = sweep(6);
    await july.start(cell(6, 4, 4)); // Fri 31 July
    await july.move(cell(7, 1, 0)); // Mon 3 August
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 6, 31), new Date(2026, 7, 3));
    await july.release();
  });

  it("drops a sweep whose month is replaced mid-drag", async () => {
    const onSelectDrag = vi.fn();
    const onCreateEvent = vi.fn();
    const year = (date: Date) => (
      <YearView
        date={date}
        weekStartsOn={1}
        onSelectDrag={onSelectDrag}
        onCreateEvent={onCreateEvent}
      />
    );
    const { getByTestId, rerender } = await render(year(new Date(2026, 6, 20)));
    await layOut(getByTestId);

    await sweep(6).start(cell(6, 2, 2)); // Wed 15 July 2026
    await sweep(6).move(cell(6, 2, 4)); // Fri 17 July 2026
    // A new year re-keys every mini month, so the running pan never finalizes.
    await rerender(year(new Date(2027, 6, 20)));
    expect(onCreateEvent).not.toHaveBeenCalled();

    // A fresh hold starts a new sweep in the new year.
    const july = sweep(6);
    await july.start(cell(6, 1, 0)); // Mon 5 July 2027
    await july.move(cell(6, 1, 2)); // Wed 7 July 2027
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2027, 6, 5), new Date(2027, 6, 7));
    await july.release();
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2027, 6, 5), new Date(2027, 6, 8));
  });

  it("leaves a running sweep to the finger that started it", async () => {
    const onCreateEvent = vi.fn();
    const { getByTestId } = await render(
      <YearView date={new Date(2026, 6, 20)} weekStartsOn={1} onCreateEvent={onCreateEvent} />,
    );
    await layOut(getByTestId);

    const july = sweep(6);
    const august = sweep(7);
    await july.start(cell(6, 2, 2)); // Wed 15 July
    await july.move(cell(6, 2, 4)); // Fri 17 July
    // A second finger holds in August, then lifts.
    await august.start(cell(7, 2, 2));
    await august.move(cell(7, 2, 4));
    await august.release();
    expect(onCreateEvent).not.toHaveBeenCalled();

    await july.release();
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 18));
  });
});
