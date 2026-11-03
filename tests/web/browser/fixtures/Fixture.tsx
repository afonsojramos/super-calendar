import type { CalendarEvent, DateRange } from "@super-calendar/core/vanilla";
import {
  DatePicker,
  DateRangePicker,
  MonthList,
  TimeGrid,
  useFixtureState,
} from "@calendar-browser/adapter";

const anchor = new Date(2026, 6, 15);
const initialEvents: CalendarEvent[] = [
  { title: "Planning", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];
const theme = { text: "rgb(12, 34, 56)", cellHeight: 80, selectedBackground: "rgb(60, 90, 120)" };

export function Fixture() {
  const view = new URLSearchParams(location.search).get("view") ?? "months";
  const [updated, setUpdated] = useFixtureState(false);
  const [disabled, setDisabled] = useFixtureState(false);
  const [restricted, setRestricted] = useFixtureState(false);
  const [calls, setCalls] = useFixtureState<string[]>([]);
  const [date, setDate] = useFixtureState<Date | null>(anchor);
  const [range, setRange] = useFixtureState<DateRange | null>({
    start: anchor,
    end: new Date(2026, 6, 16),
  });
  const [events, setEvents] = useFixtureState(initialEvents);
  const [dragStarts, setDragStarts] = useFixtureState(0);
  const record = (call: string) => setCalls((previous) => [...previous, call]);

  return (
    <main>
      <nav>
        <button onClick={() => setUpdated(true)}>Update props</button>
        <button onClick={() => setRestricted(true)}>Restrict dates</button>
        <button onClick={() => setDisabled((value) => !value)}>Toggle disabled</button>
      </nav>
      {view === "months" ? (
        <MonthList
          date={anchor}
          pastMonths={0}
          futureMonths={120}
          height={400}
          weekStartsOn={updated() ? 0 : 1}
          theme={updated() ? theme : undefined}
          minDate={restricted() ? new Date(2026, 6, 16) : undefined}
          onPressDay={updated() ? () => record("current") : () => record("previous")}
        />
      ) : view === "picker" ? (
        <DatePicker
          value={date()}
          onChange={(next) => {
            setDate(next);
            record("select");
          }}
          disabled={disabled()}
          theme={updated() ? theme : undefined}
        />
      ) : view === "range" ? (
        <DateRangePicker
          value={range()}
          onChange={(next) => {
            setRange(next);
            record(next ? "select" : "clear");
          }}
          disabled={disabled()}
          theme={updated() ? theme : undefined}
        />
      ) : (
        <TimeGrid
          date={anchor}
          now={anchor}
          mode="week"
          weekStartsOn={1}
          events={events()}
          height={500}
          hourHeight={56}
          touchDragDelay={300}
          onDragStart={() => setDragStarts((count) => count + 1)}
          onDragEvent={(event, start, end) => {
            setEvents([{ ...event, start, end }]);
            record(
              `${start.getDate()}:${start.getHours()}:${start.getMinutes()}-${end.getHours()}:${end.getMinutes()}`,
            );
          }}
        />
      )}
      <output aria-label="Calls">{JSON.stringify(calls())}</output>
      <output aria-label="Drag starts">{dragStarts()}</output>
    </main>
  );
}
