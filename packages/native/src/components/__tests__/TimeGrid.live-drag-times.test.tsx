import * as reanimatedMock from "react-native-reanimated";
import * as gestureHandlerMock from "react-native-gesture-handler";
import { vi } from "vitest";
import { act } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Dimensions, Text } from "react-native";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";

vi.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: (props: any) => {
    const index = props.initialScrollIndex ?? 0;
    const item = props.data?.[index];
    return item === undefined ? null : props.renderItem({ item, index });
  },
}));

import { DefaultEvent } from "../DefaultEvent";
import { TimeGrid } from "../TimeGrid";

type WithId = { id: string };
type Handlers = {
  onStart?: (event: Record<string, number>) => void;
  onUpdate?: (event: Record<string, number>) => void;
  onEnd?: (event: Record<string, number>, success?: boolean) => void;
  onFinalize?: (event?: Record<string, number>, success?: boolean) => void;
};
type Chain = { calls: Record<string, unknown[]>; handlers: Handlers };

const chains = () => (gestureHandlerMock as unknown as { __gestures: Chain[] }).__gestures;
const reactions = () =>
  reanimatedMock as unknown as { __reactions: unknown[]; __flushAnimatedReactions: () => void };

const moveGesture = (index = 0) => {
  const gesture = chains().filter((chain) => chain.calls.activateAfterLongPress?.[0] === 500)[
    index
  ];
  if (!gesture) throw new Error("move gesture not found");
  return gesture.handlers;
};
// Each event builds a bottom and then a top resize pan.
const resizeGesture = (edge: "bottom" | "top") => {
  const pans = chains().filter(
    (chain) =>
      chain.calls.enabled && !chain.calls.activateAfterLongPress && chain.handlers.onUpdate,
  );
  const gesture = pans[edge === "bottom" ? 0 : 1];
  if (!gesture) throw new Error(`${edge} resize gesture not found`);
  return gesture.handlers;
};

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
let renders = 0;
const LiveEvent = ({ event }: RenderEventArgs<WithId>) => {
  renders += 1;
  return <Text>{`${hhmm(event.start)}-${hhmm(event.end)}`}</Text>;
};

const standup: CalendarEvent<WithId> = {
  id: "1",
  title: "Standup",
  start: new Date(2026, 0, 6, 9),
  end: new Date(2026, 0, 6, 10),
};

const grid = (props: {
  events?: CalendarEvent<WithId>[];
  mode?: "day" | "week";
  renderEvent?: typeof LiveEvent;
  onDragEvent?: (event: CalendarEvent<WithId>, start: Date, end: Date) => boolean | void;
  labels?: ComponentProps<typeof TimeGrid>["labels"];
}) => (
  <TimeGrid<WithId>
    labels={props.labels}
    mode={props.mode ?? "day"}
    date={(props.events ?? [standup])[0].start}
    events={props.events ?? [standup]}
    cellHeight={{ value: 48 } as never}
    hourHeight={48}
    weekStartsOn={1}
    hideHours
    renderEvent={props.renderEvent ?? LiveEvent}
    keyExtractor={(item) => item.id}
    onChangeDate={() => {}}
    onPressEvent={() => {}}
    onDragEvent={props.onDragEvent ?? vi.fn()}
  />
);

beforeEach(() => {
  chains().length = 0;
  reactions().__reactions.length = 0;
  renders = 0;
});

describe("TimeGrid live drag times", () => {
  it("passes the snapped times to the renderer while moving, one render per step", async () => {
    const onDragEvent = vi.fn();
    const { getByText, queryByText } = await render(grid({ onDragEvent }));
    const move = moveGesture();
    await act(() => move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 }));
    // A pick-up alone previews nothing new.
    expect(getByText("09:00-10:00")).toBeTruthy();
    const before = renders;
    // One hour at 48px per hour, a pixel per frame: four 15-minute steps, so four
    // renders, however many frames the finger moves.
    for (let y = 1; y <= 48; y += 1) {
      await act(() => {
        move.onUpdate?.({ translationX: 0, translationY: y, absoluteX: 200, absoluteY: 300 + y });
      });
    }
    expect(getByText("10:00-11:00")).toBeTruthy();
    expect(queryByText("09:00-10:00")).toBeNull();
    expect(renders - before).toBe(4);
    // Back at the origin the label follows.
    await act(() => {
      move.onUpdate?.({ translationX: 0, translationY: 20, absoluteX: 200, absoluteY: 320 });
    });
    expect(getByText("09:30-10:30")).toBeTruthy();
    await act(() => {
      move.onEnd?.({ translationX: 0, translationY: 20 }, true);
      move.onFinalize?.({}, true);
    });
    expect(onDragEvent).toHaveBeenCalledWith(
      standup,
      new Date(2026, 0, 6, 9, 30),
      new Date(2026, 0, 6, 10, 30),
    );
  });

  it("updates the built-in time label while moving", async () => {
    const { getByText } = await render(grid({ renderEvent: DefaultEvent }));
    const move = moveGesture();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
    });
    // Included hidden: a one-hour box this short hides the time line.
    expect(getByText("10:00 - 11:00", { includeHiddenElements: true })).toBeTruthy();
  });

  it("passes the previewed end while resizing from the bottom grip", async () => {
    const onDragEvent = vi.fn();
    const { getByText } = await render(grid({ onDragEvent }));
    const handle = resizeGesture("bottom");
    await act(() => {
      handle.onStart?.({});
      handle.onUpdate?.({ translationY: 24 });
    });
    expect(getByText("09:00-10:30")).toBeTruthy();
    await act(() => {
      handle.onEnd?.({ translationY: 24 }, true);
      handle.onFinalize?.({}, true);
    });
    expect(onDragEvent).toHaveBeenCalledWith(
      standup,
      new Date(2026, 0, 6, 9),
      new Date(2026, 0, 6, 10, 30),
    );
  });

  it("passes the previewed start while resizing from the top grip", async () => {
    // A rejected resize returns the renderer to the stored times.
    const { getByText } = await render(grid({ onDragEvent: () => false }));
    const handle = resizeGesture("top");
    await act(() => {
      handle.onStart?.({});
      handle.onUpdate?.({ translationY: 24 });
    });
    expect(getByText("09:30-10:00")).toBeTruthy();
    await act(() => {
      handle.onEnd?.({ translationY: 24 }, true);
      handle.onFinalize?.({}, true);
    });
    expect(getByText("09:00-10:00")).toBeTruthy();
  });

  it.each(["move", "resize"] as const)(
    "restores the stored times when a %s is cancelled",
    async (kind) => {
      const onDragEvent = vi.fn();
      const { getByText } = await render(grid({ onDragEvent }));
      const gesture = kind === "move" ? moveGesture() : resizeGesture("bottom");
      await act(() => {
        gesture.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
        gesture.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
      });
      expect(getByText(kind === "move" ? "10:00-11:00" : "09:00-11:00")).toBeTruthy();
      await act(() => gesture.onFinalize?.({}, false));
      expect(onDragEvent).not.toHaveBeenCalled();
      expect(getByText("09:00-10:00")).toBeTruthy();
    },
  );

  it("starts the next multi-day move from the committed times", async () => {
    const trip: CalendarEvent<WithId> = {
      id: "trip",
      title: "Trip",
      start: new Date(2026, 0, 6, 17),
      end: new Date(2026, 0, 8, 21),
    };
    let events = [trip];
    const onDragEvent = vi.fn((dragged: CalendarEvent<WithId>, start: Date, end: Date) => {
      events = [{ ...dragged, start, end }];
    });
    const { getAllByText, queryAllByText, rerender } = await render(
      grid({ mode: "week", events, onDragEvent }),
    );
    // The middle segment spans its whole day, so moving by hours keeps its geometry.
    const first = moveGesture(1);
    await act(() => {
      first.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      first.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
      first.onEnd?.({ translationX: 0, translationY: 48 }, true);
      first.onFinalize?.({}, true);
      reactions().__flushAnimatedReactions();
    });
    await rerender(grid({ mode: "week", events, onDragEvent }));
    await act(() => {
      moveGesture(1).onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      reactions().__flushAnimatedReactions();
    });
    expect(getAllByText("18:00-22:00", { includeHiddenElements: true }).length).toBeGreaterThan(0);
    expect(queryAllByText("19:00-23:00", { includeHiddenElements: true })).toHaveLength(0);
  });

  it("re-renders only the renderer while the times change", async () => {
    // The event box builds its accessibility actions on every render, so this
    // counts box renders. A box render also updates every gesture detector in it.
    const moveLater = vi.fn((minutes: number) => `Move ${minutes} minutes later`);
    await render(grid({ labels: { moveLater } }));
    const move = moveGesture();
    const built = chains().length;
    const boxRenders = moveLater.mock.calls.length;
    const before = renders;
    for (const y of [12, 24, 36, 48]) {
      await act(() => {
        move.onUpdate?.({ translationX: 0, translationY: y, absoluteX: 200, absoluteY: 300 + y });
      });
    }
    expect(renders - before).toBe(4);
    expect(moveLater.mock.calls.length).toBe(boxRenders);
    // A rebuilt gesture would tear down the drag under the finger.
    expect(chains().length).toBe(built);
  });

  it("shows the times the release commits when it lands past the last update", async () => {
    const onDragEvent = vi.fn();
    const { getByText } = await render(grid({ onDragEvent }));
    const move = moveGesture();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
      move.onEnd?.({ translationX: 0, translationY: 60 }, true);
      move.onFinalize?.({}, true);
    });
    expect(onDragEvent).toHaveBeenCalledWith(
      standup,
      new Date(2026, 0, 6, 10, 15),
      new Date(2026, 0, 6, 11, 15),
    );
    // The parent has not updated yet: the box holds the dropped place and times.
    expect(getByText("10:15-11:15")).toBeTruthy();
  });

  it("keeps a resize's times when the move gesture fails to activate", async () => {
    const { getByText } = await render(grid({}));
    const move = moveGesture();
    const handle = resizeGesture("bottom");
    await act(() => {
      handle.onStart?.({});
      handle.onUpdate?.({ translationY: 24 });
      // The grip's pan won, so the long-press move finalizes without starting.
      move.onFinalize?.({}, false);
    });
    expect(getByText("09:00-10:30")).toBeTruthy();
  });

  it("restores the stored times after a rejected drop", async () => {
    const { getByText } = await render(grid({ onDragEvent: () => false }));
    const move = moveGesture();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
    });
    expect(getByText("10:00-11:00")).toBeTruthy();
    await act(() => {
      move.onEnd?.({ translationX: 0, translationY: 48 }, true);
      move.onFinalize?.({}, true);
    });
    expect(getByText("09:00-10:00")).toBeTruthy();
  });

  it("shows the committed times once an accepting parent updates", async () => {
    let events = [standup];
    const onDragEvent = vi.fn((dragged: CalendarEvent<WithId>, start: Date, end: Date) => {
      events = [{ ...dragged, start, end }];
    });
    const { getByText, rerender } = await render(grid({ onDragEvent }));
    const move = moveGesture();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
      move.onEnd?.({ translationX: 0, translationY: 48 }, true);
      move.onFinalize?.({}, true);
    });
    await rerender(grid({ events, onDragEvent }));
    // Not shifted a second time on top of the committed times.
    expect(getByText("10:00-11:00")).toBeTruthy();
  });

  it("keeps the stored times in the floating copy once the drag pages", async () => {
    vi.useFakeTimers();
    try {
      const onChangeDate = vi.fn();
      const week = (date: Date) => (
        <TimeGrid<WithId>
          mode="week"
          date={date}
          events={[standup]}
          cellHeight={{ value: 48 } as never}
          hourHeight={48}
          weekStartsOn={1}
          renderEvent={LiveEvent}
          keyExtractor={(item) => item.id}
          onChangeDate={onChangeDate}
          onPressEvent={() => {}}
          onDragEvent={vi.fn()}
        />
      );
      const { getAllByText, queryAllByText, rerender } = await render(week(standup.start));
      const move = moveGesture();
      await act(() => {
        move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
        move.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
      });
      expect(getAllByText("10:00-11:00")).toHaveLength(1);
      // Hold at the right edge: the event lifts into the floating copy and pages.
      await act(() => {
        move.onUpdate?.({ translationX: 535, translationY: 48, absoluteX: 735, absoluteY: 798 });
        vi.advanceTimersByTime(600);
      });
      expect(onChangeDate).toHaveBeenCalledWith(new Date(2026, 0, 12), { reason: "event-drag" });
      await rerender(week(new Date(2026, 0, 12)));
      // The drop day is resolved on release, so the copy shows the stored times.
      expect(getAllByText("09:00-10:00", { includeHiddenElements: true })).toHaveLength(1);
      expect(queryAllByText("10:00-11:00", { includeHiddenElements: true })).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("previews the same times in the next-day spill", async () => {
    const late: CalendarEvent<WithId> = {
      id: "late",
      title: "Late",
      start: new Date(2026, 0, 6, 21),
      end: new Date(2026, 0, 6, 23),
    };
    const { getAllByText } = await render(grid({ mode: "week", events: [late] }));
    const move = moveGesture();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 96, absoluteX: 200, absoluteY: 396 });
      reactions().__flushAnimatedReactions();
    });
    // The dragged box and the preview of its tail in the next column agree.
    expect(getAllByText("23:00-01:00", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("previews the shifted times in every multi-day segment", async () => {
    const trip: CalendarEvent<WithId> = {
      id: "trip",
      title: "Trip",
      start: new Date(2026, 0, 6, 17),
      end: new Date(2026, 0, 8, 21),
    };
    const { getAllByText, getAllByTestId } = await render(grid({ mode: "week", events: [trip] }));
    const move = moveGesture(1);
    await act(() => move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 }));
    const previews = getAllByTestId("multi-day-move-preview", { includeHiddenElements: true });
    expect(previews).toHaveLength(7);
    await act(() => {
      move.onUpdate?.({
        translationX: Dimensions.get("window").width / 7,
        translationY: 48,
        absoluteX: 300,
        absoluteY: 348,
      });
      reactions().__flushAnimatedReactions();
    });
    // Every preview segment shows Jan 7 18:00 to Jan 9 22:00.
    expect(getAllByText("18:00-22:00", { includeHiddenElements: true })).toHaveLength(7);
  });
});
