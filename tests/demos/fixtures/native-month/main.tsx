import { useState } from "react";
import { Text, TextInput, View, type ViewStyle } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { CreateGhostArgs, CalendarEvent } from "@super-calendar/core";
import { MonthView } from "../../../../packages/native/src/components/MonthView";
import { MultiWeekView } from "../../../../packages/native/src/components/MultiWeekView";

const events: CalendarEvent[] = [];
const date = new Date(2026, 5, 15);
let focused = 0;
function Draft({ start, end }: CreateGhostArgs) {
  return (
    <View>
      <Text>{`Draft ${start.getDate()} to ${end.getDate()}`}</Text>
      <TextInput
        accessibilityLabel="Draft input"
        autoFocus
        onFocus={() => {
          focused++;
        }}
        ref={(element) => element?.focus()}
      />
    </View>
  );
}
const busyDays: CalendarEvent[] = [
  { title: "Conference", start: new Date(2026, 5, 15), end: new Date(2026, 5, 18), allDay: true },
  ...[15, 16].map((day) => ({
    title: "Meeting",
    start: new Date(2026, 5, day, 9),
    end: new Date(2026, 5, day, 10),
  })),
];

const fiveEvents = Array.from({ length: 5 }, (_, i) => ({
  title: `Meeting ${i + 1}`,
  start: new Date(2026, 5, 16, 8 + i),
  end: new Date(2026, 5, 16, 9 + i),
}));
const paddedWeek = { paddingVertical: 3, marginVertical: 2 };
const constrainedWeeks = new Map<string, { grid?: ViewStyle; week?: ViewStyle; day?: ViewStyle }>([
  ["grid-height", { grid: { height: 300 } }],
  ["grid-below-content", { grid: { height: 120 } }],
  ["grid-spacing", { grid: { paddingVertical: 60, rowGap: 40 } }],
  ["grid-spacing-class", {}],
  ["day-minimum", { week: paddedWeek, day: { minHeight: 200 } }],
  ["day-minimum-class", { week: paddedWeek }],
  ["day-height", { week: paddedWeek }],
  ["day-aspect", { day: { aspectRatio: 1 } }],
  [
    "day-aspect-spaced",
    {
      grid: { width: "80%" },
      week: { paddingHorizontal: 10, columnGap: 8 },
      day: { aspectRatio: 1 },
    },
  ],
  ["week-minimum", { grid: { height: 300, paddingTop: 12, rowGap: 10 }, week: { minHeight: 140 } }],
]);

function StyledWeeks({ layout }: { layout: string }) {
  const [action, setAction] = useState("");
  const scaled = layout === "scaled-classes";
  const classes = layout === "classes" || scaled;
  const shortGrid = constrainedWeeks.get(layout);
  const tallDay = layout.startsWith("day-");
  const squareDays = layout.startsWith("day-aspect");
  const spacedDays = layout === "day-aspect-spaced";
  const viewportHeight = squareDays
    ? spacedDays
      ? 372
      : 360
    : tallDay || layout === "grid-minimum"
      ? 300
      : shortGrid
        ? 600
        : 150;
  return (
    <View
      testID="weeks-fixture"
      style={{
        width: squareDays ? "100%" : 700,
        height: viewportHeight,
        transform: scaled ? [{ scale: 0.5 }] : undefined,
      }}
    >
      <MultiWeekView
        date={date}
        numberOfWeeks={3}
        hiddenDays={spacedDays ? [0, 6] : undefined}
        events={tallDay ? fiveEvents : busyDays}
        showTitle={false}
        showWeekdays={false}
        chipHeight={20}
        maxVisibleEventCount={tallDay ? undefined : 1}
        classNames={
          layout === "grid-spacing-class"
            ? { grid: "py-[60px] gap-y-[40px] w-[420px] my-[5px] border-t-2 border-b-2" }
            : layout === "day-minimum-class"
              ? { day: "min-h-[200px]" }
              : classes
                ? {
                    week: "pt-[18px] pb-[7px] border-t-2 my-[3px]",
                    day: "justify-end gap-y-[18px] pb-[5px]",
                  }
                : undefined
        }
        styles={
          shortGrid ??
          (classes
            ? undefined
            : {
                grid: layout === "grid-minimum" ? { minHeight: 600 } : undefined,
                week: { paddingTop: 18, paddingBottom: 7, borderTopWidth: 2, marginVertical: 3 },
                day: { justifyContent: "flex-end", gap: 10, paddingBottom: 5 },
              })
        }
        calendarCellStyle={(day) =>
          layout === "day-height" && day.getDate() === 16
            ? { height: 200 }
            : !shortGrid && day.getDate() === 16
              ? { paddingTop: 14, marginTop: 3, ...(!classes && { rowGap: 14 }) }
              : undefined
        }
        renderCustomDateForMonth={(day) => (
          <Text testID={`date-${day.getDate()}`} style={{ height: day.getDate() === 16 ? 38 : 24 }}>
            {day.getDate()}
          </Text>
        )}
        renderEvent={({ event }) => <Text>{event.title}</Text>}
        onPressEvent={() => {}}
        onPressDay={(value) => setAction(`Day ${value.getDate()}`)}
        onDragStart={(event) => setAction(event.title ?? "")}
        onDragEvent={() => {}}
        onCreateEvent={(start) => setAction(`Create ${start.getDate()}`)}
        onPressMore={(_, day) => setAction(`More ${day.getDate()}`)}
        keyExtractor={(event) => event.start.toISOString()}
      />
      <output>{action}</output>
    </View>
  );
}
export default function App() {
  const [created, setCreated] = useState("");
  if (window.location.search.startsWith("?multiweek")) {
    return (
      <GestureHandlerRootView>
        <StyledWeeks layout={new URLSearchParams(window.location.search).get("multiweek") ?? ""} />
      </GestureHandlerRootView>
    );
  }
  return (
    <GestureHandlerRootView>
      <button>Before calendar</button>
      <View style={{ width: 700, height: 650 }}>
        <MonthView
          date={date}
          events={events}
          weekStartsOn={0}
          renderEvent={({ event }) => <Text>{event.title}</Text>}
          keyExtractor={(_, index) => String(index)}
          onPressEvent={() => {}}
          onCreateEvent={(start, end) => setCreated(`${start.getDate()} to ${end.getDate()}`)}
          renderCreateGhost={Draft}
        />
      </View>
      <button>After calendar</button>
      <output>{created}</output>
      <button
        onClick={() => {
          document.documentElement.dataset.draftFocus = String(focused);
        }}
      >
        Report focus
      </button>
    </GestureHandlerRootView>
  );
}
