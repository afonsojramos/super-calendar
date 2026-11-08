import { buildMultiWeekGrid } from "@super-calendar/core";
import { useMemo } from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import * as gestureHandlerMock from "react-native-gesture-handler";
import { addDays, addWeeks, differenceInCalendarDays, format, startOfMonth } from "date-fns";
import { vi } from "vitest";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";
import { MultiWeekView } from "../MultiWeekView";

const list = vi.hoisted(() => ({ props: null as any, scroll: vi.fn() }));
vi.mock("@legendapp/list/react-native", () => ({
  LegendList: (props: any) => {
    list.props = props;
    if (props.ref) props.ref.current = { scrollToIndex: list.scroll };
    return useMemo(
      () =>
        props.data[props.initialScrollIndex]
          ? props.renderItem({
              item: props.data[props.initialScrollIndex],
              index: props.initialScrollIndex,
            })
          : null,
      [props.data, props.extraData],
    );
  },
}));
import { Calendar } from "../Calendar";

const date = new Date(2030, 11, 29);
const noop = () => {};
const base = {
  date,
  events: [] as CalendarEvent[],
  weekStartsOn: 1 as const,
  renderEvent: DefaultEvent,
  keyExtractor: (event: CalendarEvent) => event.title ?? "",
  onPressEvent: noop,
};
const calendar = {
  date,
  events: [] as CalendarEvent[],
  mode: "multiweek" as const,
  weekStartsOn: 1 as const,
  onChangeDate: noop,
  onPressEvent: noop,
};
const lastGesture = () => {
  const { __gestures } = gestureHandlerMock as unknown as {
    __gestures: { handlers: Record<string, (...args: unknown[]) => void> }[];
  };
  return __gestures[__gestures.length - 1].handlers;
};
const settle = async (props: any, index: number) => {
  await act(() =>
    props.onViewableItemsChanged({
      viewableItems: [{ isViewable: true, index, item: props.data[index] }],
    }),
  );
};

beforeEach(() => list.scroll.mockClear());

describe("native MultiWeekView", () => {
  it.each([2, 3, 4, 8])(
    "renders %i event rows including an empty grid and keeps a scrollable minimum",
    async (numberOfWeeks) => {
      const view = await render(
        <MultiWeekView {...base} numberOfWeeks={numberOfWeeks} chipHeight={20} chipGap={2} />,
      );
      const grid = view.getByTestId("multiweek-grid");
      expect(StyleSheet.flatten(grid.props.style).minHeight).toBe(96 * numberOfWeeks);
      expect(view.getAllByLabelText(/, 0 events$/)).toHaveLength(numberOfWeeks * 7);
      expect(view.getByLabelText(/23 December 2030, 0 events$/)).toBeTruthy();
      expect(view.getByLabelText(/ 1 January 2031, 0 events$/)).toBeTruthy();
      expect(
        StyleSheet.flatten(view.getByLabelText(/ 1 January 2031, 0 events$/).props.style)
          .borderTopWidth,
      ).toBeGreaterThan(0);
    },
  );

  it("creates across a year and row boundary with an exclusive end", async () => {
    const create = vi.fn();
    const view = await render(<MultiWeekView {...base} onCreateEvent={create} />);
    await fireEvent(view.getByTestId("multiweek-grid"), "layout", {
      nativeEvent: { layout: { width: 700, height: 240, x: 0, y: 0 } },
    });
    const handlers = lastGesture();
    await act(() => {
      handlers.onStart({ x: 450, y: 10 });
      handlers.onUpdate({ x: 350, y: 130 });
      handlers.onEnd({}, true);
    });
    expect(create).toHaveBeenCalledExactlyOnceWith(new Date(2030, 11, 27), new Date(2031, 0, 3));
  });

  it("keeps a timed move's clock and duration across the year boundary", async () => {
    const move = vi.fn();
    const event = {
      title: "Meeting",
      start: new Date(2030, 11, 27, 9),
      end: new Date(2030, 11, 27, 10),
    };
    const view = await render(<MultiWeekView {...base} events={[event]} onDragEvent={move} />);
    await fireEvent(view.getByTestId("multiweek-grid"), "layout", {
      nativeEvent: { layout: { width: 700, height: 240, x: 0, y: 0 } },
    });
    const handlers = lastGesture();
    await act(() => {
      handlers.onStart({ x: 450, y: 35 });
      handlers.onUpdate({ x: 350, y: 130 });
      handlers.onEnd({}, true);
    });
    expect(move).toHaveBeenCalledExactlyOnceWith(
      event,
      new Date(2031, 0, 2, 9),
      new Date(2031, 0, 2, 10),
    );
  });

  it.each(["date", "count", "hidden", "unmount"])(
    "drops queued gesture work after %s changes",
    async (change) => {
      const create = vi.fn();
      const view = await render(<MultiWeekView {...base} onCreateEvent={create} />);
      await fireEvent(view.getByTestId("multiweek-grid"), "layout", {
        nativeEvent: { layout: { width: 700, height: 240, x: 0, y: 0 } },
      });
      const handlers = lastGesture();
      await act(() => {
        handlers.onStart({ x: 450, y: 10 });
        handlers.onUpdate({ x: 350, y: 130 });
      });
      if (change === "unmount") await view.unmount();
      else
        await view.rerender(
          <MultiWeekView
            {...base}
            onCreateEvent={create}
            date={change === "date" ? addWeeks(date, 2) : date}
            numberOfWeeks={change === "count" ? 3 : 2}
            hiddenDays={change === "hidden" ? [0, 6] : []}
          />,
        );
      await act(() => {
        handlers.onEnd({}, true);
        handlers.onStart({ x: 450, y: 10 });
        handlers.onUpdate({ x: 350, y: 130 });
        handlers.onEnd({}, true);
      });
      expect(create).not.toHaveBeenCalled();
    },
  );
});

describe("native multiweek pager", () => {
  it("anchors month mode at the current date after a distant aligned multiweek jump", async () => {
    const anchor = new Date(2026, 0, 5);
    const target = addWeeks(anchor, 8 * 46);
    const view = await render(<Calendar {...calendar} date={anchor} numberOfWeeks={8} />);
    const series = list.props.data;
    await view.rerender(<Calendar {...calendar} date={target} numberOfWeeks={8} />);
    expect(list.props.data).toBe(series);
    await view.rerender(<Calendar {...calendar} mode="month" date={target} numberOfWeeks={8} />);
    expect(list.props.initialScrollIndex).toBeGreaterThanOrEqual(0);
    expect(list.props.initialScrollIndex).toBeLessThan(list.props.data.length);
    expect(list.props.data[list.props.initialScrollIndex]).toEqual(startOfMonth(target));
    expect(view.getByText(format(target, "MMMM yyyy"))).toBeTruthy();
  });

  it.each([2, 3, 4, 8])(
    "uses 121 pages at a stride of %i calendar weeks",
    async (numberOfWeeks) => {
      await render(<Calendar {...calendar} numberOfWeeks={numberOfWeeks} />);
      const props = list.props;
      expect(props.data).toHaveLength(121);
      expect(props.initialScrollIndex).toBe(60);
      expect(props.data[60]).toEqual(new Date(2030, 11, 23));
      expect(differenceInCalendarDays(props.data[61], props.data[60])).toBe(numberOfWeeks * 7);
      expect(props.recycleItems).toBe(false);
      expect(props.pagingEnabled).toBe(true);
    },
  );

  it.each([new Date(-271821, 4, 1), new Date(275760, 7, 30)])(
    "preserves valid windows and recurrence near the Date boundary %s",
    async (date) => {
      const { period } = buildMultiWeekGrid(date, { numberOfWeeks: 2, weekStartsOn: 1 });
      const recurring: CalendarEvent = {
        title: "Boundary daily",
        start: period.start,
        end: addDays(period.start, 1),
        allDay: true,
        recurrence: { freq: "daily" },
      };
      const view = await render(<Calendar {...calendar} date={date} events={[recurring]} />);
      const props = list.props;
      expect(props.data.length).toBeGreaterThan(0);
      expect(props.data.length).toBeLessThan(121);
      for (const page of props.data) {
        expect(() => props.keyExtractor(page)).not.toThrow();
        expect(Number.isFinite(addWeeks(page, 2).getTime())).toBe(true);
      }
      expect(props.data[props.initialScrollIndex]).toEqual(period.start);
      expect(view.getAllByLabelText(/, 1 event$/)).toHaveLength(14);
    },
  );

  it("reports the chronological visible range in RTL with hidden weekends", async () => {
    const change = vi.fn();
    const range = vi.fn();
    await render(
      <Calendar
        {...calendar}
        isRTL
        hiddenDays={[0, 6]}
        onChangeDate={change}
        onChangeDateRange={range}
      />,
    );
    await settle(list.props, 61);
    expect(change).toHaveBeenCalledExactlyOnceWith(new Date(2031, 0, 6));
    expect(range).toHaveBeenCalledExactlyOnceWith([
      new Date(2031, 0, 6),
      new Date(2031, 0, 17, 23, 59, 59, 999),
    ]);
  });

  it("preserves a series on an ordinary swipe but rebases off-phase jumps and ignores stale callbacks", async () => {
    const change = vi.fn();
    const view = await render(<Calendar {...calendar} onChangeDate={change} />);
    const first = list.props;
    await settle(first, 61);
    const next = first.data[61];
    await view.rerender(<Calendar {...calendar} date={next} onChangeDate={change} />);
    expect(list.props.data).toBe(first.data);
    expect(list.scroll).not.toHaveBeenCalled();
    const offPhase = addWeeks(next, 1);
    await view.rerender(<Calendar {...calendar} date={offPhase} onChangeDate={change} />);
    expect(list.props.data).not.toBe(first.data);
    expect(list.props.initialScrollIndex).toBe(60);
    expect(list.props.data[60]).toEqual(offPhase);
    change.mockClear();
    await settle(first, 62);
    expect(change).not.toHaveBeenCalled();
    await settle(list.props, 61);
    expect(change).toHaveBeenCalledExactlyOnceWith(addWeeks(offPhase, 2));
  });

  it("resets a pending scroll after an external jump outside the window", async () => {
    const change = vi.fn();
    const view = await render(<Calendar {...calendar} onChangeDate={change} />);
    const first = list.props;
    await view.rerender(<Calendar {...calendar} date={first.data[65]} onChangeDate={change} />);
    expect(list.scroll).toHaveBeenCalledWith({ index: 65, animated: false });
    const pending = list.props;
    await settle(pending, 62);
    expect(change).not.toHaveBeenCalled();
    const far = new Date(2040, 0, 2);
    await view.rerender(<Calendar {...calendar} date={far} onChangeDate={change} />);
    expect(list.props.initialScrollIndex).toBe(60);
    await settle(pending, 65);
    expect(change).not.toHaveBeenCalled();
    await settle(list.props, 61);
    expect(change).toHaveBeenCalledOnce();
  });

  it("refreshes cached pages after count, week-start, hidden-day, callback and style changes", async () => {
    const press = vi.fn();
    const view = await render(<Calendar {...calendar} />);
    const first = list.props.data;
    await view.rerender(<Calendar {...calendar} numberOfWeeks={3} weekStartsOn={0} />);
    expect(list.props.data).not.toBe(first);
    expect(list.props.data[60]).toEqual(date);
    expect(view.getAllByLabelText(/, 0 events$/)).toHaveLength(21);
    const series = list.props.data;
    await view.rerender(
      <Calendar
        {...calendar}
        numberOfWeeks={3}
        weekStartsOn={0}
        hiddenDays={[0, 6]}
        onPressDay={press}
        chipGap={8}
      />,
    );
    expect(list.props.data).toBe(series);
    expect(view.getAllByLabelText(/, 0 events$/)).toHaveLength(15);
    const day = view.getByLabelText(/30 December 2030, 0 events$/);
    expect(day).toHaveStyle({ gap: 8 });
    await fireEvent.press(day);
    expect(press).toHaveBeenCalledExactlyOnceWith(new Date(2030, 11, 30));
  });

  it("expands daily recurrence over current and adjacent complete windows", async () => {
    const recurring: CalendarEvent = {
      title: "Daily",
      start: new Date(2030, 0, 1, 9),
      end: new Date(2030, 0, 1, 10),
      recurrence: { freq: "daily" },
    };
    await render(<Calendar {...calendar} events={[recurring]} numberOfWeeks={3} />);
    const props = list.props;
    const neighbour = props.renderItem({ item: props.data[59], index: 59 });
    const view = await render(neighbour);
    expect(view.getAllByLabelText(/, 1 event$/)).toHaveLength(21);
    expect(
      view.getByLabelText(
        new RegExp(`${addDays(props.data[59], 20).getDate()} December 2030, 1 event$`),
      ),
    ).toBeTruthy();
  });
});
