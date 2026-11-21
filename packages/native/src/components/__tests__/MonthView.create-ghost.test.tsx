import type { CreateGhostArgs } from "@super-calendar/core";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, Text, type ViewStyle } from "react-native";
import * as gestureHandlerMock from "react-native-gesture-handler";
import { vi } from "vitest";
import type { CalendarEvent } from "../../types";
import { DefaultEvent } from "../DefaultEvent";
import { MonthView } from "../MonthView";
import { MultiWeekView } from "../MultiWeekView";

const baseProps = {
  date: new Date(2026, 5, 15),
  events: [] as CalendarEvent[],
  weekStartsOn: 0 as const,
  renderEvent: DefaultEvent,
  keyExtractor: (_event: CalendarEvent, index: number) => String(index),
  onPressEvent: () => {},
};
const hidden = { includeHiddenElements: true };
const Draft = ({ start, end }: CreateGhostArgs) => (
  <Text>{`Draft ${start.getDate()} to ${end.getDate()}`}</Text>
);
const point = (column: number, row: number) => ({ x: column * 100 + 50, y: row * 120 + 8 });
const lastGesture = () => {
  const { __gestures } = gestureHandlerMock as unknown as {
    __gestures: { handlers: Record<string, (...args: unknown[]) => void> }[];
  };
  return __gestures.at(-1)!.handlers;
};
const layout = async (view: Awaited<ReturnType<typeof render>>, grid = "month-grid") => {
  await fireEvent(view.getByTestId(grid), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 700, height: grid === "month-grid" ? 600 : 240 } },
  });
};

describe("native month creation content", () => {
  it.each([false, true])(
    "shows the committed range across rows, reversed: %s",
    async (reversed) => {
      const onCreateEvent = vi.fn();
      const view = await render(
        <MonthView {...baseProps} onCreateEvent={onCreateEvent} renderCreateGhost={Draft} />,
      );
      await layout(view);
      const handlers = lastGesture();
      const friday = point(5, 2);
      const monday = point(1, 3);
      await act(() => handlers.onStart(reversed ? monday : friday));
      expect(view.getByText(reversed ? "Draft 22 to 23" : "Draft 19 to 20", hidden)).toBeTruthy();
      await act(() => handlers.onUpdate(reversed ? friday : monday));
      expect(view.getAllByText("Draft 19 to 23", hidden)).toHaveLength(2);
      const previews = view.getAllByTestId("month-create-ghost", hidden);
      expect(previews[0]).toHaveStyle({ left: `${(5 / 7) * 100}%`, right: "0%" });
      expect(previews[1]).toHaveStyle({ left: "0%", right: `${(5 / 7) * 100}%` });
      await act(() => handlers.onEnd({}, true));
      expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 5, 19),
        new Date(2026, 5, 23),
      );
      expect(view.queryByTestId("month-create-ghost", hidden)).toBeNull();
    },
  );

  it.each([
    ["MonthView", "month-grid"],
    ["MultiWeekView", "multiweek-grid"],
  ] as const)(
    "keeps the preview on lane 0 above a same-day all-day event in %s",
    async (name, grid) => {
      // Holiday ties with a one-day sweep on its day. The preview takes lane 0 from
      // the first day and stays there when the sweep reaches the next day.
      const holiday = {
        title: "Holiday",
        start: new Date(2026, 5, 16),
        end: new Date(2026, 5, 17),
        allDay: true,
      };
      const props = {
        ...baseProps,
        events: [holiday],
        chipHeight: 20,
        onCreateEvent: vi.fn(),
        renderCreateGhost: Draft,
      };
      const view = await render(
        name === "MonthView" ? (
          <MonthView {...props} />
        ) : (
          <MultiWeekView {...props} numberOfWeeks={2} />
        ),
      );
      await layout(view, grid);
      const barTop = () => {
        let node: { parent: unknown; props: { style?: unknown } } | null =
          view.getByText("Holiday");
        while (node && StyleSheet.flatten(node.props.style as ViewStyle)?.position !== "absolute") {
          node = node.parent as typeof node;
        }
        return StyleSheet.flatten(node?.props.style as ViewStyle)?.top;
      };
      // Lanes are 22pt apart. 16 June is Tuesday, in the month's third row and the
      // multi-week view's first.
      const row = name === "MonthView" ? 2 : 0;
      const laneZero = barTop() as number;
      const handlers = lastGesture();
      await act(() => handlers.onStart(point(2, row)));
      expect(view.getByText("Draft 16 to 17", hidden)).toBeTruthy();
      expect(view.getByTestId("month-create-ghost", hidden)).toHaveStyle({ top: laneZero });
      expect(barTop()).toBe(laneZero + 22);
      await act(() => handlers.onUpdate(point(3, row)));
      expect(view.getByText("Draft 16 to 18", hidden)).toBeTruthy();
      expect(view.getByTestId("month-create-ghost", hidden)).toHaveStyle({ top: laneZero });
      expect(barTop()).toBe(laneZero + 22);
    },
  );

  it("puts the preview on lane 0, moving the bars it overlaps down", async () => {
    // Trip starts on Sunday and Lunch sits under it. The preview takes lane 0 on
    // Tuesday, so both move down one lane and keep their order.
    const trip = {
      title: "Trip",
      start: new Date(2026, 5, 14),
      end: new Date(2026, 5, 17),
      allDay: true,
    };
    const lunch = {
      title: "Lunch",
      start: new Date(2026, 5, 16, 12),
      end: new Date(2026, 5, 16, 13),
    };
    const view = await render(
      <MonthView
        {...baseProps}
        events={[trip, lunch]}
        chipHeight={20}
        onCreateEvent={vi.fn()}
        renderCreateGhost={Draft}
      />,
    );
    await layout(view);
    // The absolutely placed wrapper a bar is drawn in.
    const barTop = (title: string) => {
      let node: { parent: unknown; props: { style?: unknown } } | null = view.getByText(title);
      while (node && StyleSheet.flatten(node.props.style as ViewStyle)?.position !== "absolute") {
        node = node.parent as typeof node;
      }
      return StyleSheet.flatten(node?.props.style as ViewStyle)?.top;
    };
    expect(barTop("Lunch")).toBe(52);
    const handlers = lastGesture();
    await act(() => handlers.onStart(point(2, 2)));
    await act(() => handlers.onUpdate(point(3, 2)));
    // Lanes start 30pt into the row, 22pt apart: the preview 0, Trip 1, Lunch 2.
    expect(view.getByTestId("month-create-ghost", hidden)).toHaveStyle({ top: 30 });
    expect(barTop("Trip")).toBe(52);
    expect(barTop("Lunch")).toBe(74);
  });

  it("keeps range Dates stable within one day and commits a stationary hold", async () => {
    const seen: CreateGhostArgs[] = [];
    const Content = (range: CreateGhostArgs) => {
      seen.push(range);
      return <Draft {...range} />;
    };
    const onCreateEvent = vi.fn();
    const props = { ...baseProps, onCreateEvent, renderCreateGhost: Content };
    const view = await render(<MonthView {...props} />);
    await layout(view);
    const handlers = lastGesture();
    await act(() => handlers.onStart(point(2, 2)));
    const initial = seen.at(-1)!;
    expect(view.getByText("Draft 16 to 17", hidden)).toBeTruthy();
    await act(() => handlers.onUpdate({ x: 270, y: 250 }));
    await view.rerender(<MonthView {...props} styles={{ createGhost: { opacity: 0.5 } }} />);
    expect(seen.at(-1)!.start).toBe(initial.start);
    expect(seen.at(-1)!.end).toBe(initial.end);
    await act(() => lastGesture().onEnd({}, true));
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(initial.start, initial.end);
  });

  it("clears cancelled content and accepts a subsequent gesture", async () => {
    const onCreateEvent = vi.fn();
    const view = await render(
      <MonthView {...baseProps} onCreateEvent={onCreateEvent} renderCreateGhost={Draft} />,
    );
    await layout(view);
    await act(() => lastGesture().onStart(point(2, 2)));
    expect(view.getByText("Draft 16 to 17", hidden)).toBeTruthy();
    await act(() => {
      lastGesture().onEnd({}, false);
      lastGesture().onFinalize();
    });
    expect(view.queryByTestId("month-create-ghost", hidden)).toBeNull();
    expect(onCreateEvent).not.toHaveBeenCalled();
    await act(() => lastGesture().onStart(point(3, 2)));
    await act(() => lastGesture().onEnd({}, true));
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 5, 17),
      new Date(2026, 5, 18),
    );
  });

  it("keeps preview content noninteractive and hidden from accessibility, with overridable styling", async () => {
    const view = await render(
      <MonthView
        {...baseProps}
        onCreateEvent={vi.fn()}
        renderCreateGhost={Draft}
        chipHeight={27}
        chipGap={5}
        classNames={{ createGhost: "draft" }}
        styles={{ createGhost: { backgroundColor: "purple" } }}
      />,
    );
    await layout(view);
    await act(() => lastGesture().onStart(point(2, 2)));
    const ghost = view.getByTestId("month-create-ghost", hidden);
    expect(ghost).toHaveStyle({
      position: "absolute",
      height: 27,
      top: 33,
      overflow: "hidden",
      backgroundColor: "purple",
    });
    expect(ghost.props.className).toBe("draft");
    expect(ghost.props.pointerEvents).toBe("none");
    expect(ghost.props.accessibilityElementsHidden).toBe(true);
    expect(ghost.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(view.queryByText("Draft 16 to 17")).toBeNull();
  });

  it("does not show content or enable creation from a renderer alone", async () => {
    const onSelectDrag = vi.fn();
    const view = await render(
      <MonthView {...baseProps} onSelectDrag={onSelectDrag} renderCreateGhost={Draft} />,
    );
    await layout(view);
    await act(() => lastGesture().onStart(point(2, 2)));
    await act(() => lastGesture().onUpdate(point(3, 2)));
    expect(onSelectDrag).toHaveBeenLastCalledWith(new Date(2026, 5, 16), new Date(2026, 5, 17));
    expect(view.queryByTestId("month-create-ghost", hidden)).toBeNull();
  });

  it("keeps the default highlight when no renderer is supplied", async () => {
    const onCreateEvent = vi.fn();
    const view = await render(<MonthView {...baseProps} onCreateEvent={onCreateEvent} />);
    await layout(view);
    await act(() => lastGesture().onStart(point(2, 2)));
    expect(view.queryByTestId("month-create-ghost", hidden)).toBeNull();
    await act(() => lastGesture().onEnd({}, true));
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 5, 16),
      new Date(2026, 5, 17),
    );
  });

  it("does not render creation content while moving an existing event", async () => {
    const onDragEvent = vi.fn();
    const event: CalendarEvent = {
      title: "Existing",
      start: new Date(2026, 5, 15, 9),
      end: new Date(2026, 5, 15, 10),
    };
    const view = await render(
      <MonthView
        {...baseProps}
        events={[event]}
        onCreateEvent={vi.fn()}
        onDragEvent={onDragEvent}
        renderCreateGhost={Draft}
      />,
    );
    await layout(view);
    await act(() => lastGesture().onStart({ x: 150, y: 272 }));
    await act(() => lastGesture().onUpdate({ x: 250, y: 272 }));
    expect(view.queryByTestId("month-create-ghost", hidden)).toBeNull();
    await act(() => lastGesture().onEnd({}, true));
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      event,
      new Date(2026, 5, 16, 9),
      new Date(2026, 5, 16, 10),
    );
  });

  it("keeps the preview on an enabled day when a sweep reaches a disabled day", async () => {
    const onCreateEvent = vi.fn();
    const view = await render(
      <MonthView
        {...baseProps}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
        isDateDisabled={(day) => day.getDate() === 17}
      />,
    );
    await layout(view);
    await act(() => lastGesture().onStart(point(2, 2)));
    await act(() => lastGesture().onUpdate(point(3, 2)));
    expect(view.getByText("Draft 16 to 17", hidden)).toBeTruthy();
    await act(() => lastGesture().onEnd({}, true));
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 5, 16),
      new Date(2026, 5, 17),
    );
  });

  it("clips a span to visible weekday columns in RTL", async () => {
    const onCreateEvent = vi.fn();
    const view = await render(
      <MonthView
        {...baseProps}
        hiddenDays={[0, 6]}
        isRTL
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
      />,
    );
    await layout(view);
    // Five columns are now 140px wide, from Friday on the left to Monday on the right.
    await act(() => lastGesture().onStart({ x: 70, y: 248 }));
    await act(() => lastGesture().onUpdate({ x: 630, y: 368 }));
    const previews = view.getAllByTestId("month-create-ghost", hidden);
    expect(previews).toHaveLength(2);
    expect(previews[0]).toHaveStyle({ left: "0%", right: "80%" });
    expect(previews[1]).toHaveStyle({ left: "80%", right: "0%" });
    expect(view.getAllByText("Draft 19 to 23", hidden)).toHaveLength(2);
  });

  it("forwards the renderer to multi-week rows", async () => {
    const onCreateEvent = vi.fn();
    const view = await render(
      <MultiWeekView
        {...baseProps}
        numberOfWeeks={2}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
      />,
    );
    await layout(view, "multiweek-grid");
    await act(() => lastGesture().onStart(point(5, 0)));
    await act(() => lastGesture().onUpdate(point(1, 1)));
    expect(view.getAllByText("Draft 19 to 23", hidden)).toHaveLength(2);
    await act(() => lastGesture().onEnd({}, true));
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 5, 19),
      new Date(2026, 5, 23),
    );
  });

  it("keeps the preview within a short week row", async () => {
    const view = await render(
      <MonthView
        {...baseProps}
        chipHeight={20}
        onCreateEvent={vi.fn()}
        renderCreateGhost={Draft}
      />,
    );
    await fireEvent(view.getByTestId("month-grid"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 200 } },
    });
    await act(() => lastGesture().onStart({ x: 250, y: 88 }));
    expect(view.getByTestId("month-create-ghost", hidden)).toHaveStyle({ top: 30, height: 10 });
  });

  it("does not extend into blank adjacent-month cells", async () => {
    const onCreateEvent = vi.fn();
    const view = await render(
      <MonthView
        {...baseProps}
        showAdjacentMonths={false}
        onCreateEvent={onCreateEvent}
        renderCreateGhost={Draft}
      />,
    );
    await layout(view);
    await act(() => lastGesture().onStart(point(2, 4)));
    await act(() => lastGesture().onUpdate(point(5, 4)));
    expect(view.getByText("Draft 30 to 1", hidden)).toBeTruthy();
    expect(view.getByTestId("month-create-ghost", hidden)).toHaveStyle({
      left: `${(2 / 7) * 100}%`,
      right: `${(4 / 7) * 100}%`,
    });
    await act(() => lastGesture().onEnd({}, true));
    expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
      new Date(2026, 5, 30),
      new Date(2026, 6, 1),
    );
  });
});
