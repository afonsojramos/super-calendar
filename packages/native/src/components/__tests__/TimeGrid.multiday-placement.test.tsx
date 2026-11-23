import { useMemo, type ReactNode } from "react";
import { vi } from "vitest";
import { act, fireEvent, within } from "@testing-library/react-native";
import * as gestureHandlerMock from "react-native-gesture-handler";
import { Dimensions, Pressable, Text } from "react-native";
import type { CalendarEvent, MultiDayTimedEventPlacement, RenderEventArgs } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";

// Preserve LegendList's content cache so prop-only placement updates must invalidate
// mounted pages through extraData.
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
// Wednesday 15 July 2026 (week Mon 13 - Sun 19 July 2026).
const date = new Date(2026, 6, 15);
const conference: CalendarEvent = {
  title: "Conference",
  start: new Date(2026, 6, 14, 9, 0),
  end: new Date(2026, 6, 16, 17, 0),
  allDay: false,
};
const fullDayTimed: CalendarEvent = {
  title: "On-call",
  start: new Date(2026, 6, 15, 0, 0),
  end: new Date(2026, 6, 16, 0, 0),
  allDay: false,
};
const overnight: CalendarEvent = {
  title: "Overnight",
  start: new Date(2026, 6, 14, 22, 0),
  end: new Date(2026, 6, 15, 6, 0),
  allDay: false,
};

describe.each(["TimeGrid", "Calendar"])("%s multiDayTimedEventPlacement", (component) => {
  const build = (
    placement: MultiDayTimedEventPlacement,
    overrides: {
      events?: CalendarEvent[];
      ampm?: boolean;
      timeZone?: string;
      onPressEvent?: (event: CalendarEvent) => void;
      renderEvent?: (props: RenderEventArgs) => ReactNode;
      eventAccessibilityLabel?: (
        event: CalendarEvent,
        context: { isAllDay: boolean; ampm: boolean },
      ) => string;
    } = {},
  ) => {
    const base = {
      date,
      events: overrides.events ?? [conference, fullDayTimed, overnight],
      multiDayTimedEventPlacement: placement,
      ampm: overrides.ampm,
      weekStartsOn: 1 as const,
      keyExtractor: (event: CalendarEvent, index: number) =>
        `${event.title ?? ""}-${event.start.toISOString()}-${index}`,
      onChangeDate: noop,
      onPressEvent: overrides.onPressEvent ?? noop,
      eventAccessibilityLabel: overrides.eventAccessibilityLabel,
    };
    return component === "Calendar" ? (
      <Calendar
        {...base}
        mode="week"
        timeZone={overrides.timeZone}
        renderEvent={overrides.renderEvent as typeof DefaultEvent | undefined}
      />
    ) : (
      <TimeGrid
        {...base}
        mode="week"
        cellHeight={{ value: 48 } as never}
        renderEvent={(overrides.renderEvent as typeof DefaultEvent | undefined) ?? DefaultEvent}
      />
    );
  };

  it("toggles >= 24h timed events between vertical columns and the all-day lane on mounted pages", async () => {
    const view = await render(build("grid"));
    // Under "grid", Conference renders 3 vertical day segments, On-call 1, Overnight 2.
    expect(view.getAllByText("Conference")).toHaveLength(3);
    expect(view.getAllByText("On-call")).toHaveLength(1);
    expect(view.getAllByText("Overnight")).toHaveLength(2);

    // Rerender with the exact same events array: extraData must invalidate cached pages.
    await view.rerender(build("all-day"));
    // Promoted >= 24h events each render once in the all-day lane with their start time.
    const lane = within(view.getByTestId("all-day-band"));
    expect(view.getAllByText("Conference")).toHaveLength(1);
    expect(lane.getByText("09:00")).toBeTruthy();
    expect(lane.getByText("Conference")).toBeTruthy();
    expect(view.getAllByText("On-call")).toHaveLength(1);
    expect(lane.getByText("00:00")).toBeTruthy();
    expect(lane.getByText("On-call")).toBeTruthy();
    // < 24h cross-midnight event stays on the vertical grid (2 segments).
    expect(view.getAllByText("Overnight")).toHaveLength(2);

    // Toggle back to "grid".
    await view.rerender(build("grid"));
    expect(view.getAllByText("Conference")).toHaveLength(3);
    expect(within(view.getByTestId("all-day-band")).queryByText("09:00")).toBeNull();
  });

  it("formats promoted lane start times in 12-hour AM/PM when ampm is set", async () => {
    const view = await render(build("all-day", { ampm: true }));
    expect(view.getByText("9:00 AM")).toBeTruthy();
    expect(view.getByText("12:00 AM")).toBeTruthy();
    expect(view.getByLabelText("Conference, 9:00 AM to 5:00 PM")).toBeTruthy();
  });

  it("passes isAllDay: false and inAllDayLane: true to custom renderers and accessibility labels", async () => {
    const holiday: CalendarEvent = {
      title: "Holiday",
      start: new Date(2026, 6, 13),
      end: new Date(2026, 6, 14),
      allDay: true,
    };
    const Custom = (props: RenderEventArgs) => (
      <Pressable onPress={props.onPress} accessibilityLabel={props.accessibilityLabel}>
        <Text>{`${props.event.title}:${String(props.isAllDay)}:${String(Boolean(props.inAllDayLane))}`}</Text>
      </Pressable>
    );
    const view = await render(
      build("all-day", {
        events: [holiday, conference],
        renderEvent: Custom,
        eventAccessibilityLabel: (event, { isAllDay }) =>
          `${event.title}:${isAllDay ? "all-day" : "timed"}`,
      }),
    );
    expect(view.getByText("Conference:false:true")).toBeTruthy();
    expect(view.getByText("Holiday:true:true")).toBeTruthy();
    expect(view.getByLabelText("Conference:timed")).toBeTruthy();
    expect(view.getByLabelText("Holiday:all-day")).toBeTruthy();
  });
});

describe("Calendar multiDayTimedEventPlacement with timeZone", () => {
  it("displays the zoned start time and reports the original event on press", async () => {
    // 2026-07-14 13:00 UTC -> 2026-07-16 21:00 UTC is 09:00 -> 17:00 in America/New_York.
    const summit: CalendarEvent = {
      title: "Summit",
      start: new Date(Date.UTC(2026, 6, 14, 13, 0)),
      end: new Date(Date.UTC(2026, 6, 16, 21, 0)),
      allDay: false,
    };
    const onPressEvent = vi.fn();
    const view = await render(
      <Calendar
        mode="week"
        date={date}
        weekStartsOn={1}
        timeZone="America/New_York"
        multiDayTimedEventPlacement="all-day"
        events={[summit]}
        onChangeDate={noop}
        onPressEvent={onPressEvent}
      />,
    );
    expect(view.getAllByText("Summit")).toHaveLength(1);
    expect(within(view.getByTestId("all-day-band")).getByText("09:00")).toBeTruthy();
    await fireEvent.press(view.getByText("Summit"));
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(summit);
  });

  it("keeps clock times across DST transitions when dragging promoted lane bars under Calendar timeZone", async () => {
    const gestureHandler = gestureHandlerMock as unknown as {
      __gestures: Array<{
        calls: Record<string, unknown[]>;
        handlers: Record<string, (...args: unknown[]) => void>;
      }>;
    };
    gestureHandler.__gestures.length = 0;

    // Week Sun 8 Mar 2026 to Sat 14 Mar 2026 in America/New_York (spring-forward Sun 8 Mar).
    const springBlock: CalendarEvent = {
      title: "Spring Block",
      start: new Date(Date.UTC(2026, 2, 8, 5, 0)), // Sun 00:00 EST
      end: new Date(Date.UTC(2026, 2, 9, 4, 0)), // Mon 00:00 EDT (23h elapsed, 24h clock)
      allDay: false,
    };
    const onDragEvent = vi.fn();
    await render(
      <Calendar
        mode="week"
        date={new Date(2026, 2, 8)}
        weekStartsOn={0}
        hideHours
        timeZone="America/New_York"
        multiDayTimedEventPlacement="all-day"
        events={[springBlock]}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />,
    );
    const pan = gestureHandler.__gestures.findLast(
      (g) => g.calls.activateAfterLongPress?.[0] === 500 && g.handlers.onStart,
    );
    if (!pan) throw new Error("Missing lane pan gesture");
    const dayWidth = Dimensions.get("window").width / 7;
    await act(() => {
      pan.handlers.onStart({ x: 5, translationX: 0 });
      pan.handlers.onUpdate({ x: 5 + dayWidth, translationX: dayWidth });
      pan.handlers.onEnd({}, true);
      pan.handlers.onFinalize({}, true);
    });
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      springBlock,
      new Date(Date.UTC(2026, 2, 9, 4, 0)), // Mon 00:00 EDT
      new Date(Date.UTC(2026, 2, 10, 4, 0)), // Tue 00:00 EDT
    );
  });

  it("clears an active vertical multi-day move preview when placement switches to 'all-day'", async () => {
    const gestureHandler = gestureHandlerMock as unknown as {
      __gestures: Array<{
        calls: Record<string, unknown[]>;
        handlers: Record<string, (...args: unknown[]) => void>;
      }>;
    };
    gestureHandler.__gestures.length = 0;

    const onDragEvent = vi.fn();
    const grid = (placement: MultiDayTimedEventPlacement) => (
      <TimeGrid
        mode="week"
        date={date}
        weekStartsOn={1}
        hideHours
        cellHeight={{ value: 48 } as never}
        multiDayTimedEventPlacement={placement}
        events={[conference]}
        renderEvent={DefaultEvent}
        keyExtractor={(event, index) => `${event.title ?? ""}-${index}`}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />
    );
    const view = await render(grid("grid"));
    const move = gestureHandler.__gestures.find(
      (g) => g.calls.activateAfterLongPress?.[0] === 500 && g.handlers.onStart,
    );
    if (!move) throw new Error("Missing timed move gesture");

    const hidden = { includeHiddenElements: true };
    await act(() => move.handlers.onStart({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 }));
    expect(view.getAllByTestId("multi-day-move-preview", hidden)).toHaveLength(7);

    await view.rerender(grid("all-day"));
    expect(view.queryAllByTestId("multi-day-move-preview", hidden)).toHaveLength(0);
    expect(within(view.getByTestId("all-day-band")).getByText("Conference")).toBeTruthy();
  });

  it("disarms edge-dwell timers and ignores lifted finalization when placement switches to 'all-day'", async () => {
    vi.useFakeTimers();
    try {
      const gestureHandler = gestureHandlerMock as unknown as {
        __gestures: Array<{
          calls: Record<string, unknown[]>;
          handlers: Record<string, (...args: unknown[]) => void>;
        }>;
      };
      gestureHandler.__gestures.length = 0;

      const onDragEvent = vi.fn();
      const onChangeDate = vi.fn();
      const fullWidth = Dimensions.get("window").width;
      const grid = (placement: MultiDayTimedEventPlacement) => (
        <TimeGrid
          mode="week"
          date={date}
          weekStartsOn={1}
          hideHours
          cellHeight={{ value: 48 } as never}
          multiDayTimedEventPlacement={placement}
          events={[conference]}
          renderEvent={DefaultEvent}
          keyExtractor={(event, index) => `${event.title ?? ""}-${index}`}
          onChangeDate={onChangeDate}
          onPressEvent={noop}
          onDragEvent={onDragEvent}
        />
      );

      // 1. Toggle before the 600ms dwell timer fires: unmount must disarm the timer.
      const view = await render(grid("grid"));
      const moveBeforeLift = gestureHandler.__gestures.find(
        (g) => g.calls.activateAfterLongPress?.[0] === 500 && g.handlers.onStart,
      );
      if (!moveBeforeLift) throw new Error("Missing timed move gesture");

      await act(() => {
        moveBeforeLift.handlers.onStart({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
        moveBeforeLift.handlers.onUpdate({
          translationX: fullWidth,
          translationY: 0,
          absoluteX: fullWidth - 5,
          absoluteY: 300,
        });
      });
      await view.rerender(grid("all-day"));
      await act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(onChangeDate).not.toHaveBeenCalled();
      expect(onDragEvent).not.toHaveBeenCalled();

      // A late UI-thread update arriving after unmount must also fail to re-arm the dwell timer.
      await act(() => {
        moveBeforeLift.handlers.onUpdate({
          translationX: 0,
          translationY: 0,
          absoluteX: fullWidth / 2,
          absoluteY: 300,
        });
        moveBeforeLift.handlers.onUpdate({
          translationX: fullWidth,
          translationY: 0,
          absoluteX: fullWidth - 5,
          absoluteY: 300,
        });
        vi.advanceTimersByTime(1500);
      });
      expect(onChangeDate).not.toHaveBeenCalled();
      expect(onDragEvent).not.toHaveBeenCalled();

      // 2. Toggle after lift has armed and fired once: repeat timer stops and onFinalize does not commit.
      gestureHandler.__gestures.length = 0;
      await view.rerender(grid("grid"));
      const moveAfterLift = gestureHandler.__gestures.find(
        (g) => g.calls.activateAfterLongPress?.[0] === 500 && g.handlers.onStart,
      );
      if (!moveAfterLift) throw new Error("Missing timed move gesture after toggle");

      await act(() => {
        moveAfterLift.handlers.onStart({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
        moveAfterLift.handlers.onUpdate({
          translationX: fullWidth,
          translationY: 0,
          absoluteX: fullWidth - 5,
          absoluteY: 300,
        });
        vi.advanceTimersByTime(650);
      });
      expect(onChangeDate).toHaveBeenCalledTimes(1);

      await view.rerender(grid("all-day"));
      // Simulate RNGH delivering onFinalize while unmounting after placement changed.
      await act(() => {
        moveAfterLift.handlers.onFinalize({}, false);
        vi.advanceTimersByTime(1500);
      });
      expect(onChangeDate).toHaveBeenCalledTimes(1);
      expect(onDragEvent).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
