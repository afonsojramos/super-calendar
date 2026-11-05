import * as gestureHandlerMock from "react-native-gesture-handler";
import { useMemo } from "react";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { act } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import type { CalendarEvent, CreateGhostArgs } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";

type GestureChain = {
  kind: string;
  calls: Record<string, unknown[]>;
  handlers: {
    onStart?: (event: Record<string, number>) => void;
    onUpdate?: (event: Record<string, number>) => void;
    onEnd?: (event: Record<string, number>, success: boolean) => void;
  };
};

// The test renderer cannot measure LegendList pages. Preserve its content cache so prop-only
// updates must invalidate mounted pages through data or extraData.
vi.mock("@legendapp/list/reanimated", () => ({
  __esModule: true,
  AnimatedLegendList: (props: {
    data: Date[];
    extraData?: unknown;
    initialScrollIndex?: number;
    renderItem: (item: { item: Date; index: number }) => ReactNode;
  }) => {
    return useMemo(() => {
      const index = props.initialScrollIndex ?? 0;
      const item = props.data[index];
      return item === undefined ? null : props.renderItem({ item, index });
    }, [props.data, props.extraData]);
  },
}));

import { Calendar } from "../Calendar";
import { DefaultEvent } from "../DefaultEvent";
import { TimeGrid } from "../TimeGrid";

const noop = () => {};
const date = new Date(2026, 0, 6);
const events: CalendarEvent[] = [
  {
    title: "Standup",
    start: new Date(2026, 0, 6, 9),
    end: new Date(2026, 0, 6, 10),
    dragHandleColor: "#ff00ff",
  },
];

describe.each(["TimeGrid", "Calendar"])("%s mounted grip visibility", (component) => {
  it.each([true, false])(
    "toggles both grips with stable events, initially visible: %s",
    async (initialVisibility) => {
      const grid = (showDragHandle: boolean) => {
        const props = {
          date,
          events,
          showDragHandle,
          keyExtractor: (event: CalendarEvent) => event.start.toISOString(),
          onChangeDate: noop,
          onPressEvent: noop,
          onDragEvent: noop,
        };
        return component === "Calendar" ? (
          <Calendar {...props} mode="week" />
        ) : (
          <TimeGrid
            {...props}
            mode="week"
            weekStartsOn={1}
            cellHeight={{ value: 48 } as never}
            renderEvent={DefaultEvent}
          />
        );
      };
      const { getByTestId, rerender } = await render(grid(initialVisibility));
      const expectVisibility = (visible: boolean) => {
        for (const testID of ["resize-handle-top", "resize-handle"]) {
          const handle = getByTestId(testID);
          expect(handle.children).toHaveLength(visible ? 1 : 0);
          if (visible) {
            const grip = handle.children[0];
            if (!grip || typeof grip === "string") throw new Error("resize grip missing");
            expect(StyleSheet.flatten(grip.props.style).backgroundColor).toBe("#ff00ff");
          }
        }
      };
      expectVisibility(initialVisibility);
      await rerender(grid(!initialVisibility));
      expectVisibility(!initialVisibility);
      await rerender(grid(initialVisibility));
      expectVisibility(initialVisibility);
    },
  );
});

describe.each(["TimeGrid", "Calendar"])("%s mounted create preview content", (component) => {
  it("clears a cached preview when creation is disabled", async () => {
    const chains = (gestureHandlerMock as unknown as { __gestures: GestureChain[] }).__gestures;
    chains.length = 0;
    const Draft = () => <Text>Active draft</Text>;
    const onCreateEvent = vi.fn();
    const cellHeight = { value: 48 };
    const grid = (enabled: boolean) => {
      const props = {
        date,
        events,
        onChangeDate: noop,
        onPressEvent: noop,
        onCreateEvent: enabled ? onCreateEvent : undefined,
        renderCreateGhost: Draft,
      };
      return component === "Calendar" ? (
        <Calendar {...props} mode="day" hourHeight={48} />
      ) : (
        <TimeGrid
          {...props}
          mode="day"
          cellHeight={cellHeight as never}
          weekStartsOn={1}
          renderEvent={DefaultEvent}
          keyExtractor={(event) => event.start.toISOString()}
        />
      );
    };
    const view = await render(grid(true));
    const pan = chains
      .filter((chain) => chain.kind === "Pan" && chain.calls.activateAfterLongPress?.[0] === 300)
      .at(-1)!.handlers;
    await act(async () => pan.onStart?.({ x: 10, y: 96 }));
    await act(async () => pan.onUpdate?.({ translationY: 96 }));
    expect(view.getByText("Active draft", { includeHiddenElements: true })).toBeTruthy();
    await view.rerender(grid(false));
    expect(view.queryByText("Active draft", { includeHiddenElements: true })).toBeNull();
    await act(async () => pan.onEnd?.({ translationY: 96 }, true));
    expect(onCreateEvent).not.toHaveBeenCalled();
    await view.rerender(grid(true));
    expect(view.queryByText("Active draft", { includeHiddenElements: true })).toBeNull();
  });

  it("swaps renderCreateGhost on a cached page during a held sweep", async () => {
    const chains = (gestureHandlerMock as unknown as { __gestures: GestureChain[] }).__gestures;
    chains.length = 0;
    const Label =
      (name: string) =>
      ({ start, end }: CreateGhostArgs) => (
        <Text>{`${name} ${start.getHours()}-${end.getHours()}`}</Text>
      );
    const first = Label("first");
    const second = Label("second");
    const grid = (renderCreateGhost: typeof first) => {
      const props = {
        date,
        events,
        keyExtractor: (event: CalendarEvent) => event.start.toISOString(),
        onChangeDate: noop,
        onPressEvent: noop,
        onCreateEvent: noop,
        renderCreateGhost,
      };
      return component === "Calendar" ? (
        <Calendar {...props} mode="day" hourHeight={48} />
      ) : (
        <TimeGrid
          {...props}
          mode="day"
          cellHeight={{ value: 48 } as never}
          weekStartsOn={1}
          renderEvent={DefaultEvent}
        />
      );
    };
    const view = await render(grid(first));
    const pan = chains
      .filter((chain) => chain.kind === "Pan" && chain.calls.activateAfterLongPress?.[0] === 300)
      .at(-1)!.handlers;
    await act(async () => pan.onStart?.({ x: 10, y: 96 }));
    await act(async () => pan.onUpdate?.({ translationY: 96 }));
    expect(view.getByText("first 2-4", { includeHiddenElements: true })).toBeTruthy();
    await view.rerender(grid(second));
    expect(view.queryByText("first 2-4", { includeHiddenElements: true })).toBeNull();
    expect(view.getByText("second 2-4", { includeHiddenElements: true })).toBeTruthy();
  });
});
