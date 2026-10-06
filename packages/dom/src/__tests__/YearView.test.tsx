import { fireEvent, render } from "@testing-library/react";
import type { CalendarEvent } from "@super-calendar/core";
import { Calendar } from "../Calendar";
import { YearView } from "../YearView";

const events: CalendarEvent[] = [
  { title: "Standup", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];

describe("dom YearView", () => {
  it("renders all twelve months with weekday initials", () => {
    const { getByRole } = render(<YearView date={new Date(2026, 6, 20)} />);
    expect(getByRole("heading", { name: "January 2026" })).toBeTruthy();
    expect(getByRole("heading", { name: "December 2026" })).toBeTruthy();
    expect(getByRole("grid", { name: "January 2026" })).toBeTruthy();
  });

  it("fires onPressDay and marks event days with data-events", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <YearView date={new Date(2026, 6, 20)} events={events} onPressDay={onPressDay} />,
    );
    const day = getByLabelText(/15 July 2026.*has events/);
    expect(day.getAttribute("data-events")).toBe("");
    fireEvent.click(day);
    expect(onPressDay).toHaveBeenCalledTimes(1);
    expect(onPressDay.mock.calls[0][0].getMonth()).toBe(6);
  });

  it("translates the state words with labels", () => {
    const { getByLabelText } = render(
      <YearView
        date={new Date(2026, 6, 20)}
        events={events}
        selectedDates={[new Date(2026, 6, 15)]}
        labels={{ selected: "wybrany", hasEvents: "ma wydarzenia" }}
      />,
    );
    expect(getByLabelText("Wednesday, 15 July 2026, wybrany, ma wydarzenia")).toBeTruthy();
  });

  it("marks selected days and the days inside a range", () => {
    const { getByLabelText } = render(
      <YearView
        date={new Date(2026, 6, 20)}
        selectedRange={{ start: new Date(2026, 6, 15), end: new Date(2026, 6, 17) }}
      />,
    );
    // Endpoints read as selected; the day between only carries the range band.
    expect(getByLabelText(/15 July 2026, selected/).getAttribute("data-selected")).toBe("");
    expect(getByLabelText(/16 July 2026/).getAttribute("data-range")).toBe("");
    expect(getByLabelText(/16 July 2026/).hasAttribute("data-selected")).toBe(false);
  });

  it("disables days outside minDate/maxDate", () => {
    const onPressDay = jest.fn();
    const { getByLabelText } = render(
      <YearView
        date={new Date(2026, 6, 20)}
        minDate={new Date(2026, 6, 10)}
        onPressDay={onPressDay}
      />,
    );
    const day = getByLabelText(/9 July 2026, unavailable/);
    expect(day.hasAttribute("data-disabled")).toBe(true);
    fireEvent.click(day);
    expect(onPressDay).not.toHaveBeenCalled();
  });

  describe("drag to select and create", () => {
    const day = (c: HTMLElement, label: string) =>
      c.querySelector(`[aria-label^="${label}"]`) as HTMLElement;

    it("reports the sweep live and commits an all-day range on release", () => {
      const onSelectDrag = jest.fn();
      const onCreateEvent = jest.fn();
      const { container } = render(
        <YearView
          date={new Date(2026, 6, 20)}
          onSelectDrag={onSelectDrag}
          onCreateEvent={onCreateEvent}
        />,
      );
      fireEvent.pointerDown(day(container, "Wednesday, 15 July 2026"), { button: 0 });
      fireEvent.pointerEnter(day(container, "Friday, 17 July 2026"));
      expect(onSelectDrag).toHaveBeenCalledWith(new Date(2026, 6, 15), new Date(2026, 6, 17));
      // Swept days are flagged for styling.
      expect(day(container, "Thursday, 16 July 2026").hasAttribute("data-creating")).toBe(true);
      fireEvent.pointerUp(window);

      expect(onCreateEvent).toHaveBeenCalledTimes(1);
      const [start, end] = onCreateEvent.mock.calls[0] as [Date, Date];
      expect(start).toEqual(new Date(2026, 6, 15));
      // End is exclusive: midnight after the last swept day.
      expect(end).toEqual(new Date(2026, 6, 18));
    });

    it("sweeps on across mini months", () => {
      const onSelectDrag = jest.fn();
      const { container } = render(
        <YearView date={new Date(2026, 6, 20)} onSelectDrag={onSelectDrag} />,
      );
      fireEvent.pointerDown(day(container, "Friday, 31 July 2026"), { button: 0 });
      fireEvent.pointerEnter(day(container, "Monday, 3 August 2026"));
      expect(onSelectDrag).toHaveBeenCalledWith(new Date(2026, 6, 31), new Date(2026, 7, 3));
      fireEvent.pointerUp(window);
    });

    it("does not swallow the click after a sweep that ended on another cell", () => {
      const onSelectDrag = jest.fn();
      const onPressDay = jest.fn();
      const { container } = render(
        <YearView
          date={new Date(2026, 6, 20)}
          onSelectDrag={onSelectDrag}
          onPressDay={onPressDay}
        />,
      );
      fireEvent.pointerDown(day(container, "Wednesday, 15 July 2026"), { button: 0 });
      fireEvent.pointerEnter(day(container, "Friday, 17 July 2026"));
      // The sweep's trailing click lands on an ancestor, so no cell consumes the
      // guard it armed; the next real click must still get through.
      fireEvent.pointerUp(window);

      const cell = day(container, "Monday, 20 July 2026");
      fireEvent.pointerDown(cell, { button: 0 });
      fireEvent.pointerUp(window);
      fireEvent.click(cell);
      expect(onPressDay).toHaveBeenCalledTimes(1);
    });

    it("keeps disabled days out of the sweep", () => {
      const onSelectDrag = jest.fn();
      const onCreateEvent = jest.fn();
      const { container } = render(
        <YearView
          date={new Date(2026, 6, 20)}
          minDate={new Date(2026, 6, 15)}
          onSelectDrag={onSelectDrag}
          onCreateEvent={onCreateEvent}
        />,
      );
      // Anchoring on a day before minDate starts nothing.
      fireEvent.pointerDown(day(container, "Monday, 13 July 2026"), { button: 0 });
      fireEvent.pointerEnter(day(container, "Friday, 17 July 2026"));
      fireEvent.pointerUp(window);
      expect(onSelectDrag).not.toHaveBeenCalled();
      expect(onCreateEvent).not.toHaveBeenCalled();

      // A live sweep never extends onto one either.
      fireEvent.pointerDown(day(container, "Friday, 17 July 2026"), { button: 0 });
      fireEvent.pointerEnter(day(container, "Monday, 13 July 2026"));
      expect(onSelectDrag).not.toHaveBeenCalled();
      fireEvent.pointerUp(window);
    });

    it("renders day cells as plain gridcells when only the sweep is wired", () => {
      const { container } = render(
        <YearView date={new Date(2026, 6, 20)} onSelectDrag={jest.fn()} />,
      );
      // A button per day would be a tab stop whose click and Enter do nothing.
      expect(container.querySelectorAll("button").length).toBe(0);
      expect(day(container, "Wednesday, 15 July 2026").tagName).toBe("DIV");
    });

    it("leaves a plain click to onPressDay", () => {
      const onCreateEvent = jest.fn();
      const onPressDay = jest.fn();
      const { container } = render(
        <YearView
          date={new Date(2026, 6, 20)}
          onCreateEvent={onCreateEvent}
          onPressDay={onPressDay}
        />,
      );
      const cell = day(container, "Wednesday, 15 July 2026");
      fireEvent.pointerDown(cell, { button: 0 });
      fireEvent.pointerUp(window);
      fireEvent.click(cell);
      expect(onCreateEvent).not.toHaveBeenCalled();
      expect(onPressDay).toHaveBeenCalledTimes(1);
    });
  });

  it("renders through Calendar mode=year and pages by year with PageDown", () => {
    const onChangeDate = jest.fn();
    const { getByRole, container } = render(
      <Calendar
        mode="year"
        date={new Date(2026, 6, 20)}
        events={events}
        onChangeDate={onChangeDate}
      />,
    );
    expect(getByRole("grid", { name: "July 2026" })).toBeTruthy();
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "PageDown" });
    expect(onChangeDate).toHaveBeenCalledTimes(1);
    expect(onChangeDate.mock.calls[0][0].getFullYear()).toBe(2027);
  });
});
