import { addDays, addMonths, addWeeks, addYears, format } from "date-fns";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  type CalendarEvent,
  type CalendarSlot,
  type DateRange,
  DateRangePicker,
  expandRecurringEvents,
  getViewDays,
  MonthList,
  parseICalendar,
  type Resource,
  ResourceTimeline,
  toICalendar,
  useDateRange,
} from "@super-calendar/dom";

import { type EventMenuActions, EventMenuProvider } from "@super-calendar/example-shared";
import { buildEvents, type EventMeta } from "@super-calendar/example-shared/events";
import { EventContextMenu } from "./EventContextMenu";

// The grid views step by a fixed period (toolbar + letter keys). "schedule" is the
// agenda list, and picker/list are scrolling MonthLists, so they sit outside it.
const MODES = ["year", "month", "week", "3days", "day"] as const;
type CalendarTab = (typeof MODES)[number];
type DemoTab =
  | CalendarTab
  | "schedule"
  | "picker"
  | "list"
  | "tailwind"
  | "field"
  | "resource"
  | "recurring"
  | "ics";
const TABS: DemoTab[] = [
  ...MODES,
  "schedule",
  "picker",
  "list",
  "tailwind",
  "field",
  "resource",
  "recurring",
  "ics",
];

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260619T090000
DURATION:PT1H
SUMMARY:Imported standup
LOCATION:Room A
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260620
SUMMARY:Imported holiday
END:VEVENT
END:VCALENDAR`;

// Rooms for the resource-timeline demo; events are spread across them by id.
const ROOMS: Resource[] = [
  { id: "room-a", title: "Room A" },
  { id: "room-b", title: "Room B" },
  { id: "room-c", title: "Room C" },
  { id: "room-d", title: "Room D" },
  { id: "room-e", title: "Room E" },
];
// Lanes per page on the resource board (see the pager above the board).
const ROOMS_PER_PAGE = 3;
const ROOM_PAGES = Math.ceil(ROOMS.length / ROOMS_PER_PAGE);
const WEEK_STARTS_ON = 1;

// A fully Tailwind-styled month, restyled entirely through per-slot `classNames`
// and `data-*` state variants — no theme object, no inline styles. Structural
// layout (the grid) is kept by the library; these classes own the look.
const TAILWIND_SLOTS: Partial<Record<CalendarSlot, string>> = {
  title: "text-center text-xl font-bold text-indigo-900 py-3",
  weekdays: "border-b border-indigo-100",
  weekday: "text-center text-[11px] font-semibold uppercase tracking-wider text-indigo-400 py-1.5",
  day: "transition-colors hover:bg-indigo-50/70",
  dayBadge:
    "text-sm rounded-full data-[today]:bg-indigo-600 data-[today]:text-white data-[outside]:text-slate-300",
  chip: "block truncate rounded bg-indigo-100 px-1.5 text-[11px] font-semibold leading-[18px] text-indigo-800",
  more: "px-1.5 text-[11px] font-semibold text-indigo-400",
};

// The dom Calendar is fully controlled by `date`, so the example owns navigation.
// Step the anchor by the period the current mode shows.
function stepDate(date: Date, mode: CalendarTab, dir: 1 | -1): Date {
  if (mode === "year") return addYears(date, dir);
  if (mode === "month") return addMonths(date, dir);
  if (mode === "week") return addWeeks(date, dir);
  if (mode === "3days") return addDays(date, dir * 3);
  return addDays(date, dir);
}

// Label for the visible period, matching exactly what the grid renders.
function periodLabel(date: Date, mode: CalendarTab): string {
  if (mode === "year") return format(date, "yyyy");
  if (mode === "month") return format(date, "MMMM yyyy");
  if (mode === "day") return format(date, "EEE, d MMM yyyy");
  const days = getViewDays(mode, date, WEEK_STARTS_ON);
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth();
  return sameMonth
    ? `${format(first, "d")} - ${format(last, "d MMM yyyy")}`
    : `${format(first, "d MMM")} - ${format(last, "d MMM yyyy")}`;
}

function isCalendarTab(tab: DemoTab): tab is CalendarTab {
  return (MODES as readonly string[]).includes(tab);
}

function rangeLabel(range: { start: Date; end?: Date | null } | null): string {
  if (!range) return "Tap a start date";
  const start = range.start.toLocaleDateString();
  if (!range.end) return `${start} → tap an end date`;
  return `${start} → ${range.end.toLocaleDateString()}`;
}

function shiftedDate(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

export function App() {
  const [mode, setMode] = useState<DemoTab>("week");
  const [date, setDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent<EventMeta>[]>(buildEvents);
  const pickerMinDate = useMemo(() => new Date(), []);
  const { range, onPressDate, reset } = useDateRange({ minDate: pickerMinDate });
  const [rangeValue, setRangeValue] = useState<DateRange | null>(null);
  const [roomPage, setRoomPage] = useState(0);
  const [icsText, setIcsText] = useState(SAMPLE_ICS);
  // Tracks the phone-width breakpoint reactively for the resource tab.
  const [narrowViewport, setNarrowViewport] = useState(
    () => window.matchMedia("(max-width: 600px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const onChange = (e: MediaQueryListEvent) => setNarrowViewport(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const importedIcs = useMemo(() => {
    try {
      return parseICalendar(icsText);
    } catch {
      return [];
    }
  }, [icsText]);
  // Rules for the "recurring" tab, expanded to concrete occurrences around the
  // visible month so paging re-materialises them. Shows BYMONTHDAY, weekly BYDAY,
  // and yearly BYMONTH from the recurrence engine.
  const recurringEvents = useMemo(() => {
    const rules: CalendarEvent[] = [
      {
        title: "Payroll",
        start: new Date(2026, 0, 1, 9),
        end: new Date(2026, 0, 1, 10),
        recurrence: { freq: "monthly", monthDays: [1, 15] },
      },
      {
        title: "Team lunch",
        start: new Date(2026, 0, 2, 12),
        end: new Date(2026, 0, 2, 13),
        recurrence: { freq: "weekly", weekdays: [5] },
      },
      {
        title: "Quarterly review",
        start: new Date(2026, 0, 15, 15),
        end: new Date(2026, 0, 15, 16),
        recurrence: { freq: "yearly", months: [1, 4, 7, 10] },
      },
    ];
    return expandRecurringEvents(rules, addMonths(date, -1), addMonths(date, 1));
  }, [date]);

  const exportIcs = () => {
    const blob = new Blob([toICalendar(events)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "super-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Actions the right-click menu performs; matched back to events by id.
  const menuActions = useMemo<EventMenuActions>(
    () => ({
      shift: (event, minutes) =>
        setEvents((prev) =>
          prev.map((e) =>
            e.id === (event as CalendarEvent<EventMeta>).id
              ? { ...e, start: shiftedDate(e.start, minutes), end: shiftedDate(e.end, minutes) }
              : e,
          ),
        ),
      remove: (event) =>
        setEvents((prev) => prev.filter((e) => e.id !== (event as CalendarEvent<EventMeta>).id)),
    }),
    [],
  );

  // Google-Calendar-style keyboard shortcuts: n/j next, p/k previous, t today,
  // and d/w/m/x to switch views. The library is controlled by `date`/`mode`, so
  // these live in the app, just like the toolbar buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? ""))
        return;
      // Leave keys to the context menu while it is open.
      if (document.querySelector('[data-slot="context-menu-content"]')) return;
      switch (e.key.toLowerCase()) {
        case "n":
        case "j":
          if (isCalendarTab(mode)) setDate((d) => stepDate(d, mode, 1));
          break;
        case "p":
        case "k":
          if (isCalendarTab(mode)) setDate((d) => stepDate(d, mode, -1));
          break;
        case "t":
          setDate(new Date());
          break;
        case "d":
          setMode("day");
          break;
        case "w":
          setMode("week");
          break;
        case "m":
          setMode("month");
          break;
        case "x":
          setMode("3days");
          break;
        case "a":
          setMode("schedule");
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  return (
    <EventMenuProvider value={menuActions}>
      <div style={styles.app}>
        <header style={styles.header}>
          <h1 style={styles.title}>@super-calendar/dom</h1>
          <p style={styles.subtitle}>
            The react-dom renderer — no React Native, no react-native-web.
          </p>
        </header>

        <nav style={styles.tabs}>
          {TABS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{ ...styles.tab, ...(mode === m ? styles.tabActive : null) }}
            >
              {m}
            </button>
          ))}
        </nav>

        {isCalendarTab(mode) ? (
          <div style={styles.navRow}>
            <div style={styles.navButtons}>
              <button
                type="button"
                style={styles.navButton}
                aria-label="Previous"
                onClick={() => setDate((d) => stepDate(d, mode, -1))}
              >
                ‹
              </button>
              <button type="button" style={styles.todayButton} onClick={() => setDate(new Date())}>
                Today
              </button>
              <button
                type="button"
                style={styles.navButton}
                aria-label="Next"
                onClick={() => setDate((d) => stepDate(d, mode, 1))}
              >
                ›
              </button>
            </div>
            <span style={styles.periodLabel}>{periodLabel(date, mode)}</span>
            <span style={styles.hint}>keys: n / p move · t today · d w m x a views</span>
          </div>
        ) : null}

        {mode === "picker" ? (
          <div style={styles.pickerCard}>
            <div style={styles.pickerBar}>
              <span style={styles.pickerLabel}>{rangeLabel(range)}</span>
              <button type="button" style={styles.clearButton} onClick={reset}>
                Clear
              </button>
            </div>
            <MonthList
              date={date}
              weekStartsOn={1}
              selectedRange={range ?? undefined}
              minDate={pickerMinDate}
              onPressDay={onPressDate}
              height={460}
            />
          </div>
        ) : mode === "list" ? (
          <div style={styles.card}>
            <MonthList
              date={date}
              events={events}
              weekStartsOn={1}
              renderEvent={EventContextMenu}
              onPressEvent={(event) => console.log("press event:", event.title)}
              onPressDay={(day) => console.log("press day:", day.toDateString())}
              onPressMore={(dayEvents, day) =>
                console.log("more:", day.toDateString(), dayEvents.length)
              }
              height={560}
            />
          </div>
        ) : mode === "recurring" ? (
          <div style={styles.card}>
            <Calendar
              mode="month"
              date={date}
              events={recurringEvents}
              weekStartsOn={1}
              onPressDay={setDate}
            />
          </div>
        ) : mode === "ics" ? (
          <div style={{ padding: "16px 0", display: "grid", gap: 16 }}>
            <div>
              <button type="button" style={styles.todayButton} onClick={exportIcs}>
                Export {events.length} events → .ics
              </button>
            </div>
            <div>
              <p style={{ margin: "0 0 6px", color: "#6B7280", fontSize: 13 }}>
                Paste an <code>.ics</code> feed to parse it (`DTEND`/`DURATION`, all-day,{" "}
                <code>TZID</code>, <code>RRULE</code>/<code>EXDATE</code>):
              </p>
              <textarea
                value={icsText}
                onChange={(e) => setIcsText(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%",
                  height: 180,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 12,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #E2E4E9",
                }}
              />
              <p style={{ margin: "8px 0 4px", fontWeight: 600, fontSize: 14 }}>
                Parsed {importedIcs.length} events:
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#1A1B1E", fontSize: 13 }}>
                {importedIcs.map((e, i) => (
                  <li key={i}>
                    {e.title} — {e.allDay ? e.start.toDateString() : e.start.toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : mode === "resource" ? (
          <div style={styles.card}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px" }}>
              <button
                type="button"
                disabled={roomPage === 0}
                onClick={() => setRoomPage((p) => Math.max(0, p - 1))}
              >
                ← Rooms
              </button>
              <span style={{ fontSize: 13, color: "#6B7280" }}>
                Page {roomPage + 1} / {ROOM_PAGES}
              </span>
              <button
                type="button"
                disabled={roomPage >= ROOM_PAGES - 1}
                onClick={() => setRoomPage((p) => Math.min(ROOM_PAGES - 1, p + 1))}
              >
                Rooms →
              </button>
            </div>
            <ResourceTimeline
              date={date}
              // Phones read better with time flowing down; wide screens keep
              // the classic horizontal timeline. Mirrors the native example.
              orientation={narrowViewport ? "vertical" : "horizontal"}
              resources={ROOMS}
              resourcesPerPage={ROOMS_PER_PAGE}
              resourcePage={roomPage}
              events={events}
              // Created events carry a real resourceId; demo data spreads by id.
              resourceId={(event) =>
                (event as { resourceId?: string }).resourceId ??
                ROOMS[Number(event.id) % ROOMS.length].id
              }
              startHour={7}
              endHour={20}
              businessHours={() => ({ start: 9, end: 17 })}
              onPressCell={(cellAt, resource) =>
                console.log("press cell:", resource.title, cellAt.toISOString())
              }
              onCreateEvent={(start, end, resource) =>
                setEvents((prev) => {
                  const nextId = String(Math.max(0, ...prev.map((e) => Number(e.id) || 0)) + 1);
                  return [
                    ...prev,
                    {
                      id: nextId,
                      kind: "work",
                      title: `✨ ${resource.title}`,
                      start,
                      end,
                      resourceId: resource.id,
                    } as (typeof prev)[number],
                  ];
                })
              }
              onPressEvent={(event) => console.log("press event:", event.title)}
              onDragEvent={(event, start, end, resource) => {
                if (event.kind === "exam") return false; // exams are locked
                setEvents((prev) =>
                  prev.map((e) =>
                    e.id === event.id ? { ...e, start, end, resourceId: resource.id } : e,
                  ),
                );
              }}
            />
          </div>
        ) : mode === "field" ? (
          <div style={{ padding: "24px 0" }}>
            <DateRangePicker
              value={rangeValue}
              onChange={setRangeValue}
              minDate={pickerMinDate}
              weekStartsOn={1}
            />
            <p style={{ marginTop: 12, color: "#6B7280", fontSize: 13 }}>
              The shipped <code>&lt;DateRangePicker&gt;</code>: a controlled date-range input with a
              popover calendar.
            </p>
          </div>
        ) : mode === "tailwind" ? (
          <div className="overflow-hidden rounded-2xl border border-indigo-100 shadow-sm">
            <Calendar
              mode="month"
              date={date}
              events={events}
              weekStartsOn={1}
              height={560}
              classNames={TAILWIND_SLOTS}
              onPressEvent={(event) => console.log("press event:", event.title)}
              onPressDay={(day) => {
                setDate(day);
                setMode("day");
              }}
              onPressMonth={(month) => {
                setDate(month);
                setMode("month");
              }}
            />
          </div>
        ) : (
          <div style={styles.card}>
            <Calendar
              mode={mode}
              date={date}
              events={events}
              weekStartsOn={1}
              height={560}
              renderTimeEvent={EventContextMenu}
              renderMonthEvent={EventContextMenu}
              renderScheduleEvent={EventContextMenu}
              scrollOffsetMinutes={8 * 60}
              businessHours={(d) => {
                const weekday = d.getDay();
                if (weekday === 0 || weekday === 6) return null; // weekends closed
                return { start: 9, end: 17 };
              }}
              onDragEvent={(event, start, end) => {
                // Exams are locked: returning false rejects the drop (snaps back).
                if (event.kind === "exam") return false;
                setEvents((prev) =>
                  prev.map((e) => (e.id === event.id ? { ...e, start, end } : e)),
                );
              }}
              onCreateEvent={(start, end) =>
                setEvents((prev) => {
                  const nextId = String(Math.max(0, ...prev.map((e) => Number(e.id) || 0)) + 1);
                  return [...prev, { id: nextId, kind: "work", title: "✨ New event", start, end }];
                })
              }
              onPressEvent={(event) => console.log("press event:", event.title)}
              onPressDay={(day) => {
                setDate(day);
                setMode("day");
              }}
              onPressMonth={(month) => {
                setDate(month);
                setMode("month");
              }}
              onPressMore={(dayEvents, day) =>
                console.log("more:", day.toDateString(), dayEvents.length)
              }
              onPressCell={(at) => console.log("create at:", at.toISOString())}
            />
          </div>
        )}
      </div>
    </EventMenuProvider>
  );
}

const styles: Record<string, CSSProperties> = {
  app: {
    maxWidth: 900,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#1A1B1E",
  },
  header: { marginBottom: 4 },
  title: { fontSize: 20, lineHeight: 1.2, margin: 0 },
  subtitle: { margin: 0, color: "#6B7280", fontSize: 14 },
  tabs: { display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 0" },
  tab: {
    padding: "6px 18px",
    borderRadius: 8,
    border: "none",
    background: "#eef0f3",
    color: "#1A1B1E",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    textTransform: "capitalize",
    fontFamily: "inherit",
  },
  tabActive: { background: "#1F6FEB", color: "#fff" },
  navRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
  },
  navButtons: { display: "flex", gap: 6 },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: "1px solid #E2E4E9",
    background: "#fff",
    color: "#1A1B1E",
    fontSize: 18,
    lineHeight: 1,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  todayButton: {
    height: 34,
    padding: "0 14px",
    borderRadius: 8,
    border: "1px solid #E2E4E9",
    background: "#fff",
    color: "#1A1B1E",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  periodLabel: { fontWeight: 600, fontSize: 16 },
  hint: { marginLeft: "auto", color: "#9AA1AC", fontSize: 12 },
  card: { border: "1px solid #E2E4E9", borderRadius: 14, overflow: "hidden" },
  pickerCard: {
    maxWidth: 460,
    border: "1px solid #E2E4E9",
    borderRadius: 14,
    overflow: "hidden",
  },
  pickerBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderBottom: "1px solid #eef0f3",
  },
  pickerLabel: { fontWeight: 600, fontSize: 15 },
  clearButton: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "none",
    background: "#eef0f3",
    color: "#1F6FEB",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
