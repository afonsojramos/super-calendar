import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { format, isSameDay, type Locale, startOfDay } from "date-fns";
import { type ComponentType, useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, EventKeyExtractor, RenderEvent } from "../types";
import { getIsToday } from "../utils/dates";
import { isAllDayEvent } from "../utils/layout";

export type AgendaProps<T> = {
  events: CalendarEvent<T>[];
  locale?: Locale;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onPressDay?: (date: Date) => void;
  /** Highlight this date's header instead of the real "today". */
  activeDate?: Date;
  /** Drawn between rows of the agenda list. */
  itemSeparatorComponent?: ComponentType<unknown> | null;
};

type Row<T> =
  | { kind: "header"; date: Date; key: string }
  | { kind: "event"; event: CalendarEvent<T>; index: number; key: string };

/**
 * A vertical, day-grouped list of events (no time grid). Events are sorted by
 * start, grouped under a date header per day. The consumer controls which
 * events (and therefore which date range) are shown.
 */
export function Agenda<T>({
  events,
  locale,
  renderEvent,
  keyExtractor,
  onPressEvent,
  onLongPressEvent,
  onPressDay,
  activeDate,
  itemSeparatorComponent,
}: AgendaProps<T>) {
  const theme = useCalendarTheme();
  const RenderEventComponent = renderEvent;

  const rows = useMemo<Row<T>[]>(() => {
    const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
    const out: Row<T>[] = [];
    let currentDay: Date | null = null;
    sorted.forEach((event, index) => {
      if (!currentDay || !isSameDay(event.start, currentDay)) {
        currentDay = startOfDay(event.start);
        out.push({ kind: "header", date: currentDay, key: `h-${currentDay.toISOString()}` });
      }
      out.push({ kind: "event", event, index, key: `e-${keyExtractor(event, index)}` });
    });
    return out;
  }, [events, keyExtractor]);

  const keyExtractorRow = useCallback((row: Row<T>) => row.key, []);
  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<Row<T>>) => {
      if (item.kind === "header") {
        const isHighlighted = activeDate ? isSameDay(item.date, activeDate) : getIsToday(item.date);
        return (
          <Text
            style={[
              theme.text.weekday,
              styles.header,
              { color: isHighlighted ? theme.colors.todayBackground : theme.colors.textMuted },
            ]}
            onPress={onPressDay ? () => onPressDay(item.date) : undefined}
            accessibilityRole={onPressDay ? "button" : "header"}
          >
            {format(item.date, "EEEE, d LLLL", { locale })}
          </Text>
        );
      }
      return (
        <View style={styles.eventRow}>
          <RenderEventComponent
            event={item.event}
            mode="schedule"
            isAllDay={isAllDayEvent(item.event)}
            onPress={() => onPressEvent(item.event)}
            onLongPress={onLongPressEvent ? () => onLongPressEvent(item.event) : undefined}
          />
        </View>
      );
    },
    [theme, locale, activeDate, onPressDay, onPressEvent, onLongPressEvent, RenderEventComponent],
  );

  return (
    <LegendList
      style={styles.list}
      data={rows}
      keyExtractor={keyExtractorRow}
      renderItem={renderItem}
      // The public prop is data-agnostic; LegendList types the separator by row.
      ItemSeparatorComponent={
        (itemSeparatorComponent ?? undefined) as ComponentType<{ leadingItem: Row<T> }> | undefined
      }
      recycleItems={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  eventRow: {
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
});
