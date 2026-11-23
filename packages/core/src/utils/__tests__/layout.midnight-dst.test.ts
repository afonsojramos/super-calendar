import { startOfDay } from "date-fns";
import { useTimeZone } from "../../../../../tests/support/timezone";
import { eventDayKeys, groupEventsByDay, isAllDayLaneEvent, layoutDayEvents } from "../layout";
import { eventsInTimeZone } from "../timezone";
import type { CalendarEvent } from "../../types";

useTimeZone("America/Sao_Paulo");

describe("event day keys across a midnight clock change", () => {
  it.each([
    { start: 3, end: new Date(2018, 10, 8), days: [3, 4, 5, 6, 7] },
    { start: 4, end: new Date(2018, 10, 8), days: [4, 5, 6, 7] },
    { start: 3, end: new Date(2018, 10, 5, 0, 30), days: [3, 4, 5] },
  ])("indexes every occupied day from November $start", ({ start, end, days }) => {
    const event = { title: "Journey", start: new Date(2018, 10, start), end };
    expect(new Date(2018, 10, 4).getHours()).toBe(1);
    const expected = days.map((day) => startOfDay(new Date(2018, 10, day)).toISOString());
    expect(eventDayKeys(event)).toEqual(expected);
    const grouped = groupEventsByDay([event]);
    for (const key of expected) expect(grouped.get(key)).toEqual([event]);
    expect(grouped.size).toBe(expected.length);
  });
});

describe("isAllDayLaneEvent across midnight-skipping DST transitions", () => {
  // America/Sao_Paulo skipped midnight on 4 Nov 2018: 2018-11-03 23:59:59 BRT (-03:00)
  // jumped straight to 2018-11-04 01:00:00 BRST (-02:00), so startOfDay(Nov 4) is 01:00.
  const sat = new Date(2018, 10, 3);
  const sun = new Date(2018, 10, 4);

  it("does not promote < 24h single-day events ending at the skipped-midnight boundary", () => {
    const twentyThreeHours: CalendarEvent = {
      title: "Sat 01:00-24:00",
      start: new Date(2018, 10, 3, 1, 0),
      end: new Date(2018, 10, 4, 0, 0), // normalizes to Sun 01:00 BRST (startOfDay(Sun))
      allDay: false,
    };
    const twentyThreeHalfHours: CalendarEvent = {
      title: "Sat 00:30-24:00",
      start: new Date(2018, 10, 3, 0, 30),
      end: new Date(2018, 10, 4, 0, 0),
      allDay: false,
    };
    expect(isAllDayLaneEvent(twentyThreeHours, "all-day")).toBe(false);
    expect(isAllDayLaneEvent(twentyThreeHalfHours, "all-day")).toBe(false);
    expect(
      layoutDayEvents([twentyThreeHours], sat, { multiDayTimedEventPlacement: "all-day" }),
    ).toHaveLength(1);
    expect(
      layoutDayEvents([twentyThreeHours], sun, { multiDayTimedEventPlacement: "all-day" }),
    ).toEqual([]);
  });

  it("promotes full-day blocks on and before the transition day, and multi-day spans across it", () => {
    const fullSat: CalendarEvent = {
      title: "Full Saturday",
      start: new Date(2018, 10, 3, 0, 0),
      end: new Date(2018, 10, 4, 0, 0),
      allDay: false,
    };
    const fullSun: CalendarEvent = {
      title: "Full Transition Sunday",
      start: new Date(2018, 10, 4, 0, 0), // Sun 01:00 BRST (startOfDay(Sun))
      end: new Date(2018, 10, 5, 0, 0), // Mon 00:00 BRST (startOfDay(Mon))
      allDay: false,
    };
    const partialSun: CalendarEvent = {
      title: "Partial Sunday",
      start: new Date(2018, 10, 4, 0, 0), // Sun 01:00 BRST
      end: new Date(2018, 10, 4, 23, 59),
      allDay: false,
    };
    const spansIntoSun: CalendarEvent = {
      title: "Sat 01:00 -> Sun 01:30",
      start: new Date(2018, 10, 3, 1, 0),
      end: new Date(2018, 10, 4, 1, 30),
      allDay: false,
    };

    expect(isAllDayLaneEvent(fullSat, "all-day")).toBe(true);
    expect(isAllDayLaneEvent(fullSun, "all-day")).toBe(true);
    expect(isAllDayLaneEvent(partialSun, "all-day")).toBe(false);
    expect(isAllDayLaneEvent(spansIntoSun, "all-day")).toBe(true);
    expect(layoutDayEvents([fullSun], sun, { multiDayTimedEventPlacement: "all-day" })).toEqual([]);
  });

  it("reads zoned events in their display zone even when the device zone skips midnight", () => {
    const utcFullDay: CalendarEvent = {
      title: "UTC full day on Sao Paulo DST date",
      start: new Date(Date.UTC(2018, 10, 4, 0, 0)),
      end: new Date(Date.UTC(2018, 10, 5, 0, 0)),
      allDay: false,
    };
    const utc23h: CalendarEvent = {
      title: "UTC 23h",
      start: new Date(Date.UTC(2018, 10, 4, 1, 0)),
      end: new Date(Date.UTC(2018, 10, 5, 0, 0)),
      allDay: false,
    };
    const zonedUtc = eventsInTimeZone([utcFullDay, utc23h], "UTC");
    expect(isAllDayLaneEvent(zonedUtc[0], "all-day")).toBe(true);
    expect(isAllDayLaneEvent(zonedUtc[1], "all-day")).toBe(false);

    // America/Havana skips midnight on 8 Mar 2026 (00:00 CST -> 01:00 CDT).
    const havanaSat23h: CalendarEvent = {
      title: "Havana Sat 01:00-24:00",
      start: new Date(Date.UTC(2026, 2, 7, 6, 0)),
      end: new Date(Date.UTC(2026, 2, 8, 5, 0)),
      allDay: false,
    };
    const havanaSunFull: CalendarEvent = {
      title: "Havana Sun full day",
      start: new Date(Date.UTC(2026, 2, 8, 5, 0)),
      end: new Date(Date.UTC(2026, 2, 9, 4, 0)),
      allDay: false,
    };
    const zonedHavana = eventsInTimeZone([havanaSat23h, havanaSunFull], "America/Havana");
    expect(isAllDayLaneEvent(zonedHavana[0], "all-day")).toBe(false);
    expect(isAllDayLaneEvent(zonedHavana[1], "all-day")).toBe(true);
  });
});
