import * as gestureHandlerMock from "react-native-gesture-handler";
import * as reanimatedMock from "react-native-reanimated";
import { vi } from "vitest";
import { act, type RenderResult, screen } from "@testing-library/react-native";
import { type ComponentProps, startTransition, useState } from "react";
import { Dimensions, StyleSheet, Text } from "react-native";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";
import { TimeGrid } from "../TimeGrid";

// A held edge drag pages the virtualized pager several times. The page the drag
// started on scrolls out of the list's draw distance after two pages, and a real
// list unmounts it with the event box and its gesture detector. These tests run
// the pager stand-in in its virtualized mode and release only gestures whose
// detector is still mounted, as React Native Gesture Handler does.

type WithId = { id: string };
type MoveHandlers = {
  onStart?: (event: Record<string, number>) => void;
  onUpdate?: (event: Record<string, number>) => void;
  onEnd?: (event: Record<string, number>, success?: boolean) => void;
  onFinalize?: (event: Record<string, number>, success?: boolean) => void;
};
type RecordedGesture = {
  calls: Record<string, unknown[]>;
  handlers: MoveHandlers;
  meta: { dropped: boolean };
};

const standup: CalendarEvent<WithId> = {
  id: "1",
  start: new Date(2026, 0, 6, 9, 0, 0),
  end: new Date(2026, 0, 6, 10, 0, 0),
  title: "Standup",
};
const noop = () => {};
const EDGE_DWELL_MS = 600;
const EDGE_REPEAT_MS = 700;

const reanimated = reanimatedMock as unknown as {
  __jsQueue: (() => void)[];
  __deferRunOnJS: (enabled: boolean) => void;
};
const lastPagerProps = () =>
  (globalThis as unknown as { __listProps: { data: Date[] } }).__listProps;

const recordedGestures = () =>
  (gestureHandlerMock as unknown as { __gestures: RecordedGesture[] }).__gestures;
// The first long-press move gesture built, which is the one a drag started on.
const moveGesture = () => {
  const gesture = recordedGestures().find(
    (candidate) => candidate.calls.activateAfterLongPress?.[0] === 500,
  );
  if (!gesture) throw new Error("move gesture not found");
  return gesture;
};
// Lifting the finger reaches a gesture only while its detector is mounted.
const release = (gesture: RecordedGesture, event: Record<string, number>, success = true) => {
  if (gesture.meta.dropped) return;
  if (success) gesture.handlers.onEnd?.(event, true);
  gesture.handlers.onFinalize?.(event, success);
};

// The floating copy is the only rendering of the event inside a view that
// ignores touches.
const floatingCopies = (result: RenderResult) =>
  result.queryAllByText("Standup").filter((node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.props.pointerEvents === "none") return true;
    }
    return false;
  });

// The opacity of the event box around a rendered title: the nearest ancestor
// that sets one.
const boxOpacity = (node: ReturnType<RenderResult["getByText"]>) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const style = StyleSheet.flatten(parent.props.style) as { opacity?: number } | undefined;
    if (typeof style?.opacity === "number") return style.opacity;
  }
  return undefined;
};

const TitleOnly = ({ event }: RenderEventArgs<WithId>) => <Text>{event.title}</Text>;

// An app that keeps `date` and `events` in state and accepts every change, or,
// with `keepDate`, ignores every date change (the example app's **Keep date**).
function ControlledGrid({
  initialEvents,
  onChangeDate,
  onDragEvent,
  eventsRef,
  keepDate = false,
  transition = false,
  getEventId,
  eventOverlap,
  multiDayTimedEventPlacement,
}: {
  initialEvents: CalendarEvent<WithId>[];
  onChangeDate: ComponentProps<typeof TimeGrid<WithId>>["onChangeDate"];
  onDragEvent: (event: CalendarEvent<WithId>, start: Date, end: Date) => boolean | void;
  eventsRef?: { set?: (events: CalendarEvent<WithId>[]) => void };
  keepDate?: boolean;
  transition?: boolean;
  getEventId?: ComponentProps<typeof TimeGrid<WithId>>["getEventId"];
  eventOverlap?: boolean;
  multiDayTimedEventPlacement?: ComponentProps<
    typeof TimeGrid<WithId>
  >["multiDayTimedEventPlacement"];
}) {
  const [date, setDate] = useState(new Date(2026, 0, 6, 12, 0, 0));
  const [events, setEvents] = useState(initialEvents);
  if (eventsRef) eventsRef.set = setEvents;
  return (
    <TimeGrid<WithId>
      mode="week"
      date={date}
      events={events}
      cellHeight={{ value: 48 } as never}
      hourHeight={48}
      weekStartsOn={1}
      hideHours
      renderEvent={TitleOnly}
      getEventId={getEventId}
      keyExtractor={getEventId ? undefined : (item) => item.id}
      eventOverlap={eventOverlap}
      multiDayTimedEventPlacement={multiDayTimedEventPlacement}
      onChangeDate={(next, details) => {
        onChangeDate(next, details);
        if (keepDate) return;
        if (transition) startTransition(() => setDate(next));
        else setDate(next);
      }}
      onPressEvent={noop}
      onDragEvent={onDragEvent}
    />
  );
}

describe("TimeGrid edge paging past the mounted pages", () => {
  beforeEach(() => {
    recordedGestures().length = 0;
    (globalThis as { __virtualizedPager?: boolean }).__virtualizedPager = true;
    vi.useFakeTimers();
  });
  afterEach(() => {
    (globalThis as { __virtualizedPager?: boolean }).__virtualizedPager = false;
    vi.useRealTimers();
  });

  // Pick the event up on Tuesday and hold the finger inside the left edge zone.
  // Call `moveGesture()` before awaiting this: the recorded gesture answers any
  // property, `then` included, so an async function must not return it.
  const holdAtLeftEdge = async (move: RecordedGesture, pages: number) => {
    await act(() => {
      move.handlers.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.handlers.onUpdate?.({
        translationX: -190,
        translationY: 0,
        absoluteX: 10,
        absoluteY: 750,
      });
    });
    await act(() => {
      vi.advanceTimersByTime(EDGE_DWELL_MS + EDGE_REPEAT_MS * (pages - 1));
    });
  };

  it.each([3, 5])(
    "drops the event on the week %i pages back and clears the floating copy",
    async (pages) => {
      const onChangeDate = vi.fn();
      const onDragEvent = vi.fn();
      const result = await render(
        <ControlledGrid
          initialEvents={[standup]}
          onChangeDate={onChangeDate}
          onDragEvent={onDragEvent}
        />,
      );
      const move = moveGesture();
      await holdAtLeftEdge(move, pages);
      expect(onChangeDate).toHaveBeenCalledTimes(pages);
      expect(onChangeDate).toHaveBeenLastCalledWith(new Date(2026, 0, 5 - 7 * pages), {
        reason: "event-drag",
      });
      expect(floatingCopies(result).length).toBe(1);

      // Carry the copy onto that week's Wednesday and lift the finger. The grab
      // was 10px into the box, so the copy's left edge sits on the column's.
      const columnWidth = Dimensions.get("window").width / 7;
      const finger = { translationX: 0, translationY: 0, absoluteX: 2 * columnWidth + 10 };
      await act(() => {
        move.handlers.onUpdate?.({ ...finger, absoluteY: 750 });
        release(move, { ...finger, absoluteY: 750 });
      });

      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const wednesday = 7 - 7 * pages;
      expect(onDragEvent).toHaveBeenCalledWith(
        standup,
        new Date(2026, 0, wednesday, 14),
        new Date(2026, 0, wednesday, 15),
      );
      expect(floatingCopies(result).length).toBe(0);
      // Paging stops with the drag.
      await act(() => {
        vi.advanceTimersByTime(EDGE_REPEAT_MS * 3);
      });
      expect(onChangeDate).toHaveBeenCalledTimes(pages);
    },
  );

  it("snaps a cancelled drag back to its own week without a drop", async () => {
    const onChangeDate = vi.fn();
    const onDragEvent = vi.fn();
    const result = await render(
      <ControlledGrid
        initialEvents={[standup]}
        onChangeDate={onChangeDate}
        onDragEvent={onDragEvent}
      />,
    );
    const move = moveGesture();
    await holdAtLeftEdge(move, 4);
    expect(floatingCopies(result).length).toBe(1);
    await act(() => {
      release(move, { translationX: 0, translationY: 0, absoluteX: 10, absoluteY: 750 }, false);
    });
    expect(floatingCopies(result).length).toBe(0);
    // A cancel is not a release: the event stays put, and the view returns to it.
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onChangeDate).toHaveBeenCalledTimes(5);
    expect(onChangeDate).toHaveBeenLastCalledWith(standup.start, { reason: "event-drag" });
    await act(() => {
      vi.advanceTimersByTime(EDGE_REPEAT_MS * 3);
    });
    expect(onChangeDate).toHaveBeenCalledTimes(5);
  });

  // An edge page scrolls with an animation. On Android a later scroll without
  // one does not stop it, so a page-back sent that way can lose to an edge page
  // still animating and leave the grid past the week it was sent to.
  it.each([
    { label: "a cancelled drag", success: false, accept: true },
    { label: "a rejected drop", success: true, accept: false },
  ])("pages back after $label with an animated scroll of its own", async ({ success, accept }) => {
    const onChangeDate = vi.fn();
    const onDragEvent = vi.fn(() => accept);
    await render(
      <ControlledGrid
        initialEvents={[standup]}
        onChangeDate={onChangeDate}
        onDragEvent={onDragEvent}
      />,
    );
    const move = moveGesture();
    await holdAtLeftEdge(move, 3);
    const scrolls = () =>
      (globalThis as { __scrollToIndexCalls?: { index: number; animated: boolean }[] })
        .__scrollToIndexCalls ?? [];
    const before = scrolls().length;
    await act(() => {
      release(move, atLeftEdge, success);
    });
    expect(onChangeDate).toHaveBeenLastCalledWith(standup.start, { reason: "event-drag" });
    const pageBack = scrolls().slice(before);
    expect(pageBack).toHaveLength(1);
    expect(pageBack[0]?.animated).toBe(true);
    expect(lastPagerProps().data[pageBack[0]!.index]).toEqual(new Date(2026, 0, 5));
  });

  it("reports the page-back without scrolling when the grid is already on the event's week", async () => {
    const onChangeDate = vi.fn();
    await render(
      <ControlledGrid
        initialEvents={[standup]}
        onChangeDate={onChangeDate}
        onDragEvent={vi.fn()}
      />,
    );
    const move = moveGesture();
    await holdAtLeftEdge(move, 1);
    // The finger crosses to the right edge, which pages back to the event's week.
    const width = Dimensions.get("window").width;
    const atRightEdge = { ...atLeftEdge, translationX: width - 200, absoluteX: width - 10 };
    await act(() => {
      move.handlers.onUpdate?.(atRightEdge);
    });
    await act(() => {
      vi.advanceTimersByTime(EDGE_DWELL_MS);
    });
    expect(onChangeDate).toHaveBeenLastCalledWith(new Date(2026, 0, 5), { reason: "event-drag" });
    const scrolls = () =>
      (globalThis as { __scrollToIndexCalls?: unknown[] }).__scrollToIndexCalls ?? [];
    const before = scrolls().length;
    await act(() => {
      release(move, atRightEdge, false);
    });
    expect(onChangeDate).toHaveBeenLastCalledWith(standup.start, { reason: "event-drag" });
    expect(scrolls().length).toBe(before);
  });

  it("clears the floating copy without a drop when the dragged box unmounts", async () => {
    const onChangeDate = vi.fn();
    const onDragEvent = vi.fn();
    const eventsRef: { set?: (events: CalendarEvent<WithId>[]) => void } = {};
    const result = await render(
      <ControlledGrid
        initialEvents={[standup]}
        onChangeDate={onChangeDate}
        onDragEvent={onDragEvent}
        eventsRef={eventsRef}
      />,
    );
    const move = moveGesture();
    await holdAtLeftEdge(move, 3);
    expect(floatingCopies(result).length).toBe(1);
    // The app removes the event mid-drag, so its box and gesture go away.
    await act(() => {
      eventsRef.set?.([]);
    });
    expect(move.meta.dropped).toBe(true);
    expect(floatingCopies(result).length).toBe(0);
    await act(() => {
      vi.advanceTimersByTime(EDGE_REPEAT_MS * 3);
    });
    expect(onChangeDate).toHaveBeenCalledTimes(3);
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("clears the move preview of an overnight event whose box unmounts mid-lift", async () => {
    const overnight: CalendarEvent<WithId> = {
      ...standup,
      start: new Date(2026, 0, 6, 22),
      end: new Date(2026, 0, 7, 2),
    };
    const eventsRef: { set?: (events: CalendarEvent<WithId>[]) => void } = {};
    const result = await render(
      <ControlledGrid
        initialEvents={[overnight]}
        onChangeDate={vi.fn()}
        onDragEvent={vi.fn()}
        eventsRef={eventsRef}
      />,
    );
    const move = moveGesture();
    // One page, so the page the drag started on stays within reach.
    await holdAtLeftEdge(move, 1);
    const previews = () =>
      result.queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }).length;
    expect(previews()).toBeGreaterThan(0);
    await act(() => {
      eventsRef.set?.([]);
    });
    expect(previews()).toBe(0);
  });

  // The finger still in the left edge zone, where the device runs released it.
  // The copy is clamped onto Monday there.
  const atLeftEdge = { translationX: -190, translationY: 0, absoluteX: 10, absoluteY: 750 };

  it("starts no page change once the finger has lifted", async () => {
    const onChangeDate = vi.fn();
    const onDragEvent = vi.fn();
    const result = await render(
      <ControlledGrid
        initialEvents={[standup]}
        onChangeDate={onChangeDate}
        onDragEvent={onDragEvent}
      />,
    );
    const move = moveGesture();
    await holdAtLeftEdge(move, 1);
    // The finger lifts on the UI thread, and the next page's dwell timer fires on
    // the JavaScript thread before the release reaches it.
    reanimated.__deferRunOnJS(true);
    await act(() => {
      release(move, atLeftEdge);
      vi.advanceTimersByTime(EDGE_REPEAT_MS);
    });
    const queued = [...reanimated.__jsQueue];
    reanimated.__deferRunOnJS(false);
    await act(() => {
      for (const run of queued) run();
    });

    expect(onChangeDate).toHaveBeenCalledTimes(1);
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    expect(onDragEvent).toHaveBeenCalledWith(
      standup,
      new Date(2025, 11, 29, 14),
      new Date(2025, 11, 29, 15),
    );
    expect(floatingCopies(result).length).toBe(0);
  });

  it.each([
    { label: "directly", transition: false },
    { label: "in a transition", transition: true },
  ])(
    "drops on the page the pager is moving to when the finger lifts as it pages, for an app that sets date $label",
    async ({ transition }) => {
      const onChangeDate = vi.fn();
      const onDragEvent = vi.fn();
      const result = await render(
        <ControlledGrid
          initialEvents={[standup]}
          onChangeDate={onChangeDate}
          onDragEvent={onDragEvent}
          transition={transition}
        />,
      );
      const move = moveGesture();
      await holdAtLeftEdge(move, 1);
      // The second page starts, and the finger lifts before the app's new date
      // renders.
      await act(() => {
        vi.advanceTimersByTime(EDGE_REPEAT_MS);
        release(move, atLeftEdge);
      });

      expect(onChangeDate).toHaveBeenCalledTimes(2);
      const scrolls = (globalThis as { __scrollToIndexCalls?: { index: number }[] })
        .__scrollToIndexCalls;
      const pager = lastPagerProps();
      expect(pager.data[scrolls!.at(-1)!.index]).toEqual(new Date(2025, 11, 22));
      expect(onDragEvent).toHaveBeenCalledTimes(1);
      expect(onDragEvent).toHaveBeenCalledWith(
        standup,
        new Date(2025, 11, 22, 14),
        new Date(2025, 11, 22, 15),
      );
      expect(floatingCopies(result).length).toBe(0);
    },
  );

  // Fabric mounts the children of a view that is not a stacking context into its
  // nearest ancestor that is. A page that became one only while inactive (through
  // its accessibility props) moved its events into a new parent on every page
  // change, and iOS cancels a touch whose view leaves the window.
  it("keeps every page a stacking context, active or not", async () => {
    await render(
      <ControlledGrid initialEvents={[standup]} onChangeDate={vi.fn()} onDragEvent={vi.fn()} />,
    );
    const pages = screen.queryAllByTestId("time-grid-page", { includeHiddenElements: true });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.props.collapsable).toBe(false);
  });

  it.each([
    { label: "takes the drop", accept: true },
    { label: "rejects the drop", accept: false },
  ])(
    "drops on the week the app kept when it declines the page the drag moved to, and $label",
    async ({ accept }) => {
      const onChangeDate = vi.fn();
      const onDragEvent = vi.fn(() => accept);
      const result = await render(
        <ControlledGrid
          initialEvents={[standup]}
          onChangeDate={onChangeDate}
          onDragEvent={onDragEvent}
          keepDate
        />,
      );
      const move = moveGesture();
      await holdAtLeftEdge(move, 1);
      // The next page starts, and the finger lifts before the app has answered it.
      await act(() => {
        vi.advanceTimersByTime(EDGE_REPEAT_MS);
        release(move, atLeftEdge);
      });

      expect(onDragEvent).toHaveBeenCalledTimes(1);
      expect(onDragEvent).toHaveBeenCalledWith(
        standup,
        new Date(2026, 0, 5, 14),
        new Date(2026, 0, 5, 15),
      );
      expect(floatingCopies(result).length).toBe(0);
      // Two edge pages, then, for a rejected drop, the page back to the event.
      expect(onChangeDate).toHaveBeenCalledTimes(accept ? 2 : 3);
      if (!accept) {
        expect(onChangeDate).toHaveBeenLastCalledWith(standup.start, { reason: "event-drag" });
      }
    },
  );

  // The box hides while its floating copy stands in, through shared values the
  // UI thread applies. An Android device left it hidden after a cancel while
  // the app was in the background, so a lift that ends without moving the
  // event mounts the box afresh rather than trusting those values to reset.
  it.each([
    { label: "a cancelled drag", success: false, accept: true },
    { label: "a rejected drop", success: true, accept: false },
  ])("mounts the event's box afresh after $label", async ({ success, accept }) => {
    const onDragEvent = vi.fn(() => accept);
    const result = await render(
      <ControlledGrid initialEvents={[standup]} onChangeDate={vi.fn()} onDragEvent={onDragEvent} />,
    );
    const move = moveGesture();
    // One page, so the page the drag started on stays mounted throughout, as
    // LegendList keeps a page it has drawn until it needs the slot.
    await holdAtLeftEdge(move, 1);
    await act(() => {
      release(move, atLeftEdge, success);
    });

    expect(move.meta.dropped).toBe(true);
    expect(floatingCopies(result).length).toBe(0);
    const [title] = result.getAllByText("Standup");
    expect(boxOpacity(title)).toBe(1);
  });

  it("passes the refreshed event object and skips self-overlap after a mid-lift refresh with getEventId", async () => {
    const eventsRef: { set?: (events: CalendarEvent<WithId>[]) => void } = {};
    const onDragEvent = vi.fn();
    const result = await render(
      <ControlledGrid
        initialEvents={[standup]}
        eventsRef={eventsRef}
        onChangeDate={vi.fn()}
        onDragEvent={onDragEvent}
        getEventId={(item) => item.id}
        eventOverlap={false}
        keepDate
      />,
    );
    const move = moveGesture();
    await holdAtLeftEdge(move, 1);

    const refreshed: CalendarEvent<WithId> = {
      ...standup,
      title: "Standup (updated)",
    };
    await act(() => {
      eventsRef.set?.([refreshed]);
    });
    // The floating copy reflects the refreshed event while still held.
    expect(result.queryAllByText("Standup (updated)").length).toBeGreaterThan(0);

    // Move back over Tuesday 09:30 (overlapping the event's own 09:00-10:00 slot)
    // and drop on the kept week: must pass `refreshed` and not self-reject.
    const dayWidth = Dimensions.get("window").width / 7;
    await act(() => {
      move.handlers.onUpdate?.({
        translationX: 0,
        translationY: 24,
        absoluteX: dayWidth + 20,
        absoluteY: 56 + 12 + 9.5 * 48 + 10,
      });
      release(move, { translationX: 0, translationY: 24 });
    });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    expect(onDragEvent.mock.calls[0]?.[0]).toBe(refreshed);
  });

  it("drops in the right column even when ghostW has not reached the UI thread yet", async () => {
    const onDragEvent = vi.fn();
    const result = await render(
      <ControlledGrid initialEvents={[standup]} onChangeDate={vi.fn()} onDragEvent={onDragEvent} />,
    );
    const move = moveGesture();
    const dayWidth = Dimensions.get("window").width / 7;
    // Place the ghost left edge right at the start of column 2 (Wednesday), then
    // zero out `ghostW` via the lift-before-UI-seed path by resetting the shared
    // value before releasing.
    await act(() => {
      move.handlers.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.handlers.onUpdate?.({
        translationX: -190,
        translationY: 0,
        absoluteX: 10,
        absoluteY: 750,
      });
    });
    await act(() => {
      vi.advanceTimersByTime(EDGE_DWELL_MS);
    });
    // Move to the start of column 2 (Wednesday: x = 2 * dayWidth + 10, grabX = 10 -> ghostLocalX = 2 * dayWidth).
    // With `dayWidth / 2`, centre is 2.5 * dayWidth (column 2, Wednesday 31 Dec 2025);
    // with `ghostW = 0`, centre would be 2.0 * dayWidth (or column 1 if slightly left of boundary).
    await act(() => {
      move.handlers.onUpdate?.({
        translationX: 0,
        translationY: 0,
        absoluteX: 2 * dayWidth + 9,
        absoluteY: 750,
      });
      release(move, { translationX: 0, translationY: 0 });
    });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, droppedStart] = onDragEvent.mock.calls[0] as [CalendarEvent<WithId>, Date, Date];
    expect([droppedStart.getFullYear(), droppedStart.getMonth(), droppedStart.getDate()]).toEqual([
      2025, 11, 31,
    ]);
    expect(floatingCopies(result).length).toBe(0);
  });

  it("cancels a queued pendingDrop if multiDayTimedEventPlacement moves the event to all-day", async () => {
    const longEvent: CalendarEvent<WithId> = {
      id: "long",
      start: new Date(2026, 0, 6, 9, 0, 0),
      end: new Date(2026, 0, 7, 10, 0, 0),
      title: "Offsite",
    };
    const onDragEvent = vi.fn();
    function SwitchingGrid() {
      const [date, setDate] = useState(new Date(2026, 0, 6, 12, 0, 0));
      const [placement, setPlacement] = useState<"grid" | "all-day">("grid");
      return (
        <TimeGrid<WithId>
          mode="week"
          date={date}
          events={[longEvent]}
          cellHeight={{ value: 48 } as never}
          hourHeight={48}
          weekStartsOn={1}
          hideHours
          renderEvent={TitleOnly}
          getEventId={(item) => item.id}
          multiDayTimedEventPlacement={placement}
          onChangeDate={(next) => {
            // Answer the second edge page in a transition that also moves 24h+
            // events into the all-day lane before the queued drop lands.
            startTransition(() => {
              setDate(next);
              if (next.getTime() < new Date(2025, 11, 29).getTime()) setPlacement("all-day");
            });
          }}
          onPressEvent={noop}
          onDragEvent={onDragEvent}
        />
      );
    }
    await render(<SwitchingGrid />);
    const move = moveGesture();
    await holdAtLeftEdge(move, 1);
    await act(() => {
      vi.advanceTimersByTime(EDGE_REPEAT_MS);
      release(move, atLeftEdge);
    });
    expect(onDragEvent).not.toHaveBeenCalled();
  });
});
