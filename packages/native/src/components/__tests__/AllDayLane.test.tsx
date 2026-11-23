import { act, fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import * as gestureHandlerMock from "react-native-gesture-handler";
import { Pressable, Text, StyleSheet } from "react-native";
import { vi } from "vitest";
import { AllDayLane } from "../AllDayLane";
import { DefaultEvent } from "../DefaultEvent";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { SlotStylesProvider } from "../../utils/slots";

const days = Array.from({ length: 7 }, (_, index) => new Date(2026, 6, 13 + index));
const trip: CalendarEvent = {
  title: "Trip",
  start: days[1],
  end: days[4],
  allDay: true,
};
const Span = (props: RenderEventArgs) => (
  <Pressable onPress={props.onPress} onLongPress={props.onLongPress}>
    <Text>{props.event.title}</Text>
    <Text>{`${props.event.title}: ${props.continuesBefore},${props.continuesAfter}`}</Text>
  </Pressable>
);
const props = {
  days,
  events: [trip],
  mode: "week" as const,
  dayWidth: 50,
  renderEvent: Span,
  keyExtractor: (event: CalendarEvent) => event.title ?? event.start.toISOString(),
  onPressEvent: vi.fn(),
};

describe("AllDayLane spans", () => {
  it.each(
    [230, 340, 361.42857142857144].flatMap((width) => [
      {
        width,
        columns: [
          [0, 0],
          [2, 6],
        ],
      },
      { width, columns: Array.from({ length: 7 }, (_, day) => [day, day]) },
    ]),
  )("keeps a full lane inside $width dp with $columns", async ({ width, columns }) => {
    const events = columns.map(([first, last], index) => ({
      ...trip,
      title: `Event ${index}`,
      start: new Date(2026, 6, 13 + first),
      end: new Date(2026, 6, 14 + last),
    }));
    const view = await render(
      <SlotStylesProvider classNames={{ allDayColumn: "span" }}>
        <AllDayLane {...props} events={events} dayWidth={width / 7} />
      </SlotStylesProvider>,
    );
    const cells = view.container.queryAll((node) => node.props.className === "span");
    expect(cells).toHaveLength(events.length);
    let consumed = 0;
    for (const cell of cells) {
      const style = StyleSheet.flatten(cell.props.style);
      // Yoga tests wrapping with float32 values before it rounds to pixels.
      const basis = Math.fround(style.width);
      const margins = Math.fround(
        Math.fround(style.marginLeft) + Math.fround(style.marginRight ?? 0),
      );
      expect(Math.fround(Math.fround(consumed + basis) + margins)).toBeLessThanOrEqual(
        Math.fround(width),
      );
      consumed = Math.fround(consumed + Math.fround(basis + margins));
    }
  });

  it("preserves custom renderer state when an unchanged event moves to another lane", async () => {
    const StatefulSpan = ({ event }: RenderEventArgs) => {
      const [expanded, setExpanded] = useState(false);
      return (
        <Pressable onPress={() => setExpanded((value) => !value)}>
          <Text>{`${event.title}: ${expanded ? "expanded" : "collapsed"}`}</Text>
        </Pressable>
      );
    };
    const view = await render(<AllDayLane {...props} renderEvent={StatefulSpan} />);
    await fireEvent.press(view.getByText("Trip: collapsed"));
    expect(view.getByText("Trip: expanded")).toBeTruthy();
    const earlier = { ...trip, title: "Earlier", start: days[0] };
    for (const events of [[trip, earlier], [earlier, trip], [trip]]) {
      await view.rerender(<AllDayLane {...props} events={events} renderEvent={StatefulSpan} />);
      expect(view.getByText("Trip: expanded")).toBeTruthy();
    }
  });

  it("renders one full-width span with original press and long-press event identity", async () => {
    const onPressEvent = vi.fn();
    const onLongPressEvent = vi.fn();
    const view = await render(
      <SlotStylesProvider classNames={{ allDayColumn: "span" }}>
        <AllDayLane {...props} onPressEvent={onPressEvent} onLongPressEvent={onLongPressEvent} />
      </SlotStylesProvider>,
    );
    expect(view.getAllByText("Trip")).toHaveLength(1);
    expect(view.getByText("Trip: false,false")).toBeTruthy();
    const columns = view.container.queryAll((node) => node.props.className === "span");
    expect(columns).toHaveLength(1);
    expect(StyleSheet.flatten(columns[0].props.style).width).toBe(150);
    await fireEvent.press(view.getByText("Trip"));
    await fireEvent(view.getByText("Trip"), "longPress");
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(trip);
    expect(onLongPressEvent).toHaveBeenCalledExactlyOnceWith(trip);
  });

  it("clips at the visible edges and reports continuation only beyond them", async () => {
    const view = await render(
      <AllDayLane
        {...props}
        events={[
          { ...trip, title: "Before", start: new Date(2026, 6, 10), end: days[2] },
          { ...trip, title: "After", start: days[5], end: new Date(2026, 6, 23) },
        ]}
      />,
    );
    expect(view.getAllByText("Before")).toHaveLength(1);
    expect(view.getByText("Before: true,false")).toBeTruthy();
    expect(view.getAllByText("After")).toHaveLength(1);
    expect(view.getByText("After: false,true")).toBeTruthy();
  });

  it.each([
    { title: "Inside", start: days[1], end: days[4], before: false, after: false },
    { title: "Before", start: new Date(2026, 6, 10), end: days[2], before: true, after: false },
    { title: "After", start: days[5], end: new Date(2026, 6, 23), before: false, after: true },
    {
      title: "Both",
      start: new Date(2026, 6, 10),
      end: new Date(2026, 6, 23),
      before: true,
      after: true,
    },
  ])(
    "squares the default chip's corners where $title continues",
    async ({ title, start, end, before, after }) => {
      const view = await render(
        <AllDayLane
          {...props}
          renderEvent={DefaultEvent}
          events={[{ ...trip, title, start, end }]}
        />,
      );
      const style = StyleSheet.flatten(view.getByRole("button").props.style);
      const corner = (squared: boolean) => (squared ? 0 : undefined);
      expect(style.borderRadius).toBe(6);
      expect(style.borderTopLeftRadius).toBe(corner(before));
      expect(style.borderBottomLeftRadius).toBe(corner(before));
      expect(style.borderTopRightRadius).toBe(corner(after));
      expect(style.borderBottomRightRadius).toBe(corner(after));
    },
  );

  it("keeps the default timed chip's corners rounded while it continues across days", async () => {
    const view = await render(
      <DefaultEvent event={trip} mode="week" continuesBefore continuesAfter onPress={() => {}} />,
    );
    const style = StyleSheet.flatten(view.getByRole("button").props.style);
    expect(style.borderRadius).toBe(6);
    expect(style.borderTopLeftRadius).toBeUndefined();
    expect(style.borderTopRightRadius).toBeUndefined();
  });

  describe("moving a bar", () => {
    type Pan = { handlers: Record<string, (...args: unknown[]) => void> };
    // The pan the lane built most recently (the mock records every builder).
    const lastPan = () => {
      const { __gestures } = gestureHandlerMock as unknown as { __gestures: Pan[] };
      const pan = __gestures.findLast((gesture) => gesture.handlers.onStart);
      if (!pan) throw new Error("No pan recorded");
      return pan;
    };
    // Trip covers columns 1-3 at 50 dp each; `x` is relative to the bar.
    const drag = async (grabX: number, translationX: number, release = true) => {
      const { handlers } = lastPan();
      await act(() => {
        handlers.onStart({ x: grabX, translationX: 0 });
        handlers.onUpdate({ x: grabX + translationX, translationX });
        if (release) {
          handlers.onEnd({}, true);
          handlers.onFinalize({}, true);
        }
      });
    };
    const setup = async (overrides: Partial<typeof props> & Record<string, unknown> = {}) => {
      const onDragEvent = vi.fn();
      const onDragStart = vi.fn();
      const view = await render(
        <AllDayLane
          {...props}
          onDragEvent={onDragEvent}
          onDragStart={onDragStart}
          {...overrides}
        />,
      );
      return { view, onDragEvent, onDragStart };
    };

    it("moves the bar by whole days from the grabbed column and keeps its duration", async () => {
      const { onDragEvent, onDragStart } = await setup();
      await drag(60, 90);
      expect(onDragStart).toHaveBeenCalledExactlyOnceWith(trip);
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(trip, days[3], days[6]);
    });

    it.each([
      { title: "after the last", grabX: 10, translationX: 900, start: 19, end: 22 },
      { title: "before the first", grabX: 120, translationX: -900, start: 11, end: 14 },
    ])("clamps a drag $title visible column", async ({ grabX, translationX, start, end }) => {
      const { onDragEvent } = await setup();
      await drag(grabX, translationX);
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        trip,
        new Date(2026, 6, start),
        new Date(2026, 6, end),
      );
    });

    it("maps columns to calendar days across hidden days", async () => {
      // Wednesday is hidden, so Thursday is one column after Tuesday.
      const visibleDays = days.filter((day) => day.getDay() !== 3);
      const { onDragEvent } = await setup({ days: visibleDays });
      await drag(10, 50);
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(trip, days[3], days[6]);
    });

    it("commits nothing when the bar returns to its column or the gesture is cancelled", async () => {
      const { onDragEvent } = await setup();
      await drag(10, 20);
      const { handlers } = lastPan();
      await act(() => {
        handlers.onStart({ x: 10, translationX: 0 });
        handlers.onUpdate({ x: 110, translationX: 100 });
        handlers.onFinalize({}, false);
      });
      expect(onDragEvent).not.toHaveBeenCalled();
    });

    it("fades the carried bar and previews where it lands", async () => {
      const view = await render(
        <SlotStylesProvider classNames={{ allDayEvent: "chip" }}>
          <AllDayLane {...props} onDragEvent={vi.fn()} />
        </SlotStylesProvider>,
      );
      const chip = () => view.container.queryAll((node) => node.props.className === "chip")[0];
      // The preview is hidden from assistive technology, so query hidden elements.
      const hidden = { includeHiddenElements: true };
      await drag(10, 0, false);
      expect(StyleSheet.flatten(chip().props.style).opacity).toBe(0.4);
      expect(view.queryByTestId("all-day-move-preview", hidden)).toBeNull();
      const { handlers } = lastPan();
      await act(() => handlers.onUpdate({ x: 160, translationX: 150 }));
      // Friday to Sunday: columns 4-6, ending exactly at the visible edge.
      let preview = view.getByTestId("all-day-move-preview", hidden);
      expect(StyleSheet.flatten(preview.props.style)).toMatchObject({ left: 150, width: 150 });
      // The carried bar and its preview both end inside the visible days.
      expect(view.getAllByText("Trip: false,false", hidden)).toHaveLength(2);
      await act(() => handlers.onUpdate({ x: 210, translationX: 200 }));
      // Saturday to Monday, clipped to columns 5-6 and continuing after.
      preview = view.getByTestId("all-day-move-preview", hidden);
      expect(StyleSheet.flatten(preview.props.style)).toMatchObject({ left: 200, width: 100 });
      expect(preview.props.importantForAccessibility).toBe("no-hide-descendants");
      expect(view.getByText("Trip: false,true", hidden)).toBeTruthy();
      await act(() => {
        handlers.onEnd({}, true);
        handlers.onFinalize({}, true);
      });
      expect(view.queryByTestId("all-day-move-preview", hidden)).toBeNull();
      expect(StyleSheet.flatten(chip().props.style).opacity).toBeUndefined();
    });

    it("keeps the carried bar and its preview through a refresh that replaces the event", async () => {
      const onDragEvent = vi.fn();
      const lane = (events: CalendarEvent[]) => (
        <SlotStylesProvider classNames={{ allDayEvent: "chip" }}>
          <AllDayLane {...props} events={events} onDragEvent={onDragEvent} />
        </SlotStylesProvider>
      );
      const view = await render(lane([trip]));
      await drag(10, 100, false);
      const refreshed = { ...trip };
      await view.rerender(lane([refreshed]));
      const chip = view.container.queryAll((node) => node.props.className === "chip")[0];
      expect(StyleSheet.flatten(chip.props.style).opacity).toBe(0.4);
      expect(
        view.getByTestId("all-day-move-preview", { includeHiddenElements: true }),
      ).toBeTruthy();
      const { handlers } = lastPan();
      await act(() => {
        handlers.onEnd({}, true);
        handlers.onFinalize({}, true);
      });
      // The drop reports the current object, so an overlap check skips its own copy.
      expect(onDragEvent.mock.calls[0][0]).toBe(refreshed);
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(trip, days[3], days[6]);
    });

    it.each([
      { title: "without onDragEvent", overrides: { onDragEvent: undefined }, event: trip },
      { title: "when the grid locks moves", overrides: { eventStartEditable: false }, event: trip },
      { title: "for a locked event", overrides: {}, event: { ...trip, draggable: false } },
      {
        title: "for a start-locked event",
        overrides: {},
        event: { ...trip, startEditable: false },
      },
      { title: "for a disabled event", overrides: {}, event: { ...trip, disabled: true } },
    ])("keeps the bar static $title", async ({ overrides, event }) => {
      const onLongPressEvent = vi.fn();
      const { view } = await setup({ ...overrides, events: [event], onLongPressEvent });
      const { calls } = lastPan() as unknown as { calls: Record<string, unknown[]> };
      expect(calls.enabled).toEqual([false]);
      await fireEvent(view.getByText("Trip"), "longPress");
      expect(onLongPressEvent).toHaveBeenCalledExactlyOnceWith(event);
    });

    it("picks a movable bar up on a long press instead of reporting it", async () => {
      const onLongPressEvent = vi.fn();
      const onPressEvent = vi.fn();
      const { view } = await setup({ onLongPressEvent, onPressEvent });
      const pan = lastPan() as unknown as { calls: Record<string, unknown[]> };
      expect(pan.calls.enabled).toEqual([true]);
      expect(pan.calls.activateAfterLongPress).toEqual([500]);
      await fireEvent(view.getByText("Trip"), "longPress");
      expect(onLongPressEvent).not.toHaveBeenCalled();
      await fireEvent.press(view.getByText("Trip"));
      expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(trip);
    });

    it("promotes and drags >= 24h timed events under 'all-day' placement while preserving times", async () => {
      const conference: CalendarEvent = {
        title: "Conference",
        start: new Date(2026, 6, 14, 9, 0),
        end: new Date(2026, 6, 16, 17, 0),
        allDay: false,
      };
      const overnight: CalendarEvent = {
        title: "Overnight",
        start: new Date(2026, 6, 14, 22, 0),
        end: new Date(2026, 6, 15, 6, 0),
        allDay: false,
      };
      const { view, onDragEvent } = await setup({
        events: [conference, overnight],
        renderEvent: DefaultEvent,
        multiDayTimedEventPlacement: "all-day",
        ampm: true,
      });
      expect(view.getByText("Conference")).toBeTruthy();
      expect(view.getByText("9:00 AM")).toBeTruthy();
      expect(view.queryByText("Overnight")).toBeNull();

      await drag(60, 100);
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        conference,
        new Date(2026, 6, 16, 9, 0),
        new Date(2026, 6, 18, 17, 0),
      );
    });

    it("keeps chronological start-time visibility under RTL column order and during RTL drag previews", async () => {
      // Reversed (RTL) week: Sun 19 down to Mon 13 July 2026.
      const rtlDays = [...days].reverse();
      const startsInsideContinuesAfter: CalendarEvent = {
        title: "After",
        start: new Date(2026, 6, 18, 15, 15), // Sat 15:15 (visible) -> next week
        end: new Date(2026, 6, 22, 10, 0),
        allDay: false,
      };
      const startsBeforeEndsInside: CalendarEvent = {
        title: "Before",
        start: new Date(2026, 6, 11, 14, 30), // prior Sat 14:30 -> Tue 14:30
        end: new Date(2026, 6, 14, 14, 30),
        allDay: false,
      };
      const { view } = await setup({
        days: rtlDays,
        events: [startsInsideContinuesAfter, startsBeforeEndsInside],
        renderEvent: DefaultEvent,
        multiDayTimedEventPlacement: "all-day",
      });

      // "After" starts inside the visible week so it keeps "15:15" and squares its leading (left) edge.
      expect(view.getByText("15:15")).toBeTruthy();
      // "Before" started before the visible week so it hides "14:30" and squares its trailing (right) edge.
      expect(view.queryByText("14:30")).toBeNull();
      const buttons = view.getAllByRole("button");
      const afterStyle = StyleSheet.flatten(buttons[0].props.style);
      const beforeStyle = StyleSheet.flatten(buttons[1].props.style);
      expect(afterStyle.borderTopLeftRadius).toBe(0);
      expect(afterStyle.borderTopRightRadius).toBeUndefined();
      expect(beforeStyle.borderTopLeftRadius).toBeUndefined();
      expect(beforeStyle.borderTopRightRadius).toBe(0);

      // Drag "Before" (lastPan is the second bar) left by 2 columns (+2 days in RTL -> starts Mon 13 inside week):
      // the live preview now starts inside the visible week, so "14:30" appears in the preview.
      const hidden = { includeHiddenElements: true };
      await drag(25, -100, false);
      expect(view.getByTestId("all-day-move-preview", hidden)).toBeTruthy();
      expect(view.getByText("14:30", hidden)).toBeTruthy();
    });

    it("hides the start time when a promoted event starts on an interior hidden day", async () => {
      // Hide Tuesday (2): visible days are Mon, Wed, Thu, Fri, Sat, Sun.
      const visibleDays = days.filter((day) => day.getDay() !== 2);
      const startsOnHiddenTue: CalendarEvent = {
        title: "Hidden Start",
        start: new Date(2026, 6, 14, 9, 0),
        end: new Date(2026, 6, 15, 9, 0),
        allDay: false,
      };
      const startsOnVisibleMon: CalendarEvent = {
        title: "Visible Start",
        start: new Date(2026, 6, 13, 8, 30),
        end: new Date(2026, 6, 15, 8, 30),
        allDay: false,
      };
      const { view } = await setup({
        days: visibleDays,
        events: [startsOnHiddenTue, startsOnVisibleMon],
        renderEvent: DefaultEvent,
        multiDayTimedEventPlacement: "all-day",
      });
      expect(view.queryByText("09:00")).toBeNull();
      expect(view.getByText("08:30")).toBeTruthy();
    });
  });

  it("uses only visible columns and keeps empty pages measurable", async () => {
    const onLayout = vi.fn();
    const visibleDays = days.filter((day) => day.getDay() !== 3);
    const view = await render(
      <SlotStylesProvider classNames={{ allDayLane: "lane", allDayColumn: "span" }}>
        <AllDayLane {...props} days={visibleDays} onLayout={onLayout} />
      </SlotStylesProvider>,
    );
    expect(view.getAllByText("Trip")).toHaveLength(1);
    expect(
      StyleSheet.flatten(
        view.container.queryAll((node) => node.props.className === "span")[0].props.style,
      ).width,
    ).toBe(100);
    await view.rerender(
      <SlotStylesProvider classNames={{ allDayLane: "lane", allDayColumn: "span" }}>
        <AllDayLane {...props} events={[]} onLayout={onLayout} />
      </SlotStylesProvider>,
    );
    expect(view.container.queryAll((node) => node.props.className === "span")).toHaveLength(0);
    const lane = view.container.queryAll((node) => node.props.className === "lane")[0];
    await fireEvent(lane, "layout", {
      nativeEvent: { layout: { width: 350, height: 0, x: 0, y: 0 } },
    });
    expect(onLayout).toHaveBeenCalledTimes(1);
  });
});
