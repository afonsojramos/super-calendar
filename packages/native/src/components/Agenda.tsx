import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { format, isSameDay, type Locale, startOfDay } from "date-fns";
import { type ComponentType, type ReactElement, useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useCalendarTheme } from "../theme";
import type { CalendarEvent, EventKeyExtractor, RenderEvent } from "../types";
import { createSlots, type SlotStyleProps } from "../utils/slots";
import { getIsToday } from "@super-calendar/core";
import { isAllDayEvent } from "@super-calendar/core";

/**
 * The styleable parts of {@link Agenda}. Mirrors the dom renderer's slot names;
 * the event itself is styled by `renderEvent` (or the theme), not a slot.
 */
export type AgendaSlot = "dayHeader" | "eventRow" | "empty";

/** Props for {@link Agenda}, the day-grouped list view of events. */
export type AgendaProps<T> = SlotStyleProps<AgendaSlot> & {
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
  classNames,
  styles: styleOverrides,
}: AgendaProps<T>): ReactElement {
  const theme = useCalendarTheme();
  // Stable across renders (it feeds the memoized renderItem below).
  const slot = useMemo(
    () => createSlots<AgendaSlot>({ classNames, styles: styleOverrides }),
    [classNames, styleOverrides],
  );
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
            {...slot("dayHeader", {
              base: styles.header,
              themed: [
                styles.headerText,
                { color: isHighlighted ? theme.colors.todayBackground : theme.colors.textMuted },
              ],
            })}
            onPress={onPressDay ? () => onPressDay(item.date) : undefined}
            accessibilityRole={onPressDay ? "button" : "header"}
          >
            {format(item.date, "EEEE, d LLLL", { locale })}
          </Text>
        );
      }
      return (
        <View {...slot("eventRow", { base: styles.eventRow, themed: theme.containers.agendaRow })}>
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
    [
      theme,
      locale,
      activeDate,
      onPressDay,
      onPressEvent,
      onLongPressEvent,
      RenderEventComponent,
      slot,
    ],
  );

  if (rows.length === 0) {
    return (
      <Text
        {...slot("empty", {
          base: styles.empty,
          themed: [styles.emptyText, { color: theme.colors.textMuted }],
        })}
      >
        No events
      </Text>
    );
  }

  return (
    <LegendList
      style={[styles.list, theme.containers.agendaList]}
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
  // Structural layout / themed typography split per slot, so a slot class can
  // replace the look without breaking the layout.
  header: {
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 12,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "600",
  },
  eventRow: {
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  empty: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  emptyText: {
    fontSize: 14,
  },
});
