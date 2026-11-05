import * as gestureHandlerMock from "react-native-gesture-handler";
import * as reanimatedMock from "react-native-reanimated";
import { vi } from "vitest";
import { act } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import type { CreateGhostArgs } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";
import { Calendar } from "../Calendar";
import { DefaultEvent } from "../DefaultEvent";
import { TimeGrid } from "../TimeGrid";

type Handlers = {
  onStart?: (event: Record<string, number>) => void;
  onUpdate?: (event: Record<string, number>) => void;
  onEnd?: (event: Record<string, number>, success?: boolean) => void;
  onFinalize?: (event?: Record<string, number>, success?: boolean) => void;
};
type Chain = { kind: string; calls: Record<string, unknown[]>; handlers: Handlers };
const chains = () => (gestureHandlerMock as unknown as { __gestures: Chain[] }).__gestures;
const animation = reanimatedMock as unknown as {
  __jsQueue: Array<() => void>;
  __deferRunOnJS: (enabled: boolean) => void;
  __flushAnimatedReactions: () => void;
};

// The latest drag-to-create pan: the only Pan that waits for the 300ms hold.
const createPan = () => {
  const pan = chains()
    .filter((chain) => chain.kind === "Pan" && chain.calls.activateAfterLongPress?.[0] === 300)
    .at(-1);
  if (!pan) throw new Error("create gesture not found");
  return pan.handlers;
};

const day = new Date(2026, 0, 6);
const clock = (date: Date) =>
  `${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;

// A hook-using renderer: it must stay mounted, and re-render only when the range changes.
function probe(name = "draft") {
  const mounts: number[] = [];
  const renders: string[] = [];
  function Draft({ start, end }: CreateGhostArgs) {
    const [id] = useState(() => mounts.push(mounts.length) - 1);
    const text = `${name} ${id} ${clock(start)}-${clock(end)}`;
    renders.push(text);
    return <Text>{text}</Text>;
  }
  return { Draft, mounts, renders };
}

const gridProps = {
  date: day,
  mode: "day" as const,
  events: [],
  cellHeight: { value: 48 } as never,
  weekStartsOn: 1 as const,
  renderEvent: DefaultEvent,
  keyExtractor: (event: { start: Date }) => event.start.toISOString(),
  onChangeDate: () => {},
  onPressEvent: () => {},
};

// Drives the create pan: a hold at `y`, then moves by translation, all at x = 10.
const sweep = {
  start: (y: number) => act(async () => createPan().onStart?.({ x: 10, y })),
  update: (translationY: number) => act(async () => createPan().onUpdate?.({ translationY })),
  end: (translationY: number) => act(async () => createPan().onEnd?.({ translationY }, true)),
  finalize: () => act(async () => createPan().onFinalize?.()),
};

describe("native TimeGrid renderCreateGhost", () => {
  beforeEach(() => {
    chains().length = 0;
    animation.__deferRunOnJS(false);
  });
  afterEach(() => animation.__deferRunOnJS(false));

  it("shows the live range, deduplicates in-step moves and commits the shown range", async () => {
    const { Draft, mounts, renders } = probe();
    const onCreateEvent = vi.fn();
    const view = await render(
      <TimeGrid {...gridProps} onCreateEvent={onCreateEvent} renderCreateGhost={Draft} />,
    );
    const shown = () => renders.at(-1);
    await sweep.start(96);
    expect(shown()).toBe("draft 0 6 02:00-6 02:15");
    await sweep.update(54);
    expect(shown()).toBe("draft 0 6 02:00-6 03:15");
    const count = renders.length;
    // 152px still rounds to 03:15: nothing crosses to JS, nothing re-renders.
    await sweep.update(56);
    expect(renders).toHaveLength(count);
    await sweep.update(-56);
    expect(shown()).toBe("draft 0 6 00:45-6 02:00");
    expect(onCreateEvent).not.toHaveBeenCalled();
    // Pointer-only content: hidden from screen readers, found only with hidden elements.
    expect(view.queryByText(shown()!)).toBeNull();
    expect(view.getByText(shown()!, { includeHiddenElements: true })).toBeTruthy();

    await sweep.end(-56);
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
    expect(start).toEqual(new Date(2026, 0, 6, 0, 45));
    expect(end).toEqual(new Date(2026, 0, 6, 2));
    await sweep.finalize();
    expect(view.queryByText(/draft/, { includeHiddenElements: true })).toBeNull();
    expect(mounts).toEqual([0]);

    // The next sweep mounts fresh content at its own start.
    await sweep.start(480);
    expect(shown()).toBe("draft 1 6 10:00-6 10:15");
    expect(mounts).toEqual([0, 1]);
  });

  it.each([
    ["past the top", 96, -296, new Date(2026, 0, 6, 0), new Date(2026, 0, 6, 2)],
    ["past the bottom", 1104, 196, new Date(2026, 0, 6, 23), new Date(2026, 0, 7, 0)],
    // The origin rounds to midnight and is held one step before it.
    ["up from midnight", 1150, -46, new Date(2026, 0, 6, 23), new Date(2026, 0, 6, 23, 45)],
  ])("clamps a sweep %s exactly like the commit", async (_, from, by, start, end) => {
    const { Draft, renders } = probe();
    const onCreateEvent = vi.fn();
    await render(
      <TimeGrid {...gridProps} onCreateEvent={onCreateEvent} renderCreateGhost={Draft} />,
    );
    await sweep.start(from);
    await sweep.update(by);
    expect(renders.at(-1)).toBe(`draft 0 ${clock(start)}-${clock(end)}`);
    await sweep.end(by);
    expect(onCreateEvent).toHaveBeenCalledWith(start, end);
  });

  it("snaps to dragStepMinutes and an hour window like the commit", async () => {
    const { Draft, renders } = probe();
    const onCreateEvent = vi.fn();
    await render(
      <TimeGrid
        {...gridProps}
        minHour={8}
        maxHour={18}
        dragStepMinutes={30}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
      />,
    );
    // 100px below 08:00 is 10:05 (10:00); 200px above it is 05:55 (06:00).
    await sweep.start(100);
    await sweep.update(-200);
    expect(renders.at(-1)).toBe("draft 0 6 06:00-6 10:00");
    await sweep.end(-200);
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 0, 6, 6), new Date(2026, 0, 6, 10));
  });

  it("clears the content when the sweep is cancelled and starts fresh", async () => {
    const { Draft, renders } = probe();
    const onCreateEvent = vi.fn();
    const view = await render(
      <TimeGrid {...gridProps} onCreateEvent={onCreateEvent} renderCreateGhost={Draft} />,
    );
    await sweep.start(96);
    await sweep.update(200);
    await act(async () => createPan().onEnd?.({ translationY: 200 }, false));
    await sweep.finalize();
    expect(view.queryByText(/draft/, { includeHiddenElements: true })).toBeNull();
    expect(onCreateEvent).not.toHaveBeenCalled();
    await sweep.start(240);
    expect(renders.at(-1)).toBe("draft 1 6 05:00-6 05:15");
  });

  it("keeps the default preview empty without a renderer", async () => {
    const onCreateEvent = vi.fn();
    const view = await render(
      <TimeGrid
        {...gridProps}
        classNames={{ createGhost: "ghost" }}
        onCreateEvent={onCreateEvent}
      />,
    );
    await sweep.start(96);
    await sweep.update(54);
    const [ghost] = view.container.queryAll((node) => node.props.className === "ghost");
    expect(ghost).toBeTruthy();
    expect(ghost.children).toHaveLength(0);
    expect(ghost.props.accessibilityElementsHidden).toBeUndefined();
    await sweep.end(54);
    expect(onCreateEvent).toHaveBeenCalledTimes(1);
  });

  it("does not enable creation or render content without onCreateEvent", async () => {
    const { Draft, renders } = probe();
    const view = await render(
      <TimeGrid {...gridProps} classNames={{ createGhost: "ghost" }} renderCreateGhost={Draft} />,
    );
    expect(createPan()).toBeTruthy();
    const pan = chains()
      .filter((chain) => chain.kind === "Pan")
      .at(-1)!;
    expect(pan.calls.enabled).toEqual([false]);
    expect(view.container.queryAll((node) => node.props.className === "ghost")).toHaveLength(0);
    expect(renders).toHaveLength(0);
  });

  it("re-renders a held sweep with replaced props", async () => {
    const first = probe("first");
    const second = probe("second");
    const onCreateEvent = vi.fn();
    const grid = (props: { renderCreateGhost: typeof first.Draft; dragStepMinutes?: number }) => (
      <TimeGrid {...gridProps} onCreateEvent={onCreateEvent} {...props} />
    );
    const view = await render(grid({ renderCreateGhost: first.Draft }));
    await sweep.start(100);
    await sweep.update(70);
    expect(first.renders.at(-1)).toBe("first 0 6 02:00-6 03:30");
    await view.rerender(grid({ renderCreateGhost: second.Draft }));
    expect(second.renders.at(-1)).toBe("second 0 6 02:00-6 03:30");
    await view.rerender(grid({ renderCreateGhost: second.Draft, dragStepMinutes: 60 }));
    expect(second.renders.at(-1)).toBe("second 0 6 02:00-6 04:00");
    await sweep.end(70);
    expect(onCreateEvent).toHaveBeenCalledWith(new Date(2026, 0, 6, 2), new Date(2026, 0, 6, 4));
  });

  it("is forwarded by Calendar in time-grid modes", async () => {
    const { Draft, renders } = probe();
    const onCreateEvent = vi.fn();
    await render(
      <Calendar
        date={day}
        mode="day"
        events={[]}
        hourHeight={48}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
        onChangeDate={() => {}}
        onPressEvent={() => {}}
      />,
    );
    await sweep.start(96);
    await sweep.update(54);
    expect(renders.at(-1)).toBe("draft 0 6 02:00-6 03:15");
    await sweep.end(54);
    expect(onCreateEvent).toHaveBeenCalledWith(
      new Date(2026, 0, 6, 2),
      new Date(2026, 0, 6, 3, 15),
    );
  });

  it.each([false, true])(
    "uses the latest pointer and snapping settings, deferred bridge: %s",
    async (deferred) => {
      const { Draft, renders } = probe();
      const onCreateEvent = vi.fn();
      const grid = (dragStepMinutes: number) => (
        <TimeGrid
          {...gridProps}
          dragStepMinutes={dragStepMinutes}
          onCreateEvent={onCreateEvent}
          renderCreateGhost={Draft}
        />
      );
      const view = await render(grid(15));
      await sweep.start(96);
      animation.__deferRunOnJS(deferred);
      await sweep.update(10);
      await sweep.update(16);
      await view.rerender(grid(10));
      await act(async () => {
        for (const deliver of animation.__jsQueue.splice(0)) deliver();
      });
      expect(renders.at(-1)).toBe("draft 0 6 02:00-6 02:20");
      animation.__deferRunOnJS(false);
      await sweep.end(16);
      expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 0, 6, 2),
        new Date(2026, 0, 6, 2, 20),
      );
    },
  );

  it("does not bridge height changes within the same snapped range", async () => {
    const { Draft } = probe();
    const cellHeight = { value: 48 };
    await render(
      <TimeGrid
        {...gridProps}
        cellHeight={cellHeight as never}
        onCreateEvent={vi.fn()}
        renderCreateGhost={Draft}
      />,
    );
    await sweep.start(96);
    await sweep.update(96);
    await act(async () => animation.__flushAnimatedReactions());
    animation.__deferRunOnJS(true);
    await act(async () => {
      for (let step = 1; step <= 100; step++) {
        cellHeight.value = 48 + step / 1000;
        animation.__flushAnimatedReactions();
      }
    });
    expect(animation.__jsQueue).toHaveLength(0);
  });

  it.each([
    { mode: "day" as const, change: "hidden day", hiddenDays: [2], isRTL: false, nextDay: 7 },
    { mode: "week" as const, change: "RTL", hiddenDays: [], isRTL: true, nextDay: 11 },
  ])("cancels a held draft when $change replaces its column's day", async (settings) => {
    const { Draft } = probe();
    const onCreateEvent = vi.fn();
    const grid = (changed: boolean) => (
      <TimeGrid
        {...gridProps}
        mode={settings.mode}
        events={[]}
        hiddenDays={changed ? settings.hiddenDays : []}
        isRTL={changed && settings.isRTL}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
      />
    );
    const view = await render(grid(false));
    await sweep.start(96);
    await sweep.update(96);
    expect(view.queryByText(/draft/, { includeHiddenElements: true })).not.toBeNull();
    await view.rerender(grid(true));
    expect(view.queryByText(/draft/, { includeHiddenElements: true })).toBeNull();
    await sweep.end(96);
    await sweep.finalize();
    expect(onCreateEvent).not.toHaveBeenCalled();
    await sweep.start(240);
    await sweep.end(48);
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 0, settings.nextDay, 5),
      new Date(2026, 0, settings.nextDay, 6),
    );
  });

  it("keeps a held draft when refreshed columns still show the pressed day", async () => {
    const { Draft, renders } = probe();
    const onCreateEvent = vi.fn();
    const grid = (hiddenDays: number[]) => (
      <TimeGrid
        {...gridProps}
        events={[]}
        hiddenDays={hiddenDays}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
      />
    );
    const view = await render(grid([]));
    await sweep.start(96);
    await sweep.update(96);
    await view.rerender(grid([0]));
    expect(renders.at(-1)).toBe("draft 0 6 02:00-6 04:00");
    await sweep.end(96);
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 0, 6, 2),
      new Date(2026, 0, 6, 4),
    );
  });

  it("updates the held range when the shared hour height changes", async () => {
    const { Draft, renders } = probe();
    const onCreateEvent = vi.fn();
    const cellHeight = { value: 48 };
    await render(
      <TimeGrid
        {...gridProps}
        cellHeight={cellHeight as never}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
      />,
    );
    await sweep.start(96);
    await sweep.update(96);
    await act(async () => {
      (
        reanimatedMock as unknown as { __flushAnimatedReactions: () => void }
      ).__flushAnimatedReactions();
    });
    expect(renders.at(-1)).toBe("draft 0 6 02:00-6 04:00");
    await act(async () => {
      cellHeight.value = 96;
      (
        reanimatedMock as unknown as { __flushAnimatedReactions: () => void }
      ).__flushAnimatedReactions();
    });
    expect(renders.at(-1)).toBe("draft 0 6 01:00-6 02:00");
    await sweep.end(96);
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 0, 6, 1),
      new Date(2026, 0, 6, 2),
    );
  });
});
