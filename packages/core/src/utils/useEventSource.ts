import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "../types";
import { loadEventSource, type EventSource, type EventSourceOptions } from "./eventSource";
export type { EventSourceOptions } from "./eventSource";

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
  source: EventSource<T>,
  { format, map, refetchIntervalMs }: EventSourceOptions<T> = {},
): EventSourceState<T> {
  const [events, setEvents] = useState<CalendarEvent<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Ignore responses from superseded fetches (unmount, source change, races).
  const generation = useRef(0);
  // Abort the superseded URL request too, so it stops consuming the network
  // instead of just being ignored when it lands.
  const abortRef = useRef<AbortController | null>(null);
  const active = useRef(false);

  // The latest source/options without re-subscribing the interval on every
  // render (inline functions and option literals are expected).
  const latest = useRef({ source, format, map });
  latest.current = { source, format, map };

  const load = useCallback(async (isManual: boolean) => {
    if (!active.current) return;
    const gen = ++generation.current;
    abortRef.current?.abort();
    const controller = typeof AbortController === "undefined" ? null : new AbortController();
    abortRef.current = controller;
    const { source: src, format: fmt, map: mapper } = latest.current;
    if (isManual) setLoading(true);
    try {
      const next = await loadEventSource({
        source: src,
        format: fmt,
        map: mapper,
        signal: controller?.signal,
      });
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
    active.current = true;
    void load(true);
    if (
      !refetchIntervalMs ||
      !Number.isFinite(refetchIntervalMs) ||
      refetchIntervalMs <= 0 ||
      refetchIntervalMs > 2 ** 31 - 1
    ) {
      return () => {
        active.current = false;
        generation.current++;
        abortRef.current?.abort();
      };
    }
    const id = setInterval(() => void load(false), refetchIntervalMs);
    return () => {
      active.current = false;
      clearInterval(id);
      generation.current++;
      abortRef.current?.abort();
    };
  }, [load, sourceKey, refetchIntervalMs]);

  const refetch = useCallback(() => load(true), [load]);
  return { events, loading, error, refetch };
}
