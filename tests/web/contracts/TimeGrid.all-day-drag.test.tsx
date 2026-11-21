import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { act, fireEvent, render, rendererName, TimeGrid } from "@calendar-test/renderer";

// Monday 13 to Sunday 19 July 2026. Trip covers Tuesday to Thursday (columns 1-3).
const date = new Date(2026, 6, 15);
const trip: CalendarEvent = {
  title: "Trip",
  start: new Date(2026, 6, 14),
  end: new Date(2026, 6, 17),
  allDay: true,
};
// jsdom has no layout, so the lane gets seven 100 px columns starting at x = 0.
const COLUMN = 100;
const at = (column: number) => ({ clientX: column * COLUMN + 50, clientY: 10, pointerId: 1 });

function setup(props: Record<string, unknown> = {}, events: CalendarEvent[] = [trip]) {
  const onPressEvent = vi.fn();
  const onDragStart = vi.fn();
  const onDragEvent = vi.fn();
  const view = render(TimeGrid, {
    date,
    mode: "week",
    weekStartsOn: 1,
    events,
    onPressEvent,
    onDragStart,
    onDragEvent,
    ...props,
  });
  const chip = (title = "Trip") => {
    const button = view
      .getAllByText(title)
      .map((node) => node.closest<HTMLElement>('button[data-slot="allDayEvent"]'))
      .find((node) => node !== null);
    if (!button) throw new Error(`Missing ${title} chip`);
    return button;
  };
  const grid = chip().closest('[data-slot="allDayColumn"]')?.parentElement;
  if (!grid) throw new Error("Missing all-day grid");
  grid.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 7 * COLUMN, height: 26, right: 7 * COLUMN, bottom: 26 }) as DOMRect;
  const preview = () =>
    view.container.querySelector<HTMLElement>('[data-slot="allDayColumn"][aria-hidden="true"]');
  return { ...view, chip, grid, preview, onPressEvent, onDragStart, onDragEvent };
}

function drag(target: HTMLElement, from: number, to: number) {
  fireEvent.pointerDown(target, at(from));
  fireEvent.pointerMove(target, at(to));
  fireEvent.pointerUp(target, at(to));
  fireEvent.click(target, { detail: 1 });
}

describe(rendererName, () => {
  it("moves an all-day event by whole days and keeps its duration", () => {
    const { chip, onPressEvent, onDragStart, onDragEvent } = setup();
    drag(chip(), 2, 4);
    expect(onDragStart).toHaveBeenCalledExactlyOnceWith(trip);
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      trip,
      new Date(2026, 6, 16),
      new Date(2026, 6, 19),
    );
    expect(onPressEvent).not.toHaveBeenCalled();
  });

  it("moves an event earlier from wherever it was grabbed", () => {
    const { chip, onDragEvent } = setup();
    drag(chip(), 3, 1);
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      trip,
      new Date(2026, 6, 12),
      new Date(2026, 6, 15),
    );
  });

  it.each([
    { title: "past the last column", from: 1, to: 12, start: 19, end: 22 },
    { title: "past the first column", from: 3, to: -6, start: 11, end: 14 },
  ])("clamps a drag $title to the visible days", ({ from, to, start, end }) => {
    const { chip, onDragEvent } = setup();
    drag(chip(), from, to);
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      trip,
      new Date(2026, 6, start),
      new Date(2026, 6, end),
    );
  });

  it("maps a column move across hidden days to calendar days", () => {
    // Wednesday is hidden: Tuesday sits in column 1 and Thursday in column 2.
    const { chip, onDragEvent } = setup({ hiddenDays: [3] });
    drag(chip(), 1, 2);
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      trip,
      new Date(2026, 6, 16),
      new Date(2026, 6, 19),
    );
  });

  it("previews the destination and fades the carried chip while dragging", () => {
    const { chip, preview } = setup();
    fireEvent.pointerDown(chip(), at(1));
    expect(preview()).toBeNull();
    fireEvent.pointerMove(chip(), at(3));
    expect(chip().hasAttribute("data-dragging")).toBe(true);
    expect(chip().style.opacity).toBe("0.4");
    const destination = preview();
    expect(destination?.style.gridColumn).toBe("4 / span 3");
    expect(destination?.textContent).toBe("Trip");
    expect(destination?.querySelector("button")).toBeNull();
    // The preview is clipped at the view edge and marks the continuing side.
    fireEvent.pointerMove(chip(), at(6));
    expect(preview()?.style.gridColumn).toBe("7 / span 1");
    expect(
      preview()?.querySelector('[data-slot="allDayEvent"]')?.hasAttribute("data-continues-after"),
    ).toBe(true);
    fireEvent.pointerUp(chip(), at(6));
    expect(preview()).toBeNull();
    expect(chip().hasAttribute("data-dragging")).toBe(false);
    expect(chip().style.opacity).toBe("");
  });

  it("presses the event on a click and on a press that stays within the slop", () => {
    const { chip, onPressEvent, onDragEvent } = setup();
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), { ...at(1), clientX: 152 });
    fireEvent.pointerUp(chip(), { ...at(1), clientX: 152 });
    fireEvent.click(chip(), { detail: 1 });
    fireEvent.click(chip(), { detail: 0 });
    expect(onPressEvent).toHaveBeenCalledTimes(2);
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("commits nothing and swallows the click when the drag returns to its day", () => {
    const { chip, onPressEvent, onDragEvent } = setup();
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), at(3));
    fireEvent.pointerMove(chip(), at(1));
    fireEvent.pointerUp(chip(), at(1));
    fireEvent.click(chip(), { detail: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onPressEvent).not.toHaveBeenCalled();
    fireEvent.click(chip(), { detail: 1 });
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape without committing or pressing", () => {
    const { chip, preview, onPressEvent, onDragEvent } = setup();
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), at(3));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(preview()).toBeNull();
    fireEvent.pointerMove(chip(), at(4));
    fireEvent.pointerUp(chip(), at(4));
    fireEvent.click(chip(), { detail: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onPressEvent).not.toHaveBeenCalled();
  });

  it.each([
    { title: "with event IDs", ids: { getEventId: () => "trip" } },
    { title: "without event IDs", ids: {} },
  ])("keeps a drag through a refresh that rebuilds the date and events $title", ({ ids }) => {
    // The rebuilt copy must not count as another event under `eventOverlap`.
    const { chip, preview, rerender, onDragEvent } = setup({ ...ids, eventOverlap: false });
    const refreshed = { ...trip };
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), at(2));
    rerender({
      date: new Date(date),
      mode: "week",
      weekStartsOn: 1,
      events: [refreshed],
      eventOverlap: false,
      onDragEvent,
      ...ids,
    });
    expect(chip().hasAttribute("data-dragging")).toBe(true);
    expect(chip().style.opacity).toBe("0.4");
    fireEvent.pointerMove(chip(), at(3));
    expect(preview()?.style.gridColumn).toBe("4 / span 3");
    // The preview is not the carried bar, so it does not match `[data-dragging]`.
    expect(preview()?.querySelector("[data-dragging]")).toBeNull();
    fireEvent.pointerUp(chip(), at(3));
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      refreshed,
      new Date(2026, 6, 16),
      new Date(2026, 6, 19),
    );
  });

  it("moves the dragged one of two identical bars", () => {
    const twin = { ...trip };
    const view = setup({}, [trip, twin]);
    const [, second] = view
      .getAllByText("Trip")
      .map((node) => node.closest<HTMLElement>('button[data-slot="allDayEvent"]'))
      .filter((node): node is HTMLElement => node !== null);
    fireEvent.pointerDown(second, at(1));
    fireEvent.pointerMove(second, at(3));
    const faded = view.container.querySelectorAll('button[data-slot="allDayEvent"][data-dragging]');
    expect([...faded]).toEqual([second]);
    fireEvent.pointerUp(second, at(3));
    expect(view.onDragEvent.mock.calls[0]?.[0]).toBe(twin);
  });

  it("presses a locked bar after a drag whose click landed elsewhere", () => {
    const locked = { ...trip, title: "Locked", draggable: false };
    const { chip, onPressEvent, onDragEvent } = setup({}, [trip, locked]);
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), at(3));
    fireEvent.pointerUp(chip(), at(3));
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(chip("Locked"), at(1));
    fireEvent.pointerUp(chip("Locked"), at(1));
    fireEvent.click(chip("Locked"), { detail: 1 });
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(locked);
  });

  it("drops a drag whose release was lost when the pointer presses again", () => {
    const { chip, preview, onDragEvent, onPressEvent } = setup();
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), at(3));
    // The release happened outside the window; the next press starts over.
    fireEvent.pointerDown(chip(), at(4));
    expect(preview()).toBeNull();
    expect(chip().hasAttribute("data-dragging")).toBe(false);
    fireEvent.pointerUp(chip(), at(4));
    fireEvent.click(chip(), { detail: 1 });
    expect(onDragEvent).not.toHaveBeenCalled();
    // That press is the user's own click, not the abandoned drag's.
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(trip);
  });

  it("cancels on pointer cancellation", () => {
    const { chip, preview, onDragEvent } = setup();
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), at(3));
    fireEvent.pointerCancel(chip(), at(3));
    expect(preview()).toBeNull();
    fireEvent.pointerUp(chip(), at(3));
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("rejects a drop onto another event when eventOverlap is false", () => {
    const other = {
      ...trip,
      title: "Other",
      start: new Date(2026, 6, 18),
      end: new Date(2026, 6, 19),
    };
    const { chip, onDragEvent } = setup({ eventOverlap: false }, [trip, other]);
    drag(chip(), 1, 3);
    expect(onDragEvent).not.toHaveBeenCalled();
    drag(chip(), 1, 0);
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      trip,
      new Date(2026, 6, 13),
      new Date(2026, 6, 16),
    );
  });

  it.each([
    { title: "without onDragEvent", props: { onDragEvent: undefined }, event: trip },
    { title: "when the grid locks moves", props: { eventStartEditable: false }, event: trip },
    { title: "for a locked event", props: {}, event: { ...trip, draggable: false } },
    { title: "for a start-locked event", props: {}, event: { ...trip, startEditable: false } },
    { title: "for a disabled event", props: {}, event: { ...trip, disabled: true } },
  ])("keeps the chip a plain button $title", ({ props, event }) => {
    const { chip, preview, onPressEvent, onDragStart, onDragEvent } = setup(props, [event]);
    fireEvent.pointerDown(chip(), at(1));
    fireEvent.pointerMove(chip(), at(3));
    expect(preview()).toBeNull();
    fireEvent.pointerUp(chip(), at(3));
    fireEvent.click(chip(), { detail: 1 });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDragEvent).not.toHaveBeenCalled();
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(event);
    expect(chip().style.cursor).toBe("pointer");
  });

  describe("touch", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const touch = (column: number) => ({ ...at(column), pointerType: "touch" });

    it("picks the chip up after the hold and drops it on another day", () => {
      const { chip, onDragStart, onDragEvent, onPressEvent } = setup();
      fireEvent.pointerDown(chip(), touch(1));
      expect(onDragStart).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onDragStart).toHaveBeenCalledExactlyOnceWith(trip);
      const scroll = new Event("touchmove", { bubbles: true, cancelable: true });
      chip().dispatchEvent(scroll);
      expect(scroll.defaultPrevented).toBe(true);
      fireEvent.pointerMove(chip(), touch(2));
      fireEvent.pointerUp(chip(), touch(2));
      fireEvent.click(chip(), { detail: 1 });
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        trip,
        new Date(2026, 6, 15),
        new Date(2026, 6, 18),
      );
      expect(onPressEvent).not.toHaveBeenCalled();
    });

    it("presses on a tap and leaves a swipe before the hold to scroll", () => {
      const { chip, onDragStart, onDragEvent, onPressEvent } = setup();
      fireEvent.pointerDown(chip(), touch(1));
      fireEvent.pointerUp(chip(), touch(1));
      fireEvent.click(chip(), { detail: 1 });
      expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(trip);

      fireEvent.pointerDown(chip(), touch(1));
      fireEvent.pointerMove(chip(), { ...touch(1), clientY: 40 });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      const scroll = new Event("touchmove", { bubbles: true, cancelable: true });
      chip().dispatchEvent(scroll);
      expect(scroll.defaultPrevented).toBe(false);
      fireEvent.pointerUp(chip(), { ...touch(3), clientY: 40 });
      expect(onDragStart).not.toHaveBeenCalled();
      expect(onDragEvent).not.toHaveBeenCalled();
    });
  });
});
