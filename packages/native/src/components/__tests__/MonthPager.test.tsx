import { render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";

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

type WithId = { id: string };
const noop = () => {};

describe("MonthPager event updates", () => {
  // Pages are keyed by month Dates that never change, so a mounted page only
  // repaints when the list's `data` or `extraData` changes. Events supplied
  // after mount (the usual async fetch) change neither — so without feeding
  // `events` to the list as extraData, the month grid stays empty until the
  // pager remounts. Guard the wiring that makes external updates repaint.
  it("feeds the current events to the list as extraData", () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const initialEvents: CalendarEvent<WithId>[] = [];
    const { rerender, getByLabelText, queryByLabelText } = render(
      <Calendar
        mode="month"
        date={date}
        events={initialEvents}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );
    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(initialEvents);
    expect(queryByLabelText(/6 January 2026, 1 event$/)).toBeNull();

    // The fetch resolves after the pager (and its pages) mounted.
    const fetched: CalendarEvent<WithId>[] = [
      {
        id: "1",
        start: new Date(2026, 0, 6, 9, 0, 0),
        end: new Date(2026, 0, 6, 10, 0, 0),
        title: "Standup",
      },
    ];
    rerender(
      <Calendar
        mode="month"
        date={date}
        events={fetched}
        onChangeDate={noop}
        onPressEvent={noop}
      />,
    );

    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(fetched);
    expect(getByLabelText(/6 January 2026, 1 event$/)).toBeTruthy();
  });
});
