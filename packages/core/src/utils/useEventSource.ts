import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "../types";
import { parseICalendar } from "./ical";

/** Options for {@link useEventSource}. */
export interface EventSourceOptions<T> {
  /**
   * Feed format for URL sources: `"json"` (default) expects an array of event
   * objects with ISO `start`/`end` strings; `"ics"` parses an iCalendar feed.
   * URLs ending in `.ics` default to `"ics"`.
   */
  format?: "json" | "ics";
  /**
   * Map the parsed JSON array into events, for feeds whose shape doesn't match
   * `CalendarEvent` (rename fields, attach `resourceId`, filter). The default
   * revives `start`/`end` ISO strings on each item.
   */
  map?: (items: unknown[]) => CalendarEvent<T>[];
  /** Re-fetch every N ms (a live feed). Omit to fetch once. */
  refetchIntervalMs?: number;
}

/** What {@link useEventSource} returns. */
export interface EventSourceState<T> {
  /** The fetched events; the previous batch is kept while a refetch runs or fails. */
  events: CalendarEvent<T>[];
  /** True while the first fetch (or a manual refetch) is in flight. */
  loading: boolean;
  /** The last fetch error, or null. Events keep their previous value on error. */
  error: Error | null;
  /** Fetch the source again now. */
  refetch: () => Promise<void>;
}

const defaultMap = <T>(items: unknown[]): CalendarEvent<T>[] =>
  items.map((raw) => {
    const item = raw as Record<string, unknown> & { start: string; end: string };
    return { ...item, start: new Date(item.start), end: new Date(item.end) } as CalendarEvent<T>;
  });

/**
 * Load events from a refreshable source: a JSON feed URL, an iCalendar feed
 * URL, or your own async function. The hook owns fetching, optional interval
 * refetching, and loading/error state; hand the returned `events` to any view.
 *
 * @example
 * ```tsx
 * const { events, loading, refetch } = useEventSource(
 *   "https://example.com/feed.ics",
 *   { refetchIntervalMs: 5 * 60_000 },
 * );
 * <Calendar mode="week" date={date} events={events} onChangeDate={setDate} />;
 * ```
 */
export function useEventSource<T = unknown>(
  source: string | (() => Promise<CalendarEvent<T>[]>),
  { format, map, refetchIntervalMs }: EventSourceOptions<T> = {},
): EventSourceState<T> {
  const [events, setEvents] = useState<CalendarEvent<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Ignore responses from superseded fetches (unmount, source change, races).
  const generation = useRef(0);

  // The latest source/options without re-subscribing the interval on every
  // render (inline functions and option literals are expected).
  const latest = useRef({ source, format, map });
  latest.current = { source, format, map };

  const load = useCallback(async (isManual: boolean) => {
    const gen = ++generation.current;
    const { source: src, format: fmt, map: mapper } = latest.current;
    if (isManual) setLoading(true);
    try {
      let next: CalendarEvent<T>[];
      if (typeof src === "function") {
        next = await src();
      } else {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`Event source responded ${response.status}`);
        const isIcs = fmt === "ics" || (fmt == null && /\.ics(\?|$)/.test(src));
        if (isIcs) {
          next = parseICalendar(await response.text()) as CalendarEvent<T>[];
        } else {
          const body = (await response.json()) as unknown[];
          next = (mapper ?? defaultMap<T>)(body);
        }
      }
      if (gen !== generation.current) return;
      setEvents(next);
      setError(null);
    } catch (cause) {
      if (gen !== generation.current) return;
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, []);

  const sourceKey = typeof source === "string" ? source : "fn";
  useEffect(() => {
    void load(true);
    if (!refetchIntervalMs) {
      return () => {
        generation.current++;
      };
    }
    const id = setInterval(() => void load(false), refetchIntervalMs);
    return () => {
      clearInterval(id);
      generation.current++;
    };
  }, [load, sourceKey, refetchIntervalMs]);

  const refetch = useCallback(() => load(true), [load]);
  return { events, loading, error, refetch };
}
