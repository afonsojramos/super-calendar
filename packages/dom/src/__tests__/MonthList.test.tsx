import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CalendarEvent } from "@super-calendar/core";

// The real Legend List needs measured layout to page through `renderItem`, which
// jsdom can't provide, so it never mounts item content. This stand-in renders
// every item synchronously, caching content until data or extraData changes.
jest.mock("@legendapp/list/react", () => ({
  __esModule: true,
  LegendList: (props: {
    data?: unknown[];
    extraData?: unknown;
    renderItem: (arg: { item: unknown; index: number }) => ReactNode;
  }) => {
    const { useMemo } = jest.requireActual<typeof import("react")>("react");
    return useMemo(
      () => (props.data ?? []).map((item, index) => props.renderItem({ item, index })),
      [props.data, props.extraData],
    );
  },
}));

import { MonthList } from "../MonthList";

const anchor = new Date(2026, 6, 15);

describe("dom MonthList", () => {
  it("renders the weekday header in the configured week order", () => {
    const { getAllByText } = render(
      <MonthList date={anchor} weekStartsOn={1} pastMonths={0} futureMonths={0} height={400} />,
    );
    expect(getAllByText("Mon").length).toBeGreaterThan(0);
    expect(getAllByText("Sun").length).toBeGreaterThan(0);
  });

  it("renders event chips for the anchor month via the prebuilt index", () => {
    const events: CalendarEvent[] = [
      { title: "Sync", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
    ];
    const { getByText } = render(
      <MonthList
        date={anchor}
        weekStartsOn={1}
        events={events}
        pastMonths={0}
        futureMonths={0}
        height={400}
      />,
    );
    expect(getByText("Sync")).toBeTruthy();
  });

  it("fires onPressDay with the clicked day", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <MonthList
        date={anchor}
        weekStartsOn={1}
        pastMonths={0}
        futureMonths={0}
        height={400}
        onPressDay={onPressDay}
      />,
    );
    fireEvent.click(getByLabelText("Wednesday, 15 July 2026"));
    expect(onPressDay).toHaveBeenCalledTimes(1);
    expect((onPressDay.mock.calls[0][0] as Date).getDate()).toBe(15);
  });

  it("updates mounted chips when only their dimensions change", () => {
    const events: CalendarEvent[] = [
      { title: "Sync", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
    ];
    const props = { date: anchor, events, pastMonths: 0, futureMonths: 0, height: 400 };
    const { container, getByText, rerender } = render(
      <MonthList {...props} chipHeight={20} chipGap={2} />,
    );
    const gap = () => container.querySelector<HTMLElement>('[data-day="2026-07-15"]')?.style.gap;
    expect(getByText("Sync").style.height).toBe("20px");
    expect(gap()).toBe("2px");

    rerender(<MonthList {...props} chipHeight={44} chipGap={2} />);
    expect(getByText("Sync").style.height).toBe("44px");

    rerender(<MonthList {...props} chipHeight={44} chipGap={6} />);
    expect(gap()).toBe("6px");
  });
});
