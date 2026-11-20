import { renderToString, type JSX } from "@solidjs/web";
import type { CalendarMode, TimeGridMode } from "@super-calendar/core/vanilla";
import { traceImpureReads } from "../../../../tests/support/server-purity";
import {
  Agenda,
  Calendar,
  createMonthGrid,
  createNow,
  DatePicker,
  DateRangePicker,
  MonthList,
  MonthView,
  MultiWeekView,
  ResourceTimeline,
  TimeGrid,
  YearView,
} from "../index";

const date = new Date(2026, 6, 15);
const now = new Date(2026, 6, 15, 11, 30);
const timeZone = "Europe/Lisbon";
const events = [
  { title: "Planning", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
  { title: "Offsite", start: new Date(2026, 6, 16), end: new Date(2026, 6, 17), allDay: true },
];
const resources = [
  { id: "a", title: "Room A" },
  { id: "b", title: "Room B" },
];

// `renderToString` draws a request trace ID from `Math.random`; it never reaches the HTML.
const solidRequestTrace = /\bat traceFor \(.*@solidjs[/\\]web[/\\]/;

function expectPureServerRender(view: () => JSX.Element) {
  const { result, reads } = traceImpureReads(() => renderToString(view), {
    ignoreFrames: [solidRequestTrace],
  });
  expect(reads).toEqual([]);
  expect(result).toBeTypeOf("string");
}

const calendarModes: CalendarMode[] = [
  "month",
  "multiweek",
  "week",
  "day",
  "3days",
  "custom",
  "schedule",
  "year",
];
const timeGridModes: TimeGridMode[] = ["week", "day", "3days", "custom"];

describe("Solid server render purity", () => {
  it("traps clock, random and unguarded browser global reads", () => {
    const { reads } = traceImpureReads(() => {
      void Date.now();
      void new Date();
      void new Date(0);
      void Math.random();
      if (typeof window !== "undefined") throw new Error("window is defined on the server");
      return document.title;
    });
    expect(reads.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      "clock:Date.now()",
      "clock:new Date()",
      "random:Math.random()",
      "global:document",
    ]);
    expect(reads[0]!.stack).toContain("purity.ssr.test.tsx");
    expect(typeof Date.now()).toBe("number");
    expect(typeof navigator).toBe("object");
  });

  it.each(calendarModes)("renders Calendar in %s mode without impure reads", (mode) => {
    expectPureServerRender(() => (
      <Calendar
        mode={mode}
        date={date}
        now={now}
        timeZone={timeZone}
        events={events}
        numberOfDays={4}
      />
    ));
  });

  it.each(timeGridModes)("renders TimeGrid in %s mode without impure reads", (mode) => {
    expectPureServerRender(() => (
      <TimeGrid
        mode={mode}
        date={date}
        now={now}
        timeZone={timeZone}
        events={events}
        numberOfDays={4}
      />
    ));
  });

  it("renders MonthView without impure reads", () => {
    expectPureServerRender(() => (
      <MonthView date={date} now={now} timeZone={timeZone} events={events} />
    ));
  });

  it("renders MultiWeekView without impure reads", () => {
    expectPureServerRender(() => (
      <MultiWeekView date={date} now={now} timeZone={timeZone} events={events} numberOfWeeks={3} />
    ));
  });

  // MonthList has no `now` prop, so its today highlight reads the clock; that is
  // the only impure read it may make.
  it("renders MonthList reading only the clock", () => {
    const { result, reads } = traceImpureReads(
      () =>
        renderToString(() => (
          <MonthList date={date} events={events} pastMonths={1} futureMonths={2} />
        )),
      { ignoreFrames: [solidRequestTrace] },
    );
    expect(reads.filter(({ kind }) => kind !== "clock")).toEqual([]);
    expect(result).toContain("Planning");
  });

  it("renders Agenda without impure reads", () => {
    expectPureServerRender(() => <Agenda now={now} timeZone={timeZone} events={events} />);
  });

  it("renders YearView without impure reads", () => {
    expectPureServerRender(() => (
      <YearView date={date} now={now} timeZone={timeZone} events={events} />
    ));
  });

  it.each(["horizontal", "vertical"] as const)(
    "renders ResourceTimeline in %s orientation without impure reads",
    (orientation) => {
      expectPureServerRender(() => (
        <ResourceTimeline
          date={date}
          now={now}
          timeZone={timeZone}
          events={events}
          resources={resources}
          resourceId={(event) => (event.title === "Planning" ? "a" : "b")}
          orientation={orientation}
        />
      ));
    },
  );

  it.each([date, null])("renders DatePicker with value %s without impure reads", (value) => {
    expectPureServerRender(() => <DatePicker value={value} onChange={() => {}} />);
  });

  it.each([{ start: date, end: new Date(2026, 6, 18) }, null])(
    "renders DateRangePicker with value %o without impure reads",
    (value) => {
      expectPureServerRender(() => <DateRangePicker value={value} onChange={() => {}} />);
    },
  );

  it("creates state primitives without impure reads", () => {
    expectPureServerRender(() => {
      const clock = createNow(() => ({ now, timeZone }));
      const grid = createMonthGrid(
        () => date,
        () => ({ today: now }),
      );
      return (
        <p>
          {clock().toISOString()} {grid().weeks.length}
        </p>
      );
    });
  });
});
