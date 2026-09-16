import { act, fireEvent, within } from "@testing-library/react-native";
import { Dimensions, Pressable, StyleSheet, Text } from "react-native";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { render } from "./renderGrid";

// Capture the props handed to the virtualized list, and render only the active
// page through `renderItem`. The real LegendList can't lay out under Jest (no
// measured dimensions), so it never mounts page content; this stand-in does,
// while still exposing the props we assert on.
const lastListProps = () => (globalThis as { __listProps?: Record<string, unknown> }).__listProps;
jest.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: (props: any) => {
    (globalThis as any).__listProps = props;
    const index = props.initialScrollIndex ?? 0;
    const item = props.data?.[index];
    return item === undefined ? null : props.renderItem({ item, index });
  },
}));

import { Calendar } from "../Calendar";
import { DefaultEvent } from "../DefaultEvent";
import { TimeGrid } from "../TimeGrid";

type WithId = { id: string };
const event: CalendarEvent<WithId> = {
  id: "1",
  start: new Date(2026, 0, 6, 9, 0, 0),
  end: new Date(2026, 0, 6, 10, 0, 0),
  title: "Standup",
};

const noop = () => {};

const moveGestureHarness = (index = 0) => {
  const { __gestures } = require("react-native-gesture-handler") as {
    __gestures: Array<{
      calls: Record<string, unknown[]>;
      handlers: {
        onStart?: (event: Record<string, number>) => void;
        onUpdate?: (event: Record<string, number>) => void;
        onEnd?: (event: Record<string, number>) => void;
        onFinalize?: (event?: Record<string, number>, success?: boolean) => void;
      };
    }>;
  };
  const gesture = __gestures.filter(
    (candidate) => candidate.calls.activateAfterLongPress?.[0] === 500,
  )[index];
  if (!gesture) throw new Error("move gesture not found");
  return gesture.handlers;
};

const animatedReactionHarness = () =>
  require("react-native-reanimated") as {
    __reactions: unknown[];
    __flushAnimatedReactions: () => void;
  };

describe("TimeGrid midnight drag", () => {
  beforeEach(() => {
    const gestureHandler = require("react-native-gesture-handler") as { __gestures: unknown[] };
    gestureHandler.__gestures.length = 0;
    animatedReactionHarness().__reactions.length = 0;
  });

  it("commits an overnight move and exposes only the clipped source height", async () => {
    const onDragEvent = jest.fn();
    let observedBoxHeight: { value: number } | undefined;
    const ProbeEvent = ({ boxHeight, continuesBefore }: RenderEventArgs<WithId>) => {
      if (!continuesBefore) observedBoxHeight = boxHeight;
      return <Text>Late shift</Text>;
    };
    const late: CalendarEvent<WithId> = {
      id: "late",
      title: "Late shift",
      start: new Date(2026, 0, 6, 19, 0, 0),
      end: new Date(2026, 0, 6, 23, 0, 0),
    };
    const { getAllByText } = await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[late]}
        cellHeight={{ value: 48 } as never}
        hourHeight={48}
        weekStartsOn={1}
        renderEvent={ProbeEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />,
    );
    const move = moveGestureHarness();

    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 1200, absoluteX: 200, absoluteY: 1500 });
      animatedReactionHarness().__flushAnimatedReactions();
    });

    // The start clamps to 23:45. Only 15 minutes remain before midnight, so the
    // source renderer receives the same 32px minimum as its clipped wrapper.
    expect(observedBoxHeight?.value).toBe(32);

    await act(() => {
      move.onEnd?.({ translationX: 0, translationY: 1200 });
      move.onFinalize?.();
      animatedReactionHarness().__flushAnimatedReactions();
    });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent<WithId>, Date, Date];
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([6, 23, 45]);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([7, 3, 45]);
    expect(getAllByText("Late shift")).toHaveLength(1);
  });

  it.each([0, 1, 2])(
    "moves every multi-day preview segment when segment %i is grabbed",
    async (segment) => {
      const trip: CalendarEvent<WithId> = {
        id: "trip",
        title: "Trip",
        start: new Date(2026, 0, 6, 17),
        end: new Date(2026, 0, 8, 21),
      };
      const onDragEvent = jest.fn();
      const observed: Array<RenderEventArgs<WithId>> = [];
      const ProbeEvent = (args: RenderEventArgs<WithId>) => {
        observed.push(args);
        return <Text>Trip</Text>;
      };
      const grid = (events: CalendarEvent<WithId>[]) => (
        <TimeGrid
          mode="week"
          date={trip.start}
          events={events}
          hourHeight={48}
          cellHeight={{ value: 48 } as never}
          weekStartsOn={1}
          hideHours
          renderEvent={ProbeEvent}
          keyExtractor={(item) => item.id}
          onChangeDate={noop}
          onPressEvent={noop}
          onDragEvent={onDragEvent}
        />
      );
      const { getAllByTestId, queryAllByTestId, rerender, getAllByText } = await render(
        grid([trip]),
      );
      const move = moveGestureHarness(segment);
      await act(() => move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 }));
      expect(
        getAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
      ).toHaveLength(7);
      const previews = observed.slice(-7);
      const translationX = Dimensions.get("window").width / 7;
      await act(() => {
        move.onUpdate?.({ translationX, translationY: 48, absoluteX: 300, absoluteY: 348 });
        animatedReactionHarness().__flushAnimatedReactions();
      });
      // Jan 7 18:00 through Jan 9 22:00, including the previously empty Friday.
      expect(previews.map((preview) => preview.boxHeight?.value)).toEqual([
        0, 0, 288, 1152, 1056, 0, 0,
      ]);
      expect(onDragEvent).not.toHaveBeenCalled();
      await rerender(grid([{ ...trip }]));
      expect(
        getAllByText("Trip", { includeHiddenElements: true })
          .slice(0, 3)
          .map((node) => StyleSheet.flatten(node.parent!.props.style).opacity),
      ).toEqual([0, 0, 0]);
      await act(() => {
        move.onEnd?.({ translationX, translationY: 48 });
        move.onFinalize?.({}, true);
      });
      expect(onDragEvent).toHaveBeenCalledWith(
        trip,
        new Date(2026, 0, 7, 18),
        new Date(2026, 0, 9, 22),
      );
      // A controlled consumer may update after the gesture ends. Keep the
      // complete preview at its snapped position until that update arrives.
      expect(
        queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
      ).toHaveLength(7);
      expect(previews.map((preview) => preview.boxHeight?.value)).toEqual([
        0, 0, 288, 1152, 1056, 0, 0,
      ]);
      await rerender(
        grid([{ ...trip, start: new Date(2026, 0, 7, 18), end: new Date(2026, 0, 9, 22) }]),
      );
      expect(
        queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
      ).toHaveLength(0);
    },
  );

  it.each(["cancel", "reject"])("clears the multi-day preview on %s", async (finish) => {
    const trip: CalendarEvent<WithId> = { ...event, end: new Date(2026, 0, 8, 10) };
    const onDragEvent = jest.fn(() => false);
    const { queryAllByTestId } = await render(
      <TimeGrid
        mode="week"
        date={trip.start}
        events={[trip]}
        hourHeight={48}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />,
    );
    const move = moveGestureHarness();
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
    });
    expect(
      queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
    ).toHaveLength(7);
    await act(() => {
      if (finish === "reject") move.onEnd?.({ translationX: 0, translationY: 48 });
      move.onFinalize?.({}, finish === "reject");
    });
    expect(onDragEvent).toHaveBeenCalledTimes(finish === "reject" ? 1 : 0);
    expect(
      queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
    ).toHaveLength(0);
  });

  it("previews the committed end when vertical movement crosses a clock change", async () => {
    const trip: CalendarEvent<WithId> = {
      id: "trip",
      title: "Trip",
      start: new Date(2026, 2, 29, 1),
      end: new Date(2026, 2, 30, 10),
    };
    const date = new Date(2026, 2, 30);
    const onDragEvent = jest.fn();
    const observed: Array<RenderEventArgs<WithId>> = [];
    const ProbeEvent = (args: RenderEventArgs<WithId>) => {
      observed.push(args);
      return <Text>Trip</Text>;
    };
    await render(
      <TimeGrid
        mode="3days"
        date={date}
        weekStartsOn={1}
        events={[trip]}
        hourHeight={48}
        cellHeight={{ value: 48 } as never}
        renderEvent={ProbeEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />,
    );
    const move = moveGestureHarness();
    await act(() => move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 }));
    const previews = observed.slice(-3);
    await act(() => {
      move.onUpdate?.({ translationX: 0, translationY: 96, absoluteX: 200, absoluteY: 396 });
      move.onEnd?.({ translationX: 0, translationY: 96 });
      move.onFinalize?.({}, true);
    });
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent<WithId>, Date, Date];
    expect(end.getTime() - start.getTime()).toBe(trip.end.getTime() - trip.start.getTime());
    expect(previews.map((preview) => preview.boxHeight?.value)).toEqual([
      ((end.getTime() - date.getTime()) / 3_600_000) * 48,
      0,
      0,
    ]);
  });
});

describe("TimeGrid event updates", () => {
  // Pages are virtualized by date, so a list item only repaints when its key,
  // data, or extraData changes. A moved event changes none of those — so without
  // feeding `events` to the list as extraData, a committed drag/menu move leaves
  // the stale position on screen (the box only appears to move until the next
  // grab snaps it back). Guard the wiring that makes external updates repaint.
  it("feeds the current events to the list as extraData", async () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const events = [event];
    const { rerender, getByLabelText, queryByLabelText } = await render(
      <Calendar mode="day" date={date} events={events} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(events);
    expect(getByLabelText(/Standup, 09:00 to 10:00/)).toBeTruthy();

    const moved: CalendarEvent<WithId> = {
      ...event,
      start: new Date(2026, 0, 6, 11, 0, 0),
      end: new Date(2026, 0, 6, 12, 0, 0),
    };
    const movedEvents = [moved];
    await rerender(
      <Calendar
        mode="day"
        date={date}
        events={movedEvents}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );

    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(movedEvents);
    expect(getByLabelText(/Standup, 11:00 to 12:00/)).toBeTruthy();
    expect(queryByLabelText(/Standup, 09:00 to 10:00/)).toBeNull();
  });
});

describe("TimeGrid all-day lane", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);
  const allDayEvent: CalendarEvent<WithId> = {
    id: "h1",
    start: new Date(2026, 0, 6),
    end: new Date(2026, 0, 7),
    title: "Holiday",
    allDay: true,
  };

  it("renders the all-day lane by default", async () => {
    const { getByText } = await render(
      <Calendar
        mode="day"
        date={date}
        events={[allDayEvent]}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(getByText("Holiday")).toBeTruthy();
  });

  it("hides the lane (and its events) when showAllDayEventCell is false", async () => {
    const { queryByText } = await render(
      <Calendar
        mode="day"
        date={date}
        events={[allDayEvent]}
        showAllDayEventCell={false}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(queryByText("Holiday")).toBeNull();
  });
});

describe("TimeGrid business hours", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);

  it("shades the closed hours around the open window (two bands)", async () => {
    const { getAllByTestId } = await render(
      <Calendar
        mode="day"
        date={date}
        events={[]}
        businessHours={() => ({ start: 9, end: 17 })}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    // Closed before 09:00 and after 17:00.
    expect(getAllByTestId("business-hours-shade", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("shades the whole day when closed (null)", async () => {
    const { getAllByTestId } = await render(
      <Calendar
        mode="day"
        date={date}
        events={[]}
        businessHours={() => null}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(getAllByTestId("business-hours-shade", { includeHiddenElements: true })).toHaveLength(1);
  });

  it("shades nothing without a businessHours callback", async () => {
    const { queryAllByTestId } = await render(
      <Calendar mode="day" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect(queryAllByTestId("business-hours-shade", { includeHiddenElements: true })).toHaveLength(
      0,
    );
  });

  it("hands each closed band to renderBusinessHours and drops the themed tint", async () => {
    const { getAllByTestId, getByText } = await render(
      <Calendar
        mode="day"
        date={date}
        events={[]}
        businessHours={() => ({ start: 9, end: 17 })}
        renderBusinessHours={({ start, end }) => <Text>{`closed ${start}-${end}`}</Text>}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    // The bands before open and after close render the custom content...
    expect(getByText("closed 0-9", { includeHiddenElements: true })).toBeTruthy();
    expect(getByText("closed 17-24", { includeHiddenElements: true })).toBeTruthy();
    // ...and the built-in tint steps aside for it.
    for (const band of getAllByTestId("business-hours-shade", { includeHiddenElements: true })) {
      expect(StyleSheet.flatten(band.props.style).backgroundColor).toBeUndefined();
    }
  });

  it("uses eventAccessibilityLabel to override a timed event's label", async () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const { getByLabelText, queryByLabelText } = await render(
      <Calendar
        mode="day"
        date={date}
        events={[event]}
        onChangeDate={noop}
        onPressEvent={noop}
        eventAccessibilityLabel={(e, ctx) => `Custom: ${e.title} (${ctx.mode})`}
      />,
    );
    expect(getByLabelText("Custom: Standup (day)")).toBeTruthy();
    expect(queryByLabelText(/Standup, 09:00 to 10:00/)).toBeNull();
  });
});

describe("TimeGrid cross-page accessibility actions", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0); // Tue 6 Jan 2026

  it("moves an event a whole page via the screen-reader actions, keeping its time", async () => {
    const onDragEvent = jest.fn();
    const { getByLabelText } = await render(
      <Calendar
        mode="week"
        date={date}
        events={[event]}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />,
    );
    const bar = getByLabelText(/Standup, 09:00 to 10:00/);
    const names = (bar.props.accessibilityActions ?? []).map((a: { name: string }) => a.name);
    expect(names).toContain("move-next-page");
    expect(names).toContain("move-previous-page");

    // "Move to next week" shifts +7 days, preserving the 09:00-10:00 time.
    await fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "move-next-page" } });
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent<WithId>, Date, Date];
    expect(start.getTime()).toBe(new Date(2026, 0, 13, 9, 0, 0).getTime());
    expect(end.getTime()).toBe(new Date(2026, 0, 13, 10, 0, 0).getTime());

    // "Move to previous week" shifts -7 days from the original.
    await fireEvent(bar, "accessibilityAction", {
      nativeEvent: { actionName: "move-previous-page" },
    });
    const [, prevStart] = onDragEvent.mock.calls[1] as [CalendarEvent<WithId>, Date, Date];
    expect(prevStart.getTime()).toBe(new Date(2025, 11, 30, 9, 0, 0).getTime());
  });

  it("locks an event with draggable:false: no drag actions even when onDragEvent is set", async () => {
    const { getByLabelText } = await render(
      <Calendar
        mode="week"
        date={date}
        events={[{ ...event, draggable: false }]}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={jest.fn()}
      />,
    );
    // Still rendered and reachable (taps unaffected), but exposes no move/resize
    // screen-reader actions, mirroring the blocked gesture.
    const bar = getByLabelText(/Standup, 09:00 to 10:00/);
    expect(bar.props.accessibilityActions ?? []).toHaveLength(0);
  });

  it("splits move vs resize with startEditable/durationEditable", async () => {
    const names = (el: { props: { accessibilityActions?: { name: string }[] } }) =>
      (el.props.accessibilityActions ?? []).map((a) => a.name);

    // startEditable: false -> resize-only (no move actions, resize actions stay).
    const moveOnly = await render(
      <Calendar
        mode="week"
        date={date}
        events={[{ ...event, startEditable: false }]}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={jest.fn()}
      />,
    );
    const a = names(moveOnly.getByLabelText(/Standup, 09:00 to 10:00/));
    expect(a).not.toContain("move-later");
    expect(a).toContain("extend");

    // durationEditable: false -> move-only (move actions stay, no resize actions).
    const resizeless = await render(
      <Calendar
        mode="week"
        date={date}
        events={[{ ...event, durationEditable: false }]}
        onChangeDate={noop}
        onPressEvent={noop}
        onDragEvent={jest.fn()}
      />,
    );
    const b = names(resizeless.getByLabelText(/Standup, 09:00 to 10:00/));
    expect(b).toContain("move-later");
    expect(b).not.toContain("extend");
  });
});

describe("TimeGrid weekend shading", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0); // Tue 6 Jan 2026 -> week has Sat + Sun

  it("tints weekend columns by default and drops them with highlightWeekends=false", async () => {
    const { queryAllByTestId, rerender } = await render(
      <Calendar mode="week" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect(queryAllByTestId("weekend-shade")).toHaveLength(2);

    await rerender(
      <Calendar
        mode="week"
        date={date}
        events={[]}
        highlightWeekends={false}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(queryAllByTestId("weekend-shade")).toHaveLength(0);
  });
});

describe("TimeGrid column header", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0); // Tue 6 Jan 2026

  it("themes the header weekday, day number, and badge", async () => {
    const { getByText, getAllByTestId } = await render(
      <Calendar
        mode="week"
        date={date}
        events={[]}
        onChangeDate={noop}
        onPressEvent={noop}
        theme={{
          text: {
            dayNumber: { fontSize: 19 },
            columnHeaderWeekday: { fontSize: 12, color: "#101010" },
          },
          containers: { columnHeaderBadge: { width: 40, height: 40 } },
        }}
      />,
    );
    const { StyleSheet } = require("react-native");
    const number = getByText("6");
    expect(StyleSheet.flatten(number.props.style).fontSize).toBe(19);
    const weekday = getByText("Tue");
    const weekdayStyle = StyleSheet.flatten(weekday.props.style);
    expect(weekdayStyle.fontSize).toBe(12);
    // A themed colour wins over the built-in muted colour.
    expect(weekdayStyle.color).toBe("#101010");
    const [badge] = getAllByTestId("column-header-badge");
    expect(StyleSheet.flatten(badge.props.style).width).toBe(40);
  });

  it("announces the full date on a pressable header and fires onPressDateHeader", async () => {
    const onPressDateHeader = jest.fn();
    const { getByLabelText } = await render(
      <Calendar
        mode="week"
        date={date}
        events={[]}
        onChangeDate={noop}
        onPressEvent={noop}
        onPressDateHeader={onPressDateHeader}
      />,
    );
    const { fireEvent } = require("@testing-library/react-native");
    await fireEvent.press(getByLabelText("Tuesday 6 January"));
    expect(onPressDateHeader).toHaveBeenCalledTimes(1);
    expect((onPressDateHeader.mock.calls[0][0] as Date).getDate()).toBe(6);
  });

  it("exposes each day column as a labelled header when not interactive", async () => {
    const { getByRole } = await render(
      <Calendar mode="week" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    // A screen reader still perceives the column's date (previously the static
    // header let only the terse "Tue"/"6" child labels speak).
    expect(getByRole("header", { name: "Tuesday 6 January" })).toBeTruthy();
  });
});

describe("TimeGrid slot styling", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);
  const gridProps = () => ({
    mode: "day" as const,
    date,
    events: [event],
    cellHeight: { value: 48 } as never,
    weekStartsOn: 1 as const,
    renderEvent: DefaultEvent,
    keyExtractor: (_e: CalendarEvent<WithId>, i: number) => String(i),
    onChangeDate: noop,
    onPressEvent: noop,
  });

  it("passes slot classes to the header and hour labels, dropping their themed styles", async () => {
    const { container, getAllByText } = await render(
      <TimeGrid
        {...gridProps()}
        classNames={{ hourLabel: "text-slate-400", columnHeaderWeekday: "uppercase" }}
      />,
    );
    const hourLabel = getAllByText("06:00")[0];
    expect(hourLabel.props.className).toBe("text-slate-400");
    // Themed muted colour dropped; structural width kept.
    const flat = StyleSheet.flatten(hourLabel.props.style) as Record<string, unknown>;
    expect(flat.color).toBeUndefined();
    expect(flat.width).toBeGreaterThan(0);
    expect(
      container.queryAll((node) => node.props.className === "uppercase").length,
    ).toBeGreaterThan(0);
  });

  it("merges per-slot style overrides over the themed look", async () => {
    const { getAllByText } = await render(
      <TimeGrid {...gridProps()} styles={{ hourLabel: { color: "tomato" } }} />,
    );
    const hourLabel = getAllByText("06:00")[0];
    expect(hourLabel.props.className).toBeUndefined();
    const flat = StyleSheet.flatten(hourLabel.props.style) as Record<string, unknown>;
    expect(flat.color).toBe("tomato");
  });
});

describe("TimeGrid event box sizing", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);
  // 15 minutes at 48px/hour is 12px, well under the default 32px floor.
  const quarter: CalendarEvent<WithId> = {
    id: "quarter",
    title: "Quarter",
    start: new Date(2026, 0, 6, 9, 0, 0),
    end: new Date(2026, 0, 6, 9, 15, 0),
  };
  const gridProps = () => ({
    mode: "day" as const,
    date,
    events: [quarter],
    cellHeight: { value: 48 } as never,
    hourHeight: 48,
    weekStartsOn: 1 as const,
    keyExtractor: (item: CalendarEvent<WithId>) => item.id,
    onChangeDate: noop,
    onPressEvent: noop,
  });
  const probe = () => {
    let observed: { value: number } | undefined;
    const ProbeEvent = ({ boxHeight }: RenderEventArgs<WithId>) => {
      observed = boxHeight;
      return <Text>Quarter</Text>;
    };
    return { ProbeEvent, boxHeight: () => observed?.value };
  };

  it("floors a short event's boxHeight at 32px by default", async () => {
    const { ProbeEvent, boxHeight } = probe();
    await render(<TimeGrid {...gridProps()} renderEvent={ProbeEvent} />);
    expect(boxHeight()).toBe(32);
  });

  it("minEventHeight lowers the floor so boxHeight follows the duration", async () => {
    const { ProbeEvent, boxHeight } = probe();
    await render(<TimeGrid {...gridProps()} renderEvent={ProbeEvent} minEventHeight={0} />);
    expect(boxHeight()).toBe(12);
  });

  it("minEventHeight can raise the floor too", async () => {
    const { ProbeEvent, boxHeight } = probe();
    await render(<TimeGrid {...gridProps()} renderEvent={ProbeEvent} minEventHeight={40} />);
    expect(boxHeight()).toBe(40);
  });

  it("insets the event box by eventGap (default 2) and lets 0 fill the slot", async () => {
    const boxPadding = async (eventGap?: number) => {
      const { container } = await render(
        <TimeGrid
          {...gridProps()}
          renderEvent={DefaultEvent}
          classNames={{ event: "event-slot" }}
          eventGap={eventGap}
        />,
      );
      const [box] = container.queryAll((node) => node.props.className === "event-slot");
      return (StyleSheet.flatten(box.props.style) as Record<string, unknown>).padding;
    };
    expect(await boxPadding()).toBe(2);
    expect(await boxPadding(0)).toBe(0);
    expect(await boxPadding(6)).toBe(6);
  });

  it("Calendar forwards minEventHeight and eventGap to the grid", async () => {
    const { ProbeEvent, boxHeight } = probe();
    const { container } = await render(
      <Calendar
        mode="day"
        date={date}
        events={[quarter]}
        renderEvent={ProbeEvent}
        minEventHeight={0}
        eventGap={0}
        classNames={{ event: "event-slot" }}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect(boxHeight()).toBe(12);
    const [box] = container.queryAll((node) => node.props.className === "event-slot");
    expect((StyleSheet.flatten(box.props.style) as Record<string, unknown>).padding).toBe(0);
  });
});

describe("TimeGrid paged header", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);
  const base = () => ({
    mode: "week" as const,
    date,
    events: [event],
    cellHeight: { value: 48 } as never,
    weekStartsOn: 1 as const,
    renderEvent: DefaultEvent,
    keyExtractor: (_e: CalendarEvent<WithId>, i: number) => String(i),
    onChangeDate: noop,
    onPressEvent: noop,
  });

  it("renders the day header inside the page, so it pages with the columns", async () => {
    const { getByTestId } = await render(<TimeGrid {...base()} />);
    const paged = getByTestId("paged-header");
    // The weekday/date columns live inside the paged header, above the band.
    expect(within(paged).getByRole("header", { name: /Tuesday 6 January/ })).toBeTruthy();
  });

  it("keeps a fixed header (no paged header) when renderHeader is supplied", async () => {
    const { queryByTestId, getByText } = await render(
      <TimeGrid {...base()} renderHeader={() => <Text>custom header</Text>} />,
    );
    expect(queryByTestId("paged-header")).toBeNull();
    expect(getByText("custom header")).toBeTruthy();
  });

  it("shows the week number in the hour-column corner, not a fixed row", async () => {
    const { getByTestId } = await render(
      <TimeGrid {...base()} showWeekNumber weekNumberPrefix="W" />,
    );
    // ISO week of the visible Monday-start week containing 6 Jan 2026 is 2.
    expect(within(getByTestId("hour-gutter")).getByText("W2")).toBeTruthy();
  });

  it("drops the paged header (and its offset) when a custom header is fixed", async () => {
    const flat = (node: { props: Record<string, unknown> }) =>
      StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
    const { getByTestId } = await render(
      <TimeGrid {...base()} minHour={7} maxHour={20} renderHeader={() => <Text>h</Text>} />,
    );
    // No 56px header band in the page height: empty lane + inset + 13 rows of 160.
    expect(flat(getByTestId("time-grid-page")).height).toBe(12 + 13 * 160);
  });
});

describe("TimeGrid hour column", () => {
  const date = new Date(2026, 0, 6, 12, 0, 0);
  const gridProps = () => ({
    mode: "week" as const,
    date,
    events: [event],
    cellHeight: { value: 48 } as never,
    weekStartsOn: 1 as const,
    renderEvent: DefaultEvent,
    keyExtractor: (_e: CalendarEvent<WithId>, i: number) => String(i),
    onChangeDate: noop,
    onPressEvent: noop,
  });
  const flat = (node: { props: Record<string, unknown> }) =>
    (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
  // The nearest ancestor positioned by the grid (its style carries a `top`).
  type Positioned = { props: Record<string, unknown>; parent: Positioned | null };
  const rowOf = (node: Positioned) => {
    let current: Positioned | null = node;
    while (current && flat(current).top === undefined) current = current.parent;
    return current!;
  };

  it("draws the hour labels once, in the column beside the pager", async () => {
    const { getByTestId, getAllByText } = await render(<TimeGrid {...gridProps()} />);
    const gutter = getByTestId("hour-gutter");
    expect(getAllByText("06:00")).toHaveLength(1);
    expect(within(gutter).getAllByText("06:00")).toHaveLength(1);
    expect(flat(gutter).width).toBe(56);
  });

  it("renders hourComponent in the hour column only", async () => {
    const { getByTestId, getAllByText } = await render(
      <TimeGrid {...gridProps()} hourComponent={(hour) => <Text>{`custom-${hour}`}</Text>} />,
    );
    expect(getAllByText("custom-6")).toHaveLength(1);
    expect(within(getByTestId("hour-gutter")).getAllByText("custom-6")).toHaveLength(1);
  });

  it("renders no hour column, and no labels, when hours are hidden", async () => {
    const { queryByTestId, queryByText } = await render(<TimeGrid {...gridProps()} hideHours />);
    expect(queryByTestId("hour-gutter")).toBeNull();
    expect(queryByText("06:00")).toBeNull();
  });

  it("lays the day columns out from the pager's left edge", async () => {
    const { container } = await render(
      <TimeGrid {...gridProps()} classNames={{ event: "event-slot" }} />,
    );
    const [box] = container.queryAll((node) => node.props.className === "event-slot");
    // Tuesday is the second column of a Monday-start week; the hour column sits
    // outside the pager, so the columns share the remaining width.
    expect(flat(box).left).toBeCloseTo((Dimensions.get("window").width - 56) / 7);
  });

  it("keeps every hour line inside the page and none in the hour column", async () => {
    const { container, getByTestId } = await render(
      <TimeGrid {...gridProps()} classNames={{ gridLines: "grid-line" }} />,
    );
    expect(container.queryAll((node) => node.props.className === "grid-line")).toHaveLength(24);
    expect(
      getByTestId("hour-gutter").queryAll((node) => node.props.className === "grid-line", {
        includeSelf: true,
      }),
    ).toHaveLength(0);
  });

  it("starts the labels and the lines from the same origin in a windowed grid", async () => {
    const { getByTestId, getAllByText, queryByText, container } = await render(
      <TimeGrid {...gridProps()} minHour={7} maxHour={20} classNames={{ gridLines: "line" }} />,
    );
    // 13 labels, 07:00 first at the top of the column and 06:00 absent.
    expect(within(getByTestId("hour-gutter")).getAllByText(/^\d\d:00$/)).toHaveLength(13);
    expect(queryByText("06:00")).toBeNull();
    expect(flat(rowOf(getAllByText("07:00")[0])).top).toBe(0);
    const [firstLine] = container.queryAll((node) => node.props.className === "line");
    expect(flat(firstLine).top).toBe(0);
    // The one hour window sizes the scroll content: the paged day header, the
    // empty all-day band, the label inset, then 13 rows of 48px. The page keeps a
    // fixed height with room for the fully zoomed window (13 rows of 160px).
    expect(flat(getByTestId("time-grid-hours")).height).toBe(56 + 12 + 13 * 48);
    expect(flat(getByTestId("time-grid-page")).height).toBe(56 + 12 + 13 * 160);
  });

  it("starts the first column at the pager's left edge when hours are hidden", async () => {
    const { container } = await render(
      <TimeGrid {...gridProps()} hideHours classNames={{ event: "event-slot" }} />,
    );
    const [box] = container.queryAll((node) => node.props.className === "event-slot");
    expect(flat(box).left).toBeCloseTo(Dimensions.get("window").width / 7);
  });

  it("styles the hour column through the hourGutter slot", async () => {
    const { getByTestId } = await render(
      <TimeGrid {...gridProps()} styles={{ hourGutter: { backgroundColor: "white" } }} />,
    );
    expect(flat(getByTestId("hour-gutter")).backgroundColor).toBe("white");
  });

  it("scrolls the hour column and the pages in one seeded scroll view", async () => {
    const { container } = await render(
      <TimeGrid {...gridProps()} hourHeight={48} scrollOffsetMinutes={8 * 60} />,
    );
    const scrollers = container.queryAll((node) => node.props.scrollEventThrottle === 16);
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0].props.contentOffset).toEqual({ x: 0, y: 384 });
    const scroller = within(scrollers[0]);
    expect(scroller.getByTestId("hour-gutter")).toBeTruthy();
    expect(scroller.getAllByLabelText(/Standup/)).toHaveLength(1);
  });

  it("gives each page an all-day band that rides the scroll offset and follows its lane", async () => {
    const trip: CalendarEvent<WithId> = {
      id: "trip",
      title: "Trip",
      start: new Date(2026, 0, 6),
      end: new Date(2026, 0, 7),
      allDay: true,
    };
    const grid = (ampm: boolean) => (
      <TimeGrid
        {...gridProps()}
        events={[event, trip]}
        hourHeight={48}
        scrollOffsetMinutes={8 * 60}
        classNames={{ allDayLane: "lane" }}
        ampm={ampm}
      />
    );
    const { container, getByTestId, getAllByLabelText, rerender } = await render(grid(false));
    // The lane lives inside the page, so it pages with the columns; the label
    // sits once in the hour column.
    const [scroller] = container.queryAll((node) => node.props.scrollEventThrottle === 16);
    expect(getAllByLabelText(/Trip/)).toHaveLength(1);
    expect(within(scroller).getAllByLabelText(/Trip/)).toHaveLength(1);
    // The "all-day" label is off by default.
    expect(within(getByTestId("hour-gutter")).queryByText("all-day")).toBeNull();
    // Unmeasured, the band sits at its 1px floor and is counter-translated by
    // the scroll offset so it holds still at the top of the viewport.
    const band = getByTestId("all-day-band");
    expect(flat(band).height).toBe(1);
    expect(flat(band).transform).toEqual([{ translateY: 384 }]);
    // The page reports its lane's natural height; the band and the page follow.
    const [lane] = container.queryAll((node) => node.props.className === "lane");
    await fireEvent(lane, "layout", { nativeEvent: { layout: { height: 46 } } });
    await rerender(grid(true));
    expect(flat(getByTestId("all-day-band")).height).toBe(46);
    expect(flat(getByTestId("time-grid-hours")).height).toBe(56 + 46 + 12 + 24 * 48);
    // The fixed page height grows with the tallest lane seen.
    expect(flat(getByTestId("time-grid-page")).height).toBe(56 + 46 + 12 + 24 * 160);
    // A week with no all-day events reports zero and the band collapses to its
    // 1px floor; the page keeps the tallest lane it has seen.
    await fireEvent(lane, "layout", { nativeEvent: { layout: { height: 0 } } });
    await rerender(grid(false));
    expect(flat(getByTestId("all-day-band")).height).toBe(1);
    expect(flat(getByTestId("time-grid-page")).height).toBe(56 + 46 + 12 + 24 * 160);
  });

  it("renders no all-day columns for a week whose all-day events fall elsewhere", async () => {
    const away: CalendarEvent<WithId> = {
      id: "away",
      title: "Away",
      start: new Date(2026, 1, 3),
      end: new Date(2026, 1, 4),
      allDay: true,
    };
    const { container } = await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[away]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
        classNames={{ allDayLane: "lane", allDayColumn: "col" }}
      />,
    );
    // The lane itself renders (it reports its height), but with no columns to
    // pad it, so the week measures as empty rather than as a row of padding.
    expect(container.queryAll((node) => node.props.className === "lane")).toHaveLength(1);
    expect(container.queryAll((node) => node.props.className === "col")).toHaveLength(0);
  });
});

describe("TimeGrid all-day band during a swipe", () => {
  it("interpolates the band's height between the outgoing and incoming pages", async () => {
    const trip: CalendarEvent<WithId> = {
      id: "trip",
      title: "Trip",
      start: new Date(2026, 0, 6),
      end: new Date(2026, 0, 7),
      allDay: true,
    };
    const grid = (ampm: boolean) => (
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[event, trip]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
        classNames={{ allDayLane: "lane" }}
        ampm={ampm}
      />
    );
    const { container, getByTestId, rerender } = await render(grid(false));
    const flat = (node: { props: Record<string, unknown> }) =>
      StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
    const [lane] = container.queryAll((node) => node.props.className === "lane");
    await fireEvent(lane, "layout", { nativeEvent: { layout: { height: 64 } } });
    await rerender(grid(true));
    expect(flat(getByTestId("all-day-band")).height).toBe(64);
    // The list keeps its offset on the UI thread. Three quarters of the way in
    // from the previous page (unmeasured, so no height) the band is three
    // quarters of the way up to this page's height.
    const listProps = lastListProps() as {
      sharedValues: { scrollOffset: { value: number } };
      getFixedItemSize: () => number;
    };
    const pageWidth = listProps.getFixedItemSize();
    listProps.sharedValues.scrollOffset.value = (179 + 0.75) * pageWidth;
    await rerender(grid(false));
    expect(flat(getByTestId("all-day-band")).height).toBeCloseTo(64 * 0.75);
  });
});

describe("TimeGrid fast-fling repaint", () => {
  const flushFrame = async () => {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  };

  const settle = async (x: number) => {
    const onEnd = (lastListProps() as { onMomentumScrollEnd?: (e: unknown) => void })
      .onMomentumScrollEnd;
    await act(() => onEnd?.({ nativeEvent: { contentOffset: { x } } }));
  };

  beforeEach(() => {
    (globalThis as { __scrollToIndexCalls?: unknown[] }).__scrollToIndexCalls = [];
  });

  it("re-anchors the list to the page the fling settled on", async () => {
    await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[event]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const pageWidth = (lastListProps() as { getFixedItemSize: () => number }).getFixedItemSize();
    await settle(5 * pageWidth);
    await flushFrame();
    const calls = (globalThis as { __scrollToIndexCalls?: { index: number }[] })
      .__scrollToIndexCalls;
    expect(calls?.at(-1)).toEqual({ index: 5, animated: false });
  });

  it("clamps an overscrolled settle to the page window", async () => {
    await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[event]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    const pageCount = (lastListProps() as { data: unknown[] }).data.length;
    // A rubber-band overscroll past the last page must not pass an out-of-range index.
    await settle(1e9);
    await flushFrame();
    const calls = (globalThis as { __scrollToIndexCalls?: { index: number }[] })
      .__scrollToIndexCalls;
    expect(calls?.at(-1)).toEqual({ index: pageCount - 1, animated: false });
  });

  it("commits the page a fling settles on, even one viewability never reported", async () => {
    const onChangeDate = jest.fn();
    await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[event]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    const list = lastListProps() as { getFixedItemSize: () => number; initialScrollIndex: number };
    const pageWidth = list.getFixedItemSize();
    // Rest 60% into the next page: under the 90% viewability threshold, so only
    // the settle can report it.
    await settle((list.initialScrollIndex + 0.6) * pageWidth);
    expect(onChangeDate).toHaveBeenCalledTimes(1);
    const [committed] = onChangeDate.mock.calls[0] as [Date];
    expect([committed.getFullYear(), committed.getMonth(), committed.getDate()]).toEqual([
      2026, 0, 12,
    ]);
  });

  it("does not re-commit a settle on the page already shown", async () => {
    const onChangeDate = jest.fn();
    await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[event]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    const list = lastListProps() as { getFixedItemSize: () => number; initialScrollIndex: number };
    await settle(list.initialScrollIndex * list.getFixedItemSize());
    expect(onChangeDate).not.toHaveBeenCalled();
  });
});

describe("TimeGrid cross-week drop", () => {
  beforeEach(() => {
    const gestureHandler = require("react-native-gesture-handler") as { __gestures: unknown[] };
    gestureHandler.__gestures.length = 0;
    animatedReactionHarness().__reactions.length = 0;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("maps the lifted ghost's pager-local position to a day column and time", async () => {
    const onDragEvent = jest.fn();
    const onChangeDate = jest.fn();
    const grid = (date: Date) => (
      <TimeGrid
        mode="week"
        date={date}
        events={[event]}
        cellHeight={{ value: 48 } as never}
        hourHeight={48}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={onChangeDate}
        onPressEvent={noop}
        onDragEvent={onDragEvent}
      />
    );
    const { rerender } = await render(grid(new Date(2026, 0, 6, 12, 0, 0)));
    const move = moveGestureHarness();
    // Grab the box 10px in, then hold the finger inside the pager's right edge zone.
    await act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 535, translationY: 0, absoluteX: 735, absoluteY: 750 });
    });
    // The edge dwell lifts the event into the floating ghost and pages the view.
    await act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(onChangeDate).toHaveBeenCalledWith(new Date(2026, 0, 12));
    // The pager keeps swiping enabled throughout: toggling it made the list
    // re-apply its initial offset on release and jump back a page.
    expect((lastListProps() as { scrollEnabled?: boolean }).scrollEnabled).toBe(true);
    // A controlled app advances the page in response, so the drop's target week
    // becomes Jan 12-18 (not the un-advanced Jan 5-11).
    await rerender(grid(new Date(2026, 0, 12)));
    await act(() => {
      move.onFinalize?.({}, true);
    });
    // The ghost's left edge is 725px into the pager (past the last of seven
    // columns, so clamped to the advanced week's Sunday, Jan 18) and its top 764px
    // down the page: past the 56px paged header (this week has no all-day band)
    // and the 12px label inset, 672px is 14 rows.
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent<WithId>, Date, Date];
    expect(start).toEqual(new Date(2026, 0, 18, 14, 0));
    expect(end).toEqual(new Date(2026, 0, 18, 15, 0));
  });
});

describe("TimeGrid short-event press", () => {
  type Chain = {
    kind: string;
    args: Chain[];
    calls: Record<string, unknown[]>;
    handlers: {
      onEnd?: (event: unknown, success: boolean) => void;
      onStart?: (event: unknown) => void;
    };
  };
  const chains = () =>
    (require("react-native-gesture-handler") as { __gestures: Chain[] }).__gestures;
  const brief: CalendarEvent<WithId> = {
    id: "brief",
    title: "Brief",
    start: new Date(2026, 0, 6, 9, 0, 0),
    end: new Date(2026, 0, 6, 9, 15, 0),
  };
  beforeEach(() => {
    chains().length = 0;
  });

  it("presses the event from a tap on either resize handle", async () => {
    const onPressEvent = jest.fn();
    const { getByTestId } = await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[brief]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={onPressEvent}
        onDragEvent={noop}
      />,
    );
    // Both handles mount on an editable event.
    expect(getByTestId("resize-handle")).toBeTruthy();
    expect(getByTestId("resize-handle-top")).toBeTruthy();
    // Each handle races its pan against a tap and a long press.
    const races = chains().filter((chain) => chain.kind === "Race");
    expect(races).toHaveLength(2);
    for (const race of races) {
      const [pan, tap, longPress] = race.args;
      expect(pan.kind).toBe("Pan");
      expect(tap.kind).toBe("Tap");
      expect(tap.calls.runOnJS?.[0]).toBe(true);
      expect(longPress.kind).toBe("LongPress");
      // A tap the pan took over is not a press; a completed tap is.
      tap.handlers.onEnd?.({}, false);
      tap.handlers.onEnd?.({}, true);
    }
    expect(onPressEvent).toHaveBeenCalledTimes(2);
    expect(onPressEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "brief" }));
  });

  it("long-presses a handle on an event that a long press cannot move", async () => {
    const onLongPressEvent = jest.fn();
    const pinned: CalendarEvent<WithId> = { ...brief, startEditable: false };
    await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12, 0, 0)}
        events={[pinned]}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(item) => item.id}
        onChangeDate={noop}
        onPressEvent={noop}
        onLongPressEvent={onLongPressEvent}
        onDragEvent={noop}
      />,
    );
    const longPresses = chains().filter((chain) => chain.kind === "LongPress");
    expect(longPresses.length).toBeGreaterThan(0);
    expect(longPresses[0].calls.enabled?.[0]).toBe(true);
    longPresses[0].handlers.onStart?.({});
    expect(onLongPressEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "brief" }));
  });
});

describe("TimeGrid background events", () => {
  const blocked: CalendarEvent<WithId> = {
    id: "blocked",
    title: "Blocked",
    start: new Date(2026, 0, 6, 9, 0, 0),
    end: new Date(2026, 0, 6, 12, 0, 0),
    display: "background",
  };
  const flat = (node: { props: { style?: unknown } }) =>
    StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
  const BlockedBand = ({ event: band, onPress, onLongPress }: RenderEventArgs<WithId>) => (
    <Pressable testID="bg-press" onPress={onPress} onLongPress={onLongPress}>
      <Text>{band.title}</Text>
    </Pressable>
  );
  const grid = (props: Partial<React.ComponentProps<typeof TimeGrid<WithId>>>) => (
    <TimeGrid
      mode="week"
      date={new Date(2026, 0, 6, 12, 0, 0)}
      events={[blocked, event]}
      cellHeight={{ value: 48 } as never}
      weekStartsOn={1}
      renderEvent={DefaultEvent}
      keyExtractor={(item) => item.id}
      onChangeDate={noop}
      onPressEvent={noop}
      {...props}
    />
  );

  it("shades a background event without rendering it as an event", async () => {
    const { getByTestId, queryByText } = await render(grid({}));
    // The default band is hidden from assistive tech, so ask for hidden elements.
    const band = getByTestId("background-event-shade", { includeHiddenElements: true });
    expect(flat(band).pointerEvents).toBe("none");
    expect(flat(band).backgroundColor).toBeDefined();
    expect(queryByText("Blocked")).toBeNull();
  });

  it("renders a background event through the component and lets it press", async () => {
    const onPressEvent = jest.fn();
    const onLongPressEvent = jest.fn();
    const { getByTestId, getByText } = await render(
      grid({ renderBackgroundEvent: BlockedBand, onPressEvent, onLongPressEvent }),
    );
    expect(getByText("Blocked")).toBeTruthy();
    const band = getByTestId("background-event-shade");
    expect(flat(band).pointerEvents).toBe("box-none");
    // The themed tint gives way to the component's own look.
    expect(flat(band).backgroundColor).toBeUndefined();
    await fireEvent.press(getByTestId("bg-press"));
    expect(onPressEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "blocked" }));
    await fireEvent(getByTestId("bg-press"), "longPress");
    expect(onLongPressEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "blocked" }));
  });

  it("tells the component when a multi-day background continues past the column", async () => {
    const span: CalendarEvent<WithId> = {
      id: "span",
      title: "Span",
      start: new Date(2026, 0, 5, 22, 0, 0),
      end: new Date(2026, 0, 7, 2, 0, 0),
      display: "background",
    };
    const Edges = ({ continuesBefore, continuesAfter }: RenderEventArgs<WithId>) => (
      <Text>{`${continuesBefore ? "<" : "-"}${continuesAfter ? ">" : "-"}`}</Text>
    );
    const { getByText } = await render(
      grid({ events: [span, event], renderBackgroundEvent: Edges }),
    );
    expect(getByText("->")).toBeTruthy(); // Jan 5 runs on into Jan 6
    expect(getByText("<>")).toBeTruthy(); // Jan 6 is covered end to end
    expect(getByText("<-")).toBeTruthy(); // Jan 7 carries the tail
  });
});
