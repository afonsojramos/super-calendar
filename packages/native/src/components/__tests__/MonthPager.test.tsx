import { startTransition, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";
import * as gestureHandlerMock from "react-native-gesture-handler";
import type { CreateGhostArgs } from "@super-calendar/core";
import type { CalendarEvent } from "../../types";

// Capture the props handed to the virtualized list, and render only the active
// page through `renderItem`. The real LegendList can't lay out in the test renderer (no
// measured dimensions), so it never mounts page content; this stand-in does,
// while still exposing the props we assert on.
const lastListProps = () => (globalThis as { __listProps?: Record<string, unknown> }).__listProps;
vi.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: (props: any) => {
    (globalThis as any).__listProps = props;
    useImperativeHandle(props.ref, () => ({
      scrollToIndex: (params: unknown) => (globalThis as any).__scrollToIndex?.(params),
    }));
    useEffect(() => {
      (globalThis as any).__listMounts = ((globalThis as any).__listMounts ?? 0) + 1;
    }, []);
    return useMemo(() => {
      const index = props.initialScrollIndex ?? 0;
      const item = props.data?.[index];
      return item === undefined ? null : props.renderItem({ item, index });
    }, [props.data, props.extraData]);
  },
}));

import { Calendar } from "../Calendar";

type WithId = { id: string };
const noop = () => {};

describe("MonthPager event updates", () => {
  // Pages are keyed by month Dates that never change, so a mounted page only
  // repaints when the list's `data` or `extraData` changes. Events supplied
  // after mount (the usual async fetch) change neither — so without feeding
  // `events` to the list as extraData, the month grid stays empty until the
  // pager remounts. Guard the wiring that makes external updates repaint.
  it("feeds the current events to the list as extraData", async () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const initialEvents: CalendarEvent<WithId>[] = [];
    const { rerender, getByLabelText, queryByLabelText } = await render(
      <Calendar
        mode="month"
        date={date}
        events={initialEvents}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(initialEvents);
    expect(queryByLabelText(/6 January 2026, 1 event$/)).toBeNull();

    // The fetch resolves after the pager (and its pages) mounted.
    const fetched: CalendarEvent<WithId>[] = [
      {
        id: "1",
        start: new Date(2026, 0, 6, 9, 0, 0),
        end: new Date(2026, 0, 6, 10, 0, 0),
        title: "Standup",
      },
    ];
    await rerender(
      <Calendar
        mode="month"
        date={date}
        events={fetched}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );

    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(fetched);
    expect(getByLabelText(/6 January 2026, 1 event$/)).toBeTruthy();
  });

  it("updates mounted pages when only chip dimensions change", async () => {
    const date = new Date(2026, 0, 6);
    const events: CalendarEvent[] = [
      { title: "One", start: date, end: new Date(2026, 0, 7), allDay: true },
      { title: "Two", start: date, end: new Date(2026, 0, 7), allDay: true },
    ];
    const props = {
      date,
      events,
      mode: "month" as const,
      onChangeDate: noop,
      onPressEvent: noop,
      maxVisibleEventCount: 1,
    };
    const { getByLabelText, rerender } = await render(
      <Calendar {...props} chipHeight={20} chipGap={2} />,
    );
    expect(getByLabelText(/6 January 2026, 2 events$/)).toHaveStyle({ gap: 2 });
    expect(getByLabelText(/1 more events, 6 January/)).toHaveStyle({ height: 20 });

    await rerender(<Calendar {...props} chipHeight={44} chipGap={2} />);
    expect(getByLabelText(/1 more events, 6 January/)).toHaveStyle({ height: 44 });

    await rerender(<Calendar {...props} chipHeight={44} chipGap={6} />);
    expect(getByLabelText(/6 January 2026, 2 events$/)).toHaveStyle({ gap: 6 });
  });
});

describe("MonthPager creation preview updates", () => {
  it.each(["month", "multiweek"] as const)(
    "updates the cached %s page renderer and creation callback",
    async (mode) => {
      const first = vi.fn();
      const replacement = vi.fn();
      const First = ({ start }: CreateGhostArgs) => <Text>{`First ${start.getDate()}`}</Text>;
      const Second = ({ start }: CreateGhostArgs) => <Text>{`Second ${start.getDate()}`}</Text>;
      const props = {
        mode,
        date: new Date(2026, 5, 15),
        events: [] as CalendarEvent[],
        weekStartsOn: 0 as const,
        onChangeDate: noop,
        onPressEvent: noop,
      };
      const view = await render(
        <Calendar {...props} onCreateEvent={first} renderCreateGhost={First} />,
      );
      await fireEvent(
        view.getByTestId(mode === "month" ? "month-grid" : "multiweek-grid"),
        "layout",
        {
          nativeEvent: { layout: { x: 0, y: 0, width: 700, height: mode === "month" ? 600 : 240 } },
        },
      );
      const gesture = () => {
        const { __gestures } = gestureHandlerMock as unknown as {
          __gestures: { handlers: Record<string, (...args: unknown[]) => void> }[];
        };
        return __gestures.at(-1)!.handlers;
      };
      await act(() => gesture().onStart({ x: 250, y: mode === "month" ? 248 : 8 }));
      expect(view.getByText("First 16", { includeHiddenElements: true })).toBeTruthy();
      await view.rerender(<Calendar {...props} onCreateEvent={first} renderCreateGhost={Second} />);
      expect(view.getByText("Second 16", { includeHiddenElements: true })).toBeTruthy();
      expect(view.queryByText("First 16", { includeHiddenElements: true })).toBeNull();
      await view.rerender(
        <Calendar {...props} onCreateEvent={replacement} renderCreateGhost={Second} />,
      );
      await act(() => gesture().onEnd({}, true));
      expect(first).not.toHaveBeenCalled();
      expect(replacement).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 5, 16),
        new Date(2026, 5, 17),
      );
      await act(() => gesture().onStart({ x: 250, y: mode === "month" ? 248 : 8 }));
      await view.rerender(<Calendar {...props} renderCreateGhost={Second} />);
      expect(view.queryByTestId("month-create-ghost", { includeHiddenElements: true })).toBeNull();
    },
  );
});

describe("MonthPager creation preview styling", () => {
  it.each(["month", "multiweek"] as const)(
    "updates cached %s preview styles and classes",
    async (mode) => {
      const Draft = ({ start }: CreateGhostArgs) => <Text>{`Draft ${start.getDate()}`}</Text>;
      const props = {
        mode,
        date: new Date(2026, 5, 15),
        events: [] as CalendarEvent[],
        weekStartsOn: 0 as const,
        onChangeDate: noop,
        onPressEvent: noop,
        onCreateEvent: noop,
        renderCreateGhost: Draft,
      };
      const firstStyle = { createGhost: { backgroundColor: "red" } };
      const secondStyle = { createGhost: { backgroundColor: "blue" } };
      const view = await render(
        <Calendar {...props} styles={firstStyle} classNames={{ createGhost: "first" }} />,
      );
      await fireEvent(
        view.getByTestId(mode === "month" ? "month-grid" : "multiweek-grid"),
        "layout",
        {
          nativeEvent: { layout: { x: 0, y: 0, width: 700, height: mode === "month" ? 600 : 240 } },
        },
      );
      const { __gestures } = gestureHandlerMock as unknown as {
        __gestures: { handlers: Record<string, (...args: unknown[]) => void> }[];
      };
      await act(() =>
        __gestures.at(-1)!.handlers.onStart({ x: 250, y: mode === "month" ? 248 : 8 }),
      );
      const ghost = () => view.getByTestId("month-create-ghost", { includeHiddenElements: true });
      expect(ghost()).toHaveStyle({ backgroundColor: "red" });
      expect(ghost().props.className).toBe("first");
      await view.rerender(
        <Calendar {...props} styles={secondStyle} classNames={{ createGhost: "first" }} />,
      );
      expect(ghost()).toHaveStyle({ backgroundColor: "blue" });
      await view.rerender(
        <Calendar {...props} styles={secondStyle} classNames={{ createGhost: "second" }} />,
      );
      expect(ghost().props.className).toBe("second");
    },
  );
});

describe("MonthPager container resize", () => {
  const layout = (width: number, height: number) => ({
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });

  const listMounts = () => (globalThis as { __listMounts?: number }).__listMounts ?? 0;

  afterEach(() => {
    delete (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex;
  });

  it.each(["month", "multiweek"] as const)(
    "resizes the mounted %s page and keeps it in view when the container size changes",
    async (mode) => {
      const scrollToIndex = vi.fn();
      (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex = scrollToIndex;
      const view = await render(
        <Calendar
          mode={mode}
          date={new Date(2026, 10, 6)}
          events={[]}
          onChangeDate={noop}
          onPressEvent={noop}
        />,
      );
      const pager = view.getByTestId("month-pager");
      const page = () => view.getByTestId("month-pager-page");

      await fireEvent(pager, "layout", layout(400, 500));
      expect(page()).toHaveStyle({ width: 400, height: 500 });
      const activeIndex = lastListProps()?.initialScrollIndex;
      const mounts = listMounts();
      scrollToIndex.mockClear();

      // The native scroll offset keeps the old `index * width`, so each resize
      // must scroll back to the committed page.
      await fireEvent(pager, "layout", layout(240, 500));
      expect(page()).toHaveStyle({ width: 240 });
      expect(scrollToIndex).toHaveBeenCalledExactlyOnceWith({
        index: activeIndex,
        animated: false,
      });
      await fireEvent(pager, "layout", layout(400, 500));
      expect(page()).toHaveStyle({ width: 400 });
      expect(scrollToIndex).toHaveBeenCalledTimes(2);

      // A height change only re-renders the pages; the scroll offset still holds.
      await fireEvent(pager, "layout", layout(400, 320));
      expect(page()).toHaveStyle({ width: 400, height: 320 });
      expect(scrollToIndex).toHaveBeenCalledTimes(2);

      // Remounting the list would rebuild every page and flash it blank.
      expect(listMounts()).toBe(mounts);
    },
  );
});

describe("MonthPager title", () => {
  const date = new Date(2026, 0, 6);

  it("renders the built-in 'MMMM yyyy' title by default", async () => {
    const { getByText } = await render(
      <Calendar mode="month" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect(getByText("January 2026")).toBeTruthy();
  });

  it("hides it with showTitle={false}, so an app header can own the label", async () => {
    const { queryByText } = await render(
      <Calendar
        mode="month"
        date={date}
        events={[]}
        showTitle={false}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(queryByText("January 2026")).toBeNull();
  });
});

describe("MonthPager controlled swipes", () => {
  afterEach(() => {
    delete (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex;
  });

  const swipeTo = async (index: number) => {
    const list = lastListProps() as {
      data: Date[];
      onViewableItemsChanged: (info: unknown) => void;
    };
    await act(() =>
      list.onViewableItemsChanged({
        viewableItems: [{ isViewable: true, index, item: list.data[index] }],
      }),
    );
  };

  it.each(["month", "multiweek"] as const)(
    "pages the %s pager back when the app keeps the date after a swipe",
    async (mode) => {
      const scrollToIndex = vi.fn();
      (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex = scrollToIndex;
      const onChangeDate = vi.fn();
      await render(
        <Calendar
          mode={mode}
          date={new Date(2026, 10, 6)}
          events={[]}
          onChangeDate={onChangeDate}
          onPressEvent={noop}
        />,
      );
      const activeIndex = lastListProps()?.initialScrollIndex as number;
      await swipeTo(activeIndex + 1);
      expect(onChangeDate).toHaveBeenCalledTimes(1);
      // The app ignored the change, so the pager must return to the date it shows.
      expect(scrollToIndex).toHaveBeenLastCalledWith({ index: activeIndex, animated: true });
    },
  );

  it("reports a swipe made while the pager is paging back", async () => {
    const scrollToIndex = vi.fn();
    (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex = scrollToIndex;
    const onChangeDate = vi.fn();
    await render(
      <Calendar
        mode="month"
        date={new Date(2026, 10, 6)}
        events={[]}
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    const activeIndex = lastListProps()?.initialScrollIndex as number;
    await swipeTo(activeIndex + 1);
    // The user grabs the pager before the page-back lands and swipes forward again.
    await act(() => (lastListProps() as { onScrollBeginDrag: () => void }).onScrollBeginDrag());
    await swipeTo(activeIndex + 1);
    expect(onChangeDate).toHaveBeenCalledTimes(2);
  });

  it("waits for the finger to lift before paging back", async () => {
    const scrollToIndex = vi.fn();
    (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex = scrollToIndex;
    await render(
      <Calendar
        mode="month"
        date={new Date(2026, 10, 6)}
        events={[]}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const activeIndex = lastListProps()?.initialScrollIndex as number;
    const drag = lastListProps() as { onScrollBeginDrag: () => void; onScrollEndDrag: () => void };
    await act(() => drag.onScrollBeginDrag());
    // A slow drag shows the next month before the finger lifts.
    await swipeTo(activeIndex + 1);
    expect(scrollToIndex).not.toHaveBeenCalled();
    await act(() => (lastListProps() as typeof drag).onScrollEndDrag());
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: activeIndex, animated: true });
  });

  it("pages back when a parent view cancels the drag", async () => {
    const scrollToIndex = vi.fn();
    (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex = scrollToIndex;
    await render(
      <Calendar
        mode="month"
        date={new Date(2026, 10, 6)}
        events={[]}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const activeIndex = lastListProps()?.initialScrollIndex as number;
    type Touch = { onScrollBeginDrag: () => void; onTouchCancel: () => void };
    await act(() => (lastListProps() as Touch).onScrollBeginDrag());
    await swipeTo(activeIndex + 1);
    // No drag end arrives for a cancelled gesture, only the touch cancel.
    await act(() => (lastListProps() as Touch).onTouchCancel());
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: activeIndex, animated: true });
  });

  it("does not page back when the app accepts the date in a transition", async () => {
    const scrollToIndex = vi.fn();
    (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex = scrollToIndex;
    function Controlled() {
      const [date, setDate] = useState(new Date(2026, 10, 6));
      return (
        <Calendar
          mode="month"
          date={date}
          events={[]}
          onChangeDate={(next) => startTransition(() => setDate(next))}
          onPressEvent={noop}
        />
      );
    }
    await render(<Controlled />);
    const activeIndex = lastListProps()?.initialScrollIndex as number;
    await swipeTo(activeIndex + 1);
    expect(scrollToIndex).not.toHaveBeenCalled();
  });

  it("stays on the swiped page when the app accepts the date", async () => {
    const scrollToIndex = vi.fn();
    (globalThis as { __scrollToIndex?: unknown }).__scrollToIndex = scrollToIndex;
    function Controlled() {
      const [date, setDate] = useState(new Date(2026, 10, 6));
      return (
        <Calendar mode="month" date={date} events={[]} onChangeDate={setDate} onPressEvent={noop} />
      );
    }
    await render(<Controlled />);
    const activeIndex = lastListProps()?.initialScrollIndex as number;
    await swipeTo(activeIndex + 1);
    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
