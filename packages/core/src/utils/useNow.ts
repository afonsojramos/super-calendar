import { useEffect, useState } from "react";
import { toZonedTime } from "./timezone";

/** Options for {@link useNow}. */
export interface UseNowOptions {
  /**
   * A fixed instant to use instead of the device clock (a server-synced clock,
   * or a stable value for tests). A fixed instant doesn't tick.
   */
  now?: Date;
  /**
   * Shift the instant into this IANA time zone's wall-clock (the same shift
   * `eventsInTimeZone` applies), so the now indicator lines up with events
   * displayed in that zone rather than the device's.
   */
  timeZone?: string;
  /** Tick interval in ms (default one minute). */
  tickMs?: number;
}

const MINUTE_MS = 60_000;

const resolveNow = (now?: Date, timeZone?: string): Date => {
  const instant = now ?? new Date();
  return timeZone ? toZonedTime(instant, timeZone) : instant;
};

/**
 * The current wall-clock time, re-read every `tickMs` while `enabled`, shifted
 * into `timeZone` when given, or pinned to a fixed `now` override. Drives the
 * now indicator on both renderers so it can't disagree with zone-shifted events.
 */
export function useNow(
  enabled: boolean,
  { now, timeZone, tickMs = MINUTE_MS }: UseNowOptions = {},
): Date {
  const [value, setValue] = useState(() => resolveNow(now, timeZone));
  const nowMs = now?.getTime();
  useEffect(() => {
    if (!enabled) return;
    setValue(resolveNow(nowMs != null ? new Date(nowMs) : undefined, timeZone));
    if (nowMs != null) return; // a fixed instant doesn't tick
    const id = setInterval(() => setValue(resolveNow(undefined, timeZone)), tickMs);
    return () => clearInterval(id);
  }, [enabled, nowMs, timeZone, tickMs]);
  return value;
}
