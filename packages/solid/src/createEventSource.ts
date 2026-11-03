import {
  loadEventSource,
  type CalendarEvent,
  type EventSource,
  type EventSourceOptions,
} from "@super-calendar/core/vanilla";
import { createEffect, createMemo, createSignal, untrack, type Accessor } from "solid-js";

/** Reactive state for a refreshable calendar feed. */
export interface EventSourceState<T> {
  /** Last successful batch, retained during loading and errors. */
  events: Accessor<CalendarEvent<T>[]>;
  loading: Accessor<boolean>;
  error: Accessor<Error | null>;
  /** Reload now. Does nothing after the owning component or root is disposed. */
  refetch: () => Promise<void>;
}

/** Load a reactive URL or async function, with optional polling and owned cleanup. */
export function createEventSource<T = unknown>(
  source: Accessor<EventSource<T>>,
  options: Accessor<EventSourceOptions<T>> = () => ({}),
): EventSourceState<T> {
  const [events, setEvents] = createSignal<CalendarEvent<T>[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | null>(null);
  let generation = 0;
  let controller: AbortController | undefined;
  let active = false;
  const configuration = createMemo(() => ({ source: source(), ...options() }));

  const load = async (manual: boolean, value: ReturnType<typeof configuration>) => {
    if (!active) return;
    const current = ++generation;
    controller?.abort();
    controller = typeof AbortController === "undefined" ? undefined : new AbortController();
    if (manual) setLoading(true);
    try {
      const next = await loadEventSource({
        ...value,
        signal: controller?.signal,
      });
      if (current !== generation) return;
      setEvents(next);
      setError(null);
    } catch (cause) {
      if (current !== generation) return;
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (current === generation) setLoading(false);
    }
  };

  createEffect(configuration, (value) => {
    active = true;
    void load(true, value);
    const interval = value.refetchIntervalMs;
    const timer =
      interval && Number.isFinite(interval) && interval > 0 && interval <= 2 ** 31 - 1
        ? setInterval(() => void load(false, value), interval)
        : undefined;
    return () => {
      active = false;
      generation++;
      controller?.abort();
      if (timer !== undefined) clearInterval(timer);
    };
  });

  return {
    events,
    loading,
    error,
    refetch: () => (active ? load(true, untrack(configuration)) : Promise.resolve()),
  };
}
