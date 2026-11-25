import { vi } from "vitest";
import { act } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";
import { render } from "../../../../../tests/support/native-time-grid";

// Arrow-key paging only listens on react-native-web, so capture the handler each
// pager registers and call it directly.
const pagerKeyHandlers: ((delta: number) => void)[] = [];
vi.mock("../../utils/useWebPagerKeys", () => ({
  useWebPagerKeys: (_enabled: boolean, onPage: (delta: number) => void) => {
    pagerKeyHandlers.push(onPage);
  },
}));

import { Calendar } from "../Calendar";
import { DefaultEvent } from "../DefaultEvent";
import { TimeGrid } from "../TimeGrid";

const lastListProps = () => (globalThis as { __listProps?: Record<string, unknown> }).__listProps;
const noop = () => {};
const events: CalendarEvent[] = [];

describe("onChangeDate reason on native", () => {
  beforeEach(() => {
    pagerKeyHandlers.length = 0;
  });

  it("reports arrow-key paging in the time grid as keyboard", async () => {
    const onChangeDate = vi.fn();
    await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12)}
        events={events}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(_event, index) => String(index)}
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    await act(() => pagerKeyHandlers.at(-1)?.(1));
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(expect.any(Date), {
      reason: "keyboard",
    });
  });

  it("reports a time grid page that becomes visible as a swipe", async () => {
    const onChangeDate = vi.fn();
    await render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 0, 6, 12)}
        events={events}
        cellHeight={{ value: 48 } as never}
        weekStartsOn={1}
        renderEvent={DefaultEvent}
        keyExtractor={(_event, index) => String(index)}
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    const list = lastListProps() as {
      data: Date[];
      initialScrollIndex: number;
      getFixedItemSize: () => number;
      sharedValues: { scrollOffset: { value: number } };
      onViewableItemsChanged: (info: unknown) => void;
    };
    const index = list.initialScrollIndex + 1;
    // The swipe moves the list onto the next page, which then reports as viewable.
    list.sharedValues.scrollOffset.value = index * list.getFixedItemSize();
    await act(() =>
      list.onViewableItemsChanged({
        viewableItems: [{ isViewable: true, index, item: list.data[index] }],
      }),
    );
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(list.data[index], { reason: "swipe" });
  });

  it("reports arrow-key paging in the month pager as keyboard", async () => {
    const onChangeDate = vi.fn();
    await render(
      <Calendar
        mode="month"
        date={new Date(2026, 0, 15)}
        events={events}
        onChangeDate={onChangeDate}
        onPressEvent={noop}
      />,
    );
    await act(() => pagerKeyHandlers.at(-1)?.(1));
    expect(onChangeDate).toHaveBeenCalledExactlyOnceWith(new Date(2026, 1, 1), {
      reason: "keyboard",
    });
  });
});
