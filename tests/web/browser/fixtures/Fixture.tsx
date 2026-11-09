import type { CalendarEvent, CreateGhostArgs, DateRange } from "@super-calendar/core/vanilla";
import {
  Calendar,
  DatePicker,
  DateRangePicker,
  MonthList,
  ResourceTimeline,
  TimeGrid,
  useFixtureMount,
  useFixtureState,
} from "@calendar-browser/adapter";

const anchor = new Date(2026, 6, 15);
type FixtureEvent = CalendarEvent<{ id: number }>;
const initialEvents: FixtureEvent[] = [
  { id: 0, title: "Planning", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];
const recurringEvents: FixtureEvent[] = [
  { ...initialEvents[0], recurrence: { freq: "daily", count: 1 } },
];
const denseEvents: FixtureEvent[] = Array.from({ length: 1000 }, (_, index) => {
  const start = new Date(
    2026,
    6,
    13 + (index % 7),
    9 + (Math.floor(index / 7) % 8),
    (index % 4) * 15,
  );
  return {
    id: index,
    title: `Event ${index}`,
    start,
    end: new Date(start.getTime() + 30 * 60_000),
  };
});
// Editing scenarios: an editable event beside a neighbour it can overlap, a
// one-step event at the minimum duration, and events locked in different ways.
const editEvents: FixtureEvent[] = [
  { id: 0, title: "Planning", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
  { id: 1, title: "Standup", start: new Date(2026, 6, 15, 10), end: new Date(2026, 6, 15, 10, 30) },
  { id: 2, title: "Short", start: new Date(2026, 6, 16, 9), end: new Date(2026, 6, 16, 9, 15) },
  {
    id: 3,
    title: "Fixed start",
    start: new Date(2026, 6, 17, 9),
    end: new Date(2026, 6, 17, 10),
    startEditable: false,
  },
  {
    id: 4,
    title: "Locked",
    start: new Date(2026, 6, 14, 9),
    end: new Date(2026, 6, 14, 10),
    draggable: false,
  },
  {
    id: 5,
    title: "Quarterly planning review with the regional operations leadership team",
    start: new Date(2026, 6, 18, 9),
    end: new Date(2026, 6, 18, 10),
  },
];
const resources = [
  { id: "a", title: "Room A" },
  { id: "b", title: "Room B" },
  { id: "c", title: "Room C" },
];
const crowdedEvents: FixtureEvent[] = ["First", "Second", "Third"].map((title, id) => ({
  id,
  title,
  start: new Date(2026, 6, 15, 9),
  end: new Date(2026, 6, 15, 10),
}));
const manyEvents: FixtureEvent[] = Array.from({ length: 12 }, (_, id) => ({
  id,
  title:
    id === 0
      ? "https://meet.example.com/quarterlyoperationsreviewwithregionalleadershipandcustomerteams2026"
      : `Planning session ${id + 1} with the regional operations leadership team`,
  start: new Date(2026, 6, 15, 9),
  end: new Date(2026, 6, 15, 10),
}));
const clippedEvents: FixtureEvent[] = [
  { id: 0, title: "Morning", start: new Date(2026, 6, 15, 7), end: new Date(2026, 6, 15, 9) },
  { id: 1, title: "Overnight", start: new Date(2026, 6, 15, 22), end: new Date(2026, 6, 16, 10) },
];
type ResourceEvent = CalendarEvent<{ id: number; resourceId: string }>;
const crowdedBookings: ResourceEvent[] = crowdedEvents.map((event) => ({
  ...event,
  resourceId: "a",
}));
const manyBookings: ResourceEvent[] = manyEvents.map((event) => ({ ...event, resourceId: "a" }));
const resourceEvents: ResourceEvent[] = [
  {
    id: 0,
    title: "Planning",
    resourceId: "a",
    start: new Date(2026, 6, 15, 9),
    end: new Date(2026, 6, 15, 10),
  },
  {
    id: 1,
    title: "Locked",
    resourceId: "b",
    start: new Date(2026, 6, 15, 12),
    end: new Date(2026, 6, 15, 13),
    draggable: false,
  },
];
const clock = (date: Date) => `${date.getDate()}:${date.getHours()}:${date.getMinutes()}`;
const theme = { text: "rgb(12, 34, 56)", cellHeight: 80, selectedBackground: "rgb(60, 90, 120)" };
// Custom create-preview content: the live range, an unbroken word wider than
// any preview, and a control that must stay unreachable.
const Draft = (props: CreateGhostArgs & { resource?: { id: string } }) => (
  <div>
    <strong>{`Draft ${props.resource ? `${props.resource.id} ` : ""}${clock(props.start)}-${clock(props.end)}`}</strong>
    <span>{"Quarterlyoperationsreviewwithregionalleadership".repeat(4)}</span>
    <button>Draft action</button>
  </div>
);
const FocusingDraft = (props: CreateGhostArgs & { resource?: { id: string } }) => {
  let button: HTMLButtonElement | null = null;
  // Solid refs run before attachment, so also attempt focus in its mount effect.
  useFixtureMount(() => {
    document.body.dataset.draftFocusConnected = String(button?.isConnected);
    button?.focus();
  });
  return (
    <div>
      <Draft {...props} />
      <button
        ref={(element) => {
          button = element;
          element?.focus();
        }}
      >
        Focus on mount
      </button>
    </div>
  );
};
const missingEventId = (): string | number => {
  // @ts-expect-error Simulate a JavaScript consumer returning an invalid ID.
  return undefined;
};

export function Fixture() {
  const view = new URLSearchParams(location.search).get("view") ?? "months";
  const unavailable = view.endsWith("-unavailable");
  const constrained = unavailable || view.endsWith("-constrained");
  const minDate = unavailable
    ? new Date(2026, 7, 1)
    : constrained
      ? new Date(2026, 6, 5)
      : undefined;
  const EditableGrid = view.startsWith("calendar-actions") ? Calendar : TimeGrid;
  const [updated, setUpdated] = useFixtureState(false);
  const [disabled, setDisabled] = useFixtureState(false);
  const [restricted, setRestricted] = useFixtureState(false);
  const [calls, setCalls] = useFixtureState<string[]>([]);
  const [createdEvents, setCreatedEvents] = useFixtureState<FixtureEvent[]>([]);
  const [date, setDate] = useFixtureState<Date | null>(constrained ? new Date(2026, 6, 1) : anchor);
  const [range, setRange] = useFixtureState<DateRange | null>({
    start: constrained ? new Date(2026, 6, 1) : anchor,
    end: new Date(2026, 6, 16),
  });
  const [events, setEvents] = useFixtureState(
    view === "multiweek-transformed"
      ? recurringEvents
      : view === "dense"
        ? denseEvents
        : view === "edit-clipped"
          ? clippedEvents
          : view === "edit-crowded"
            ? crowdedEvents
            : view === "edit-many" || (view.startsWith("multiweek") && view.endsWith("dense"))
              ? manyEvents
              : view === "edit"
                ? editEvents
                : initialEvents,
  );
  const [boardEvents, setBoardEvents] = useFixtureState(
    view.endsWith("crowded")
      ? crowdedBookings
      : view.endsWith("many")
        ? manyBookings
        : resourceEvents,
  );
  const [rejecting, setRejecting] = useFixtureState(false);
  const [overlapping, setOverlapping] = useFixtureState(true);
  const [editing, setEditing] = useFixtureState(true);
  const [revision, setRevision] = useFixtureState(0);
  const [dragStarts, setDragStarts] = useFixtureState(0);
  const record = (call: string) => setCalls((previous) => [...previous, call]);

  return (
    <main>
      <nav>
        <button onClick={() => setUpdated(true)}>Update props</button>
        <button onClick={() => setRestricted(true)}>Restrict dates</button>
        <button onClick={() => setDisabled((value) => !value)}>Toggle disabled</button>
        <button onClick={() => setRejecting((value) => !value)}>Toggle rejection</button>
        <button onClick={() => setOverlapping((value) => !value)}>Toggle overlap</button>
        <button onClick={() => setEditing((value) => !value)}>Toggle editing</button>
        <button
          onClick={() => {
            setEvents((current) => [...current].reverse());
            setBoardEvents((current) => [...current].reverse());
          }}
        >
          Reverse events
        </button>
        <button
          onClick={() => {
            const refresh = <T extends CalendarEvent>(event: T) => ({
              ...event,
              title: `${event.title} refreshed`,
              start: new Date(event.start.getTime() + 60 * 60_000),
              end: new Date(event.end.getTime() + 60 * 60_000),
            });
            setEvents((current) => current.map(refresh));
            setBoardEvents((current) => current.map(refresh));
          }}
        >
          Refresh events
        </button>
        <button
          onClick={() => {
            setEvents((current) => [...current, { ...current[0] }]);
            setBoardEvents((current) => [...current, { ...current[0] }]);
          }}
        >
          Duplicate event ID
        </button>
        <button
          onClick={() => {
            setEvents([]);
            setBoardEvents([]);
          }}
        >
          Remove events
        </button>
        {view === "dense" ? (
          <button
            onClick={() => {
              setEvents((current) =>
                current.map((event) => ({ ...event, title: `${event.title}!` })),
              );
              setRevision((current) => current + 1);
            }}
          >
            Update events
          </button>
        ) : null}
      </nav>
      {view.startsWith("multiweek") ? (
        <Calendar
          mode="multiweek"
          date={date() ?? anchor}
          numberOfWeeks={updated() ? 3 : view.includes("eight") ? 8 : 2}
          weekStartsOn={1}
          hiddenDays={restricted() ? [0, 6] : undefined}
          maxDate={view === "multiweek-disabled-next" ? new Date(2026, 6, 26) : undefined}
          isDateDisabled={disabled() ? (day) => day.getDate() === 16 : undefined}
          height={view.includes("eight") ? 260 : 300}
          events={events()}
          timeZone={view === "multiweek-transformed" ? "Europe/Lisbon" : undefined}
          onDragStart={
            view === "multiweek-transformed" ? () => setDragStarts((count) => count + 1) : undefined
          }
          selectedRange={view === "multiweek-selection" ? (range() ?? undefined) : undefined}
          onSelectDrag={
            view === "multiweek-selection" ? (start, end) => setRange({ start, end }) : undefined
          }
          keyboardDayNavigation
          onChangeDate={setDate}
          onCreateEvent={(start, end) => record(`${clock(start)}-${clock(end)}`)}
          onDragEvent={(event, start, end) => {
            record(`${event.title}@${clock(start)}-${clock(end)}`);
          }}
        />
      ) : view === "months" ? (
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
      ) : view.startsWith("picker") ? (
        <DatePicker
          value={date()}
          minDate={minDate}
          onChange={(next) => {
            setDate(next);
            record("select");
          }}
          disabled={disabled()}
          theme={updated() ? theme : undefined}
        />
      ) : view.startsWith("range") ? (
        <DateRangePicker
          value={range()}
          minDate={minDate}
          onChange={(next) => {
            setRange(next);
            record(next ? "select" : "clear");
          }}
          disabled={disabled()}
          theme={updated() ? theme : undefined}
        />
      ) : view.startsWith("edit") || view.startsWith("calendar-actions") ? (
        <EditableGrid<{ id: number }>
          date={anchor}
          onChangeDate={(next) => record(`page:${clock(next)}`)}
          now={anchor}
          mode="week"
          weekStartsOn={1}
          events={events()}
          getEventId={
            view.endsWith("-invalid-id")
              ? missingEventId
              : view.endsWith("-stable")
                ? (event) => event.id
                : undefined
          }
          height={500}
          hourHeight={56}
          minHour={view === "edit-clipped" ? 8 : undefined}
          maxHour={view === "edit-clipped" ? 18 : undefined}
          eventOverlap={overlapping()}
          onPressEvent={(event) => record(`press:${event.title}`)}
          onPressCell={() => record("cell")}
          onDragStart={() => setDragStarts((count) => count + 1)}
          onDragEvent={
            editing()
              ? (event, start, end) => {
                  record(`${event.title}@${clock(start)}-${clock(end)}`);
                  if (rejecting()) return false;
                  setEvents((current) =>
                    current.map((item) => (item === event ? { ...item, start, end } : item)),
                  );
                }
              : undefined
          }
        />
      ) : view.startsWith("resources") ? (
        <ResourceTimeline<{ id: number; resourceId: string }>
          date={anchor}
          now={anchor}
          orientation={view.includes("vertical") ? "vertical" : "horizontal"}
          resources={resources}
          events={boardEvents()}
          getEventId={
            view.endsWith("-invalid-id")
              ? missingEventId
              : view.endsWith("-stable")
                ? (event) => event.id
                : undefined
          }
          startHour={8}
          endHour={14}
          onPressEvent={(event) => record(`press:${event.title}`)}
          onDragEvent={
            editing()
              ? (event, start, end, resource) => {
                  record(`${event.title}@${clock(start)}-${clock(end)}@${resource.id}`);
                  if (rejecting()) return false;
                  setBoardEvents((current) =>
                    current.map((item) =>
                      item === event ? { ...item, start, end, resourceId: resource.id } : item,
                    ),
                  );
                }
              : undefined
          }
        />
      ) : view.startsWith("snap-") ? (
        <TimeGrid<{ id: number }>
          date={view.includes("dst") ? new Date(2026, 2, 29) : anchor}
          now={anchor}
          mode={view.includes("week") ? "week" : "day"}
          weekStartsOn={1}
          events={createdEvents()}
          height={700}
          hourHeight={view.includes("default") || view.includes("minimum") ? undefined : 60}
          minEventHeight={view.includes("minimum") ? 28 : undefined}
          minHour={view.includes("dst") ? 0 : view.includes("fractional") ? 8.1 : 8}
          maxHour={view.includes("dst") ? 6 : 14}
          dragStepMinutes={view.includes("30") ? 30 : 15}
          renderCreateGhost={view.includes("content") ? Draft : undefined}
          onCreateEvent={(start, end) => {
            record(`${clock(start)}-${clock(end)}`);
            setCreatedEvents([{ id: 1, title: "Created", start, end }]);
          }}
        />
      ) : view.startsWith("create") ? (
        // Create-by-drag scenarios. The whole column fits in the viewport, so a
        // pointer can overshoot it in either direction. `-window` narrows the
        // visible hours; `-classed` and `-styled` restyle the preview's border.
        <TimeGrid<{ id: number }>
          date={anchor}
          now={anchor}
          mode={view.startsWith("create-day") ? "day" : "week"}
          weekStartsOn={1}
          events={[]}
          height={700}
          hourHeight={24}
          minHour={view.endsWith("-window") ? 8 : undefined}
          maxHour={view.endsWith("-window") ? 18 : undefined}
          classNames={view.endsWith("-classed") ? { createGhost: "fixture-ghost" } : undefined}
          styles={
            view.endsWith("-styled")
              ? { createGhost: { border: "3px solid rgb(60, 90, 120)" } }
              : undefined
          }
          onCreateEvent={(start, end) => record(`${clock(start)}-${clock(end)}`)}
        />
      ) : view.startsWith("draft-resources") ? (
        // Create-preview content on the resource timeline, along either axis.
        <ResourceTimeline<{ id: number; resourceId: string }>
          className="fixture-resource-scroll"
          date={anchor}
          now={anchor}
          orientation={view.includes("-vertical") ? "vertical" : "horizontal"}
          resources={resources}
          events={[]}
          style={view.endsWith("-scrolled") ? { height: 240 } : undefined}
          startHour={8}
          endHour={view.endsWith("-scrolled") ? 24 : 14}
          onCreateEvent={(start, end, resource) =>
            record(`${clock(start)}-${clock(end)}@${resource.id}`)
          }
          renderCreateGhost={view.endsWith("-focus") ? FocusingDraft : Draft}
        />
      ) : view.startsWith("draft") ? (
        // Create-preview content on the time grid. `-window` narrows the visible
        // hours; `-scrolled` makes the column taller than the viewport, which
        // opens scrolled to 08:00.
        <TimeGrid<{ id: number }>
          date={anchor}
          now={anchor}
          mode="day"
          events={[]}
          height={700}
          hourHeight={view.endsWith("-scrolled") ? 48 : 24}
          minHour={view.endsWith("-window") ? 8 : undefined}
          maxHour={view.endsWith("-window") ? 18 : undefined}
          onCreateEvent={(start, end) => record(`${clock(start)}-${clock(end)}`)}
          renderCreateGhost={view.endsWith("-focus") ? FocusingDraft : Draft}
        />
      ) : (
        <TimeGrid<{ id: number }>
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
      {view === "multiweek-selection" ? (
        <output aria-label="Selection">
          {range()?.end ? `${clock(range()!.start)}-${clock(range()!.end!)}` : ""}
        </output>
      ) : null}
      <output aria-label="Drag starts">{dragStarts()}</output>
      <output aria-label="Revision">{revision()}</output>
    </main>
  );
}
