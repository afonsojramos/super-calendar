import type { CalendarEvent } from "../../types";
import { eventsInTimeZone, toZonedTime, zonedTimeToUtc } from "../timezone";

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
});
