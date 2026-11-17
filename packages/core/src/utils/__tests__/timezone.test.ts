import type { CalendarEvent } from "../../types";
import {
  eventsInTimeZone,
  fromZonedTime,
  nowInTimeZone,
  toZonedTime,
  zonedDragBounds,
  zonedEventSource,
  zonedTimeToUtc,
} from "../timezone";

// 1 June 2026, 12:00 UTC. June avoids the US/EU DST transition dates, so the
// offsets below are stable regardless of the machine running the test.
const instant = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));

describe("toZonedTime", () => {
  it("returns the UTC wall clock for the UTC zone", () => {
    const zoned = toZonedTime(instant, "UTC");
    expect(zoned.getHours()).toBe(12);
    expect(zoned.getMinutes()).toBe(0);
    expect(zoned.getDate()).toBe(1);
  });

  it("shifts back for a western zone (New York, UTC-4 in June)", () => {
    expect(toZonedTime(instant, "America/New_York").getHours()).toBe(8);
  });

  it("shifts forward for an eastern zone (Tokyo, UTC+9)", () => {
    expect(toZonedTime(instant, "Asia/Tokyo").getHours()).toBe(21);
  });

  it("rolls the date over when the zone crosses midnight", () => {
    // 23:00 UTC on the 1st is 08:00 on the 2nd in Tokyo.
    const late = new Date(Date.UTC(2026, 5, 1, 23, 0, 0));
    const tokyo = toZonedTime(late, "Asia/Tokyo");
    expect(tokyo.getDate()).toBe(2);
    expect(tokyo.getHours()).toBe(8);
  });

  it("preserves milliseconds", () => {
    const withMs = new Date(Date.UTC(2026, 5, 1, 12, 0, 0, 123));
    expect(toZonedTime(withMs, "UTC").getMilliseconds()).toBe(123);
  });
});

describe("toZonedTime formatter cache", () => {
  it("stays correct for more zones than it keeps formatters for", () => {
    // Every case variant of a zone name is a distinct key.
    const variants = Array.from({ length: 80 }, (_, index) =>
      "asia/tokyo"
        .split("")
        .map((ch, at) => ((index >> at) & 1 ? ch.toUpperCase() : ch))
        .join(""),
    );
    for (const zone of [...variants, "America/New_York", ...variants]) {
      const expected = zone === "America/New_York" ? 8 : 21;
      expect(toZonedTime(instant, zone).getHours()).toBe(expected);
    }
  });

  it("does not cache an invalid zone", () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(() => toZonedTime(instant, "Not/A_Zone")).toThrow(RangeError);
    }
  });
});

describe("nowInTimeZone", () => {
  // 22:00 UTC on 12 November is already 07:00 on the 13th in Tokyo.
  const evening = new Date("2026-11-12T22:00:00Z");

  it("reads a fixed instant on the zone's wall clock", () => {
    const tokyo = nowInTimeZone(evening, "Asia/Tokyo");
    expect([tokyo.getMonth(), tokyo.getDate(), tokyo.getHours()]).toEqual([10, 13, 7]);
    const losAngeles = nowInTimeZone(evening, "America/Los_Angeles");
    expect([losAngeles.getDate(), losAngeles.getHours()]).toEqual([12, 14]);
  });

  it("returns the instant itself without a zone", () => {
    expect(nowInTimeZone(evening)).toBe(evening);
  });

  it("defaults to the device clock", () => {
    const before = Date.now();
    const value = nowInTimeZone().getTime();
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(Date.now());
  });
});

describe("zonedTimeToUtc", () => {
  // Pass wall-clock components as UTC fields; get back the true instant.
  const wall = (y: number, m: number, d: number, h: number) => new Date(Date.UTC(y, m, d, h, 0, 0));

  it("resolves a summer (DST) wall time to UTC", () => {
    // 09:00 New York in June is EDT (UTC-4) → 13:00 UTC.
    expect(zonedTimeToUtc(wall(2026, 5, 19, 9), "America/New_York").toISOString()).toBe(
      "2026-06-19T13:00:00.000Z",
    );
  });

  it("resolves a winter (standard) wall time to UTC", () => {
    // 09:00 New York in January is EST (UTC-5) → 14:00 UTC.
    expect(zonedTimeToUtc(wall(2026, 0, 15, 9), "America/New_York").toISOString()).toBe(
      "2026-01-15T14:00:00.000Z",
    );
  });

  it("round-trips through toZonedTime", () => {
    const instant2 = new Date(Date.UTC(2026, 5, 1, 12, 34, 0));
    const zoned = toZonedTime(instant2, "Asia/Tokyo");
    const back = zonedTimeToUtc(
      new Date(
        Date.UTC(
          zoned.getFullYear(),
          zoned.getMonth(),
          zoned.getDate(),
          zoned.getHours(),
          zoned.getMinutes(),
        ),
      ),
      "Asia/Tokyo",
    );
    expect(back.toISOString()).toBe(instant2.toISOString());
  });
});

describe("eventsInTimeZone", () => {
  it("zones start and end while keeping other fields", () => {
    const events: CalendarEvent[] = [
      { start: instant, end: new Date(Date.UTC(2026, 5, 1, 13, 0, 0)), title: "Sync" },
    ];
    const [zoned] = eventsInTimeZone(events, "Asia/Tokyo");
    expect(zoned.title).toBe("Sync");
    expect(zoned.start.getHours()).toBe(21);
    expect(zoned.end.getHours()).toBe(22);
  });

  it("leaves all-day events as they are, on their own days", () => {
    const flagged: CalendarEvent = {
      title: "Holiday",
      allDay: true,
      start: new Date("2026-11-12T00:00:00Z"),
      end: new Date("2026-11-13T00:00:00Z"),
    };
    // Midnight to midnight on the device clock reads as all-day without the flag.
    const inferred: CalendarEvent = { start: new Date(2026, 10, 12), end: new Date(2026, 10, 14) };
    for (const timeZone of ["America/New_York", "Asia/Tokyo", "Pacific/Kiritimati"]) {
      const zoned = eventsInTimeZone([flagged, inferred], timeZone);
      expect(zoned[0]).toBe(flagged);
      expect(zoned[1]).toBe(inferred);
    }
  });

  it("shifts a midnight-bounded event marked as timed", () => {
    const timed: CalendarEvent = {
      allDay: false,
      start: new Date("2026-11-12T00:00:00Z"),
      end: new Date("2026-11-13T00:00:00Z"),
    };
    const [zoned] = eventsInTimeZone([timed], "America/New_York");
    expect(zoned).not.toBe(timed);
    expect([zoned.start.getDate(), zoned.start.getHours()]).toEqual([11, 19]);
    expect([zoned.end.getDate(), zoned.end.getHours()]).toEqual([12, 19]);
  });
});

describe("fromZonedTime", () => {
  it.each(["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Kiritimati", "Pacific/Pago_Pago"])(
    "inverts toZonedTime in %s",
    (timeZone) => {
      for (const iso of [
        "2026-01-15T03:20:30.123Z",
        "2026-07-15T23:45:00Z",
        "2026-11-12T15:00:00Z",
      ]) {
        const real = new Date(iso);
        expect(fromZonedTime(toZonedTime(real, timeZone), timeZone).toISOString()).toBe(
          real.toISOString(),
        );
      }
    },
  );

  it("reads device-local fields as the zone's wall clock", () => {
    // 10:00 on 12 November in New York (EST, UTC-5) is 15:00 UTC.
    expect(fromZonedTime(new Date(2026, 10, 12, 10), "America/New_York").toISOString()).toBe(
      "2026-11-12T15:00:00.000Z",
    );
  });
});

describe("zonedEventSource", () => {
  const meeting: CalendarEvent<{ id: string }> = {
    id: "m",
    start: new Date("2026-11-12T15:00:00Z"),
    end: new Date("2026-11-12T16:00:00Z"),
  };

  it("returns the event a display copy was made from", () => {
    const [zoned] = eventsInTimeZone([meeting], "America/New_York");
    expect(zoned).not.toBe(meeting);
    expect(zonedEventSource(zoned)).toBe(meeting);
  });

  it("returns any other event as it is", () => {
    expect(zonedEventSource(meeting)).toBe(meeting);
    const copy = { ...eventsInTimeZone([meeting], "America/New_York")[0] };
    expect(zonedEventSource(copy)).toBe(copy);
  });
});

describe("zonedDragBounds", () => {
  const timeZone = "America/New_York";
  const meeting: CalendarEvent = {
    start: new Date("2026-11-12T15:00:00Z"), // 10:00 in New York
    end: new Date("2026-11-12T16:00:00Z"),
  };
  const [zoned] = eventsInTimeZone([meeting], timeZone);
  const wall = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

  it("reads a moved event's bounds as the zone's wall clock", () => {
    const { start, end } = zonedDragBounds(zoned, wall(13, 14, 30), wall(13, 15, 30));
    expect(start.toISOString()).toBe("2026-11-13T19:30:00.000Z");
    expect(end.toISOString()).toBe("2026-11-13T20:30:00.000Z");
  });

  it("keeps the exact instant of an edge the drag left alone", () => {
    const resized = zonedDragBounds(zoned, zoned.start, wall(12, 12));
    expect(resized.start).toBe(meeting.start);
    expect(resized.end.toISOString()).toBe("2026-11-12T17:00:00.000Z");
    const fromTop = zonedDragBounds(zoned, wall(12, 9), zoned.end);
    expect(fromTop.start.toISOString()).toBe("2026-11-12T14:00:00.000Z");
    expect(fromTop.end).toBe(meeting.end);
  });

  it("returns the bounds of an event that was never shifted", () => {
    const holiday: CalendarEvent = {
      allDay: true,
      start: new Date(2026, 10, 12),
      end: new Date(2026, 10, 13),
    };
    const [same] = eventsInTimeZone([holiday], timeZone);
    const start = new Date(2026, 10, 14);
    const end = new Date(2026, 10, 15);
    expect(zonedDragBounds(same, start, end)).toEqual({ start, end });
    expect(zonedDragBounds(same, start, end).start).toBe(start);
  });
});
