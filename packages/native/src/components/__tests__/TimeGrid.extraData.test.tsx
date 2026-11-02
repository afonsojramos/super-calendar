import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import type { CalendarEvent } from "../../types";
import { render } from "./renderGrid";

// Jest cannot measure LegendList pages. Preserve its content cache so prop-only
// updates must invalidate mounted pages through data or extraData.
jest.mock("@legendapp/list/reanimated", () => ({
  __esModule: true,
  AnimatedLegendList: (props: {
    data: Date[];
    extraData?: unknown;
    initialScrollIndex?: number;
    renderItem: (item: { item: Date; index: number }) => ReactNode;
  }) => {
    const { useMemo } = jest.requireActual<typeof import("react")>("react");
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
