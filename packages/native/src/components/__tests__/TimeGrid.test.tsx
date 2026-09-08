import { act, fireEvent, render } from "@testing-library/react-native";
import { Dimensions, StyleSheet, Text } from "react-native";
import type { CalendarEvent, RenderEventArgs } from "../../types";

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

  it("commits an overnight move and exposes only the clipped source height", () => {
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
    const { getAllByText } = render(
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

    act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 1200, absoluteX: 200, absoluteY: 1500 });
      animatedReactionHarness().__flushAnimatedReactions();
    });

    // The start clamps to 23:45. Only 15 minutes remain before midnight, so the
    // source renderer receives the same 32px minimum as its clipped wrapper.
    expect(observedBoxHeight?.value).toBe(32);

    act(() => {
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
    (segment) => {
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
      const { getAllByTestId, queryAllByTestId, rerender, UNSAFE_getAllByType } = render(
        grid([trip]),
      );
      const move = moveGestureHarness(segment);
      act(() => move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 }));
      expect(
        getAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
      ).toHaveLength(7);
      const previews = observed.slice(-7);
      const translationX = Dimensions.get("window").width / 7;
      act(() => {
        move.onUpdate?.({ translationX, translationY: 48, absoluteX: 300, absoluteY: 348 });
        animatedReactionHarness().__flushAnimatedReactions();
      });
      // Jan 7 18:00 through Jan 9 22:00, including the previously empty Friday.
      expect(previews.map((preview) => preview.boxHeight?.value)).toEqual([
        0, 0, 288, 1152, 1056, 0, 0,
      ]);
      expect(onDragEvent).not.toHaveBeenCalled();
      rerender(grid([{ ...trip }]));
      expect(
        UNSAFE_getAllByType(ProbeEvent)
          .slice(0, 3)
          .map((node) => StyleSheet.flatten(node.parent!.props.style).opacity),
      ).toEqual([0, 0, 0]);
      act(() => {
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
      rerender(grid([{ ...trip, start: new Date(2026, 0, 7, 18), end: new Date(2026, 0, 9, 22) }]));
      expect(
        queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
      ).toHaveLength(0);
    },
  );

  it.each(["cancel", "reject"])("clears the multi-day preview on %s", (finish) => {
    const trip: CalendarEvent<WithId> = { ...event, end: new Date(2026, 0, 8, 10) };
    const onDragEvent = jest.fn(() => false);
    const { queryAllByTestId } = render(
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
    act(() => {
      move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 });
      move.onUpdate?.({ translationX: 0, translationY: 48, absoluteX: 200, absoluteY: 348 });
    });
    expect(
      queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
    ).toHaveLength(7);
    act(() => {
      if (finish === "reject") move.onEnd?.({ translationX: 0, translationY: 48 });
      move.onFinalize?.({}, finish === "reject");
    });
    expect(onDragEvent).toHaveBeenCalledTimes(finish === "reject" ? 1 : 0);
    expect(
      queryAllByTestId("multi-day-move-preview", { includeHiddenElements: true }),
    ).toHaveLength(0);
  });

  it("previews the committed end when vertical movement crosses a clock change", () => {
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
    render(
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
    act(() => move.onStart?.({ x: 10, y: 10, absoluteX: 200, absoluteY: 300 }));
    const previews = observed.slice(-3);
    act(() => {
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
  it("feeds the current events to the list as extraData", () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const events = [event];
    const { rerender, getByLabelText, queryByLabelText } = render(
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
    rerender(
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

  it("renders the all-day lane by default", () => {
    const { getByText } = render(
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

  it("hides the lane (and its events) when showAllDayEventCell is false", () => {
    const { queryByText } = render(
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

  it("shades the closed hours around the open window (two bands)", () => {
    const { getAllByTestId } = render(
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

  it("shades the whole day when closed (null)", () => {
    const { getAllByTestId } = render(
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

  it("shades nothing without a businessHours callback", () => {
    const { queryAllByTestId } = render(
      <Calendar mode="day" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect(queryAllByTestId("business-hours-shade", { includeHiddenElements: true })).toHaveLength(
      0,
    );
  });

  it("hands each closed band to renderBusinessHours and drops the themed tint", () => {
    const { getAllByTestId, getByText } = render(
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

  it("uses eventAccessibilityLabel to override a timed event's label", () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const { getByLabelText, queryByLabelText } = render(
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

  it("moves an event a whole page via the screen-reader actions, keeping its time", () => {
    const onDragEvent = jest.fn();
    const { getByLabelText } = render(
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
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "move-next-page" } });
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent<WithId>, Date, Date];
    expect(start.getTime()).toBe(new Date(2026, 0, 13, 9, 0, 0).getTime());
    expect(end.getTime()).toBe(new Date(2026, 0, 13, 10, 0, 0).getTime());

    // "Move to previous week" shifts -7 days from the original.
    fireEvent(bar, "accessibilityAction", { nativeEvent: { actionName: "move-previous-page" } });
    const [, prevStart] = onDragEvent.mock.calls[1] as [CalendarEvent<WithId>, Date, Date];
    expect(prevStart.getTime()).toBe(new Date(2025, 11, 30, 9, 0, 0).getTime());
  });

  it("locks an event with draggable:false: no drag actions even when onDragEvent is set", () => {
    const { getByLabelText } = render(
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

  it("splits move vs resize with startEditable/durationEditable", () => {
    const names = (el: { props: { accessibilityActions?: { name: string }[] } }) =>
      (el.props.accessibilityActions ?? []).map((a) => a.name);

    // startEditable: false -> resize-only (no move actions, resize actions stay).
    const moveOnly = render(
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
    const resizeless = render(
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

  it("tints weekend columns by default and drops them with highlightWeekends=false", () => {
    const { queryAllByTestId, rerender } = render(
      <Calendar mode="week" date={date} events={[]} onChangeDate={noop} onPressEvent={noop} />,
    );
    expect(queryAllByTestId("weekend-shade")).toHaveLength(2);

    rerender(
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

  it("themes the header weekday, day number, and badge", () => {
    const { getByText, getAllByTestId } = render(
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

  it("announces the full date on a pressable header and fires onPressDateHeader", () => {
    const onPressDateHeader = jest.fn();
    const { getByLabelText } = render(
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
    fireEvent.press(getByLabelText("Tuesday 6 January"));
    expect(onPressDateHeader).toHaveBeenCalledTimes(1);
    expect((onPressDateHeader.mock.calls[0][0] as Date).getDate()).toBe(6);
  });

  it("exposes each day column as a labelled header when not interactive", () => {
    const { getByRole } = render(
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

  it("passes slot classes to the header and hour labels, dropping their themed styles", () => {
    const { UNSAFE_getAllByProps, getAllByText } = render(
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
    expect(UNSAFE_getAllByProps({ className: "uppercase" }).length).toBeGreaterThan(0);
  });

  it("merges per-slot style overrides over the themed look", () => {
    const { getAllByText } = render(
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

  it("floors a short event's boxHeight at 32px by default", () => {
    const { ProbeEvent, boxHeight } = probe();
    render(<TimeGrid {...gridProps()} renderEvent={ProbeEvent} />);
    expect(boxHeight()).toBe(32);
  });

  it("minEventHeight lowers the floor so boxHeight follows the duration", () => {
    const { ProbeEvent, boxHeight } = probe();
    render(<TimeGrid {...gridProps()} renderEvent={ProbeEvent} minEventHeight={0} />);
    expect(boxHeight()).toBe(12);
  });

  it("minEventHeight can raise the floor too", () => {
    const { ProbeEvent, boxHeight } = probe();
    render(<TimeGrid {...gridProps()} renderEvent={ProbeEvent} minEventHeight={40} />);
    expect(boxHeight()).toBe(40);
  });

  it("insets the event box by eventGap (default 2) and lets 0 fill the slot", () => {
    const boxPadding = (eventGap?: number) => {
      const { UNSAFE_getAllByProps } = render(
        <TimeGrid
          {...gridProps()}
          renderEvent={DefaultEvent}
          classNames={{ event: "event-slot" }}
          eventGap={eventGap}
        />,
      );
      const [box] = UNSAFE_getAllByProps({ className: "event-slot" });
      return (StyleSheet.flatten(box.props.style) as Record<string, unknown>).padding;
    };
    expect(boxPadding()).toBe(2);
    expect(boxPadding(0)).toBe(0);
    expect(boxPadding(6)).toBe(6);
  });

  it("Calendar forwards minEventHeight and eventGap to the grid", () => {
    const { ProbeEvent, boxHeight } = probe();
    const { UNSAFE_getAllByProps } = render(
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
    const [box] = UNSAFE_getAllByProps({ className: "event-slot" });
    expect((StyleSheet.flatten(box.props.style) as Record<string, unknown>).padding).toBe(0);
  });
});
