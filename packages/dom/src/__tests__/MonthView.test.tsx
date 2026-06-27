import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { MonthView } from "../MonthView";

describe("dom MonthView", () => {
  it("renders the month title and weekday headers", () => {
    const { getByText, getAllByText } = render(
      <MonthView date={new Date(2026, 6, 1)} weekStartsOn={1} />,
    );
    expect(getByText("July 2026")).toBeTruthy();
    expect(getAllByText("Mon").length).toBeGreaterThan(0);
  });

  it("fires onPressDay with the clicked date", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <MonthView date={new Date(2026, 6, 1)} weekStartsOn={1} onPressDay={onPressDay} />,
    );
    fireEvent.click(getByLabelText("Wednesday, 15 July 2026"));
    expect(onPressDay).toHaveBeenCalledTimes(1);
    const clicked = onPressDay.mock.calls[0][0] as Date;
    expect(clicked.getDate()).toBe(15);
    expect(clicked.getMonth()).toBe(6);
  });

  it("disables days outside the min/max range", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <MonthView
        date={new Date(2026, 6, 1)}
        weekStartsOn={1}
        minDate={new Date(2026, 6, 10)}
        onPressDay={onPressDay}
      />,
    );
    const early = getByLabelText("Wednesday, 8 July 2026") as HTMLButtonElement;
    expect(early.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(early);
    expect(onPressDay).not.toHaveBeenCalled();
  });

  it("keeps one tab stop and moves focus with the arrow keys (roving tabindex)", () => {
    const { container } = render(<MonthView date={new Date(2030, 0, 1)} weekStartsOn={1} />);
    const tabbable = () => container.querySelectorAll('[data-day][tabindex="0"]');
    // exactly one day is tabbable; the rest are removed from the tab order
    expect(tabbable()).toHaveLength(1);
    expect(container.querySelector('[data-day="2030-01-01"]')!.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(container.querySelector('[role="grid"]')!, { key: "ArrowRight" });
    expect(tabbable()).toHaveLength(1);
    expect(container.querySelector('[data-day="2030-01-02"]')!.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(container.querySelector('[role="grid"]')!, { key: "ArrowDown" });
    expect(container.querySelector('[data-day="2030-01-09"]')!.getAttribute("tabindex")).toBe("0");
  });

  it("renders a rounded pill band by default and a full-cell fill when opted in", () => {
    const selectedRange = { start: new Date(2030, 0, 6), end: new Date(2030, 0, 10) };
    const { container, rerender } = render(
      <MonthView date={new Date(2030, 0, 1)} weekStartsOn={1} selectedRange={selectedRange} />,
    );
    const startBand = () =>
      container.querySelector('[data-day="2030-01-06"] [data-band]') as HTMLElement;
    // Default: centered pill — rounded leading edge, inset from the cell top.
    expect(startBand().style.borderTopLeftRadius).toBe("16px");
    expect(startBand().style.top).toBe("8px");
    // A middle day keeps the band but no rounding (so the strip is continuous).
    const mid = container.querySelector('[data-day="2030-01-08"] [data-band]') as HTMLElement;
    expect(mid.style.borderTopLeftRadius).toBe("");

    rerender(
      <MonthView
        date={new Date(2030, 0, 1)}
        weekStartsOn={1}
        selectedRange={selectedRange}
        fillCellOnSelection
      />,
    );
    // Opt-in: band fills the whole cell, square corners (0 renders unitless).
    expect(parseFloat(startBand().style.borderTopLeftRadius || "0")).toBe(0);
    expect(parseFloat(startBand().style.top || "0")).toBe(0);
  });

  describe("events (calendar layout)", () => {
    const events: CalendarEvent[] = [
      { title: "Standup", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 9, 30) },
      { title: "Lunch", start: new Date(2026, 6, 15, 12), end: new Date(2026, 6, 15, 13) },
    ];

    it("renders event chips on the day they fall on", () => {
      const { getByText } = render(
        <MonthView date={new Date(2026, 6, 1)} weekStartsOn={1} events={events} />,
      );
      expect(getByText("Standup")).toBeTruthy();
      expect(getByText("Lunch")).toBeTruthy();
    });

    it("fires onPressEvent for a chip without also firing onPressDay", () => {
      const onPressEvent = jest.fn();
      const onPressDay = jest.fn();
      const { getByText } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          events={events}
          onPressEvent={onPressEvent}
          onPressDay={onPressDay}
        />,
      );
      fireEvent.click(getByText("Standup"));
      expect(onPressEvent).toHaveBeenCalledTimes(1);
      expect(onPressEvent.mock.calls[0][0].title).toBe("Standup");
      expect(onPressDay).not.toHaveBeenCalled();
    });

    it("collapses overflow into a '+N more' row that calls onPressMore", () => {
      const many: CalendarEvent[] = Array.from({ length: 5 }, (_, i) => ({
        title: `E${i}`,
        start: new Date(2026, 6, 15, 9 + i),
        end: new Date(2026, 6, 15, 10 + i),
      }));
      const onPressMore = jest.fn();
      const { getByText } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          events={many}
          maxVisibleEventCount={3}
          onPressMore={onPressMore}
        />,
      );
      // 5 events, cap 3: shows 2 chips + "+3 more".
      const more = getByText("3 more");
      fireEvent.click(more);
      expect(onPressMore).toHaveBeenCalledTimes(1);
      expect(onPressMore.mock.calls[0][0]).toHaveLength(3);
      expect((onPressMore.mock.calls[0][1] as Date).getDate()).toBe(15);
    });

    it("spreads a multi-day event across each day it covers", () => {
      const span: CalendarEvent[] = [
        { title: "Trip", start: new Date(2026, 6, 14), end: new Date(2026, 6, 16) },
      ];
      const { getAllByText } = render(
        <MonthView date={new Date(2026, 6, 1)} weekStartsOn={1} events={span} />,
      );
      // Covers the 14th and 15th (end exclusive at midnight of the 16th).
      expect(getAllByText("Trip").length).toBe(2);
    });
  });
});
