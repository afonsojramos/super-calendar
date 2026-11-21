import { act, fireEvent, render, within } from "@testing-library/react-native";
import { useEffect } from "react";
import { StyleSheet, Text, type ViewStyle } from "react-native";
import * as gestureHandlerMock from "react-native-gesture-handler";
import { vi } from "vitest";
import { defaultTheme } from "../../theme";
import type { CalendarEvent, RenderEventArgs } from "../../types";
import { MonthView } from "../MonthView";
import { MultiWeekView } from "../MultiWeekView";

const hidden = { includeHiddenElements: true };
// Shows the bounds and any continuation flags each bar is drawn with.
const Chip = ({ event, continuesBefore, continuesAfter }: RenderEventArgs) => (
  <Text>
    {`${event.title} ${event.start.getDate()}-${event.end.getDate()}` +
      `${continuesBefore ? " <" : ""}${continuesAfter ? " >" : ""}`}
  </Text>
);
const lastGesture = () => {
  const { __gestures } = gestureHandlerMock as unknown as {
    __gestures: { handlers: Record<string, (...args: unknown[]) => void> }[];
  };
  return __gestures.at(-1)!.handlers;
};
const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as ViewStyle);
const pct = (columns: number) => `${(columns / 7) * 100}%`;

describe.each(["month", "multiweek"] as const)("native %s move preview", (mode) => {
  // Month: June 2026 from Sunday 31 May, five 120pt rows at 700x600; row 2 is
  // 14-20 June. Multi-week: two 120pt rows from Monday 23 December 2030.
  const setup =
    mode === "month"
      ? {
          date: new Date(2026, 5, 15),
          weekStartsOn: 0 as const,
          grid: "month-grid",
          height: 600,
          // Wednesday 17 to Friday 19 June, moved to Friday 19 to Sunday 21.
          trip: { start: new Date(2026, 5, 17), end: new Date(2026, 5, 20) },
          origin: { x: 350, y: 272 },
          target: { x: 550, y: 272 },
          covered: [/19 June 2026/, /20 June 2026/, /21 June 2026/],
          untouched: [/17 June 2026/, /18 June 2026/, /22 June 2026/],
          label: "Trip 19-22",
        }
      : {
          date: new Date(2030, 11, 23),
          weekStartsOn: 1 as const,
          grid: "multiweek-grid",
          height: 240,
          // Thursday 26 to Saturday 28 December, moved to Saturday 28 to Monday 30.
          trip: { start: new Date(2030, 11, 26), end: new Date(2030, 11, 29) },
          origin: { x: 350, y: 35 },
          target: { x: 550, y: 35 },
          covered: [/28 December 2030/, /29 December 2030/, /30 December 2030/],
          untouched: [/26 December 2030/, /27 December 2030/, /31 December 2030/],
          label: "Trip 28-31",
        };
  const View = mode === "month" ? MonthView : MultiWeekView;
  const trip: CalendarEvent = { title: "Trip", allDay: true, ...setup.trip };
  const mount = async (onDragEvent = vi.fn()) => {
    const view = await render(
      <View
        date={setup.date}
        weekStartsOn={setup.weekStartsOn}
        events={[trip]}
        renderEvent={Chip}
        keyExtractor={(event: CalendarEvent) => event.title ?? ""}
        onPressEvent={() => {}}
        onDragEvent={onDragEvent}
      />,
    );
    await fireEvent(view.getByTestId(setup.grid), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 700, height: setup.height } },
    });
    return view;
  };
  const tinted = (view: Awaited<ReturnType<typeof mount>>, day: RegExp) =>
    styleOf(view.getByLabelText(day))?.backgroundColor === defaultTheme.colors.rangeBackground;

  it("previews the destination span across a week boundary and tints every covered day", async () => {
    const onDragEvent = vi.fn();
    const view = await mount(onDragEvent);
    const handlers = lastGesture();
    await act(() => {
      handlers.onStart(setup.origin);
      handlers.onUpdate(setup.target);
    });

    const previews = view.getAllByTestId("month-move-preview", hidden);
    expect(previews).toHaveLength(2);
    expect(styleOf(previews[0])).toMatchObject({ left: pct(5), width: pct(2) });
    expect(styleOf(previews[1])).toMatchObject({ left: pct(0), width: pct(1) });
    for (const preview of previews) {
      expect(preview.props.pointerEvents).toBe("none");
      expect(preview.props.importantForAccessibility).toBe("no-hide-descendants");
      // The chip's own background matches the drop tint in the default theme,
      // so the preview stays opaque and is outlined in the selection colour.
      expect(styleOf(preview)?.opacity ?? 1).toBe(1);
      const outline = within(preview).getByTestId("month-move-preview-outline", hidden);
      expect(styleOf(outline)).toMatchObject({
        position: "absolute",
        borderWidth: 1,
        borderColor: defaultTheme.colors.selectedBackground,
      });
    }
    // The renderer draws the shifted event in each row, with the same
    // continuation hints as the real bars (none on the month grid).
    expect(view.getAllByText(setup.label, hidden)).toHaveLength(2);
    // The original stays in place, faded.
    expect(
      view.getByText(`Trip ${setup.trip.start.getDate()}-${setup.trip.end.getDate()}`),
    ).toBeTruthy();

    for (const day of setup.covered) expect(tinted(view, day)).toBe(true);
    for (const day of setup.untouched) expect(tinted(view, day)).toBe(false);

    await act(() => handlers.onEnd({}, true));
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("month-move-preview", hidden)).toBeNull();
    for (const day of setup.covered) expect(tinted(view, day)).toBe(false);
  });

  it("removes the preview when the drag returns to its origin day", async () => {
    const view = await mount();
    const handlers = lastGesture();
    await act(() => {
      handlers.onStart(setup.origin);
      handlers.onUpdate(setup.target);
    });
    expect(view.getAllByTestId("month-move-preview", hidden)).toHaveLength(2);
    await act(() => handlers.onUpdate(setup.origin));
    expect(view.queryByTestId("month-move-preview", hidden)).toBeNull();
    for (const day of setup.covered) expect(tinted(view, day)).toBe(false);
  });

  it("removes the preview when the gesture is cancelled", async () => {
    const onDragEvent = vi.fn();
    const view = await mount(onDragEvent);
    const handlers = lastGesture();
    await act(() => {
      handlers.onStart(setup.origin);
      handlers.onUpdate(setup.target);
    });
    await act(() => {
      handlers.onEnd({}, false);
      handlers.onFinalize();
    });
    expect(view.queryByTestId("month-move-preview", hidden)).toBeNull();
    for (const day of setup.covered) expect(tinted(view, day)).toBe(false);
    expect(onDragEvent).not.toHaveBeenCalled();
  });
});

describe("native month move preview lanes", () => {
  // The absolutely placed wrapper a bar is drawn in.
  const barTop = (node: { parent: unknown; props: { style?: unknown } }) => {
    let current: typeof node | null = node;
    while (current && styleOf(current)?.position !== "absolute") {
      current = current.parent as typeof node | null;
    }
    return current ? styleOf(current)?.top : undefined;
  };

  it("pushes down only the bars the preview overlaps when the row has no lane to spare", async () => {
    // June 2026 from Sunday 31 May; row 2 is 14-20 June. One lane per row: Lisbon
    // trip and Weekend share lane 0, and the preview of Weekend on Saturday
    // overlaps only Weekend, so Lisbon trip keeps its lane.
    const lisbon: CalendarEvent = {
      title: "Lisbon trip",
      start: new Date(2026, 5, 14),
      end: new Date(2026, 5, 17),
      allDay: true,
    };
    const weekend: CalendarEvent = {
      title: "Weekend",
      start: new Date(2026, 5, 18),
      end: new Date(2026, 5, 21),
      allDay: true,
    };
    const view = await render(
      <MonthView
        date={new Date(2026, 5, 15)}
        weekStartsOn={0}
        events={[lisbon, weekend]}
        maxVisibleEventCount={1}
        renderEvent={Chip}
        keyExtractor={(event: CalendarEvent) => event.title ?? ""}
        onPressEvent={() => {}}
        onDragEvent={vi.fn()}
      />,
    );
    await fireEvent(view.getByTestId("month-grid"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 600 } },
    });
    const laneZero = barTop(view.getByText("Lisbon trip 14-17"));
    const handlers = lastGesture();
    await act(() => {
      handlers.onStart({ x: 450, y: 272 });
      handlers.onUpdate({ x: 650, y: 272 });
    });
    const [preview] = view.getAllByTestId("month-move-preview", hidden);
    expect(styleOf(preview)).toMatchObject({ left: pct(6), top: laneZero });
    expect(barTop(view.getByText("Lisbon trip 14-17"))).toBe(laneZero);
    // Only Weekend's own days (18-20 June) fold the moved-down original into
    // "+1 More"; Lisbon trip's days have nothing hidden.
    expect(view.getAllByText(/More/)).toHaveLength(3);
  });
});

describe("native month bar identity", () => {
  // Counts how many times each bar's chip mounts, keyed by its label.
  const mounts = new Map<string, number>();
  const CountingChip = ({ event }: RenderEventArgs) => {
    const label = `${event.title} ${event.start.getDate()}-${event.end.getDate()}`;
    useEffect(() => {
      mounts.set(label, (mounts.get(label) ?? 0) + 1);
    }, [label]);
    return <Text>{label}</Text>;
  };
  // Wednesday 17 to Friday 19 June 2026, in row 2 (14-20 June).
  const trip = (): CalendarEvent => ({
    title: "Trip",
    start: new Date(2026, 5, 17),
    end: new Date(2026, 5, 20),
    allDay: true,
  });
  const element = (events: CalendarEvent[]) => (
    <MonthView
      date={new Date(2026, 5, 15)}
      weekStartsOn={0}
      events={events}
      renderEvent={CountingChip}
      keyExtractor={(event: CalendarEvent) => event.title ?? ""}
      onPressEvent={() => {}}
      onDragEvent={vi.fn()}
    />
  );
  const mount = async (events: CalendarEvent[]) => {
    mounts.clear();
    const view = await render(element(events));
    await fireEvent(view.getByTestId("month-grid"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 700, height: 600 } },
    });
    return view;
  };

  it("keeps the carried bar mounted when the preview moves it to another lane", async () => {
    const view = await mount([trip()]);
    const handlers = lastGesture();
    // One day later the preview (18-20) overlaps the original, which moves down.
    await act(() => {
      handlers.onStart({ x: 350, y: 272 });
      handlers.onUpdate({ x: 450, y: 272 });
    });
    expect(view.getAllByTestId("month-move-preview", hidden)).toHaveLength(1);
    expect(mounts.get("Trip 17-20")).toBe(1);
    await act(() => handlers.onEnd({}, false));
    expect(mounts.get("Trip 17-20")).toBe(1);
  });

  it("keeps bars mounted when events are replaced with equal content", async () => {
    const view = await mount([trip(), trip()]);
    expect(view.getAllByText("Trip 17-20")).toHaveLength(2);
    expect(mounts.get("Trip 17-20")).toBe(2);
    await view.rerender(element([trip(), trip()]));
    expect(view.getAllByText("Trip 17-20")).toHaveLength(2);
    expect(mounts.get("Trip 17-20")).toBe(2);
  });
});
