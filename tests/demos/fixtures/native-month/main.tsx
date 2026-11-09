import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import type { CreateGhostArgs, CalendarEvent } from "@super-calendar/core";
import { MonthView } from "../../../../packages/native/src/components/MonthView";

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
export default function App() {
  const [created, setCreated] = useState("");
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
