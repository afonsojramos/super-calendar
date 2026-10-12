import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { MonthView } from "../MonthView";
import { Calendar } from "../Calendar";

const date = new Date(2026, 6, 1);
const events: CalendarEvent[] = [
  { title: "Trip", start: new Date(2026, 6, 15), end: new Date(2026, 6, 18), allDay: true },
  { title: "Meeting", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
  { title: "Lunch", start: new Date(2026, 6, 15, 12), end: new Date(2026, 6, 15, 13) },
];

function element(node: Element | null): HTMLElement {
  if (!(node instanceof HTMLElement)) {
    throw new Error("Missing month element");
  }
  return node;
}

describe("DOM month chip dimensions", () => {
  it("sizes spanning bars, row spacers, overflow and popover chips consistently", () => {
    const { container, getByText } = render(
      <MonthView
        date={date}
        events={events}
        chipHeight={44}
        chipGap={6}
        maxVisibleEventCount={2}
      />,
    );
    const chip = getByText("Trip");
    expect(chip.style.height).toBe("44px");
    const bar = element(chip.closest("button"));
    expect(bar.style.height).toBe("44px");
    const cell = element(container.querySelector('[data-day="2026-07-15"]'));
    expect(cell.style.gap).toBe("6px");
    expect(cell.style.minHeight).toBe("132px");
    const more = getByText("2 More");
    expect(more.style.height).toBe("44px");
    fireEvent.click(more);
    expect(getByText("Meeting").style.height).toBe("44px");
    expect(getByText("Lunch").style.height).toBe("44px");
  });

  it("keeps the current dimensions when the options are omitted", () => {
    const { getByText } = render(<MonthView date={date} events={events} />);
    expect(getByText("Trip").style.height).toBe("18px");
  });

  it("forwards the dimensions through Calendar", () => {
    const { getByText } = render(
      <Calendar date={date} mode="month" events={events} chipHeight={36} chipGap={4} />,
    );
    expect(getByText("Trip").style.height).toBe("36px");
  });
});
