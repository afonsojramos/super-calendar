import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Calendar, type CalendarEvent, type CalendarMode } from "react-native-bigger-calendar";
import { EventContextMenu } from "./components/EventContextMenu";
import { EventMenuProvider, type EventMenuActions } from "./components/EventMenu";

// Freeze the clock so the demo always renders the same scene: the events, the
// "today" highlight and the current-time line all anchor to this instant (Tue
// 23 June 2026, 10:01). Handy for screenshots and docs. Delete this block to
// follow the real device clock.
const MOCK_NOW = new Date(2026, 5, 23, 10, 1, 0).getTime();
globalThis.Date = new Proxy(Date, {
  construct: (target, args) => Reflect.construct(target, args.length === 0 ? [MOCK_NOW] : args),
  get: (target, prop, receiver) =>
    prop === "now" ? () => MOCK_NOW : Reflect.get(target, prop, receiver),
}) as DateConstructor;

type EventMeta = {
  id: string;
  kind: "work" | "music" | "health" | "exam" | "social" | "travel";
};

const MODES: CalendarMode[] = ["month", "week", "3days", "day", "schedule"];

// Shift a date by some minutes (used by the right-click menu actions).
function shiftedDate(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

// Pin the calendar to a single view, overriding the tab bar — handy for
// screenshots and docs. Set it to a mode (e.g. "week") to force that view; leave
// it null to drive the calendar interactively through the tabs.
const DEMO_MODE: CalendarMode | null = null;

// Events anchored to "today" so the demo is always populated.
function buildEvents(): CalendarEvent<EventMeta>[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const at = (offsetDays: number, hour: number, minute = 0) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  return [
    // A packed "today" (seven events) so the month cell overflows into "+N more".
    { id: "11", kind: "social", title: "☕ Coffee with Alex", start: at(0, 8), end: at(0, 8, 30) },
    { id: "1", kind: "work", title: "👥 Team standup", start: at(0, 9), end: at(0, 9, 30) },
    { id: "2", kind: "health", title: "🦷 Dentist", start: at(0, 11), end: at(0, 11, 45) },
    {
      id: "3",
      kind: "social",
      title: "🥪 Lunch with Sam",
      start: at(0, 12, 30),
      end: at(0, 13, 30),
    },
    // Long title + an evening slot below the morning scroll offset.
    {
      id: "4",
      kind: "music",
      title: "🎸 King Gizzard & the Lizard Wizard",
      start: at(0, 19),
      end: at(0, 23),
    },
    { id: "5", kind: "exam", title: "🚗 Driving theory exam", start: at(1, 9), end: at(1, 10, 30) },
    { id: "6", kind: "health", title: "🩺 GP appointment", start: at(1, 15), end: at(1, 15, 30) },
    { id: "7", kind: "health", title: "💪 Physio", start: at(2, 10), end: at(2, 10, 45) },
    { id: "8", kind: "work", title: "📊 Project review", start: at(2, 14), end: at(2, 15) },
    { id: "12", kind: "health", title: "🏋️ Gym", start: at(0, 16), end: at(0, 17) },
    // A multi-day event: renders on every day it spans, clipped per day.
    { id: "9", kind: "travel", title: "✈️ Lisbon trip", start: at(3, 17), end: at(5, 21) },
    // An all-day event: renders in the lane above the grid, not in the columns.
    {
      id: "10",
      kind: "social",
      title: "🎂 Mum's birthday",
      start: at(0, 0),
      end: at(1, 0),
      allDay: true,
    },
  ];
}

export default function App() {
  const [mode, setMode] = useState<CalendarMode>("week");
  const [date, setDate] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent<EventMeta>[]>(buildEvents);
  // DEMO_MODE pins the view when set; otherwise the tab bar drives it.
  const activeMode = DEMO_MODE ?? mode;

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

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.root}>
          <View style={styles.tabs}>
            {MODES.map((m) => (
              <Pressable
                key={m}
                style={[styles.tab, activeMode === m && styles.tabActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.tabText, activeMode === m && styles.tabTextActive]}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <EventMenuProvider value={menuActions}>
            <Calendar
              mode={activeMode}
              date={date}
              events={events}
              weekStartsOn={1}
              scrollOffsetMinutes={8 * 60}
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
                  const nextId = String(Math.max(0, ...prev.map((e) => Number(e.id) || 0)) + 1);
                  return [...prev, { id: nextId, kind: "work", title: "✨ New event", start, end }];
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
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  tabs: { flexDirection: "row", padding: 8, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#eef0f3",
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#1F6FEB" },
  tabText: { fontWeight: "600", color: "#1A1B1E", textTransform: "capitalize" },
  tabTextActive: { color: "#fff" },
});
