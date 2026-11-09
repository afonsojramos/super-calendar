import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { addDays } from "date-fns";
import { Calendar, useFixtureState } from "@calendar-browser/adapter";

type Event = CalendarEvent<{ id: number }>;
const anchor = new Date(2026, 6, 15);
const initial: Event[] = [
  { id: 0, title: "Planning", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];
const clock = (date: Date) => `${date.getDate()}:${date.getHours()}:${date.getMinutes()}`;

export function PerformanceFixture() {
  const [date, setDate] = useFixtureState(anchor);
  const [mode, setMode] = useFixtureState<"week" | "month">("week");
  const [events, setEvents] = useFixtureState(initial);
  const [committed, setCommitted] = useFixtureState("");
  return (
    <main>
      <nav>
        <button
          data-perf="next"
          onClick={() => {
            setDate((current) => addDays(current, 7));
            setEvents((current) =>
              current.map((event) => ({
                ...event,
                start: addDays(event.start, 7),
                end: addDays(event.end, 7),
              })),
            );
          }}
        >
          Next week
        </button>
        <button data-perf="month" onClick={() => setMode("month")}>
          Show month
        </button>
      </nav>
      <Calendar<Event>
        date={date()}
        onChangeDate={setDate}
        mode={mode()}
        now={anchor}
        events={events()}
        getEventId={(event) => event.id}
        weekStartsOn={1}
        height={500}
        hourHeight={56}
        minHour={8}
        maxHour={18}
        onDragEvent={(event, start, end) => {
          setEvents((current) =>
            current.map((item) => (item.id === event.id ? { ...item, start, end } : item)),
          );
          setCommitted(`${clock(start)}-${clock(end)}`);
        }}
        onCreateEvent={(start, end) => {
          setEvents((current) => [
            ...current,
            { id: current.length, title: "Created", start, end },
          ]);
          setCommitted(`${clock(start)}-${clock(end)}`);
        }}
      />
      <output data-perf="date">{date().getDate()}</output>
      <output data-perf="committed">{committed()}</output>
    </main>
  );
}
