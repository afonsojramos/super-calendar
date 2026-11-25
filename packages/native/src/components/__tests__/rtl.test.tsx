import * as gestureHandlerMock from "react-native-gesture-handler";
import { vi } from "vitest";
import { act, render as rtlRender, within } from "@testing-library/react-native";
import { useEffect, useImperativeHandle, useMemo } from "react";
import { Dimensions, StyleSheet, Text } from "react-native";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";

// Arrow-key paging only listens on react-native-web, so capture the handler each
// pager registers and call it directly.
const pagerKeyHandlers: ((delta: number) => void)[] = [];
vi.mock("../../utils/useWebPagerKeys", () => ({
  useWebPagerKeys: (_enabled: boolean, onPage: (delta: number) => void) => {
    pagerKeyHandlers.push(onPage);
  },
}));

// The month pager's list: render only the active page and expose its props.
vi.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: (props: any) => {
    (globalThis as any).__listProps = props;
    useImperativeHandle(props.ref, () => ({ scrollToIndex: () => {} }));
    useEffect(() => {}, []);
    return useMemo(() => {
      const index = props.initialScrollIndex ?? 0;
      const item = props.data?.[index];
      return item === undefined ? null : props.renderItem({ item, index });
    }, [props.data, props.extraData]);
  },
}));

import { Calendar } from "../Calendar";
import { DefaultEvent } from "../DefaultEvent";
import { MonthList } from "../MonthList";
import { MonthView } from "../MonthView";
import { TimeGrid } from "../TimeGrid";
import { YearView } from "../YearView";

type WithId = { id: string };
type ListProps = {
  data: Date[];
  initialScrollIndex: number;
  getFixedItemSize?: () => number;
  sharedValues?: { scrollOffset: { value: number } };
  onViewableItemsChanged: (info: unknown) => void;
};
const lastListProps = () => (globalThis as unknown as { __listProps: ListProps }).__listProps;
const flat = (node: { props: Record<string, unknown> }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const noop = () => {};
const standup: CalendarEvent<WithId> = {
  id: "1",
  title: "Standup",
  start: new Date(2026, 0, 6, 9),
  end: new Date(2026, 0, 6, 10),
};

const moveGesture = () => {
  const { __gestures } = gestureHandlerMock as unknown as {
    __gestures: Array<{
      calls: Record<string, unknown[]>;
      handlers: {
        onStart?: (event: Record<string, number>) => void;
        onUpdate?: (event: Record<string, number>) => void;
        onEnd?: (event: Record<string, number>, success?: boolean) => void;
        onFinalize?: (event?: Record<string, number>, success?: boolean) => void;
      };
    }>;
  };
  const gesture = __gestures.find(
    (candidate) => candidate.calls.activateAfterLongPress?.[0] === 500,
  );
  if (!gesture) throw new Error("move gesture not found");
  return gesture.handlers;
};

function grid(props: Partial<Parameters<typeof TimeGrid<WithId>>[0]> = {}) {
  return (
    <TimeGrid<WithId>
      mode="week"
      date={new Date(2026, 0, 6, 12)}
      events={[standup]}
      cellHeight={{ value: 48 } as never}
      hourHeight={48}
      weekStartsOn={1}
      renderEvent={DefaultEvent}
      keyExtractor={(item) => item.id}
      onChangeDate={noop}
      onPressEvent={noop}
      isRTL
      {...props}
    />
  );
}

beforeEach(() => {
  pagerKeyHandlers.length = 0;
  (gestureHandlerMock as unknown as { __gestures: unknown[] }).__gestures.length = 0;
});

describe("TimeGrid right to left", () => {
  it("puts the hour column on the right of the day columns", async () => {
    const { getByTestId } = await render(grid());
    const gutter = flat(getByTestId("hour-gutter"));
    expect(gutter.right).toBe(0);
    expect(gutter.left).toBeUndefined();
    const pager = flat(getByTestId("time-grid-pager"));
    expect(pager.left).toBe(0);
    expect(pager.right).toBe(56);
  });

  it("aligns the hour and all-day labels toward the day columns and places the now label in the right gutter", async () => {
    const allDay: CalendarEvent<WithId> = {
      id: "all-day",
      title: "Offsite",
      start: new Date(2026, 0, 6),
      end: new Date(2026, 0, 7),
      allDay: true,
    };
    const { getByTestId } = await render(
      grid({
        mode: "day",
        events: [standup, allDay],
        showAllDayLabel: true,
        now: new Date(2026, 0, 6, 10, 5),
        renderNowLabel: () => <Text>10:05</Text>,
        styles: { hourLabel: {} },
      }),
    );
    const gutter = within(getByTestId("hour-gutter"));
    const label = gutter.getByText("06:00");
    expect(flat(label).textAlign).toBe("left");
    expect(flat(label).paddingLeft).toBe(6);
    const allDayLabel = gutter.getByText("all-day");
    expect(flat(allDayLabel).textAlign).toBe("left");
    expect(flat(allDayLabel).paddingLeft).toBe(6);
    expect(gutter.getByText("10:05")).toBeTruthy();
  });

  it("mirrors all-day continuation edges in single-day RTL views", async () => {
    const ongoing: CalendarEvent<WithId> = {
      id: "ongoing",
      title: "Conference",
      start: new Date(2026, 0, 5),
      end: new Date(2026, 0, 7),
      allDay: true,
    };
    let observed: { continuesBefore?: boolean; continuesAfter?: boolean } | null = null;
    const Probe = ({ event, continuesBefore, continuesAfter }: RenderEventArgs<WithId>) => {
      if (event.id === "ongoing") observed = { continuesBefore, continuesAfter };
      return <Text>{event.title}</Text>;
    };
    await render(grid({ mode: "day", events: [ongoing], renderEvent: Probe }));
    // Event started before the visible day; under RTL that cut-off edge is on the right.
    expect(observed).toEqual({ continuesBefore: false, continuesAfter: true });
  });

  it("places overlapping timed events from right to left under isRTL", async () => {
    const first: CalendarEvent<WithId> = {
      id: "a",
      title: "First",
      start: new Date(2026, 0, 6, 9),
      end: new Date(2026, 0, 6, 10),
    };
    const second: CalendarEvent<WithId> = {
      id: "b",
      title: "Second",
      start: new Date(2026, 0, 6, 9, 30),
      end: new Date(2026, 0, 6, 10, 30),
    };
    const { getByText } = await render(grid({ mode: "day", events: [first, second] }));
    const leftOf = (title: string) => {
      let node = getByText(title).parent;
      while (node && typeof flat(node).left !== "number") node = node.parent;
      return flat(node!).left as number;
    };
    expect(leftOf("First")).toBeGreaterThan(leftOf("Second"));
  });

  it("draws each day separator on the column edge nearest the hour column", async () => {
    // The override marks the separators so they can be found in the rendered tree.
    const marker = 0.123;
    const view = await render(grid({ styles: { daySeparator: { opacity: marker } } }));
    type Node = { props?: { style?: unknown }; children?: unknown[] | null };
    const found: Record<string, unknown>[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      const { props, children } = node as Node;
      const style = (StyleSheet.flatten(props?.style as never) ?? {}) as Record<string, unknown>;
      if (style.opacity === marker) found.push(style);
      children?.forEach(walk);
    };
    walk(view.toJSON());
    expect(found.length).toBeGreaterThan(0);
    expect(found.map((style) => style.right)).toContain(0);
    expect(found.every((style) => style.left === undefined)).toBe(true);
  });

  it("keeps the hour column on the left without isRTL", async () => {
    const { getByTestId } = await render(grid({ isRTL: false }));
    expect(flat(getByTestId("hour-gutter")).left).toBe(0);
    expect(flat(getByTestId("time-grid-pager")).left).toBe(56);
  });

  it("puts the previous week on the next page, so a right swipe goes forward", async () => {
    const onChangeDate = vi.fn();
    await render(grid({ onChangeDate }));
    const list = lastListProps();
    const active = list.data[list.initialScrollIndex];
    expect(active).toEqual(new Date(2026, 0, 5));
    expect(list.data[list.initialScrollIndex + 1]).toEqual(new Date(2025, 11, 29));
    expect(list.data[list.initialScrollIndex - 1]).toEqual(new Date(2026, 0, 12));
    const index = list.initialScrollIndex + 1;
    // The swipe moves the list onto the next page, which then reports as viewable.
    list.sharedValues!.scrollOffset.value = index * list.getFixedItemSize!();
    await act(() =>
      list.onViewableItemsChanged({
        viewableItems: [{ isViewable: true, index, item: list.data[index] }],
      }),
    );
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2025, 11, 29), {
      reason: "swipe",
    });
  });

  it("pages to the next week on ArrowLeft", async () => {
    const onChangeDate = vi.fn();
    await render(grid({ onChangeDate }));
    await act(() => pagerKeyHandlers.at(-1)?.(-1));
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2026, 0, 12), {
      reason: "keyboard",
    });
  });

  it("moves an event to the previous day when dragged one column right", async () => {
    const onDragEvent = vi.fn();
    await render(grid({ onDragEvent }));
    const columnWidth = (Dimensions.get("window").width - 56) / 7;
    const move = moveGesture();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({
        translationX: columnWidth,
        translationY: 0,
        absoluteX: 200 + columnWidth,
        absoluteY: 300,
      });
      move.onEnd?.({ translationX: columnWidth, translationY: 0 });
      move.onFinalize?.();
    });
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      standup,
      new Date(2026, 0, 5, 9),
      new Date(2026, 0, 5, 10),
    );
  });

  it("pages to the previous week when a drag dwells at the right edge", async () => {
    vi.useFakeTimers();
    try {
      const onChangeDate = vi.fn();
      await render(grid({ onChangeDate, onDragEvent: vi.fn(), hideHours: true }));
      const width = Dimensions.get("window").width;
      const move = moveGesture();
      await act(() => {
        move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
        move.onUpdate?.({
          translationX: width,
          translationY: 0,
          absoluteX: width - 1,
          absoluteY: 300,
        });
        vi.advanceTimersByTime(600);
      });
      expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2025, 11, 29), {
        reason: "event-drag",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops an edge-dragged event onto the RTL column it landed on", async () => {
    vi.useFakeTimers();
    const prevVirtualized = (globalThis as Record<string, unknown>).__virtualizedPager;
    (globalThis as Record<string, unknown>).__virtualizedPager = true;
    try {
      const onDragEvent = vi.fn();
      const onChangeDate = vi.fn();
      const view = await render(grid({ onChangeDate, onDragEvent, hideHours: true }));
      const move = moveGesture();
      await act(() => {
        move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
        move.onUpdate?.({
          translationX: -200,
          translationY: 0,
          absoluteX: 1,
          absoluteY: 300,
        });
        vi.advanceTimersByTime(600);
      });
      expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2026, 0, 12), {
        reason: "event-drag",
      });
      await view.rerender(
        grid({ date: new Date(2026, 0, 12), onChangeDate, onDragEvent, hideHours: true }),
      );
      await act(() => {
        move.onEnd?.({ translationX: -200, translationY: 0 }, true);
        move.onFinalize?.({}, true);
      });
      // Leftmost column of the RTL week Jan 12-18 (weekStartsOn=1) is Sunday Jan 18.
      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const [event, start] = onDragEvent.mock.calls[0] as [CalendarEvent<WithId>, Date];
      expect(event).toBe(standup);
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(0);
      expect(start.getDate()).toBe(18);
    } finally {
      (globalThis as Record<string, unknown>).__virtualizedPager = prevVirtualized;
      vi.useRealTimers();
    }
  });
});

describe("MonthPager right to left", () => {
  it("puts the previous month on the next page", async () => {
    const onChangeDate = vi.fn();
    await rtlRender(
      <Calendar
        mode="month"
        date={new Date(2026, 0, 15)}
        events={[]}
        isRTL
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    const list = lastListProps();
    expect(list.data[list.initialScrollIndex]).toEqual(new Date(2026, 0, 1));
    expect(list.data[list.initialScrollIndex + 1]).toEqual(new Date(2025, 11, 1));
    const index = list.initialScrollIndex + 1;
    await act(() =>
      list.onViewableItemsChanged({
        viewableItems: [{ isViewable: true, index, item: list.data[index] }],
      }),
    );
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2025, 11, 1), {
      reason: "swipe",
    });
  });

  it("pages to the next month on ArrowLeft", async () => {
    const onChangeDate = vi.fn();
    await rtlRender(
      <Calendar
        mode="month"
        date={new Date(2026, 0, 15)}
        events={[]}
        isRTL
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    await act(() => pagerKeyHandlers.at(-1)?.(-1));
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2026, 1, 1), {
      reason: "keyboard",
    });
  });

  it("puts the previous weeks on the next multi-week page", async () => {
    const onChangeDate = vi.fn();
    await rtlRender(
      <Calendar
        mode="multiweek"
        numberOfWeeks={2}
        weekStartsOn={1}
        date={new Date(2026, 0, 6)}
        events={[]}
        isRTL
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    const list = lastListProps();
    expect(list.data[list.initialScrollIndex]).toEqual(new Date(2026, 0, 5));
    expect(list.data[list.initialScrollIndex + 1]).toEqual(new Date(2025, 11, 22));
    await act(() => pagerKeyHandlers.at(-1)?.(-1));
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2026, 0, 19), {
      reason: "keyboard",
    });
  });

  it("refreshes cached pages when isRTL toggles on MonthPager and MonthList", async () => {
    const pager = await rtlRender(
      <Calendar
        mode="month"
        date={new Date(2026, 0, 15)}
        events={[]}
        isRTL={false}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const pagerBefore = (lastListProps() as unknown as { extraData: { isRTL: boolean } }).extraData;
    await pager.rerender(
      <Calendar
        mode="month"
        date={new Date(2026, 0, 15)}
        events={[]}
        isRTL
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const pagerAfter = (lastListProps() as unknown as { extraData: { isRTL: boolean } }).extraData;
    expect(pagerBefore.isRTL).toBe(false);
    expect(pagerAfter.isRTL).toBe(true);
    await pager.unmount();

    const list = await rtlRender(
      <MonthList
        date={new Date(2026, 0, 15)}
        events={[]}
        weekStartsOn={1}
        isRTL={false}
        onPressEvent={noop}
      />,
    );
    const listBefore = (lastListProps() as unknown as { extraData: { isRTL: boolean } }).extraData;
    await list.rerender(
      <MonthList
        date={new Date(2026, 0, 15)}
        events={[]}
        weekStartsOn={1}
        isRTL
        onPressEvent={noop}
      />,
    );
    const listAfter = (lastListProps() as unknown as { extraData: { isRTL: boolean } }).extraData;
    expect(listBefore.isRTL).toBe(false);
    expect(listAfter.isRTL).toBe(true);
  });
});

describe("MonthView right to left", () => {
  it("caps selected range endpoints on the right for start and left for end", async () => {
    const { getAllByTestId } = await rtlRender(
      <MonthView
        date={new Date(2026, 0, 15)}
        events={[]}
        weekStartsOn={1}
        isRTL
        renderEvent={DefaultEvent}
        selectedRange={{ start: new Date(2026, 0, 6), end: new Date(2026, 0, 8) }}
        onPressEvent={noop}
      />,
    );
    // In RTL week row, Jan 8 (end) is left of Jan 7 (middle) is left of Jan 6 (start).
    const bands = getAllByTestId("month-range-band").map(flat);
    expect(bands).toHaveLength(3);
    const [endBand, midBand, startBand] = bands;
    expect(startBand.right).toBe("50%");
    expect(startBand.left).toBe(0);
    expect(startBand.borderTopRightRadius).toBeGreaterThan(0);
    expect(startBand.borderTopLeftRadius).toBeUndefined();
    expect(midBand.left).toBe(0);
    expect(midBand.right).toBe(0);
    expect(endBand.left).toBe("50%");
    expect(endBand.right).toBe(0);
    expect(endBand.borderTopLeftRadius).toBeGreaterThan(0);
    expect(endBand.borderTopRightRadius).toBeUndefined();
  });
});

describe("YearView right to left", () => {
  it("runs each week and the weekday initials right to left", async () => {
    const { getByTestId, getAllByText } = await rtlRender(
      <YearView date={new Date(2026, 0, 1)} weekStartsOn={0} isRTL onPressDay={noop} />,
    );
    // Thursday 1 January 2026: its first week row reads Saturday 3 to Thursday 1.
    const january = getByTestId("year-month-grid-0");
    const labels = january
      .queryAll((node) => typeof node.props.accessibilityLabel === "string")
      .map((node) => node.props.accessibilityLabel as string)
      .filter((label, index, all) => all.indexOf(label) === index)
      .slice(0, 3);
    expect(labels.map((label) => label.split(",")[1].trim())).toEqual([
      "3 January 2026",
      "2 January 2026",
      "1 January 2026",
    ]);
    // Sunday-start initials S M T W T F S, mirrored.
    const initials = getAllByText(/^[A-Z]$/, { includeHiddenElements: true })
      .slice(0, 7)
      .map((node) => node.props.children);
    expect(initials).toEqual(["S", "F", "T", "W", "T", "M", "S"]);
  });

  it.each([
    ["YearView", <YearView key="year" date={new Date(2026, 0, 1)} weekStartsOn={0} isRTL />],
    [
      "Calendar in year mode",
      <Calendar
        key="calendar"
        mode="year"
        date={new Date(2026, 0, 1)}
        events={[]}
        isRTL
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    ],
  ])("starts the months at the top right: %s", async (_name, element) => {
    const { getByLabelText } = await rtlRender(element);
    let grid = getByLabelText("January 2026").parent;
    while (grid && flat(grid).flexWrap !== "wrap") grid = grid.parent;
    expect(grid && flat(grid).flexDirection).toBe("row-reverse");
  });
});
