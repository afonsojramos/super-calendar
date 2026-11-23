import { useCallback, useMemo } from "react";
import {
  type CalendarEvent,
  eventIdKeys,
  type EventIdGetter,
  type EventKeyExtractor,
} from "@super-calendar/core";

// Derive a key purely from event data so identity is stable across reorders and
// list mutations. Events that can share an identical start/end/title need
// `getEventId`.
export const defaultEventKey: EventKeyExtractor<unknown> = (event) =>
  `${event.start.toISOString()}|${event.end.toISOString()}|${event.title ?? ""}`;

/**
 * The React key for each event in `events`: its valid, unique `getEventId`
 * result, or else the deprecated `keyExtractor`, or else its content. The
 * prefix keeps an ID key apart from a `keyExtractor` key.
 */
export function useEventKeyExtractor<T>(
  events: readonly CalendarEvent<T>[],
  getEventId: EventIdGetter<T> | undefined,
  keyExtractor: EventKeyExtractor<T> | undefined,
): EventKeyExtractor<T> {
  const ids = useMemo(() => eventIdKeys(events, getEventId), [events, getEventId]);
  return useCallback(
    (event: CalendarEvent<T>, index: number) => {
      const id = ids.get(event);
      if (id !== undefined) return `id:${id}`;
      return (keyExtractor ?? (defaultEventKey as EventKeyExtractor<T>))(event, index);
    },
    [ids, keyExtractor],
  );
}
