import { useMemo, type ReactNode } from "react";
import { vi } from "vitest";
import { render } from "../../../../../tests/support/native-time-grid";

type ListProps = {
  data: unknown[];
  extraData?: unknown;
  initialScrollIndex?: number;
  renderItem: (item: { item: unknown; index: number }) => ReactNode;
};

// The test renderer cannot measure LegendList pages. Preserve its content cache
// so a prop-only update must invalidate mounted pages through data or extraData.
const lastListProps = () => (globalThis as { __todayListProps?: ListProps }).__todayListProps;
const cachedList = vi.hoisted(() => (props: ListProps) => {
  (globalThis as { __todayListProps?: ListProps }).__todayListProps = props;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- rendered as a component by the mocks below
  return useMemo(() => {
    const index = props.initialScrollIndex ?? 0;
    const item = props.data[index];
    return item === undefined ? null : props.renderItem({ item, index });
  }, [props.data, props.extraData]);
});
vi.mock("@legendapp/list/react-native", () => ({ __esModule: true, LegendList: cachedList }));
vi.mock("@legendapp/list/reanimated", () => ({
  __esModule: true,
  AnimatedLegendList: cachedList,
}));

import { Agenda } from "../Agenda";
import { Calendar } from "../Calendar";

const noop = () => {};

describe("Calendar today highlight on mounted pages", () => {
  const props = {
    date: new Date(2026, 10, 12),
    events: [],
    onChangeDate: noop,
    onPressEvent: noop,
  };

  it.each(["month", "multiweek", "week"] as const)(
    "moves the highlight in %s mode when only now changes",
    async (mode) => {
      const view = await render(
        <Calendar {...props} mode={mode} now={new Date(2026, 10, 12, 9)} />,
      );
      expect(view.getAllByLabelText(/12 November.*, today/i)).toHaveLength(1);
      await view.rerender(<Calendar {...props} mode={mode} now={new Date(2026, 10, 13, 9)} />);
      expect(view.getAllByLabelText(/13 November.*, today/i)).toHaveLength(1);
      expect(view.queryAllByLabelText(/, today/i)).toHaveLength(1);
    },
  );

  it("moves the highlight when only timeZone changes", async () => {
    const now = new Date("2026-11-12T22:00:00Z");
    const view = await render(
      <Calendar {...props} mode="month" now={now} timeZone="America/Los_Angeles" />,
    );
    expect(view.getAllByLabelText(/12 November.*, today/i)).toHaveLength(1);
    await view.rerender(<Calendar {...props} mode="month" now={now} timeZone="Asia/Tokyo" />);
    expect(view.getAllByLabelText(/13 November.*, today/i)).toHaveLength(1);
  });

  it("invalidates the agenda's rows when today changes", async () => {
    const agenda = (now: Date) => (
      <Agenda
        events={[
          { title: "Standup", start: new Date(2026, 10, 12, 9), end: new Date(2026, 10, 12, 10) },
        ]}
        now={now}
        renderEvent={() => null}
        keyExtractor={(event) => event.start.toISOString()}
        onPressEvent={noop}
      />
    );
    const view = await render(agenda(new Date(2026, 10, 12, 9)));
    const before = lastListProps()?.extraData;
    await view.rerender(agenda(new Date(2026, 10, 12, 18)));
    expect(lastListProps()?.extraData).toBe(before);
    await view.rerender(agenda(new Date(2026, 10, 13, 9)));
    expect(lastListProps()?.extraData).not.toBe(before);
  });
});
