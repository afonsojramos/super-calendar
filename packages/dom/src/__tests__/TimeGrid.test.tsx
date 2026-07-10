import { act, fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { TimeGrid } from "../TimeGrid";

const day = new Date(2026, 5, 26);
const events: CalendarEvent[] = [
  { title: "Focus", start: new Date(2026, 5, 26, 14, 0), end: new Date(2026, 5, 26, 16, 0) },
];

// The event chip sits inside the absolutely-positioned wrapper that carries the
// pointer handlers: title div -> default-event root -> wrapper.
function wrapperOf(chip: HTMLElement): HTMLElement {
  return chip.parentElement!.parentElement!;
}

describe("dom TimeGrid", () => {
  it("renders timed events with their time label", () => {
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} />,
    );
    expect(getByText("Focus")).toBeTruthy();
    expect(getByText("14:00 - 16:00")).toBeTruthy();
  });

  it("hides the time line on a short event in a narrow multi-column view", () => {
    const short: CalendarEvent[] = [
      { title: "Quick", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 9, 30) },
    ];
    const { getByText, queryByText } = render(
      <TimeGrid date={day} mode="week" events={short} hourHeight={48} />,
    );
    expect(getByText("Quick")).toBeTruthy();
    // 30 min at 48px/h = 24px box, below the 56px threshold: title only.
    expect(queryByText("09:00 - 09:30")).toBeNull();
  });

  it("centers a lone title line vertically and keeps taller chips top-aligned", () => {
    const mixed: CalendarEvent[] = [
      { title: "Quick", start: new Date(2026, 5, 26, 9, 0), end: new Date(2026, 5, 26, 9, 30) },
      ...events, // Focus, 2h: title + time fit, stays top-aligned
    ];
    const { getByText } = render(<TimeGrid date={day} mode="day" events={mixed} hourHeight={48} />);
    // The 24px box fits exactly one title line and no time: centered.
    const quickBox = getByText("Quick").parentElement as HTMLElement;
    expect(quickBox.style.justifyContent).toBe("center");
    const focusBox = getByText("Focus").parentElement as HTMLElement;
    expect(focusBox.style.justifyContent).toBe("");
  });

  it("drag-moves an event and reports the snapped new times", () => {
    const onDragEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Focus"));
    // Drag up 96px = 2h at 48px/hour: 14:00–16:00 -> 12:00–14:00.
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 204, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 204, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    expect(start.getHours()).toBe(12);
    expect(end.getHours()).toBe(14);
  });

  it("treats a press with no movement as a tap, not a drag", () => {
    const onDragEvent = jest.fn();
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={events}
        hourHeight={48}
        onDragEvent={onDragEvent}
        onPressEvent={onPressEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 300, pointerId: 1 });

    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps an event in place when onDragEvent rejects the drop", () => {
    const onDragEvent = jest.fn(() => false);
    const { getByText } = render(
      <TimeGrid date={day} mode="day" events={events} hourHeight={48} onDragEvent={onDragEvent} />,
    );
    const box = wrapperOf(getByText("Focus"));
    fireEvent.pointerDown(box, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 204, pointerId: 1 });
    fireEvent.pointerUp(box, { clientY: 204, pointerId: 1 });

    expect(onDragEvent).toHaveBeenCalledTimes(1);
    // Controlled: the parent declined, so the event is still rendered (snaps back).
    expect(getByText("Focus")).toBeTruthy();
  });

  // The day column is the only element with a left border (day separator).
  function dayColumn(container: HTMLElement): HTMLElement {
    return container.querySelector<HTMLElement>('[style*="border-left"]')!;
  }

  it("sweeps out a new event from empty grid space", () => {
    const onCreateEvent = jest.fn();
    const { container } = render(
      <TimeGrid date={day} mode="day" hourHeight={48} onCreateEvent={onCreateEvent} />,
    );
    const col = dayColumn(container);
    // Drag from 0px (00:00) to 96px (02:00) at 48px/hour.
    fireEvent.pointerDown(col, { clientY: 0, pointerId: 1, button: 0 });
    fireEvent.pointerMove(col, { clientY: 96, pointerId: 1 });
    fireEvent.pointerUp(col, { clientY: 96, pointerId: 1 });

    expect(onCreateEvent).toHaveBeenCalledTimes(1);
    const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(2);
  });

  it("treats a stationary press on empty space as onPressCell", () => {
    const onPressCell = jest.fn();
    const { container } = render(
      <TimeGrid date={day} mode="day" hourHeight={48} onPressCell={onPressCell} />,
    );
    const col = dayColumn(container);
    fireEvent.pointerDown(col, { clientY: 96, pointerId: 1, button: 0 });
    fireEvent.pointerUp(col, { clientY: 96, pointerId: 1 });

    expect(onPressCell).toHaveBeenCalledTimes(1);
    expect((onPressCell.mock.calls[0][0] as Date).getHours()).toBe(2);
  });

  it("spreads a multi-day all-day event across every column it covers", () => {
    const wed = new Date(2026, 6, 15); // week (Mon start) = Jul 13–19
    const trip: CalendarEvent[] = [
      { title: "Trip", start: new Date(2026, 6, 14), end: new Date(2026, 6, 17), allDay: true },
    ];
    const { getAllByText } = render(
      <TimeGrid date={wed} mode="week" weekStartsOn={1} events={trip} hourHeight={48} />,
    );
    // Covers the 14th, 15th, 16th (end exclusive at midnight of the 17th).
    expect(getAllByText("Trip")).toHaveLength(3);
  });

  it("queries businessHours for each visible day", () => {
    const businessHours = jest.fn(() => ({ start: 9, end: 17 }));
    render(<TimeGrid date={day} mode="3days" weekStartsOn={1} businessHours={businessHours} />);
    expect(businessHours).toHaveBeenCalled();
  });

  it("does not make empty day columns keyboard tab stops", () => {
    const { container } = render(
      <TimeGrid date={day} mode="day" hourHeight={48} onCreateEvent={jest.fn()} />,
    );
    // Empty columns are pointer-only; keyboard focus moves through events only.
    expect(dayColumn(container).getAttribute("tabindex")).toBeNull();
  });

  it("keeps events keyboard-focusable and activatable", () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={events}
        hourHeight={48}
        onPressEvent={onPressEvent}
      />,
    );
    const box = wrapperOf(getByText("Focus"));
    expect(box.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("hides the all-day lane when showAllDayEventCell is false", () => {
    const allDay: CalendarEvent[] = [
      { title: "Holiday", start: new Date(2026, 5, 26), end: new Date(2026, 5, 27), allDay: true },
    ];
    const { queryByText, rerender } = render(
      <TimeGrid date={day} mode="day" events={allDay} hourHeight={48} />,
    );
    expect(queryByText("all-day")).toBeTruthy();
    rerender(
      <TimeGrid
        date={day}
        mode="day"
        events={allDay}
        hourHeight={48}
        showAllDayEventCell={false}
      />,
    );
    expect(queryByText("all-day")).toBeNull();
  });

  it("uses eventAccessibilityLabel to override an event's aria-label", () => {
    const { getByLabelText, queryByLabelText } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={events}
        hourHeight={48}
        eventAccessibilityLabel={(event, ctx) => `Custom: ${event.title} (${ctx.mode})`}
      />,
    );
    expect(getByLabelText("Custom: Focus (day)")).toBeTruthy();
    // The built-in "title, time range" label is replaced.
    expect(queryByLabelText("Focus, 14:00 to 16:00")).toBeNull();
  });

  it("advances the now-indicator as the wall clock ticks", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 26, 9, 0, 0));
    try {
      const { container } = render(<TimeGrid date={day} mode="day" hourHeight={60} />);
      const nowTop = () =>
        (container.querySelector('[data-slot="nowIndicator"]') as HTMLElement).style.top;
      // 09:00 at 60px/hour → 540px.
      expect(nowTop()).toBe("540px");
      act(() => {
        // Advancing the timer also advances the fake clock by 60s, landing on 10:30.
        jest.setSystemTime(new Date(2026, 5, 26, 10, 29, 0));
        jest.advanceTimersByTime(60_000);
      });
      // The minute tick re-read the clock: 10:30 → 630px, not frozen at 540.
      expect(nowTop()).toBe("630px");
    } finally {
      jest.useRealTimers();
    }
  });

  describe("minHour / maxHour / hideHours", () => {
    it("renders only the hours inside [minHour, maxHour) and offsets events by minHour", () => {
      const { container, getByText } = render(
        <TimeGrid date={day} mode="day" events={events} hourHeight={60} minHour={8} maxHour={18} />,
      );
      const labels = [...container.querySelectorAll('[data-slot="hourLabel"]')];
      // Hours 8…17 inclusive → 10 labels; the first shown hour is 08:00, not 00:00.
      expect(labels).toHaveLength(10);
      expect(labels[0].textContent).toBe("08:00");
      expect(labels.at(-1)?.textContent).toBe("17:00");
      // The 14:00 event sits at (14 − 8) × 60 = 360px.
      expect(wrapperOf(getByText("Focus")).style.top).toBe("360px");
    });

    it("drops events that fall entirely outside the window", () => {
      const early: CalendarEvent[] = [
        { title: "Dawn", start: new Date(2026, 5, 26, 5, 0), end: new Date(2026, 5, 26, 6, 0) },
      ];
      const { queryByText } = render(
        <TimeGrid date={day} mode="day" events={early} hourHeight={60} minHour={8} maxHour={18} />,
      );
      expect(queryByText("Dawn")).toBeNull();
    });

    it("maps pointer position to time using minHour", () => {
      const onPressCell = jest.fn();
      const { container } = render(
        <TimeGrid
          date={day}
          mode="day"
          hourHeight={60}
          minHour={8}
          maxHour={18}
          onPressCell={onPressCell}
        />,
      );
      const col = container.querySelector<HTMLElement>('[style*="border-left"]')!;
      // 120px down at 60px/hour, window starting at 08:00 → 10:00.
      fireEvent.pointerDown(col, { clientY: 120, pointerId: 1, button: 0 });
      fireEvent.pointerUp(col, { clientY: 120, pointerId: 1 });
      expect((onPressCell.mock.calls[0][0] as Date).getHours()).toBe(10);
    });

    it("hides the hour axis with hideHours while keeping the grid lines", () => {
      const { container } = render(
        <TimeGrid date={day} mode="day" events={events} hourHeight={48} hideHours />,
      );
      expect(container.querySelector('[data-slot="hourGutter"]')).toBeNull();
      expect(container.querySelector('[data-slot="hourLabel"]')).toBeNull();
      expect(container.querySelector('[data-slot="gridLines"]')).toBeTruthy();
    });

    it("does not teleport an event taller than the visible window when dragged", () => {
      // Regression: `windowEnd - duration` fell below `windowStart`, inverting the
      // clamp so any drag jumped the event to a fixed wrong time.
      const onDragEvent = jest.fn();
      const tall: CalendarEvent[] = [
        { title: "Shift", start: new Date(2026, 5, 26, 8, 0), end: new Date(2026, 5, 26, 18, 0) },
      ];
      const { getByText } = render(
        <TimeGrid
          date={day}
          mode="day"
          events={tall}
          hourHeight={60}
          minHour={8}
          maxHour={17}
          onDragEvent={onDragEvent}
        />,
      );
      const box = wrapperOf(getByText("Shift"));
      fireEvent.pointerDown(box, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(box, { clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(box, { clientY: 40, pointerId: 1 });

      expect(onDragEvent).toHaveBeenCalledTimes(1);
      const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
      // Pinned at the window start (08:00), duration intact — not teleported to 07:00.
      expect(start.getHours()).toBe(8);
      expect(end.getHours()).toBe(18);
    });

    it("hides the now-indicator when the clock is outside the window", () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 5, 26, 6, 0, 0));
      try {
        const { container } = render(
          <TimeGrid date={day} mode="day" hourHeight={60} minHour={8} maxHour={18} />,
        );
        expect(container.querySelector('[data-slot="nowIndicator"]')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("week numbers", () => {
    it("shows the ISO week number of the first visible day when enabled", () => {
      const { container } = render(
        // Mon 13 Jul 2026 is in ISO week 29.
        <TimeGrid date={new Date(2026, 6, 15)} mode="week" weekStartsOn={1} showWeekNumber />,
      );
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("W29");
    });

    it("uses the ISO week of the visible Thursday for a Sunday-start week", () => {
      // Sun 7 – Sat 13 Jan 2024: days[0] (Sunday) is ISO week 1, but the Mon–Sat
      // body is ISO week 2. Referencing the Thursday shows the week the row reads as.
      const { container } = render(
        <TimeGrid date={new Date(2024, 0, 10)} mode="week" weekStartsOn={0} showWeekNumber />,
      );
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("W2");
    });

    it("respects a custom weekNumberPrefix and defaults to hidden", () => {
      const { container, rerender } = render(
        <TimeGrid date={new Date(2026, 6, 15)} mode="week" weekStartsOn={1} />,
      );
      // Off by default.
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("");
      rerender(
        <TimeGrid
          date={new Date(2026, 6, 15)}
          mode="week"
          weekStartsOn={1}
          showWeekNumber
          weekNumberPrefix="Week "
        />,
      );
      expect(container.querySelector('[data-slot="weekNumber"]')?.textContent).toBe("Week 29");
    });
  });

  describe("slot styling", () => {
    it("applies per-slot classes and drops the themed inline style so the class wins", () => {
      const { container } = render(
        <TimeGrid mode="day" date={day} events={events} classNames={{ hourLabel: "text-xs" }} />,
      );
      const label = container.querySelector('[data-slot="hourLabel"]') as HTMLElement;
      expect(label.className).toBe("text-xs");
      // Structural positioning kept; themed colour/size dropped for the class.
      expect(label.style.position).toBe("absolute");
      expect(label.style.fontSize).toBe("");
    });

    it("marks today's column header with data-today", () => {
      const { container } = render(<TimeGrid mode="day" date={new Date()} />);
      const header = container.querySelector('[data-slot="columnHeader"]') as HTMLElement;
      expect(header.hasAttribute("data-today")).toBe(true);
    });
  });

  describe("keyboard event navigation", () => {
    // Mon 13 Jul 2026 has two events; Tue 14 has one. Week starts Monday.
    const weekEvents: CalendarEvent[] = [
      { title: "A", start: new Date(2026, 6, 13, 9), end: new Date(2026, 6, 13, 10) },
      { title: "B", start: new Date(2026, 6, 13, 14), end: new Date(2026, 6, 13, 15) },
      { title: "C", start: new Date(2026, 6, 14, 11), end: new Date(2026, 6, 14, 12) },
    ];
    const renderWeek = (extra = {}) =>
      render(
        <TimeGrid
          mode="week"
          date={new Date(2026, 6, 15)}
          events={weekEvents}
          weekStartsOn={1}
          hourHeight={48}
          keyboardEventNavigation
          {...extra}
        />,
      );

    it("keeps every event tabbable (additive, not roving) so screen readers keep access", () => {
      const { getByText } = renderWeek();
      // All events remain tab stops; arrow keys are an addition, not a replacement.
      expect(wrapperOf(getByText("A")).tabIndex).toBe(0);
      expect(wrapperOf(getByText("B")).tabIndex).toBe(0);
      expect(wrapperOf(getByText("C")).tabIndex).toBe(0);
    });

    it("ArrowDown / ArrowUp step through a day's events by time", () => {
      const { getByText } = renderWeek();
      const a = wrapperOf(getByText("A"));
      const b = wrapperOf(getByText("B"));
      fireEvent.keyDown(a, { key: "ArrowDown" });
      expect(document.activeElement).toBe(b);
      fireEvent.keyDown(b, { key: "ArrowUp" });
      expect(document.activeElement).toBe(a);
    });

    it("ArrowRight jumps to the nearest-in-time event in the next day", () => {
      const { getByText } = renderWeek();
      const b = wrapperOf(getByText("B")); // Mon 14:00
      const c = wrapperOf(getByText("C")); // Tue 11:00 (only event that day)
      fireEvent.keyDown(b, { key: "ArrowRight" });
      expect(document.activeElement).toBe(c);
      fireEvent.keyDown(c, { key: "ArrowLeft" });
      // Back to Monday, nearest to 11:00 is A (09:00) over B (14:00).
      expect(document.activeElement).toBe(wrapperOf(getByText("A")));
    });

    it("Home / End go to the day's first / last event", () => {
      const { getByText } = renderWeek();
      const a = wrapperOf(getByText("A"));
      const b = wrapperOf(getByText("B"));
      fireEvent.keyDown(a, { key: "End" });
      expect(document.activeElement).toBe(b);
      fireEvent.keyDown(b, { key: "Home" });
      expect(document.activeElement).toBe(a);
    });

    it("still activates an event with Enter", () => {
      const onPressEvent = jest.fn();
      const { getByText } = renderWeek({ onPressEvent });
      fireEvent.keyDown(wrapperOf(getByText("A")), { key: "Enter" });
      expect(onPressEvent).toHaveBeenCalledTimes(1);
      expect((onPressEvent.mock.calls[0][0] as CalendarEvent).title).toBe("A");
    });
  });

  describe("accessibility", () => {
    it("exposes each day column's full date to assistive tech, even when not interactive", () => {
      const { getByText } = render(<TimeGrid mode="day" date={new Date(2026, 6, 15)} />);
      // Wed 15 Jul 2026: the visually-hidden accessible label carries the full date.
      expect(getByText("Wednesday, 15 July 2026")).toBeTruthy();
    });

    it("makes the date header a real labeled button when onPressDateHeader is set", () => {
      const onPressDateHeader = jest.fn();
      const { getByRole } = render(
        <TimeGrid mode="day" date={new Date(2026, 6, 15)} onPressDateHeader={onPressDateHeader} />,
      );
      const button = getByRole("button", { name: "Wednesday, 15 July 2026" });
      fireEvent.click(button);
      expect(onPressDateHeader).toHaveBeenCalledTimes(1);
    });

    it("does not render the non-interactive header as a button", () => {
      const { queryByRole } = render(<TimeGrid mode="day" date={new Date(2026, 6, 15)} />);
      expect(queryByRole("button", { name: "Wednesday, 15 July 2026" })).toBeNull();
    });
  });

  it("tints the weekend columns with the weekend background", () => {
    // Week of Mon 6 – Sun 12 July 2026; Sat 11 and Sun 12 are the weekend.
    const { container } = render(
      <TimeGrid
        mode="week"
        date={new Date(2026, 6, 8)}
        weekStartsOn={1}
        theme={{ weekendBackground: "#F6F7F9" }}
      />,
    );
    const weekend = [...container.querySelectorAll('[data-slot="dayColumn"][data-weekend]')];
    expect(weekend).toHaveLength(2);
    expect((weekend[0] as HTMLElement).style.background).toBe("rgb(246, 247, 249)");
    // Weekdays carry no weekend tint.
    const weekdays = container.querySelectorAll('[data-slot="dayColumn"]:not([data-weekend])');
    expect(weekdays).toHaveLength(5);
  });
});
