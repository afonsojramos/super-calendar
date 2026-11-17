import type { CalendarEvent, RecurrenceRule } from "../../types";
import { expandRecurringEvents } from "../recurrence";
import { eventsInTimeZone, fromZonedTime, zonedDragBounds, zonedTimeToUtc } from "../timezone";

const NEW_YORK = "America/New_York";
const iso = (events: CalendarEvent[]) => events.map((event) => event.start.toISOString());
const utc = (value: string) => new Date(`${value}Z`);
const expand = (
  start: string,
  recurrence: RecurrenceRule,
  from: string,
  to: string,
  extra: Partial<CalendarEvent> = {},
) =>
  expandRecurringEvents(
    [
      {
        start: utc(start),
        end: new Date(utc(start).getTime() + 3_600_000),
        title: "Standup",
        recurrence,
        ...extra,
      },
    ],
    utc(from),
    utc(to),
    { timeZone: NEW_YORK },
  );

// The zone's rules decide every result below, so each must hold whatever zone
// the device is in: one without DST, one whose DST changes fall on other dates,
// the zone itself, and one a day ahead of it.
describe.each(["UTC", "Europe/Warsaw", "America/New_York", "Pacific/Apia"])(
  "recurrence on a zone's clock (device in %s)",
  (deviceZone) => {
    const previous = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = deviceZone;
    });
    afterAll(() => {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    });

    it("keeps the zone's clock time across its fall-back change", () => {
      // 09:00 in New York: 13:00 UTC on EDT, 14:00 UTC once clocks go back on 1 Nov.
      expect(
        iso(
          expand(
            "2026-10-30T13:00:00",
            { freq: "daily" },
            "2026-10-30T00:00:00",
            "2026-11-03T00:00:00",
          ),
        ),
      ).toEqual([
        "2026-10-30T13:00:00.000Z",
        "2026-10-31T13:00:00.000Z",
        "2026-11-01T14:00:00.000Z",
        "2026-11-02T14:00:00.000Z",
      ]);
    });

    it("keeps the zone's clock time across its spring-forward change", () => {
      expect(
        iso(
          expand(
            "2026-03-06T14:00:00",
            { freq: "weekly" },
            "2026-03-01T00:00:00",
            "2026-03-21T00:00:00",
          ),
        ),
      ).toEqual([
        "2026-03-06T14:00:00.000Z",
        "2026-03-13T13:00:00.000Z",
        "2026-03-20T13:00:00.000Z",
      ]);
    });

    it("moves an occurrence in the skipped hour to after it, for that day only", () => {
      // 02:30 in New York doesn't exist on 8 March.
      expect(
        iso(
          expand(
            "2026-03-07T07:30:00",
            { freq: "daily" },
            "2026-03-07T00:00:00",
            "2026-03-10T00:00:00",
          ),
        ),
      ).toEqual([
        "2026-03-07T07:30:00.000Z",
        "2026-03-08T07:30:00.000Z", // 03:30 EDT
        "2026-03-09T06:30:00.000Z", // 02:30 EDT
      ]);
    });

    it("keeps each occurrence's elapsed duration", () => {
      const occurrences = expand(
        "2026-10-30T13:00:00",
        { freq: "daily" },
        "2026-10-30T00:00:00",
        "2026-11-03T00:00:00",
      );
      expect(occurrences.map((e) => e.end.getTime() - e.start.getTime())).toEqual(
        occurrences.map(() => 3_600_000),
      );
      expect(occurrences.every((e) => e.recurrence === undefined)).toBe(true);
    });

    it("reads weekdays on the zone's calendar", () => {
      // 22:00 on Monday 2 November in New York is already Tuesday in UTC.
      expect(
        iso(
          expand(
            "2026-11-03T03:00:00",
            { freq: "weekly", weekdays: [1, 3] },
            "2026-11-01T00:00:00",
            "2026-11-12T12:00:00",
          ),
        ),
      ).toEqual([
        "2026-11-03T03:00:00.000Z", // Mon 2 Nov, 22:00
        "2026-11-05T03:00:00.000Z", // Wed 4 Nov
        "2026-11-10T03:00:00.000Z", // Mon 9 Nov
        "2026-11-12T03:00:00.000Z", // Wed 11 Nov
      ]);
    });

    it("reads month days and nth weekdays on the zone's calendar", () => {
      // 20:00 on 31 October in New York is 1 November in UTC.
      expect(
        iso(
          expand(
            "2026-11-01T00:00:00",
            { freq: "monthly", monthDays: [-1] },
            "2026-10-01T00:00:00",
            "2027-01-05T00:00:00",
          ),
        ),
      ).toEqual([
        "2026-11-01T00:00:00.000Z", // 31 Oct, 20:00 EDT
        "2026-12-01T01:00:00.000Z", // 30 Nov, 20:00 EST
        "2027-01-01T01:00:00.000Z", // 31 Dec
      ]);
      // The first Friday, at 21:00 in New York (Saturday in UTC).
      expect(
        iso(
          expand(
            "2026-10-03T01:00:00",
            { freq: "monthly", nthWeekday: { week: 1, weekday: 5 } },
            "2026-10-01T00:00:00",
            "2026-12-31T00:00:00",
          ),
        ),
      ).toEqual([
        "2026-10-03T01:00:00.000Z", // Fri 2 Oct
        "2026-11-07T02:00:00.000Z", // Fri 6 Nov, EST
        "2026-12-05T02:00:00.000Z", // Fri 4 Dec
      ]);
    });

    it("honours count, until and the query window as real instants", () => {
      expect(
        iso(
          expand(
            "2026-10-30T13:00:00",
            { freq: "daily", count: 3 },
            "2026-10-01T00:00:00",
            "2026-12-01T00:00:00",
          ),
        ),
      ).toHaveLength(3);
      expect(
        iso(
          expand(
            "2026-10-30T13:00:00",
            { freq: "daily", until: utc("2026-11-01T14:00:00") },
            "2026-10-01T00:00:00",
            "2026-12-01T00:00:00",
          ),
        ),
      ).toEqual([
        "2026-10-30T13:00:00.000Z",
        "2026-10-31T13:00:00.000Z",
        "2026-11-01T14:00:00.000Z",
      ]);
      // A window that opens during one occurrence and closes at another's start.
      expect(
        iso(
          expand(
            "2026-10-30T13:00:00",
            { freq: "daily" },
            "2026-10-31T13:30:00",
            "2026-11-01T14:00:00",
          ),
        ),
      ).toEqual(["2026-10-31T13:00:00.000Z", "2026-11-01T14:00:00.000Z"]);
    });

    it("fast-forwards a long-running rule to a far window", () => {
      expect(
        iso(
          expand(
            "2020-01-06T14:00:00",
            { freq: "daily" },
            "2026-07-01T00:00:00",
            "2026-07-02T23:00:00",
          ),
        ),
      ).toEqual(["2026-07-01T13:00:00.000Z", "2026-07-02T13:00:00.000Z"]);
    });

    it("drops a timed exception's occurrence and a dated exception's whole zone day", () => {
      // Two occurrences a day: 09:00 and 21:00 in New York.
      const rule = (exdates: Date[]): RecurrenceRule => ({
        freq: "daily",
        rdates: [
          utc("2026-11-11T02:00:00"),
          utc("2026-11-12T02:00:00"),
          utc("2026-11-13T02:00:00"),
        ],
        exdates,
      });
      const run = (exdates: Date[]) =>
        iso(
          expand(
            "2026-11-10T14:00:00",
            rule(exdates),
            "2026-11-10T00:00:00",
            "2026-11-13T12:00:00",
          ),
        );
      const all = run([]);
      expect(all).toHaveLength(6);
      // A timed exception: only the occurrence at that instant.
      expect(run([utc("2026-11-12T02:00:00")])).toEqual(
        all.filter((start) => start !== "2026-11-12T02:00:00.000Z"),
      );
      // A date at device midnight names a calendar day: both of 11 November's
      // occurrences in New York go, including the 21:00 one that is the 12th in UTC.
      const dayWide = all.filter(
        (start) => start !== "2026-11-11T14:00:00.000Z" && start !== "2026-11-12T02:00:00.000Z",
      );
      expect(run([new Date(2026, 10, 11)])).toEqual(dayWide);
      // So does midnight in the zone itself.
      expect(run([fromZonedTime(new Date(2026, 10, 11), NEW_YORK)])).toEqual(dayWide);
    });

    it("treats an exception at an occurrence's instant as timed, even at device midnight", () => {
      // 19:00 in New York is midnight UTC: on a UTC device this instant reads as
      // a date, but it names one occurrence.
      const run = (exdates: Date[]) =>
        iso(
          expand(
            "2026-11-11T00:00:00",
            { freq: "daily", exdates },
            "2026-11-10T00:00:00",
            "2026-11-14T00:00:00",
          ),
        );
      expect(run([utc("2026-11-12T00:00:00")])).toEqual(
        run([]).filter((start) => start !== "2026-11-12T00:00:00.000Z"),
      );
    });

    it("repeats an all-day event on calendar days, not on the zone's clock", () => {
      const holiday: CalendarEvent = {
        title: "Holiday",
        allDay: true,
        start: new Date(2026, 9, 30),
        end: new Date(2026, 9, 31),
        recurrence: { freq: "daily", count: 5 },
      };
      const occurrences = expandRecurringEvents(
        [holiday],
        fromZonedTime(new Date(2026, 9, 30), NEW_YORK),
        fromZonedTime(new Date(2026, 10, 4), NEW_YORK),
        { timeZone: NEW_YORK },
      );
      expect(occurrences.map((e) => e.start)).toEqual(
        [30, 31, 32, 33, 34].map((day) => new Date(2026, 9, day)),
      );
      // Unshifted, so each stays on its day when displayed in the zone.
      expect(eventsInTimeZone(occurrences, NEW_YORK)).toEqual(occurrences);
    });

    it("leaves expansion without a timeZone on the device's clock", () => {
      const event: CalendarEvent = {
        start: new Date(2026, 9, 30, 9),
        end: new Date(2026, 9, 30, 10),
        recurrence: { freq: "daily" },
      };
      const occurrences = expandRecurringEvents(
        [event],
        new Date(2026, 9, 30),
        new Date(2026, 10, 3),
      );
      expect(occurrences.map((e) => [e.start.getDate(), e.start.getHours()])).toEqual([
        [30, 9],
        [31, 9],
        [1, 9],
        [2, 9],
      ]);
    });

    describe("zonedTimeToUtc", () => {
      const wall = (month: number, day: number, hour: number, minute = 0) =>
        new Date(Date.UTC(2026, month, day, hour, minute));

      it("ignores the device's own DST changes", () => {
        // 02:30 on 29 March exists in New York; Warsaw skips that hour.
        expect(zonedTimeToUtc(wall(2, 29, 2, 30), NEW_YORK).toISOString()).toBe(
          "2026-03-29T06:30:00.000Z",
        );
        // 02:30 on 25 October exists once in New York; Warsaw repeats that hour.
        expect(zonedTimeToUtc(wall(9, 25, 2, 30), NEW_YORK).toISOString()).toBe(
          "2026-10-25T06:30:00.000Z",
        );
      });

      it("resolves a skipped time to the same distance after the gap", () => {
        expect(zonedTimeToUtc(wall(2, 8, 2, 30), NEW_YORK).toISOString()).toBe(
          "2026-03-08T07:30:00.000Z", // 03:30 EDT
        );
        expect(zonedTimeToUtc(wall(2, 29, 2, 30), "Europe/Warsaw").toISOString()).toBe(
          "2026-03-29T01:30:00.000Z", // 03:30 CEST
        );
        // Either side of the gap is untouched.
        expect(zonedTimeToUtc(wall(2, 8, 1, 59), NEW_YORK).toISOString()).toBe(
          "2026-03-08T06:59:00.000Z",
        );
        expect(zonedTimeToUtc(wall(2, 8, 3), NEW_YORK).toISOString()).toBe(
          "2026-03-08T07:00:00.000Z",
        );
      });
    });

    describe("zonedDragBounds across the zone's DST change", () => {
      const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

      it("keeps a moved event's elapsed duration when asked to", () => {
        // 23:00 on 30 October to 02:00 on the 31st in New York: three hours.
        const night: CalendarEvent = {
          start: utc("2026-10-31T03:00:00"),
          end: utc("2026-10-31T06:00:00"),
        };
        const [zoned] = eventsInTimeZone([night], NEW_YORK);
        // Dropped a day later, its span now holds the repeated hour.
        const moved = zonedDragBounds(zoned, at(31, 23), at(32, 2), { keepDuration: true });
        expect(moved.start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
        expect(moved.end.toISOString()).toBe("2026-11-01T06:00:00.000Z"); // 01:00 EST
        // A month drop keeps both clock times instead, so it gains the hour.
        const dropped = zonedDragBounds(zoned, at(31, 23), at(32, 2));
        expect(dropped.start.toISOString()).toBe("2026-11-01T03:00:00.000Z");
        expect(dropped.end.toISOString()).toBe("2026-11-01T07:00:00.000Z"); // 02:00 EST
      });

      it("resizes an end across the change to the zone's clock time", () => {
        // 23:00 to 23:30 on 31 October in New York.
        const late: CalendarEvent = {
          start: utc("2026-11-01T03:00:00"),
          end: utc("2026-11-01T03:30:00"),
        };
        const [zoned] = eventsInTimeZone([late], NEW_YORK);
        const resized = zonedDragBounds(zoned, zoned.start, at(32, 3), { keepDuration: true });
        expect(resized.start).toBe(late.start);
        expect(resized.end.toISOString()).toBe("2026-11-01T08:00:00.000Z"); // 03:00 EST
      });
    });
  },
);
