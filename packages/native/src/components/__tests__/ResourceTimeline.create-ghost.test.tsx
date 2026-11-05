import * as gestureHandlerMock from "react-native-gesture-handler";
import { vi } from "vitest";
import { act, render } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import type { CreateGhostArgs } from "../../types";
import { type Resource, ResourceTimeline } from "../ResourceTimeline";

type Handlers = {
  onStart?: (event: Record<string, number>) => void;
  onUpdate?: (event: Record<string, number>) => void;
  onEnd?: (event: Record<string, number>, success?: boolean) => void;
  onFinalize?: () => void;
};
type Chain = { kind: string; calls: Record<string, unknown[]>; handlers: Handlers };
const chains = () => (gestureHandlerMock as unknown as { __gestures: Chain[] }).__gestures;
// Each lane's create pan waits for the 250ms hold; with no bars there are no others.
const lanePans = () =>
  chains()
    .filter((chain) => chain.kind === "Pan" && chain.calls.activateAfterLongPress?.[0] === 250)
    .map((chain) => chain.handlers);

const date = new Date(2026, 0, 1);
const resources = [
  { id: "a", title: "Studio" },
  { id: "b", title: "Booth" },
];
const clock = (value: Date) =>
  `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;

function probe() {
  const mounts: number[] = [];
  const renders: string[] = [];
  function Draft({ start, end, resource }: CreateGhostArgs & { resource: Resource }) {
    const [id] = useState(() => mounts.push(mounts.length) - 1);
    const text = `${resource.title} ${id} ${clock(start)}-${clock(end)}`;
    renders.push(text);
    return <Text>{text}</Text>;
  }
  return { Draft, mounts, renders };
}

describe.each(["horizontal", "vertical"] as const)(
  "native %s ResourceTimeline renderCreateGhost",
  (orientation) => {
    const axis = (px: number) => (orientation === "vertical" ? { x: 5, y: px } : { x: px, y: 5 });

    beforeEach(() => {
      chains().length = 0;
    });

    it("shows the lane's resource and live range, then commits the shown range", async () => {
      const { Draft, mounts, renders } = probe();
      const onCreateEvent = vi.fn();
      const view = await render(
        <ResourceTimeline
          date={date}
          resources={resources}
          events={[]}
          orientation={orientation}
          hourWidth={80}
          hourHeight={80}
          onCreateEvent={onCreateEvent}
          renderCreateGhost={Draft}
        />,
      );
      const pan = lanePans()[1];
      // 80px per hour: 100px is 01:15.
      await act(async () => pan.onStart?.(axis(100)));
      expect(renders.at(-1)).toBe("Booth 0 01:15-01:30");
      await act(async () => pan.onUpdate?.(axis(250)));
      expect(renders.at(-1)).toBe("Booth 0 01:15-03:15");
      const count = renders.length;
      // 252px still rounds to 03:15: nothing crosses to JS.
      await act(async () => pan.onUpdate?.(axis(252)));
      expect(renders).toHaveLength(count);
      await act(async () => pan.onUpdate?.(axis(20)));
      expect(renders.at(-1)).toBe("Booth 0 00:15-01:15");
      expect(view.queryByText("Booth 0 00:15-01:15")).toBeNull();
      expect(view.getByText("Booth 0 00:15-01:15", { includeHiddenElements: true })).toBeTruthy();
      expect(onCreateEvent).not.toHaveBeenCalled();

      await act(async () => pan.onEnd?.(axis(20), true));
      expect(onCreateEvent).toHaveBeenCalledWith(
        new Date(2026, 0, 1, 0, 15),
        new Date(2026, 0, 1, 1, 15),
        resources[1],
      );
      await act(async () => pan.onFinalize?.());
      expect(view.queryByText(/Booth \d/, { includeHiddenElements: true })).toBeNull();
      expect(mounts).toEqual([0]);

      await act(async () => lanePans()[0].onStart?.(axis(400)));
      expect(renders.at(-1)).toBe("Studio 1 05:00-05:15");
    });

    it("clears the content when a sweep is cancelled without creating", async () => {
      const { Draft } = probe();
      const onCreateEvent = vi.fn();
      const view = await render(
        <ResourceTimeline
          date={date}
          resources={resources}
          events={[]}
          orientation={orientation}
          hourWidth={80}
          hourHeight={80}
          onCreateEvent={onCreateEvent}
          renderCreateGhost={Draft}
        />,
      );
      const pan = lanePans()[0];
      await act(async () => pan.onStart?.(axis(100)));
      await act(async () => pan.onUpdate?.(axis(250)));
      await act(async () => pan.onEnd?.(axis(250), false));
      await act(async () => pan.onFinalize?.());
      expect(onCreateEvent).not.toHaveBeenCalled();
      expect(view.queryByText(/Studio \d/, { includeHiddenElements: true })).toBeNull();
    });

    it("keeps the default preview empty, and needs onCreateEvent to render", async () => {
      const { Draft, renders } = probe();
      const view = await render(
        <ResourceTimeline
          date={date}
          resources={resources}
          events={[]}
          orientation={orientation}
          onCreateEvent={vi.fn()}
        />,
      );
      for (const ghost of view.getAllByTestId("resource-create-ghost", {
        includeHiddenElements: true,
      })) {
        expect(ghost.children).toHaveLength(0);
      }
      await view.rerender(
        <ResourceTimeline
          date={date}
          resources={resources}
          events={[]}
          orientation={orientation}
          onPressCell={vi.fn()}
          renderCreateGhost={Draft}
        />,
      );
      expect(
        view.queryAllByTestId("resource-create-ghost", { includeHiddenElements: true }),
      ).toHaveLength(0);
      expect(renders).toHaveLength(0);
    });
  },
);
