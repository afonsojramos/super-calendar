import { type ICalEvent, parseICalendar, toICalendar } from "../ical";

const wrap = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n${body}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

describe("parseICalendar", () => {
  it("parses a timed UTC event with summary, description, and location", () => {
    const ics = wrap(
      [
        "UID:abc-123",
        "DTSTART:20260619T100000Z",
        "DTEND:20260619T113000Z",
        "SUMMARY:Lecture",
        "DESCRIPTION:Room notes",
        "LOCATION:Hall A",
      ].join("\r\n"),
    );
    const [event] = parseICalendar(ics);
    expect(event.uid).toBe("abc-123");
    expect(event.title).toBe("Lecture");
    expect(event.description).toBe("Room notes");
    expect(event.location).toBe("Hall A");
    expect(event.allDay).toBeUndefined();
    expect(event.start.toISOString()).toBe("2026-06-19T10:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-06-19T11:30:00.000Z");
  });

  it("treats VALUE=DATE as all-day and defaults a missing end to one day", () => {
    const ics = wrap(["DTSTART;VALUE=DATE:20260620", "SUMMARY:Holiday"].join("\r\n"));
    const [event] = parseICalendar(ics);
    expect(event.allDay).toBe(true);
    expect(event.start).toEqual(new Date(2026, 5, 20));
    expect(event.end).toEqual(new Date(2026, 5, 21));
  });

  it("derives the end from DURATION when DTEND is absent", () => {
    const ics = wrap(
      ["DTSTART:20260619T100000Z", "DURATION:PT1H30M", "SUMMARY:Workshop"].join("\r\n"),
    );
    const [event] = parseICalendar(ics);
    expect(event.start.toISOString()).toBe("2026-06-19T10:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-06-19T11:30:00.000Z");
  });

  it("prefers DTEND over DURATION when both are present", () => {
    const ics = wrap(
      ["DTSTART:20260619T100000Z", "DTEND:20260619T120000Z", "DURATION:PT1H", "SUMMARY:Both"].join(
        "\r\n",
      ),
    );
    const [event] = parseICalendar(ics);
    expect(event.end.toISOString()).toBe("2026-06-19T12:00:00.000Z");
  });

  it("resolves a TZID local time to the correct UTC instant", () => {
    // 09:00 on 19 Jun 2026 in New York is EDT (UTC-4) → 13:00 UTC.
    const ics = wrap(
      ["DTSTART;TZID=America/New_York:20260619T090000", "SUMMARY:Call"].join("\r\n"),
    );
    const [event] = parseICalendar(ics);
    expect(event.start.toISOString()).toBe("2026-06-19T13:00:00.000Z");
  });

  it("unescapes text and unfolds long lines", () => {
    const ics = wrap(
      [
        "DTSTART:20260101T090000Z",
        "SUMMARY:Sync\\, review\\; and plan",
        "DESCRIPTION:First line\\nsecond line that keeps going and going and go",
        " ing past the fold boundary",
      ].join("\r\n"),
    );
    const [event] = parseICalendar(ics);
    expect(event.title).toBe("Sync, review; and plan");
    expect(event.description).toBe(
      "First line\nsecond line that keeps going and going and going past the fold boundary",
    );
  });

  it("parses an RRULE into a RecurrenceRule", () => {
    const ics = wrap(
      [
        "DTSTART:20260101T090000Z",
        "SUMMARY:Standup",
        "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=6;BYDAY=MO,WE,FR",
      ].join("\r\n"),
    );
    const [event] = parseICalendar(ics);
    expect(event.recurrence).toEqual({
      freq: "weekly",
      interval: 2,
      count: 6,
      weekdays: [1, 3, 5],
    });
  });

  it("parses an ordinal BYDAY into an nthWeekday recurrence", () => {
    const ics = wrap(
      ["DTSTART:20260101T090000Z", "SUMMARY:Board", "RRULE:FREQ=MONTHLY;BYDAY=3MO"].join("\r\n"),
    );
    const [event] = parseICalendar(ics);
    expect(event.recurrence).toEqual({ freq: "monthly", nthWeekday: { week: 3, weekday: 1 } });
  });

  it("attaches EXDATE exception days to the recurrence", () => {
    const ics = wrap(
      [
        "DTSTART:20260101T090000Z",
        "SUMMARY:Standup",
        "RRULE:FREQ=DAILY;COUNT=5",
        "EXDATE:20260102T090000Z,20260104T090000Z",
      ].join("\r\n"),
    );
    const [event] = parseICalendar(ics);
    expect(event.recurrence?.exdates?.map((d) => d.toISOString())).toEqual([
      "2026-01-02T09:00:00.000Z",
      "2026-01-04T09:00:00.000Z",
    ]);
  });

  it("reads every VEVENT and skips other components", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/London",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "DTSTART:20260101T090000Z",
      "SUMMARY:One",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20260102T090000Z",
      "SUMMARY:Two",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseICalendar(ics).map((e) => e.title)).toEqual(["One", "Two"]);
  });
});

describe("toICalendar", () => {
  const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));

  it("serializes a timed event in UTC with a stable UID", () => {
    const ics = toICalendar(
      [
        {
          start: new Date(Date.UTC(2026, 5, 19, 10, 0, 0)),
          end: new Date(Date.UTC(2026, 5, 19, 11, 30, 0)),
          title: "Lecture",
        },
      ],
      { now },
    );
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260619T100000Z");
    expect(ics).toContain("DTEND:20260619T113000Z");
    expect(ics).toContain("SUMMARY:Lecture");
    expect(ics).toContain("DTSTAMP:20260101T000000Z");
    expect(ics).toContain("UID:20260619T100000Z-Lecture@super-calendar");
    expect(ics.includes("\r\n")).toBe(true); // CRLF line endings
  });

  it("serializes an all-day event with VALUE=DATE", () => {
    const ics = toICalendar(
      [
        {
          start: new Date(2026, 5, 20),
          end: new Date(2026, 5, 21),
          title: "Holiday",
          allDay: true,
        },
      ],
      { now },
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260620");
    expect(ics).toContain("DTEND;VALUE=DATE:20260621");
  });

  it("escapes text special characters", () => {
    const ics = toICalendar([{ start: now, end: now, title: "Sync, review; plan\nnext" }], { now });
    expect(ics).toContain("SUMMARY:Sync\\, review\\; plan\\nnext");
  });

  it("round-trips events through serialize then parse", () => {
    const events: ICalEvent[] = [
      {
        uid: "evt-1",
        start: new Date(Date.UTC(2026, 5, 19, 10, 0, 0)),
        end: new Date(Date.UTC(2026, 5, 19, 11, 30, 0)),
        title: "Weekly sync",
        location: "Room 2",
        recurrence: { freq: "weekly", interval: 1, weekdays: [1, 3] },
      },
    ];
    const [round] = parseICalendar(toICalendar(events, { now }));
    expect(round.uid).toBe("evt-1");
    expect(round.title).toBe("Weekly sync");
    expect(round.location).toBe("Room 2");
    expect(round.start.toISOString()).toBe(events[0].start.toISOString());
    expect(round.end.toISOString()).toBe(events[0].end.toISOString());
    expect(round.recurrence).toEqual({ freq: "weekly", weekdays: [1, 3] });
  });

  it("round-trips an ordinal-weekday (last Friday) recurrence", () => {
    const events: ICalEvent[] = [
      {
        start: new Date(Date.UTC(2026, 0, 30, 9, 0, 0)),
        end: new Date(Date.UTC(2026, 0, 30, 10, 0, 0)),
        title: "Payday",
        recurrence: { freq: "monthly", nthWeekday: { week: -1, weekday: 5 } },
      },
    ];
    const ics = toICalendar(events, { now });
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYDAY=-1FR");
    const [round] = parseICalendar(ics);
    expect(round.recurrence).toEqual({ freq: "monthly", nthWeekday: { week: -1, weekday: 5 } });
  });

  it("round-trips a BYMONTHDAY recurrence (including a negative last-day)", () => {
    const events: ICalEvent[] = [
      {
        start: new Date(Date.UTC(2026, 0, 1, 9, 0, 0)),
        end: new Date(Date.UTC(2026, 0, 1, 10, 0, 0)),
        title: "Payroll",
        recurrence: { freq: "monthly", monthDays: [1, 15, -1] },
      },
    ];
    const ics = toICalendar(events, { now });
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15,-1");
    const [round] = parseICalendar(ics);
    expect(round.recurrence).toEqual({ freq: "monthly", monthDays: [1, 15, -1] });
  });

  it("round-trips a yearly BYMONTH recurrence", () => {
    const events: ICalEvent[] = [
      {
        start: new Date(Date.UTC(2026, 0, 15, 9, 0, 0)),
        end: new Date(Date.UTC(2026, 0, 15, 10, 0, 0)),
        title: "Review",
        recurrence: { freq: "yearly", months: [3, 9] },
      },
    ];
    const ics = toICalendar(events, { now });
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=3,9");
    const [round] = parseICalendar(ics);
    expect(round.recurrence).toEqual({ freq: "yearly", months: [3, 9] });
  });

  it("round-trips RDATE additions", () => {
    const events: ICalEvent[] = [
      {
        start: new Date(Date.UTC(2026, 0, 1, 9, 0, 0)),
        end: new Date(Date.UTC(2026, 0, 1, 10, 0, 0)),
        title: "Standup",
        recurrence: { freq: "weekly", count: 2, rdates: [new Date(Date.UTC(2026, 0, 5, 9, 0, 0))] },
      },
    ];
    const ics = toICalendar(events, { now });
    expect(ics).toContain("RDATE:20260105T090000Z");
    const [round] = parseICalendar(ics);
    expect(round.recurrence?.rdates?.[0]?.toISOString()).toBe(
      new Date(Date.UTC(2026, 0, 5, 9, 0, 0)).toISOString(),
    );
  });
});
