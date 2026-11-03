import { vi } from "vitest";
import { render } from "@testing-library/react";

// Legend List (used by the schedule agenda) needs measured layout jsdom can't
// provide; render every row synchronously so schedule mode is testable.
vi.mock("@legendapp/list/react", () => ({
  __esModule: true,
  LegendList: (props: {
    data?: unknown[];
    renderItem: (arg: { item: unknown; index: number }) => unknown;
  }) => (props.data ?? []).map((item, index) => props.renderItem({ item, index })),
}));

import { Calendar } from "../Calendar";

const date = new Date(2026, 6, 15);
const daily = [
  {
    title: "Daily",
    start: new Date(2026, 6, 13, 9),
    end: new Date(2026, 6, 13, 10),
    recurrence: { freq: "daily" as const },
  },
];
describe("dom Calendar schedule virtualization", () => {
  it("auto-expands recurring events in schedule mode over a forward window", () => {
    const { getAllByText } = render(<Calendar mode="schedule" date={date} events={daily} />);
    // A daily rule fills the ~3-month agenda look-ahead, not a single stray row.
    expect(getAllByText("Daily").length).toBeGreaterThan(30);
  });
});
