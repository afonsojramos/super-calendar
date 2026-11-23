import type { CalendarEvent, EventIdGetter } from "../types";

const idKey = (id: unknown): string | undefined =>
  typeof id === "string" || typeof id === "number" ? `${typeof id}:${id}` : undefined;

/**
 * A key for every event in `events` whose `getEventId` result is a string or a
 * number that no other event shares. Events with a missing, invalid, or
 * duplicate ID are left out, so a renderer falls back to its own identity for
 * them. The key keeps `1` and `"1"` apart.
 */
export function eventIdKeys<T>(
  events: readonly CalendarEvent<T>[],
  getEventId: EventIdGetter<T> | undefined,
): Map<CalendarEvent<T>, string> {
  const keys = new Map<CalendarEvent<T>, string>();
  if (!getEventId) return keys;
  const owners = new Map<string, CalendarEvent<T> | null>();
  for (const event of events) {
    const key = idKey(getEventId(event));
    if (key === undefined) continue;
    // `null` marks an ID that more than one event returned.
    owners.set(key, owners.has(key) ? null : event);
  }
  for (const [key, event] of owners) if (event) keys.set(event, key);
  return keys;
}

/**
 * The event in `events` that `held` refers to after a refresh: `held` itself
 * when it is still there, or else the only event with the same valid
 * `getEventId` result. Returns `undefined` when neither exists.
 */
export function findCurrentEvent<T>(
  events: readonly CalendarEvent<T>[],
  held: CalendarEvent<T>,
  getEventId: EventIdGetter<T> | undefined,
): CalendarEvent<T> | undefined {
  if (events.includes(held)) return held;
  if (!getEventId) return undefined;
  const key = idKey(getEventId(held));
  if (key === undefined) return undefined;
  let match: CalendarEvent<T> | undefined;
  for (const event of events) {
    if (idKey(getEventId(event)) !== key) continue;
    if (match) return undefined;
    match = event;
  }
  return match;
}
