import { act, fireEvent, type RenderResult } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";
import type { CalendarEvent } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";
import { DefaultEvent } from "../DefaultEvent";
import { TimeGrid } from "../TimeGrid";

// `scrollOffsetMinutes` mounts the scroll view at an offset through
// `contentOffset`, and the grid pins its header and all-day band at that offset
// until the first scroll event. A viewport taller than the hours (a low-density
// screen) cannot scroll that far: on Android the scroll view rests lower, and at
// 0 it sends no scroll event, so the pinned rows were left hovering over the
// hours.

type WithId = { id: string };
const standup: CalendarEvent<WithId> = {
  id: "1",
  start: new Date(2026, 0, 6, 9, 0, 0),
  end: new Date(2026, 0, 6, 10, 0, 0),
  title: "Standup",
};
const noop = () => {};
// 08:00 at 48px an hour.
const SEED = 8 * 48;

const scrollToCalls = () =>
  (globalThis as { __scrollToCalls?: { y: number }[] }).__scrollToCalls ?? [];

const grid = (pass: number) => (
  <TimeGrid<WithId>
    mode="week"
    date={new Date(2026, 0, 6, 12)}
    events={[standup]}
    cellHeight={{ value: 48 } as never}
    hourHeight={48}
    weekStartsOn={1}
    scrollOffsetMinutes={8 * 60}
    renderEvent={DefaultEvent}
    keyExtractor={(item) => item.id}
    onChangeDate={noop}
    onPressEvent={noop}
    // Changes nothing but forces a render, which evaluates the animated styles.
    eventGap={pass % 2}
  />
);

const pinnedOffset = (result: RenderResult) =>
  (
    StyleSheet.flatten(result.getByTestId("paged-header").props.style) as {
      transform?: { translateY: number }[];
    }
  ).transform?.[0]?.translateY;

describe("TimeGrid scrollOffsetMinutes seed", () => {
  const platform = Platform.OS;
  beforeEach(() => {
    (globalThis as { __scrollToCalls?: unknown[] }).__scrollToCalls = [];
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = platform;
  });

  const mount = async () => {
    const result = await render(grid(0));
    const scrollView = result.container.queryAll(
      (node) => node.props.scrollEventThrottle === 16,
    )[0];
    let pass = 0;
    const size = async (viewport: number, content: number) => {
      await fireEvent(scrollView, "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height: viewport } },
      });
      await fireEvent(scrollView, "contentSizeChange", 400, content);
      await result.rerender(grid(++pass));
    };
    const scroll = async (y: number) => {
      await fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 0, y } } });
      await result.rerender(grid(++pass));
    };
    return { result, size, scroll };
  };

  it("pins the header at the seeded offset before anything lays out", async () => {
    const { result } = await mount();
    expect(pinnedOffset(result)).toBe(SEED);
  });

  it.each([
    { label: "shorter than the viewport", viewport: 1500, content: 1300, offset: 0 },
    { label: "scrollable short of the seed", viewport: 1200, content: 1400, offset: 200 },
  ])("pins the header where hours $label can rest", async ({ viewport, content, offset }) => {
    const { result, size } = await mount();
    await act(() => size(viewport, content));
    expect(pinnedOffset(result)).toBe(offset);
    // The scroll view is held there too, so a later layout cannot move it.
    expect(scrollToCalls()).toEqual([{ y: offset, animated: false }]);
  });

  it("keeps the seed on iOS, which holds an out-of-range offset", async () => {
    Platform.OS = "ios";
    const { result, size } = await mount();
    await act(() => size(1500, 1300));
    expect(pinnedOffset(result)).toBe(SEED);
    expect(scrollToCalls()).toEqual([]);
  });

  it("keeps the seed when the hours can scroll that far", async () => {
    const { result, size } = await mount();
    await act(() => size(800, 1400));
    expect(pinnedOffset(result)).toBe(SEED);
    expect(scrollToCalls()).toEqual([]);
  });

  it("follows the scroll events once they arrive", async () => {
    const { result, size, scroll } = await mount();
    await act(() => scroll(500));
    await act(() => size(1200, 1400));
    expect(pinnedOffset(result)).toBe(500);
    expect(scrollToCalls()).toEqual([]);
  });
});
