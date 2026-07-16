import { render } from "@testing-library/react-native";
import type { CalendarEvent } from "../../types";

// Capture the props handed to the virtualized list, and render only the anchor
// month through `renderItem`. The real LegendList can't lay out under Jest (no
// measured dimensions), so it never mounts month content; this stand-in does,
// while still exposing the props we assert on. Kept apart from MonthList.test.tsx,
// which deliberately mounts the real LegendList.
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

import { MonthList } from "../MonthList";

type WithId = { id: string };

describe("MonthList event updates", () => {
  // Months are keyed by dates that never change, so a mounted month only
  // repaints when the list's `data` or `extraData` changes. Events supplied
  // after mount (the usual async fetch) change neither — the same bug the
  // MonthPager had (#28). Guard the wiring that makes external updates repaint.
  it("feeds the current events to the list as extraData", () => {
    const date = new Date(2026, 0, 6, 12, 0, 0);
    const initialEvents: CalendarEvent<WithId>[] = [];
    const { rerender, getByLabelText, queryByLabelText } = render(
      <MonthList date={date} events={initialEvents} weekStartsOn={1} />,
    );
    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(initialEvents);
    expect(queryByLabelText(/6 January 2026, 1 event$/)).toBeNull();

    // The fetch resolves after the list (and its months) mounted.
    const fetched: CalendarEvent<WithId>[] = [
      {
        id: "1",
        start: new Date(2026, 0, 6, 9, 0, 0),
        end: new Date(2026, 0, 6, 10, 0, 0),
        title: "Standup",
      },
    ];
    rerender(<MonthList date={date} events={fetched} weekStartsOn={1} />);

    expect((lastListProps()?.extraData as { events?: unknown })?.events).toBe(fetched);
    expect(getByLabelText(/6 January 2026, 1 event$/)).toBeTruthy();
  });
});
