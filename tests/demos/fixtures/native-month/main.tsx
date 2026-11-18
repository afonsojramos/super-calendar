import { useState } from "react";
import { Text, TextInput, View } from "react-native";
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

function StyledWeeks({ classes, tallGrid }: { classes: boolean; tallGrid: boolean }) {
  const [action, setAction] = useState("");
  return (
    <View style={{ width: 700, height: tallGrid ? 300 : 150 }}>
      <MultiWeekView
        date={date}
        numberOfWeeks={3}
        events={busyDays}
        showTitle={false}
        showWeekdays={false}
        chipHeight={20}
        maxVisibleEventCount={1}
        classNames={
          classes
            ? {
                week: "pt-[18px] pb-[7px] border-t-2 my-[3px]",
                day: "justify-end gap-y-[18px] pb-[5px]",
              }
            : undefined
        }
        styles={
          classes
            ? undefined
            : {
                grid: tallGrid ? { minHeight: 600 } : undefined,
                week: { paddingTop: 18, paddingBottom: 7, borderTopWidth: 2, marginVertical: 3 },
                day: { justifyContent: "flex-end", gap: 10, paddingBottom: 5 },
              }
        }
        calendarCellStyle={(day) =>
          day.getDate() === 16
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
        <StyledWeeks
          classes={window.location.search.includes("classes")}
          tallGrid={window.location.search.includes("grid-minimum")}
        />
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
