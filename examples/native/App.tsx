import { addDays, addMonths, addWeeks, format } from "date-fns";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Calendar,
  type CalendarEvent,
  type CalendarMode,
  expandRecurringEvents,
  getViewDays,
  parseICalendar,
  type Resource,
  ResourceTimeline,
  toICalendar,
} from "@super-calendar/native";
// The picker surface imports from the Reanimated-free /picker entry point.
import { type DateRange, MonthList, useDateRange } from "@super-calendar/native/picker";
import { EventMenuProvider, type EventMenuActions } from "@super-calendar/example-shared";
import { buildEvents, type EventMeta } from "@super-calendar/example-shared/events";
import { EventContextMenu } from "./components/EventContextMenu";

const MODES: CalendarMode[] = ["month", "week", "3days", "day", "schedule"];

// The mode tabs plus the extra demo surfaces, matching the dom example where
// the native package supports them: "picker" (range selection via useDateRange),
// "list" (the vertically-scrolling MonthList), "resource" (ResourceTimeline),
// "recurring" (expandRecurringEvents), and "ics" (parse/export iCalendar).
type DemoTab = CalendarMode | "picker" | "list" | "resource" | "recurring" | "ics";
const TABS: DemoTab[] = [...MODES, "picker", "list", "resource", "recurring", "ics"];

// Rooms for the resource-timeline demo; events are spread across them by id.
const ROOMS: Resource[] = [
  { id: "room-a", title: "Room A" },
  { id: "room-b", title: "Room B" },
  { id: "room-c", title: "Room C" },
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

// The grid views that step by a fixed period; schedule/picker/list scroll instead.
const GRID_MODES: CalendarMode[] = ["month", "week", "3days", "day"];
function isGridMode(tab: DemoTab): tab is CalendarMode {
  return (GRID_MODES as string[]).includes(tab);
}

// Step the anchor by the period the current grid view shows. Matches the dom
// example so both demos navigate identically.
function stepDate(date: Date, mode: CalendarMode, dir: 1 | -1): Date {
  if (mode === "month") return addMonths(date, dir);
  if (mode === "week") return addWeeks(date, dir);
  if (mode === "3days") return addDays(date, dir * 3);
  return addDays(date, dir);
}

// Label for the visible period, matching exactly what the grid renders. Mirrors
// the dom example so both demos show the same toolbar title.
function periodLabel(date: Date, mode: CalendarMode): string {
  if (mode === "month") return format(date, "MMMM yyyy");
  if (mode === "day") return format(date, "EEE, d MMM yyyy");
  const days = getViewDays(mode, date, 1);
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth();
  return sameMonth
    ? `${format(first, "d")} - ${format(last, "d MMM yyyy")}`
    : `${format(first, "d MMM")} - ${format(last, "d MMM yyyy")}`;
}

// Human-readable summary of the current range-selection state for the banner.
function rangeLabel(range: DateRange | null): string {
  if (!range) return "Tap a start date";
  const start = range.start.toLocaleDateString();
  if (!range.end) return `${start} → tap an end date`;
  return `${start} → ${range.end.toLocaleDateString()}`;
}

// Shift a date by some minutes (used by the right-click menu actions).
function shiftedDate(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

// Pin the calendar to a single view, overriding the tab bar — handy for
// screenshots and docs. Set it to a mode (e.g. "week") to force that view and
// hide the title and date-nav chrome (keeping only the tab bar), so a screenshot
// frames just the calendar. Leave it null to drive the calendar interactively.
const DEMO_MODE: CalendarMode | null = null;

export default function App() {
  const [mode, setMode] = useState<DemoTab>("week");
  const [date, setDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent<EventMeta>[]>(buildEvents);
  // Range selection for the "picker" tab; onPressDate wires to month-cell taps.
  // Disallow past dates so the picker also demonstrates disabled days.
  const pickerMinDate = useMemo(() => new Date(), []);
  const { range, onPressDate, selectRange, reset } = useDateRange({ minDate: pickerMinDate });
  // DEMO_MODE pins the view when set; otherwise the tab bar drives it.
  const activeMode: DemoTab = DEMO_MODE ?? mode;

  // The "ics" tab parses whatever is in the text box; invalid input just yields
  // an empty list while typing.
  const [icsText, setIcsText] = useState(SAMPLE_ICS);
  const importedIcs = useMemo(() => {
    try {
      return parseICalendar(icsText);
    } catch {
      return [];
    }
  }, [icsText]);

  // Rules for the "recurring" tab, expanded to concrete occurrences around the
  // visible month so paging re-materialises them. Mirrors the dom example.
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

  // Download the current events as an .ics file; the button only renders on the
  // web, where the anchor-download trick is available.
  const exportIcs = () => {
    const blob = new Blob([toICalendar(events)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "super-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Actions the (web) right-click menu performs; matched back to events by id.
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

  // Web-only Google-Calendar-style shortcuts, matching the dom example: n/j next,
  // p/k previous, t today, d/w/m/x to switch views. The built-in left/right arrow
  // paging (useWebPagerKeys) still works too.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? ""))
        return;
      switch (e.key.toLowerCase()) {
        case "n":
        case "j":
          if (isGridMode(mode)) setDate((d) => stepDate(d, mode, 1));
          break;
        case "p":
        case "k":
          if (isGridMode(mode)) setDate((d) => stepDate(d, mode, -1));
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
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <View style={styles.page}>
            {DEMO_MODE == null ? (
              <View style={styles.header}>
                <Text style={styles.title}>@super-calendar/native</Text>
                <Text style={styles.subtitle}>
                  The React Native renderer, running in the browser via react-native-web.
                </Text>
              </View>
            ) : null}
            <View style={styles.tabs}>
              {TABS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.tab, activeMode === m && styles.tabActive]}
                  onPress={() => setMode(m)}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.tabText, activeMode === m && styles.tabTextActive]}
                  >
                    {m}
                  </Text>
                </Pressable>
              ))}
            </View>
            {DEMO_MODE == null && isGridMode(activeMode) ? (
              <View style={styles.navRow}>
                <View style={styles.navButtons}>
                  <Pressable
                    style={styles.navButton}
                    accessibilityRole="button"
                    accessibilityLabel="Previous"
                    onPress={() => setDate((d) => stepDate(d, activeMode, -1))}
                  >
                    <Text style={styles.navButtonText}>‹</Text>
                  </Pressable>
                  <Pressable style={styles.todayButton} onPress={() => setDate(new Date())}>
                    <Text style={styles.todayText}>Today</Text>
                  </Pressable>
                  <Pressable
                    style={styles.navButton}
                    accessibilityRole="button"
                    accessibilityLabel="Next"
                    onPress={() => setDate((d) => stepDate(d, activeMode, 1))}
                  >
                    <Text style={styles.navButtonText}>›</Text>
                  </Pressable>
                </View>
                <Text style={styles.periodLabel}>{periodLabel(date, activeMode)}</Text>
                {Platform.OS === "web" ? (
                  <Text style={styles.hint}>
                    keys: ← / → or n / p move · t today · d w m x a views
                  </Text>
                ) : null}
              </View>
            ) : null}
            {activeMode === "picker" ? (
              <View style={styles.pickerScreen}>
                <View style={styles.pickerCard}>
                  <View style={styles.pickerBar}>
                    <Text style={styles.pickerLabel}>{rangeLabel(range)}</Text>
                    <Pressable style={styles.clearButton} onPress={reset}>
                      <Text style={styles.clearText}>Clear</Text>
                    </Pressable>
                  </View>
                  <MonthList
                    date={date}
                    weekStartsOn={1}
                    selectedRange={range ?? undefined}
                    minDate={pickerMinDate}
                    onChangeVisibleMonth={setDate}
                    onPressDay={onPressDate}
                    onSelectDrag={selectRange}
                  />
                </View>
              </View>
            ) : activeMode === "resource" ? (
              <View style={styles.card}>
                <ResourceTimeline
                  date={date}
                  resources={ROOMS}
                  events={events}
                  resourceId={(event) => ROOMS[Number(event.id) % ROOMS.length].id}
                  startHour={7}
                  endHour={20}
                  onPressEvent={(event) => console.log("press event:", event.title)}
                  onDragEvent={(event, start, end) => {
                    if (event.kind === "exam") return false; // exams are locked
                    setEvents((prev) =>
                      prev.map((e) => (e.id === event.id ? { ...e, start, end } : e)),
                    );
                  }}
                />
              </View>
            ) : activeMode === "recurring" ? (
              <View style={styles.card}>
                <Calendar
                  mode="month"
                  date={date}
                  events={recurringEvents}
                  weekStartsOn={1}
                  onChangeDate={setDate}
                  onPressEvent={(event) => console.log("press event:", event.title)}
                  onPressDay={setDate}
                />
              </View>
            ) : activeMode === "ics" ? (
              <ScrollView style={styles.icsScreen}>
                {Platform.OS === "web" ? (
                  <Pressable style={styles.icsExport} onPress={exportIcs}>
                    <Text style={styles.todayText}>Export {events.length} events → .ics</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.icsHint}>
                  Paste an .ics feed to parse it (DTEND/DURATION, all-day, TZID, RRULE/EXDATE):
                </Text>
                <TextInput
                  multiline
                  value={icsText}
                  onChangeText={setIcsText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  style={styles.icsInput}
                />
                <Text style={styles.icsParsed}>Parsed {importedIcs.length} events:</Text>
                {importedIcs.map((e, i) => (
                  <Text key={i} style={styles.icsItem}>
                    • {e.title} — {e.allDay ? e.start.toDateString() : e.start.toLocaleString()}
                  </Text>
                ))}
              </ScrollView>
            ) : activeMode === "list" ? (
              <View style={styles.card}>
                <EventMenuProvider value={menuActions}>
                  <MonthList
                    date={date}
                    events={events}
                    weekStartsOn={1}
                    renderEvent={EventContextMenu}
                    keyExtractor={(event) => event.id}
                    onChangeVisibleMonth={setDate}
                    onPressEvent={(event) => console.log("press event:", event.title)}
                    onPressDay={(day) => console.log("press day:", day.toDateString())}
                  />
                </EventMenuProvider>
              </View>
            ) : (
              <View style={styles.card}>
                <EventMenuProvider value={menuActions}>
                  <Calendar
                    mode={activeMode}
                    date={date}
                    events={events}
                    weekStartsOn={1}
                    scrollOffsetMinutes={8 * 60}
                    businessHours={(date) => {
                      const weekday = date.getDay();
                      if (weekday === 0 || weekday === 6) return null; // weekends closed
                      return { start: 9, end: 17 };
                    }}
                    renderEvent={EventContextMenu}
                    onChangeDate={setDate}
                    onDragEvent={(event, start, end) => {
                      // Demo: exams are locked — returning false rejects the drop and
                      // snaps the event back to where it started.
                      if ((event as CalendarEvent<EventMeta>).kind === "exam") return false;
                      setEvents((prev) =>
                        prev.map((e) => (e.id === event.id ? { ...e, start, end } : e)),
                      );
                    }}
                    onDragStart={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                    onCreateEvent={(start, end) =>
                      setEvents((prev) => {
                        const nextId = String(
                          Math.max(0, ...prev.map((e) => Number(e.id) || 0)) + 1,
                        );
                        return [
                          ...prev,
                          { id: nextId, kind: "work", title: "✨ New event", start, end },
                        ];
                      })
                    }
                    onPressEvent={(event) => console.log("press event:", event.title)}
                    onPressDay={(day) => {
                      setDate(day);
                      setMode("day");
                    }}
                    onPressMore={(dayEvents, day) =>
                      console.log("more:", day.toDateString(), dayEvents.length)
                    }
                    onPressCell={(at) => console.log("create at:", at.toISOString())}
                  />
                </EventMenuProvider>
              </View>
            )}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  // Center the demo and cap its width on wide (web) viewports, like the dom example.
  page: { flex: 1, width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 16 },
  header: { paddingTop: 16, paddingBottom: 4 },
  // Match the dom example's <h1>: Tailwind's preflight resets headings to the
  // inherited (normal) weight, so the title is 20px at the default weight.
  title: { fontSize: 20, fontWeight: "400", color: "#1A1B1E" },
  subtitle: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  // The framed surface around the calendar / list, matching the dom example's card.
  card: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E4E9",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
    // On the web match the dom example's calendar box (its 560px grid plus the day
    // header and all-day lane); on a device fill the available screen.
    ...Platform.select({ web: { height: 649 }, default: { flex: 1 } }),
  },
  // Pill buttons that wrap onto extra rows, matching the dom example's bar.
  tabs: { flexDirection: "row", flexWrap: "wrap", paddingVertical: 8, gap: 8 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#eef0f3",
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#1F6FEB" },
  tabText: { fontWeight: "600", color: "#1A1B1E", textTransform: "capitalize" },
  tabTextActive: { color: "#fff" },
  // Prev / Today / next navigation, mirroring the dom example's toolbar.
  navRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12 },
  navButtons: { flexDirection: "row", gap: 6 },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E4E9",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonText: { fontSize: 18, lineHeight: 18, color: "#1A1B1E" },
  todayButton: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E4E9",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  todayText: { fontWeight: "600", fontSize: 14, color: "#1A1B1E" },
  periodLabel: { fontWeight: "600", fontSize: 16, color: "#1A1B1E" },
  hint: { marginLeft: "auto", color: "#9AA1AC", fontSize: 12 },
  // Keep the picker from sprawling: a centered card capped in width and height.
  pickerScreen: { flex: 1, alignItems: "center", paddingBottom: 16 },
  pickerCard: {
    flex: 1,
    width: "100%",
    maxWidth: 460,
    maxHeight: 520,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E4E9",
    borderRadius: 14,
    overflow: "hidden",
  },
  pickerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerLabel: { fontSize: 15, fontWeight: "600", color: "#1A1B1E" },
  // The "ics" tab: export button, paste box, and the parsed-event list.
  icsScreen: { flex: 1, paddingVertical: 8 },
  icsExport: {
    alignSelf: "flex-start",
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E4E9",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  icsHint: { color: "#6B7280", fontSize: 13, marginBottom: 6 },
  icsInput: {
    minHeight: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E4E9",
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    color: "#1A1B1E",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    textAlignVertical: "top",
  },
  icsParsed: { fontWeight: "600", fontSize: 14, color: "#1A1B1E", marginTop: 8, marginBottom: 4 },
  icsItem: { color: "#1A1B1E", fontSize: 13, lineHeight: 20 },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#eef0f3",
  },
  clearText: { fontWeight: "600", color: "#1F6FEB" },
});
