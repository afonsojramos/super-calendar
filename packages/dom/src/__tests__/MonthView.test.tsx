import { fireEvent, render } from "@testing-library/react";
import { type CalendarEvent, groupEventsByDay } from "@super-calendar/core";
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

  it("events mode tabs through events only, with no day-cell tab stops by default", () => {
    const events: CalendarEvent[] = [
      { title: "E", start: new Date(2030, 0, 1, 9), end: new Date(2030, 0, 1, 10) },
    ];
    const { container } = render(
      <MonthView date={new Date(2030, 0, 1)} weekStartsOn={1} events={events} />,
    );
    // No day cell is focusable; the event chip (a button) carries the focus.
    expect(container.querySelectorAll("[data-day][tabindex]")).toHaveLength(0);
    expect(container.querySelector('[role="grid"] button')).toBeTruthy();
  });

  it("keyboardDayNavigation restores the roving day tab stop in events mode", () => {
    const events: CalendarEvent[] = [
      { title: "E", start: new Date(2030, 0, 1, 9), end: new Date(2030, 0, 1, 10) },
    ];
    const { container } = render(
      <MonthView
        date={new Date(2030, 0, 1)}
        weekStartsOn={1}
        events={events}
        keyboardDayNavigation
      />,
    );
    const tabbable = () => container.querySelectorAll('[data-day][tabindex="0"]');
    expect(tabbable()).toHaveLength(1);
    expect(container.querySelector('[data-day="2030-01-01"]')!.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(container.querySelector('[role="grid"]')!, { key: "ArrowRight" });
    expect(container.querySelector('[data-day="2030-01-02"]')!.getAttribute("tabindex")).toBe("0");
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
    // The pill caps at the endpoint circle (half a 34px badge in from centre),
    // not the cell edge, so no band spills into the space beside the circle.
    expect(startBand().style.left).toBe("calc(50% - 17px)");
    const endBand = container.querySelector('[data-day="2030-01-10"] [data-band]') as HTMLElement;
    expect(endBand.style.right).toBe("calc(50% - 17px)");
    // A middle day keeps the band but no rounding (so the strip is continuous)
    // and spans the full cell width to bridge the endpoints.
    const mid = container.querySelector('[data-day="2030-01-08"] [data-band]') as HTMLElement;
    expect(mid.style.borderTopLeftRadius).toBe("");
    expect(mid.style.left).toBe("0px");

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
      // 5 events, cap 3: shows 2 chips + "3 More".
      const more = getByText("3 More");
      fireEvent.click(more);
      expect(onPressMore).toHaveBeenCalledTimes(1);
      expect(onPressMore.mock.calls[0][0]).toHaveLength(3);
      expect((onPressMore.mock.calls[0][1] as Date).getDate()).toBe(15);
    });

    it("keeps one chip visible at maxVisibleEventCount=1 (never only the overflow row)", () => {
      const two: CalendarEvent[] = [
        { title: "First", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
        { title: "Second", start: new Date(2026, 6, 15, 11), end: new Date(2026, 6, 15, 12) },
      ];
      const { getByText } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          events={two}
          maxVisibleEventCount={1}
        />,
      );
      expect(getByText("First")).toBeTruthy();
      expect(getByText("1 More")).toBeTruthy();
    });

    it("renders chips from a prebuilt eventsByDay map (the internal MonthList path)", () => {
      // MonthList builds the index once and passes it; the lookup key must match.
      const map = groupEventsByDay(events);
      const { getByText } = render(
        <MonthView date={new Date(2026, 6, 1)} weekStartsOn={1} events={[]} eventsByDay={map} />,
      );
      expect(getByText("Standup")).toBeTruthy();
      expect(getByText("Lunch")).toBeTruthy();
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

  describe("slot styling", () => {
    it("exposes a data-slot hook and the default themed style when no class is given", () => {
      const { getByText } = render(<MonthView date={new Date(2026, 6, 1)} weekStartsOn={1} />);
      const title = getByText("July 2026");
      expect(title.getAttribute("data-slot")).toBe("title");
      // Zero-config keeps the built-in look.
      expect(title.style.fontWeight).toBe("700");
    });

    it("drops the themed inline style for a slot when a class is supplied, so the class wins", () => {
      const { getByText } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          classNames={{ title: "text-center font-normal" }}
        />,
      );
      const title = getByText("July 2026");
      expect(title.className).toBe("text-center font-normal");
      // The default fontWeight/fontSize/padding are gone so the class controls them.
      expect(title.style.fontWeight).toBe("");
      expect(title.style.fontSize).toBe("");
      expect(title.style.padding).toBe("");
    });

    it("keeps structural styles even when a class replaces the themed ones", () => {
      const { container } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          classNames={{ weekdays: "border-0" }}
        />,
      );
      const header = container.querySelector('[data-slot="weekdays"]') as HTMLElement;
      expect(header.className).toBe("border-0");
      // Structural grid layout is preserved; only the themed border/padding drop.
      expect(header.style.display).toBe("grid");
      expect(header.style.borderBottom).toBe("");
    });

    it("merges a per-slot inline style override last", () => {
      const { getByText } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          styles={{ title: { color: "rgb(255, 0, 0)" } }}
        />,
      );
      const title = getByText("July 2026");
      // Override applied on top of the retained default themed styles.
      expect(title.style.color).toBe("rgb(255, 0, 0)");
      expect(title.style.fontWeight).toBe("700");
    });

    it("marks day state with present/absent data-* attributes for variant styling", () => {
      const { container } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          selectedDates={[new Date(2026, 6, 15)]}
        />,
      );
      const selected = container.querySelector('[data-day="2026-07-15"]') as HTMLElement;
      expect(selected.hasAttribute("data-selected")).toBe(true);
      const plain = container.querySelector('[data-day="2026-07-16"]') as HTMLElement;
      expect(plain.hasAttribute("data-selected")).toBe(false);
    });
  });

  it("uses eventAccessibilityLabel to override an event chip's aria-label", () => {
    const events: CalendarEvent[] = [
      { title: "Standup", start: new Date(2026, 6, 15, 9, 0), end: new Date(2026, 6, 15, 9, 30) },
    ];
    const { getByLabelText, queryByLabelText } = render(
      <MonthView
        date={new Date(2026, 6, 1)}
        weekStartsOn={1}
        events={events}
        eventAccessibilityLabel={(event) => `Custom: ${event.title}`}
      />,
    );
    expect(getByLabelText("Custom: Standup")).toBeTruthy();
    // The built-in "title, day" label is replaced, not appended.
    expect(queryByLabelText("Standup, 15 July")).toBeNull();
  });

  describe("drag to create", () => {
    const dayCell = (c: HTMLElement, id: string) =>
      c.querySelector(`[data-day="${id}"]`) as HTMLElement;

    it("fires onCreateEvent with the dragged all-day span and marks days data-creating", () => {
      const onCreateEvent = jest.fn();
      const { container } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          events={[]}
          onCreateEvent={onCreateEvent}
        />,
      );
      fireEvent.pointerDown(dayCell(container, "2026-07-06"), { button: 0 });
      fireEvent.pointerEnter(dayCell(container, "2026-07-08"));
      // Days across the sketched span are flagged for styling.
      expect(dayCell(container, "2026-07-07").hasAttribute("data-creating")).toBe(true);
      fireEvent.pointerUp(window);

      expect(onCreateEvent).toHaveBeenCalledTimes(1);
      const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
      expect(start).toEqual(new Date(2026, 6, 6));
      // End is exclusive: midnight after the last dragged day.
      expect(end).toEqual(new Date(2026, 6, 9));
    });

    it("does not fire on a plain click (no drag), leaving onPressDay to handle it", () => {
      const onCreateEvent = jest.fn();
      const onPressDay = jest.fn();
      const { container } = render(
        <MonthView
          date={new Date(2026, 6, 1)}
          weekStartsOn={1}
          events={[]}
          onCreateEvent={onCreateEvent}
          onPressDay={onPressDay}
        />,
      );
      const cell = dayCell(container, "2026-07-06");
      fireEvent.pointerDown(cell, { button: 0 });
      fireEvent.pointerUp(window);
      fireEvent.click(cell);
      expect(onCreateEvent).not.toHaveBeenCalled();
      expect(onPressDay).toHaveBeenCalledTimes(1);
    });
  });
});

describe("dom MonthView built-in more popover", () => {
  const manyEvents: CalendarEvent[] = Array.from({ length: 6 }, (_, i) => ({
    title: `Event ${i + 1}`,
    start: new Date(2026, 5, 15, 9 + i),
    end: new Date(2026, 5, 15, 10 + i),
  }));

  it("opens a popover listing the day's events when onPressMore is absent", () => {
    const onPressEvent = jest.fn();
    const { getByText, getByRole } = render(
      <MonthView
        date={new Date(2026, 5, 15)}
        events={manyEvents}
        maxVisibleEventCount={2}
        onPressEvent={onPressEvent}
      />,
    );
    fireEvent.click(getByText(/More/));
    const dialog = getByRole("dialog");
    expect(dialog).toBeTruthy();
    fireEvent.click(getByText("Event 6"));
    expect(onPressEvent).toHaveBeenCalledWith(expect.objectContaining({ title: "Event 6" }));
  });

  it("defers to a consumer onPressMore instead", () => {
    const onPressMore = jest.fn();
    const { getByText, queryByRole } = render(
      <MonthView
        date={new Date(2026, 5, 15)}
        events={manyEvents}
        maxVisibleEventCount={2}
        onPressMore={onPressMore}
      />,
    );
    fireEvent.click(getByText(/More/));
    expect(onPressMore).toHaveBeenCalledTimes(1);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("moves focus into the dialog on open and back to the trigger on Escape", () => {
    const { getByText, getByRole, queryByRole } = render(
      <MonthView date={new Date(2026, 5, 15)} events={manyEvents} maxVisibleEventCount={2} />,
    );
    const trigger = getByText(/More/);
    fireEvent.click(trigger);
    const dialog = getByRole("dialog");
    // Focus lands on the first event inside the popover (it lists the whole day).
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.textContent).toBe("Event 1");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
    // Focus returns to the "+N more" button that opened it.
    expect(document.activeElement).toBe(trigger);
  });

  it("contains Tab within the dialog, wrapping in both directions", () => {
    const { getByText, getByRole } = render(
      <MonthView date={new Date(2026, 5, 15)} events={manyEvents} maxVisibleEventCount={2} />,
    );
    fireEvent.click(getByText(/More/));
    const dialog = getByRole("dialog");
    const buttons = dialog.querySelectorAll<HTMLElement>("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
