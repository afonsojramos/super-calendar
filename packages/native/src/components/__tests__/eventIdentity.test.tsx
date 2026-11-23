import * as gestureHandlerMock from "react-native-gesture-handler";
import * as reanimatedMock from "react-native-reanimated";
import { vi } from "vitest";
import { act, fireEvent } from "@testing-library/react-native";
import { type ReactElement, useRef } from "react";
import { Dimensions, Text } from "react-native";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";

// The real list cannot lay out in the test renderer. Render a pager's active
// page, or every row of a list, keyed like the list keys them.
vi.mock("@legendapp/list/react-native", async () => {
  const { Fragment, createElement } = await import("react");
  return {
    __esModule: true,
    LegendList: (props: {
      data?: unknown[];
      initialScrollIndex?: number;
      keyExtractor: (item: unknown) => string;
      renderItem: (info: { item: unknown; index: number }) => ReactElement;
    }) => {
      const data = props.data ?? [];
      if (props.initialScrollIndex === undefined) {
        return data.map((item, index) =>
          createElement(
            Fragment,
            { key: props.keyExtractor(item) },
            props.renderItem({ item, index }),
          ),
        );
      }
      const index = props.initialScrollIndex;
      const item = data[index];
      return item === undefined ? null : props.renderItem({ item, index });
    },
  };
});

import { Agenda } from "../Agenda";
import { MonthView } from "../MonthView";
import { TimeGrid } from "../TimeGrid";

// `getEventId` keeps rendered state and a held gesture on the same event when a
// refresh replaces every event object. Each refresh also renames the event, so a
// content key (the default, and what `contentKey` returns) cannot stand in for
// the ID. Passing both shows that `getEventId` wins.
type Item = CalendarEvent<{ id: string }>;
const getEventId = (event: Item) => event.id;
const contentKey = (event: Item) =>
  `${event.start.toISOString()}|${event.end.toISOString()}|${event.title}`;
const noop = () => {};

type Recorded = {
  calls: Record<string, unknown[]>;
  handlers: Record<string, ((...args: unknown[]) => void) | undefined>;
};
const gestures = () => (gestureHandlerMock as unknown as { __gestures: Recorded[] }).__gestures;
const flushReactions = () =>
  (
    reanimatedMock as unknown as { __flushAnimatedReactions: () => void }
  ).__flushAnimatedReactions();

// Counts how often each event's renderer mounted, so a remount shows up.
const mounts = new Map<string, number>();
function Probe({ event }: RenderEventArgs<{ id: string }>) {
  const id = useRef(event.id);
  const mounted = useRef(false);
  if (!mounted.current) {
    mounted.current = true;
    mounts.set(id.current, (mounts.get(id.current) ?? 0) + 1);
  }
  return <Text>{event.title}</Text>;
}

beforeEach(() => {
  gestures().length = 0;
  mounts.clear();
});

describe("TimeGrid", () => {
  const standup: Item = {
    id: "standup",
    title: "Standup",
    start: new Date(2026, 0, 6, 9),
    end: new Date(2026, 0, 6, 10),
  };
  const trip: Item = {
    id: "trip",
    title: "Trip",
    start: new Date(2026, 0, 6),
    end: new Date(2026, 0, 8),
    allDay: true,
  };
  const grid = (events: Item[], props: Record<string, unknown> = {}) => (
    <TimeGrid<{ id: string }>
      mode="week"
      date={new Date(2026, 0, 6, 12)}
      events={events}
      cellHeight={{ value: 48 } as never}
      hourHeight={48}
      weekStartsOn={1}
      renderEvent={Probe}
      onChangeDate={noop}
      onPressEvent={noop}
      {...props}
    />
  );
  // The timed event's long-press move: its only pan that waits 500 ms off the JS thread.
  const timedMove = () => {
    const pan = gestures().find(
      (gesture) => gesture.calls.activateAfterLongPress?.[0] === 500 && !gesture.calls.runOnJS,
    );
    if (!pan) throw new Error("timed move gesture not found");
    return pan.handlers;
  };
  // The bottom-edge resize: the first pan that is neither held nor run on JS.
  const bottomResize = () => {
    const pan = gestures().find(
      (gesture) =>
        gesture.calls.enabled &&
        !gesture.calls.activateAfterLongPress &&
        !gesture.calls.runOnJS &&
        gesture.handlers.onUpdate,
    );
    if (!pan) throw new Error("resize gesture not found");
    return pan.handlers;
  };
  // The all-day bar's move, which runs on the JS thread.
  const laneMove = () => {
    const pan = gestures().findLast(
      (gesture) => gesture.calls.activateAfterLongPress?.[0] === 500 && gesture.calls.runOnJS,
    );
    if (!pan) throw new Error("all-day move gesture not found");
    return pan.handlers;
  };

  it.each([
    { title: "getEventId", props: { getEventId } },
    {
      title: "getEventId over a keyExtractor that changes",
      props: { getEventId, keyExtractor: contentKey },
    },
  ])("keeps a timed event's renderer through a refresh with $title", async ({ props }) => {
    const view = await render(grid([standup], props));
    await view.rerender(grid([{ ...standup, title: "Standup moved" }], props));
    expect(view.getByText("Standup moved")).toBeTruthy();
    expect(mounts.get("standup")).toBe(1);
  });

  it("still keys events with the deprecated keyExtractor", async () => {
    const props = { keyExtractor: (event: Item) => event.id };
    const view = await render(grid([standup], props));
    await view.rerender(grid([{ ...standup, title: "Standup moved" }], props));
    expect(view.getByText("Standup moved")).toBeTruthy();
    expect(mounts.get("standup")).toBe(1);
  });

  it("keeps a held move on its event through a refresh", async () => {
    const onDragEvent = vi.fn();
    const props = { getEventId, keyExtractor: contentKey, onDragEvent };
    const view = await render(grid([standup], props));
    const move = timedMove();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 96, absoluteX: 200, absoluteY: 396 });
      flushReactions();
    });
    const refreshed = { ...standup, title: "Standup moved" };
    await view.rerender(grid([refreshed], props));
    await act(() => {
      move.onEnd?.({ translationX: 0, translationY: 96 }, true);
      move.onFinalize?.({}, true);
      flushReactions();
    });
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      refreshed,
      new Date(2026, 0, 6, 11),
      new Date(2026, 0, 6, 12),
    );
  });

  it("keeps a held resize on its event through a refresh", async () => {
    const onDragEvent = vi.fn();
    const props = { getEventId, keyExtractor: contentKey, onDragEvent };
    const view = await render(grid([standup], props));
    const resize = bottomResize();
    await act(() => {
      resize.onStart?.({});
      resize.onUpdate?.({ translationY: 48 });
    });
    const refreshed = { ...standup, title: "Standup longer" };
    await view.rerender(grid([refreshed], props));
    await act(() => {
      resize.onEnd?.({ translationY: 48 }, true);
      resize.onFinalize?.({}, true);
    });
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      refreshed,
      new Date(2026, 0, 6, 9),
      new Date(2026, 0, 6, 11),
    );
  });

  it("keeps a held all-day drag on its event through a refresh", async () => {
    const onDragEvent = vi.fn();
    const props = { getEventId, keyExtractor: contentKey, onDragEvent };
    const view = await render(grid([trip], props));
    const dayWidth = Dimensions.get("window").width / 7;
    const move = laneMove();
    await act(() => {
      move.onStart?.({ x: 1, translationX: 0 });
      move.onUpdate?.({ x: 1 + dayWidth * 2, translationX: dayWidth * 2 });
    });
    const refreshed = { ...trip, title: "Trip renamed" };
    await view.rerender(grid([refreshed], props));
    await act(() => {
      move.onEnd?.({}, true);
      move.onFinalize?.({}, true);
    });
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      refreshed,
      new Date(2026, 0, 8),
      new Date(2026, 0, 10),
    );
  });
});

describe("MonthView", () => {
  // Wednesday 17 to Friday 19 June 2026, on the third row of a 700x600 grid.
  const trip: Item = {
    id: "trip",
    title: "Trip",
    start: new Date(2026, 5, 17),
    end: new Date(2026, 5, 20),
    allDay: true,
  };
  const month = (events: Item[], onDragEvent = vi.fn()) => (
    <MonthView<{ id: string }>
      date={new Date(2026, 5, 15)}
      weekStartsOn={0}
      events={events}
      renderEvent={Probe}
      getEventId={getEventId}
      keyExtractor={contentKey}
      onPressEvent={noop}
      onDragEvent={onDragEvent}
    />
  );

  it("keeps a bar's renderer through a refresh", async () => {
    const view = await render(month([trip]));
    await view.rerender(month([{ ...trip, title: "Trip renamed" }]));
    expect(view.getByText("Trip renamed")).toBeTruthy();
    expect(mounts.get("trip")).toBe(1);
  });

  it("keeps a held move on its event through a refresh and commits the new object", async () => {
    const onDragEvent = vi.fn();
    const view = await render(month([trip], onDragEvent));
    await fireEvent(view.getByTestId("month-grid"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 600 } },
    });
    await act(() => {
      gestures().at(-1)?.handlers.onStart?.({ x: 350, y: 272 });
      gestures().at(-1)?.handlers.onUpdate?.({ x: 550, y: 272 });
    });
    const refreshed = { ...trip, title: "Trip renamed" };
    await view.rerender(month([refreshed], onDragEvent));
    // Gesture Handler keeps the active pan and calls its latest callbacks.
    await act(() => gestures().at(-1)?.handlers.onEnd?.({}, true));
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      refreshed,
      new Date(2026, 5, 19),
      new Date(2026, 5, 22),
    );
  });
});

describe("Agenda", () => {
  it("keeps a row's renderer through a refresh that inserts an earlier event", async () => {
    const lunch: Item = {
      id: "lunch",
      title: "Lunch",
      start: new Date(2026, 5, 23, 12),
      end: new Date(2026, 5, 23, 13),
    };
    const agenda = (events: Item[]) => (
      <Agenda<{ id: string }>
        events={events}
        renderEvent={Probe}
        getEventId={getEventId}
        keyExtractor={contentKey}
        onPressEvent={noop}
      />
    );
    const view = await render(agenda([lunch]));
    const standup: Item = {
      id: "standup",
      title: "Standup",
      start: new Date(2026, 5, 23, 9),
      end: new Date(2026, 5, 23, 9, 30),
    };
    await view.rerender(agenda([standup, { ...lunch, title: "Lunch moved" }]));
    expect(view.getByText("Lunch moved")).toBeTruthy();
    expect(mounts.get("lunch")).toBe(1);
  });
});
