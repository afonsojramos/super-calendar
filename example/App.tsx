import { useMemo, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Calendar, type CalendarEvent, type CalendarMode } from 'react-native-bigger-calendar';

type EventMeta = { id: string; kind: 'lecture' | 'lab' | 'exam' };

const MODES: CalendarMode[] = ['month', 'week', 'day'];

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
    { id: '1', kind: 'lecture', title: 'Contract Law', start: at(0, 9), end: at(0, 10, 30) },
    { id: '2', kind: 'lab', title: 'Research Skills', start: at(0, 11), end: at(0, 12) },
    { id: '3', kind: 'lecture', title: 'Tort Law', start: at(1, 13), end: at(1, 15) },
    { id: '4', kind: 'exam', title: 'Mid-term Exam', start: at(2, 9), end: at(2, 12) },
    // A multi-day event: renders on every day it spans, clipped per day.
    { id: '5', kind: 'lecture', title: 'Residential', start: at(3, 18), end: at(5, 12) },
  ];
}

export default function App() {
  const [mode, setMode] = useState<CalendarMode>('week');
  const [date, setDate] = useState(() => new Date());
  const events = useMemo(buildEvents, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.root}>
        <View style={styles.tabs}>
          {MODES.map((m) => (
            <Pressable
              key={m}
              style={[styles.tab, mode === m && styles.tabActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <Calendar
          mode={mode}
          date={date}
          events={events}
          weekStartsOn={1}
          scrollOffsetMinutes={8 * 60}
          onChangeDate={setDate}
          onPressEvent={(event) => console.log('press event:', event.title)}
          onPressDay={(day) => {
            setDate(day);
            setMode('day');
          }}
          onPressMore={(dayEvents, day) => console.log('more:', day.toDateString(), dayEvents.length)}
          onPressCell={(at) => console.log('create at:', at.toISOString())}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', padding: 8, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eef0f3',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#1F6FEB' },
  tabText: { fontWeight: '600', color: '#1A1B1E', textTransform: 'capitalize' },
  tabTextActive: { color: '#fff' },
});
