import { buildMultiWeekGrid } from "@super-calendar/core";
import { useMemo } from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { type StyleProp, StyleSheet, Text, type ViewStyle } from "react-native";
import * as gestureHandlerMock from "react-native-gesture-handler";
import { addDays, addWeeks, differenceInCalendarDays, format, startOfMonth } from "date-fns";
import { vi } from "vitest";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";
import { MultiWeekView } from "../MultiWeekView";
import { CalendarThemeProvider, mergeTheme } from "../../theme";

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

type RenderedGrid = Awaited<ReturnType<typeof render>>;

const rowHeights = (view: RenderedGrid) =>
  view.getByTestId("multiweek-grid").children.map((row) => {
    if (typeof row === "string") throw new Error("Expected a week row");
    return StyleSheet.flatten(row.props.style as StyleProp<ViewStyle>)?.height;
  });

const layoutViewport = (view: RenderedGrid, height: number) =>
  fireEvent(view.getByTestId("multiweek-viewport"), "layout", {
    nativeEvent: { layout: { width: 700, height, x: 0, y: 0 } },
  });

const busyEvents = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    title: `Busy ${i}`,
    start: new Date(2030, 11, 31, 9 + i),
    end: new Date(2030, 11, 31, 10 + i),
  }));

// Fixed multi-week rows also hold the day cell's hairline top border.
const expectRows = (heights: unknown[], count: number, height: number) => {
  expect(heights).toHaveLength(count);
  for (const rowHeight of heights) {
    expect(rowHeight).toBeCloseTo(height + StyleSheet.hairlineWidth);
  }
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
      expect(StyleSheet.flatten(grid.props.style).minHeight).toBeCloseTo(
        (96 + StyleSheet.hairlineWidth) * numberOfWeeks,
      );
      expect(view.getAllByLabelText(/, 0 events$/)).toHaveLength(numberOfWeeks * 7);
      expect(view.getByLabelText(/23 December 2030, 0 events$/)).toBeTruthy();
      expect(view.getByLabelText(/ 1 January 2031, 0 events$/)).toBeTruthy();
      expect(
        StyleSheet.flatten(view.getByLabelText(/ 1 January 2031, 0 events$/).props.style)
          .borderTopWidth,
      ).toBeGreaterThan(0);
    },
  );

  it("gives every week row the same height, however many events it holds", async () => {
    // The first week holds four events; the others hold none. In the scroll
    // viewport, flexed rows grew with their events, so rows drew at different
    // heights while the hit test and chip capacity divided the grid evenly.
    const busy = busyEvents(4);
    const view = await render(<MultiWeekView {...base} events={busy} numberOfWeeks={3} />);
    const heights = () => rowHeights(view);
    await layoutViewport(view, 600);
    expect(heights()).toEqual([200, 200, 200]);
    // Fixed rows carry no flex, which would override their height on Yoga (a zero
    // basis) or on react-native-web (`flex: 0`); the grid sizes to them.
    const flexKeys = ["flex", "flexGrow", "flexShrink", "flexBasis", "height"];
    const grid = StyleSheet.flatten(view.getByTestId("multiweek-grid").props.style) ?? {};
    for (const key of flexKeys) expect(grid).not.toHaveProperty(key);
    for (const row of view.getByTestId("multiweek-grid").children) {
      const style =
        StyleSheet.flatten((row as { props: { style?: StyleProp<ViewStyle> } }).props.style) ?? {};
      for (const key of flexKeys.slice(0, 4)) expect(style).not.toHaveProperty(key);
    }
    // A short viewport keeps each row at its minimum height and scrolls instead.
    await layoutViewport(view, 90);
    const [first, ...rest] = heights() as number[];
    expect(first).toBeGreaterThan(30);
    expect(rest).toEqual([first, first]);
  });

  it("keeps room for the overflow label under a fixed cap in a short viewport", async () => {
    // One 20pt lane plus "+N more" under a 30pt date area: 30 + 22 + 22.
    const busy = busyEvents(2);
    const view = await render(
      <MultiWeekView
        {...base}
        events={busy}
        numberOfWeeks={3}
        chipHeight={20}
        chipGap={2}
        maxVisibleEventCount={1}
      />,
    );
    await layoutViewport(view, 90);
    expectRows(rowHeights(view), 3, 74);
    expect(view.getByText(/More/)).toBeTruthy();
  });

  it("fits a themed overflow line height under a fixed cap", async () => {
    // Default 20pt chips and a 40pt overflow line: 30 + 22 + (40 + 2).
    const busy = busyEvents(2);
    const view = await render(
      <CalendarThemeProvider
        value={mergeTheme({ text: { more: { fontSize: 11, lineHeight: 40 } } })}
      >
        <MultiWeekView {...base} events={busy} numberOfWeeks={3} maxVisibleEventCount={1} />
      </CalendarThemeProvider>,
    );
    await layoutViewport(view, 90);
    expectRows(rowHeights(view), 3, 94);
  });

  it.each([
    // No gap: 28 date area + 20 lane + 2 label margin + 20 label.
    {
      label: "a capped row without gaps",
      props: { chipHeight: 20, chipGap: 0, maxVisibleEventCount: 1 },
      theme: {},
      height: 70,
    },
    // Auto-fit keeps one lane beside the label: 30 + 22 + 2 + 60, more than three lanes.
    {
      label: "an auto-fit row with a tall label",
      props: {},
      theme: { more: { fontSize: 11, lineHeight: 60 } },
      height: 114,
    },
    {
      // A consumer's `styles.more` wins over the theme: 30 + 22 + 2 + 40.
      label: "a capped row with a restyled label",
      props: { maxVisibleEventCount: 1, styles: { more: { lineHeight: 40 } } },
      theme: {},
      height: 94,
    },
  ])("fits the overflow label in $label", async ({ props, theme, height }) => {
    const busy = busyEvents(4);
    const view = await render(
      <CalendarThemeProvider value={mergeTheme({ text: theme })}>
        <MultiWeekView {...base} {...props} events={busy} numberOfWeeks={3} />
      </CalendarThemeProvider>,
    );
    await layoutViewport(view, 90);
    expectRows(rowHeights(view), 3, height);
    expect(view.getByText(/More/).props.numberOfLines).toBe(1);
  });

  it("sizes rows from the measured overflow label", async () => {
    // Borders, minimum heights and class names only show in the laid-out label, so
    // its measured height (60pt here) wins over the estimate: 30 + 22 + 60.
    const busy = busyEvents(2);
    const view = await render(
      <MultiWeekView
        {...base}
        events={busy}
        numberOfWeeks={3}
        maxVisibleEventCount={1}
        styles={{ more: { minHeight: 58 } }}
      />,
    );
    await fireEvent(
      view.getByTestId("month-more-probe", { includeHiddenElements: true }),
      "layout",
      {
        nativeEvent: { layout: { width: 60, height: 60, x: 0, y: 0 } },
      },
    );
    await layoutViewport(view, 90);
    expectRows(rowHeights(view), 3, 112);
  });

  it("keeps room for a custom date taller than the built-in badge", async () => {
    // A 120pt custom date adds 96pt over the 24pt badge: 30 + 96 + three 22pt lanes.
    const view = await render(
      <MultiWeekView
        {...base}
        numberOfWeeks={3}
        renderCustomDateForMonth={(day) => <Text>{`date ${day.getDate()}`}</Text>}
      />,
    );
    const custom = view.getByText("date 31").parent;
    if (!custom) throw new Error("custom date wrapper not found");
    await fireEvent(custom, "layout", {
      nativeEvent: { layout: { width: 40, height: 120, x: 0, y: 4 } },
    });
    await layoutViewport(view, 90);
    expectRows(rowHeights(view), 3, 192);
  });

  it("counts a tall custom date when fitting lanes above the overflow label", async () => {
    // 404pt over three weeks gives 134.67pt rows. Below a 60pt custom date, 70.67pt
    // fits two 22pt lanes plus the 17pt "+N more" label, so five events show two.
    const busy = busyEvents(5);
    const view = await render(
      <MultiWeekView
        {...base}
        events={busy}
        numberOfWeeks={3}
        renderCustomDateForMonth={(day) => <Text>{`date ${day.getDate()}`}</Text>}
      />,
    );
    const custom = view.getByText("date 31").parent;
    if (!custom) throw new Error("custom date wrapper not found");
    await fireEvent(custom, "layout", {
      nativeEvent: { layout: { width: 40, height: 60, x: 0, y: 4 } },
    });
    await layoutViewport(view, 404);
    await fireEvent(view.getByTestId("multiweek-grid"), "layout", {
      nativeEvent: { layout: { width: 700, height: 404, x: 0, y: 0 } },
    });
    expect(view.getByLabelText("3 more events, 31 December")).toBeTruthy();
  });

  it("keeps room for a restyled built-in date badge, and gives it back", async () => {
    // The date wrapper around the built-in badge, which holds the day number.
    const dateArea = (view: Awaited<ReturnType<typeof render>>) => {
      const wrapper = view.getByText("31").parent?.parent;
      if (!wrapper) throw new Error("date wrapper not found");
      return wrapper;
    };
    const tall = (
      <MultiWeekView {...base} numberOfWeeks={3} styles={{ dayBadge: { height: 120 } }} />
    );
    const view = await render(tall);
    await layoutViewport(view, 90);
    // A 120pt badge adds 96pt over the 24pt default: 30 + 96 + three 22pt lanes.
    await fireEvent(dateArea(view), "layout", {
      nativeEvent: { layout: { width: 40, height: 120, x: 0, y: 4 } },
    });
    expectRows(rowHeights(view), 3, 192);
    // Back to the plain badge, the reserve shrinks to the 96pt minimum again.
    await view.rerender(<MultiWeekView {...base} numberOfWeeks={3} />);
    await fireEvent(dateArea(view), "layout", {
      nativeEvent: { layout: { width: 40, height: 24, x: 0, y: 4 } },
    });
    expectRows(rowHeights(view), 3, 96);
  });

  describe("fixed rows and day-cell styles", () => {
    it("keeps rows at the minimum when the cell aligns its content to the bottom", async () => {
      // A bottom-aligned date sits lower in a taller row. Its position must not
      // feed the row height, or each layout would grow the row again.
      const view = await render(
        <MultiWeekView
          {...base}
          numberOfWeeks={3}
          styles={{ day: { justifyContent: "flex-end" } }}
        />,
      );
      await layoutViewport(view, 90);
      for (let pass = 0; pass < 3; pass++) {
        const rowHeight = rowHeights(view)[0] as number;
        const dateArea = view.getByText("31").parent?.parent;
        if (!dateArea) throw new Error("date wrapper not found");
        await fireEvent(dateArea, "layout", {
          nativeEvent: { layout: { width: 40, height: 24, x: 0, y: rowHeight - 24 } },
        });
      }
      expectRows(rowHeights(view), 3, 96);
    });

    it("forgets a tall date once its week leaves the view", async () => {
      // 8 January sits in the third week. Dropping that week must not keep its
      // 120pt date, though the remaining dates never lay out again.
      const tallDate = (day: Date) => <Text>{`date ${day.getDate()}`}</Text>;
      const view = await render(
        <MultiWeekView {...base} numberOfWeeks={3} renderCustomDateForMonth={tallDate} />,
      );
      await layoutViewport(view, 90);
      const custom = view.getByText("date 8").parent;
      if (!custom) throw new Error("custom date wrapper not found");
      await fireEvent(custom, "layout", {
        nativeEvent: { layout: { width: 40, height: 120, x: 0, y: 4 } },
      });
      expectRows(rowHeights(view), 3, 192);
      await view.rerender(
        <MultiWeekView {...base} numberOfWeeks={2} renderCustomDateForMonth={tallDate} />,
      );
      expect(view.queryByText("date 8")).toBeNull();
      expectRows(rowHeights(view), 2, 96);
    });

    it("keeps the built-in badge at the cell's end whatever the cell's alignment", async () => {
      const view = await render(
        <MultiWeekView {...base} numberOfWeeks={3} styles={{ day: { alignItems: "center" } }} />,
      );
      const dateArea = view.getByText("31").parent?.parent;
      if (!dateArea) throw new Error("date wrapper not found");
      expect(StyleSheet.flatten(dateArea.props.style)?.alignSelf).toBe("stretch");

      const custom = await render(
        <MultiWeekView
          {...base}
          numberOfWeeks={3}
          renderCustomDateForMonth={(day) => <Text>{`date ${day.getDate()}`}</Text>}
        />,
      );
      const customArea = custom.getByText("date 31").parent;
      expect(StyleSheet.flatten(customArea?.props.style)?.alignSelf).toBeUndefined();
    });
  });

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
