import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import {
  Calendar,
  fireEvent,
  render,
  rendererName,
  TimeGrid,
  type RenderEventArgs,
} from "@calendar-test/renderer";

// Monday 13 to Sunday 19 July 2026.
const date = new Date(2026, 6, 15);
const COLUMN = 100;
const at = (column: number) => ({ clientX: column * COLUMN + 50, clientY: 10, pointerId: 1 });

const conference: CalendarEvent = {
  title: "Conference",
  start: new Date(2026, 6, 14, 9, 0),
  end: new Date(2026, 6, 16, 17, 0),
  allDay: false,
};
const fullDayTimed: CalendarEvent = {
  title: "On-call",
  start: new Date(2026, 6, 15, 0, 0),
  end: new Date(2026, 6, 16, 0, 0),
  allDay: false,
};
const exact24h: CalendarEvent = {
  title: "24h Shift",
  start: new Date(2026, 6, 14, 9, 0),
  end: new Date(2026, 6, 15, 9, 0),
  allDay: false,
};
const under24h: CalendarEvent = {
  title: "Almost 24h",
  start: new Date(2026, 6, 14, 9, 0),
  end: new Date(2026, 6, 15, 8, 59),
  allDay: false,
};
const overnight: CalendarEvent = {
  title: "Overnight",
  start: new Date(2026, 6, 14, 22, 0),
  end: new Date(2026, 6, 15, 6, 0),
  allDay: false,
};
const meeting: CalendarEvent = {
  title: "Standup",
  start: new Date(2026, 6, 15, 10, 0),
  end: new Date(2026, 6, 15, 11, 0),
  allDay: false,
};

describe(rendererName, () => {
  it("keeps >= 24h timed events on the vertical grid by default ('grid')", () => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      events: [conference, fullDayTimed],
    });
    expect(view.container.querySelector('[data-slot="allDayLane"]')).toBeNull();
    // Conference spans Tue-Thu (3 segments); On-call covers Wed (1 segment).
    expect(view.container.querySelectorAll('[data-slot="event"]')).toHaveLength(4);
  });

  it("promotes >= 24h timed events to the all-day lane and clears the vertical columns under 'all-day'", () => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      events: [conference, fullDayTimed, exact24h, under24h, overnight, meeting],
    });

    const lane = view.container.querySelector('[data-slot="allDayLane"]');
    if (!lane) throw new Error("Missing all-day lane");
    const laneChips = [...lane.querySelectorAll('[data-slot="allDayEvent"]')];
    expect(laneChips).toHaveLength(3);
    expect(laneChips.map((chip) => chip.textContent)).toEqual(
      expect.arrayContaining(["09:00Conference", "00:00On-call", "09:0024h Shift"]),
    );

    // Only < 24h events stay in the vertical grid: under24h (2 segs), overnight (2 segs), meeting (1 seg).
    const gridEvents = [...view.container.querySelectorAll<HTMLElement>('[data-slot="event"]')];
    expect(gridEvents).toHaveLength(5);
    const standup = gridEvents.find((el) => el.textContent?.includes("Standup"));
    if (!standup) throw new Error("Missing Standup event");
    // Wednesday 10:00-11:00 has full column width (inset only by default 1px eventGap)
    // because Conference and On-call moved to the lane.
    expect(standup.style.left).toBe("calc(0% + 1px)");
    expect(standup.style.width).toBe("calc(100% - 2px)");
  });

  it("formats promoted lane start times in 12-hour AM/PM when ampm is set", () => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      ampm: true,
      multiDayTimedEventPlacement: "all-day",
      events: [conference, fullDayTimed],
    });
    expect(view.getByText("9:00 AM")).toBeTruthy();
    expect(view.getByText("12:00 AM")).toBeTruthy();
    expect(view.getByText("Conference")).toBeTruthy();
    expect(view.getByText("On-call")).toBeTruthy();
  });

  it("omits the start time and squares the continuing ends when a promoted bar crosses visible edges", () => {
    const startsBefore: CalendarEvent = {
      title: "Before",
      start: new Date(2026, 6, 11, 14, 30),
      end: new Date(2026, 6, 15, 12, 0),
      allDay: false,
    };
    const endsAfter: CalendarEvent = {
      title: "After",
      start: new Date(2026, 6, 18, 15, 15),
      end: new Date(2026, 6, 22, 10, 0),
      allDay: false,
    };
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      events: [startsBefore, endsAfter],
    });

    const beforeChip = view.getByText("Before").closest('[data-slot="allDayEvent"]');
    const afterChip = view.getByText("After").closest('[data-slot="allDayEvent"]');
    if (!beforeChip || !afterChip) throw new Error("Missing promoted chips");

    expect(beforeChip.textContent).toBe("Before");
    expect(beforeChip.hasAttribute("data-continues-before")).toBe(true);
    expect(beforeChip.hasAttribute("data-continues-after")).toBe(false);
    const beforeBox = beforeChip.querySelector<HTMLElement>('[data-slot="eventBox"]');
    expect(beforeBox?.style.getPropertyValue("border-top-left-radius")).toMatch(/^0(px)?$/);
    expect(beforeBox?.style.getPropertyValue("border-top-right-radius")).toBe("6px");

    expect(afterChip.textContent).toBe("15:15After");
    expect(afterChip.hasAttribute("data-continues-before")).toBe(false);
    expect(afterChip.hasAttribute("data-continues-after")).toBe(true);
    const afterBox = afterChip.querySelector<HTMLElement>('[data-slot="eventBox"]');
    expect(afterBox?.style.getPropertyValue("border-top-left-radius")).toBe("6px");
    expect(afterBox?.style.getPropertyValue("border-top-right-radius")).toMatch(/^0(px)?$/);
  });

  it("passes isAllDay: false and inAllDayLane: true to custom renderers and accessibility labels", () => {
    const holiday: CalendarEvent = {
      title: "Holiday",
      start: new Date(2026, 6, 13),
      end: new Date(2026, 6, 14),
      allDay: true,
    };
    const Custom = (props: RenderEventArgs) => (
      <span
        data-all-day={String(props.isAllDay)}
        data-in-lane={String(Boolean(props.inAllDayLane))}
      >
        {props.event.title}
      </span>
    );
    const labeler = vi.fn(
      (event: CalendarEvent, ctx: { isAllDay: boolean }) =>
        `${event.title}:${ctx.isAllDay ? "all-day" : "timed"}`,
    );

    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      events: [holiday, conference],
      renderEvent: Custom,
      eventAccessibilityLabel: labeler,
    });

    const confNode = view.getByText("Conference");
    expect(confNode.getAttribute("data-all-day")).toBe("false");
    expect(confNode.getAttribute("data-in-lane")).toBe("true");
    expect(confNode.closest("button")?.getAttribute("aria-label")).toBe("Conference:timed");

    const holNode = view.getByText("Holiday");
    expect(holNode.getAttribute("data-all-day")).toBe("true");
    expect(holNode.getAttribute("data-in-lane")).toBe("true");
    expect(holNode.closest("button")?.getAttribute("aria-label")).toBe("Holiday:all-day");
  });

  it("announces the timed range (not 'all day') by default for promoted events", () => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      events: [conference],
    });
    const chip = view.getByText("Conference").closest("button");
    expect(chip?.getAttribute("aria-label")).toBe("Conference, 09:00 to 17:00");
  });

  it("presses and drags promoted lane bars while preserving start and end times", () => {
    const onPressEvent = vi.fn();
    const onDragStart = vi.fn();
    const onDragEvent = vi.fn();
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      events: [conference],
      onPressEvent,
      onDragStart,
      onDragEvent,
    });

    const chip = view
      .getByText("Conference")
      .closest<HTMLElement>('button[data-slot="allDayEvent"]');
    if (!chip) throw new Error("Missing promoted chip");

    fireEvent.click(chip, { detail: 1 });
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(conference);

    const grid = chip.closest('[data-slot="allDayColumn"]')?.parentElement;
    if (!grid) throw new Error("Missing all-day grid");
    grid.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 7 * COLUMN,
        height: 26,
        right: 7 * COLUMN,
        bottom: 26,
      }) as DOMRect;

    fireEvent.pointerDown(chip, at(1));
    fireEvent.pointerMove(chip, at(3));
    const preview = view.container.querySelector<HTMLElement>(
      '[data-slot="allDayColumn"][aria-hidden="true"]',
    );
    expect(preview?.style.gridColumn).toBe("4 / span 3");
    expect(preview?.textContent).toBe("09:00Conference");
    fireEvent.pointerUp(chip, at(3));
    fireEvent.click(chip, { detail: 1 });

    expect(onDragStart).toHaveBeenCalledExactlyOnceWith(conference);
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      conference,
      new Date(2026, 6, 16, 9, 0),
      new Date(2026, 6, 18, 17, 0),
    );
    expect(onPressEvent).toHaveBeenCalledTimes(1);
  });

  it("excludes promoted events from the timed Edit events chooser", () => {
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      events: [conference],
      onDragEvent: vi.fn(),
    });
    expect(view.queryByRole("button", { name: "Edit events" })).toBeNull();

    view.rerender({
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "grid",
      events: [conference],
      onDragEvent: vi.fn(),
    });
    expect(view.getByRole("button", { name: "Edit events" })).toBeTruthy();
  });

  it("keeps >= 24h background events as background bands and honours showAllDayEventCell={false}", () => {
    const bg: CalendarEvent = {
      title: "Maintenance",
      start: new Date(2026, 6, 14, 9, 0),
      end: new Date(2026, 6, 16, 17, 0),
      display: "background",
    };
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      events: [bg],
    });
    expect(view.container.querySelector('[data-slot="allDayLane"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-slot="backgroundEvent"]')).toHaveLength(3);

    view.rerender({
      date,
      mode: "week",
      weekStartsOn: 1,
      multiDayTimedEventPlacement: "all-day",
      showAllDayEventCell: false,
      events: [conference],
    });
    expect(view.container.querySelector('[data-slot="allDayLane"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-slot="event"]')).toHaveLength(0);
  });

  it("cancels an active lane drag when placement switches back to 'grid'", () => {
    const onDragEvent = vi.fn();
    const props = {
      date,
      mode: "week" as const,
      weekStartsOn: 1 as const,
      multiDayTimedEventPlacement: "all-day" as "grid" | "all-day",
      events: [conference],
      onDragEvent,
    };
    const view = render(TimeGrid, props);
    const chip = view
      .getByText("Conference")
      .closest<HTMLElement>('button[data-slot="allDayEvent"]');
    const grid = chip?.closest('[data-slot="allDayColumn"]')?.parentElement;
    if (!chip || !grid) throw new Error("Missing promoted chip");
    grid.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 7 * COLUMN,
        height: 26,
        right: 7 * COLUMN,
        bottom: 26,
      }) as DOMRect;

    fireEvent.pointerDown(chip, at(1));
    fireEvent.pointerMove(chip, at(3));
    expect(
      view.container.querySelector('[data-slot="allDayColumn"][aria-hidden="true"]'),
    ).not.toBeNull();

    view.rerender({ ...props, multiDayTimedEventPlacement: "grid" });
    expect(view.container.querySelector('[data-slot="allDayLane"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-slot="event"]')).toHaveLength(3);
    fireEvent.pointerUp(document, at(3));
    expect(onDragEvent).not.toHaveBeenCalled();
  });

  it("forwards multiDayTimedEventPlacement through Calendar and works with timeZone", () => {
    // 2026-07-14 13:00 UTC -> 2026-07-16 21:00 UTC is 09:00 -> 17:00 in America/New_York (EDT, UTC-4).
    const utcConference: CalendarEvent = {
      title: "Summit",
      start: new Date(Date.UTC(2026, 6, 14, 13, 0)),
      end: new Date(Date.UTC(2026, 6, 16, 21, 0)),
      allDay: false,
    };
    const onPressEvent = vi.fn();
    const onDragEvent = vi.fn();
    const view = render(Calendar, {
      mode: "week",
      date,
      weekStartsOn: 1,
      timeZone: "America/New_York",
      multiDayTimedEventPlacement: "all-day",
      events: [utcConference],
      onPressEvent,
      onDragEvent,
    });

    const chip = view.getByText("Summit").closest<HTMLElement>('button[data-slot="allDayEvent"]');
    if (!chip) throw new Error("Missing Summit chip");
    expect(chip.textContent).toBe("09:00Summit");
    expect(view.container.querySelectorAll('[data-slot="event"]')).toHaveLength(0);

    fireEvent.click(chip, { detail: 1 });
    expect(onPressEvent).toHaveBeenCalledExactlyOnceWith(utcConference);

    const grid = chip.closest('[data-slot="allDayColumn"]')?.parentElement;
    if (!grid) throw new Error("Missing all-day grid");
    grid.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 7 * COLUMN,
        height: 26,
        right: 7 * COLUMN,
        bottom: 26,
      }) as DOMRect;

    fireEvent.pointerDown(chip, at(1));
    fireEvent.pointerMove(chip, at(2));
    fireEvent.pointerUp(chip, at(2));
    expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
      utcConference,
      new Date(Date.UTC(2026, 6, 15, 13, 0)),
      new Date(Date.UTC(2026, 6, 17, 21, 0)),
    );
  });

  it("keeps clock times across DST transitions when dragging promoted lane bars under Calendar timeZone", () => {
    // Week Sun 8 Mar 2026 to Sat 14 Mar 2026 in America/New_York (spring-forward Sun 8 Mar).
    const dstDate = new Date(2026, 2, 8);
    const springBlock: CalendarEvent = {
      title: "Spring Block",
      start: new Date(Date.UTC(2026, 2, 8, 5, 0)), // Sun 00:00 EST
      end: new Date(Date.UTC(2026, 2, 9, 4, 0)), // Mon 00:00 EDT (23h elapsed, 24h clock)
      allDay: false,
    };
    const normalBlock: CalendarEvent = {
      title: "Normal Block",
      start: new Date(Date.UTC(2026, 2, 9, 4, 0)), // Mon 00:00 EDT
      end: new Date(Date.UTC(2026, 2, 10, 4, 0)), // Tue 00:00 EDT (24h elapsed)
      allDay: false,
    };
    const onDragEvent = vi.fn();
    const view = render(Calendar, {
      mode: "week",
      date: dstDate,
      weekStartsOn: 0,
      timeZone: "America/New_York",
      multiDayTimedEventPlacement: "all-day",
      events: [springBlock, normalBlock],
      onDragEvent,
    });

    const springChip = view
      .getByText("Spring Block")
      .closest<HTMLElement>('button[data-slot="allDayEvent"]');
    const normalChip = view
      .getByText("Normal Block")
      .closest<HTMLElement>('button[data-slot="allDayEvent"]');
    const grid = springChip?.closest('[data-slot="allDayColumn"]')?.parentElement;
    if (!springChip || !normalChip || !grid) throw new Error("Missing DST lane chips");
    grid.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 7 * COLUMN,
        height: 52,
        right: 7 * COLUMN,
        bottom: 52,
      }) as DOMRect;

    // Drag spring-forward 00:00-24:00 block +1 day to Monday: must stay 00:00-24:00 EDT (not 23:00).
    fireEvent.pointerDown(springChip, at(0));
    fireEvent.pointerMove(springChip, at(1));
    fireEvent.pointerUp(springChip, at(1));
    expect(onDragEvent).toHaveBeenLastCalledWith(
      springBlock,
      new Date(Date.UTC(2026, 2, 9, 4, 0)),
      new Date(Date.UTC(2026, 2, 10, 4, 0)),
    );

    // Drag normal Monday 00:00-24:00 block -1 day onto spring-forward Sunday: must end Mon 00:00 EDT (not 01:00).
    fireEvent.pointerDown(normalChip, at(1));
    fireEvent.pointerMove(normalChip, at(0));
    fireEvent.pointerUp(normalChip, at(0));
    expect(onDragEvent).toHaveBeenLastCalledWith(
      normalBlock,
      new Date(Date.UTC(2026, 2, 8, 5, 0)),
      new Date(Date.UTC(2026, 2, 9, 4, 0)),
    );

    // Drag a multi-day event across the spring-forward boundary: both clock times stay intact.
    const multiDay: CalendarEvent = {
      title: "Offsite",
      start: new Date(Date.UTC(2026, 2, 5, 14, 0)), // Thu 09:00 EST
      end: new Date(Date.UTC(2026, 2, 6, 22, 0)), // Fri 17:00 EST
      allDay: false,
    };
    view.rerender({
      mode: "week",
      date: new Date(2026, 2, 4), // Week Mon 2 Mar to Sun 8 Mar
      weekStartsOn: 1,
      timeZone: "America/New_York",
      multiDayTimedEventPlacement: "all-day",
      events: [multiDay],
      onDragEvent,
    });
    const offsiteChip = view
      .getByText("Offsite")
      .closest<HTMLElement>('button[data-slot="allDayEvent"]');
    const offsiteGrid = offsiteChip?.closest('[data-slot="allDayColumn"]')?.parentElement;
    if (!offsiteChip || !offsiteGrid) throw new Error("Missing Offsite chip");
    offsiteGrid.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 7 * COLUMN,
        height: 26,
        right: 7 * COLUMN,
        bottom: 26,
      }) as DOMRect;
    fireEvent.pointerDown(offsiteChip, at(3));
    fireEvent.pointerMove(offsiteChip, at(5));
    fireEvent.pointerUp(offsiteChip, at(5));
    expect(onDragEvent).toHaveBeenLastCalledWith(
      multiDay,
      new Date(Date.UTC(2026, 2, 7, 14, 0)), // Sat 09:00 EST
      new Date(Date.UTC(2026, 2, 8, 21, 0)), // Sun 17:00 EDT
    );
  });

  it("hides the start time when a promoted event starts on an interior hidden day", () => {
    // Tuesday (2) is hidden; visible columns are Mon, Wed, Thu, Fri, Sat, Sun.
    const startsOnHiddenTue: CalendarEvent = {
      title: "Hidden Start",
      start: new Date(2026, 6, 14, 9, 0), // Tue 09:00
      end: new Date(2026, 6, 15, 9, 0), // Wed 09:00
      allDay: false,
    };
    const startsOnVisibleMon: CalendarEvent = {
      title: "Visible Start",
      start: new Date(2026, 6, 13, 9, 0), // Mon 09:00
      end: new Date(2026, 6, 15, 9, 0), // Wed 09:00
      allDay: false,
    };
    const view = render(TimeGrid, {
      date,
      mode: "week",
      weekStartsOn: 1,
      hiddenDays: [2],
      multiDayTimedEventPlacement: "all-day",
      events: [startsOnHiddenTue, startsOnVisibleMon],
    });
    const hiddenStartChip = view.getByText("Hidden Start").closest('[data-slot="allDayEvent"]');
    const visibleStartChip = view.getByText("Visible Start").closest('[data-slot="allDayEvent"]');
    expect(hiddenStartChip?.textContent).toBe("Hidden Start");
    expect(visibleStartChip?.textContent).toBe("09:00Visible Start");
  });

  it("cancels an active vertical-grid drag and pending touch hold when placement switches to 'all-day'", () => {
    const onDragEvent = vi.fn();
    const onDragStart = vi.fn();
    const tuesdaySibling: CalendarEvent = {
      title: "Tuesday Sync",
      start: new Date(2026, 6, 14, 14, 0),
      end: new Date(2026, 6, 14, 15, 0),
      allDay: false,
    };
    const observedDuringToggle: Array<{
      title?: string;
      inAllDayLane?: boolean;
      startMs: number;
    }> = [];
    let recordingToggle = false;
    const SpyEvent = (props: RenderEventArgs) => (
      <span>
        {(() => {
          if (recordingToggle) {
            observedDuringToggle.push({
              title: props.event.title,
              inAllDayLane: props.inAllDayLane,
              startMs: props.event.start.getTime(),
            });
          }
          return props.event.title;
        })()}
      </span>
    );
    const baseProps = {
      date,
      mode: "week" as const,
      weekStartsOn: 1 as const,
      multiDayTimedEventPlacement: "grid" as "grid" | "all-day",
      events: [conference, tuesdaySibling],
      renderEvent: SpyEvent,
      onDragEvent,
      onDragStart,
    };
    const view = render(TimeGrid, baseProps);
    const firstBox = view.getAllByText("Conference")[0].closest<HTMLElement>('[data-slot="event"]');
    const column = firstBox?.parentElement;
    if (!firstBox || !column) throw new Error("Missing vertical Conference box");
    column.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: COLUMN, height: 1152, right: COLUMN, bottom: 1152 }) as DOMRect;

    // Drag the first segment before 00:00 so a spillDayIndex would also be set if unguarded.
    fireEvent.pointerDown(firstBox, {
      clientX: 50,
      clientY: 432,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    });
    fireEvent.pointerMove(document, {
      clientX: 50,
      clientY: -96,
      pointerId: 1,
      pointerType: "mouse",
    });

    // Switch placement mid-drag: active vertical drag, sibling re-indexing, and spill previews must all stay clean
    // even on the pre-effect render frame before cleanup effects flush.
    recordingToggle = true;
    view.rerender({ ...baseProps, multiDayTimedEventPlacement: "all-day" });
    recordingToggle = false;
    expect(
      observedDuringToggle.filter((call) => call.title === "Conference" && !call.inAllDayLane),
    ).toEqual([]);
    expect(
      observedDuringToggle.filter(
        (call) => call.title === "Tuesday Sync" && call.startMs !== tuesdaySibling.start.getTime(),
      ),
    ).toEqual([]);
    expect(view.container.querySelector('[data-slot="allDayLane"]')).not.toBeNull();
    const remainingGridBoxes = [...view.container.querySelectorAll('[data-slot="event"]')];
    expect(remainingGridBoxes).toHaveLength(1);
    expect(remainingGridBoxes[0].textContent).toContain("Tuesday Sync");
    expect(remainingGridBoxes[0].hasAttribute("data-dragging")).toBe(false);
    expect(view.container.querySelectorAll("[data-dragging]")).toHaveLength(0);
    fireEvent.pointerUp(document, {
      clientX: 50,
      clientY: -96,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(onDragEvent).not.toHaveBeenCalled();

    // Pending touch hold must also cancel cleanly without firing onDragStart.
    vi.useFakeTimers();
    try {
      onDragStart.mockClear();
      view.rerender({ ...baseProps, multiDayTimedEventPlacement: "grid" });
      const touchBox = view
        .getAllByText("Conference")[0]
        .closest<HTMLElement>('[data-slot="event"]');
      if (!touchBox) throw new Error("Missing vertical box for touch hold");
      fireEvent.pointerDown(touchBox, {
        clientX: 50,
        clientY: 432,
        pointerId: 2,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
      });
      view.rerender({ ...baseProps, multiDayTimedEventPlacement: "all-day" });
      vi.advanceTimersByTime(600);
      expect(onDragStart).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
