import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import { vi } from "vitest";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";
import { MultiWeekView } from "../MultiWeekView";

const hold = vi.hoisted(() => ({
  start: null as (() => void) | null,
  move: null as ((x: number, y: number) => void) | null,
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  const React = await import("react");
  return {
    ...actual,
    Platform: { ...actual.Platform, OS: "web" },
    View: React.forwardRef<
      React.ComponentRef<typeof actual.View>,
      React.ComponentProps<typeof actual.View>
    >((props, ref) => {
      React.useImperativeHandle(
        ref,
        () =>
          ({
            getBoundingClientRect: () => ({ left: 0, top: 0 }),
            style: {},
          }) as unknown as React.ComponentRef<typeof actual.View>,
      );
      return <actual.View {...props} />;
    }),
  };
});

// Record the delayed activation while exercising the view's real hit testing,
// prop updates, and release path. Browser contracts cover the hold timer itself.
vi.mock("../../utils/holdWebDateDrag", () => ({
  holdWebDateDrag: (
    _node: HTMLElement,
    _pointer: unknown,
    start: () => void,
    move: (x: number, y: number) => void,
    cancel: () => void,
    release: () => void,
  ) => {
    hold.start = start;
    hold.move = move;
    return () => {
      cancel();
      release();
    };
  },
}));

const releases = new Set<() => void>();
beforeEach(() => {
  hold.start = null;
  hold.move = null;
  releases.clear();
  vi.stubGlobal("addEventListener", (type: string, listener: () => void) => {
    if (type === "pointerup") releases.add(listener);
  });
  vi.stubGlobal("removeEventListener", (type: string, listener: () => void) => {
    if (type === "pointerup") releases.delete(listener);
  });
});
afterEach(async () => {
  await cleanup();
  vi.unstubAllGlobals();
});

it.each(["move", "create"])(
  "preserves a pending %s when a new event occupies the pressed lane",
  async (kind) => {
    const original: CalendarEvent = {
      title: "Original",
      start: new Date(2030, 11, 27, 9),
      end: new Date(2030, 11, 27, 10),
    };
    const arrival: CalendarEvent = {
      title: "New longer event",
      start: new Date(2030, 11, 23),
      end: new Date(2030, 11, 31),
    };
    const onDragEvent = vi.fn();
    const onCreateEvent = vi.fn();
    const props = {
      date: new Date(2030, 11, 29),
      weekStartsOn: 1 as const,
      events: kind === "move" ? [original] : [],
      keyExtractor: (event: CalendarEvent) => event.title ?? "",
      renderEvent: DefaultEvent,
      onPressEvent: () => {},
      onCreateEvent,
      onDragEvent,
    };
    const view = await render(<MultiWeekView {...props} />);
    const grid = view.getByTestId("multiweek-grid");
    await fireEvent(grid, "layout", {
      nativeEvent: { layout: { width: 700, height: 240, x: 0, y: 0 } },
    });
    await fireEvent(grid, "pointerDown", {
      nativeEvent: {
        button: 0,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
        clientX: 450,
        clientY: 35,
      },
    });
    expect(hold.start).not.toBeNull();
    await view.rerender(<MultiWeekView {...props} events={[arrival, ...props.events]} />);
    await act(() => hold.start!());
    await act(() => hold.move!(350, 130));
    await act(() => {
      // Dispatch only to listeners registered before this release.
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const release of [...releases]) release();
    });
    if (kind === "move") {
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        original,
        new Date(2031, 0, 2, 9),
        new Date(2031, 0, 2, 10),
      );
      expect(onCreateEvent).not.toHaveBeenCalled();
    } else {
      expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2030, 11, 27),
        new Date(2031, 0, 3),
      );
      expect(onDragEvent).not.toHaveBeenCalled();
    }
  },
);
