import { createSignal, For, Show, untrack } from "solid-js";
import { addDays, addMonths, addWeeks, addYears, format } from "date-fns";
import { FeedExample } from "./FeedExample";
import {
  Calendar,
  buildMultiWeekGrid,
  DatePicker,
  DateRangePicker,
  MonthList,
  ResourceTimeline,
  createDateRange,
  darkSolidTheme,
  type CalendarEvent,
  type CalendarMode,
  type CreateGhostArgs,
} from "@super-calendar/solid";

const anchor = new Date(2026, 10, 2);
const at = (day: number, hour = 0) => new Date(2026, 10, day, hour);
const initialEvents: CalendarEvent<{ room: string }>[] = [
  { title: "Planning", start: at(2, 9), end: at(2, 10), room: "a" },
  { title: "Design review", start: at(2, 10), end: at(2, 12), room: "b" },
  { title: "Project time", start: at(3, 14), end: at(3, 16), room: "a" },
  { title: "Team day", start: at(4), end: at(5), room: "b" },
  { title: "Unavailable", start: at(2, 12), end: at(2, 13), display: "background", room: "a" },
];
const modes: CalendarMode[] = [
  "month",
  "multiweek",
  "week",
  "day",
  "3days",
  "custom",
  "schedule",
  "year",
];
const views = [...modes, "months", "resources", "feed"];
const pickerStyles = {
  popover: {
    bottom: "calc(100% + 6px)",
    marginTop: 0,
    minWidth: 0,
    width: "min(300px, calc(100vw - 36px))",
  },
};

// Drag-to-create preview content: the draft's title and live time range, the
// same range onCreateEvent receives on release.
function DraftPreview(props: CreateGhostArgs) {
  return (
    <div class="draft">
      <strong>New event</strong>
      <div>{`${format(props.start, "HH:mm")} - ${format(props.end, "HH:mm")}`}</div>
    </div>
  );
}

function MonthDraft(props: CreateGhostArgs) {
  const range = () => {
    const last = addDays(props.end, -1);
    return props.start.getTime() === last.getTime()
      ? format(props.start, "MMM d")
      : `${format(props.start, "MMM d")} to ${format(last, "MMM d")}`;
  };
  return (
    <span
      style={{
        display: "block",
        padding: "0 3px",
        "font-size": "11px",
        "font-weight": 600,
        "white-space": "nowrap",
        overflow: "hidden",
        "text-overflow": "ellipsis",
      }}
    >{`Draft: ${range()}`}</span>
  );
}

export function viewFromSearch(search: string) {
  const requested = new URLSearchParams(search).get("view");
  return views.find((value) => value === requested) ?? "week";
}

export function App(props: { initialView?: string }) {
  const [date, setDate] = createSignal(anchor);
  const [numberOfWeeks, setNumberOfWeeks] = createSignal(2);
  const [view, setView] = createSignal(untrack(() => props.initialView ?? "week"));
  const [events, setEvents] = createSignal(initialEvents);
  const [dark, setDark] = createSignal(false);
  const [vertical, setVertical] = createSignal(false);
  const [status, setStatus] = createSignal("Drag an event to move it. Drag an edge to resize it.");
  const selection = createDateRange();
  const mode = () => modes.find((value) => value === view()) ?? "week";
  const theme = () => (dark() ? darkSolidTheme : undefined);
  const move = (event: CalendarEvent<{ room: string }>, start: Date, end: Date) => {
    setEvents((current) =>
      current.map((item) => (item === event ? { ...item, start, end } : item)),
    );
    setStatus(
      `${event.title} moved to ${format(start, "EEE d MMM, HH:mm")}–${format(end, "HH:mm")}`,
    );
  };
  const create = (start: Date, end: Date) => {
    setEvents((current) => [...current, { title: "New event", start, end, room: "a" }]);
    setStatus(`Created an event for ${format(start, "EEE d MMM, HH:mm")}`);
  };
  const page = (direction: number) =>
    setDate((current) =>
      mode() === "multiweek"
        ? addWeeks(current, direction * numberOfWeeks())
        : mode() === "year"
          ? addYears(current, direction)
          : mode() === "month"
            ? addMonths(current, direction)
            : addDays(current, direction * (mode() === "day" ? 1 : 7)),
    );

  const periodLabel = () => {
    if (mode() !== "multiweek") return format(date(), "MMMM yyyy");
    const { visibleRange } = buildMultiWeekGrid(date(), {
      numberOfWeeks: numberOfWeeks(),
      weekStartsOn: 1,
    });
    return `${format(visibleRange.start, "PP")} - ${format(addDays(visibleRange.endExclusive, -1), "PP")}`;
  };

  return (
    <main data-theme={dark() ? "dark" : "light"}>
      <header>
        <div>
          <p class="eyebrow">Super Calendar</p>
          <h1>Your week, in view.</h1>
          <p>Solid 2.0 example</p>
        </div>
        <button onClick={() => setDark((value) => !value)}>Switch theme</button>
      </header>
      <nav aria-label="Calendar controls">
        <div class="navigation">
          <button aria-label="Previous period" onClick={() => page(-1)}>
            ←
          </button>
          <strong data-testid="visible-period">{periodLabel()}</strong>
          <button aria-label="Next period" onClick={() => page(1)}>
            →
          </button>
        </div>
        <label>
          View{" "}
          <select
            aria-label="View"
            value={view()}
            onChange={(event) => setView(event.currentTarget.value)}
          >
            <For each={views}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </label>
        <Show when={mode() === "multiweek"}>
          <label>
            Weeks{" "}
            <select
              aria-label="Weeks"
              value={numberOfWeeks()}
              onChange={(event) => setNumberOfWeeks(Number(event.currentTarget.value))}
            >
              <For each={[2, 3, 4]}>{(count) => <option value={count}>{count}</option>}</For>
            </select>
          </label>
        </Show>
      </nav>
      <section class="calendar" aria-label="Interactive calendar">
        <Show
          when={view() === "feed"}
          fallback={
            <Show
              when={view() === "resources"}
              fallback={
                <Show
                  when={view() === "months"}
                  fallback={
                    <Calendar
                      date={date()}
                      mode={mode()}
                      events={events()}
                      onChangeDate={setDate}
                      theme={theme()}
                      now={anchor}
                      height={560}
                      minHour={7}
                      maxHour={20}
                      hourHeight={56}
                      weekStartsOn={1}
                      numberOfDays={5}
                      numberOfWeeks={numberOfWeeks()}
                      showAllDayLabel
                      keyboardDayNavigation
                      keyboardEventNavigation
                      onPressDay={selection.onPressDate}
                      selectedRange={selection.range() ?? undefined}
                      onSelectDrag={selection.selectRange}
                      onDragEvent={move}
                      onCreateEvent={create}
                      renderCreateGhost={
                        mode() === "month" || mode() === "multiweek" ? MonthDraft : DraftPreview
                      }
                      onPressEvent={(event) => setStatus(`Selected ${event.title}`)}
                    />
                  }
                >
                  <MonthList
                    date={date()}
                    events={events()}
                    theme={theme()}
                    height={560}
                    selectedRange={selection.range() ?? undefined}
                    onPressDay={selection.onPressDate}
                  />
                </Show>
              }
            >
              <label class="orientation">
                <input
                  type="checkbox"
                  checked={vertical()}
                  onChange={(event) => setVertical(event.currentTarget.checked)}
                />{" "}
                Vertical resources
              </label>
              <ResourceTimeline
                date={date()}
                events={events()}
                resources={[
                  { id: "a", title: "Studio" },
                  { id: "b", title: "Meeting room" },
                ]}
                resourceId={(event) => event.room}
                orientation={vertical() ? "vertical" : "horizontal"}
                startHour={7}
                endHour={20}
                theme={theme()}
                now={anchor}
                onPressEvent={(event) => setStatus(`Selected ${event.title}`)}
                onDragEvent={(event, start, end, resource) => {
                  setEvents((current) =>
                    current.map((item) =>
                      item === event ? { ...item, start, end, room: resource.id } : item,
                    ),
                  );
                  setStatus(`Moved ${event.title} to ${resource.title}`);
                }}
              />
            </Show>
          }
        >
          <FeedExample date={date()} theme={theme()} />
        </Show>
      </section>
      <div class="pickers">
        <label>
          Jump to date{" "}
          <DatePicker value={date()} onChange={setDate} theme={theme()} styles={pickerStyles} />
        </label>
        <label>
          Select a range{" "}
          <DateRangePicker
            value={selection.range()}
            onChange={selection.setRange}
            theme={theme()}
            styles={pickerStyles}
          />
        </label>
      </div>
      <p role="status">{status()}</p>
    </main>
  );
}
