import { differenceInMinutes, isSameDay, startOfDay } from 'date-fns';
import type { CalendarEvent } from '../types';

const MINUTES_PER_HOUR = 60;
// Minimum duration (in hours) a positioned event is given, so a zero/negative
// span still occupies a sliver rather than collapsing to nothing.
const MIN_DURATION_HOURS = 0.25;

export type PositionedEvent<T> = {
  event: CalendarEvent<T>;
  /** Hours from midnight to the event start (fractional). */
  startHours: number;
  /** Event duration in hours (clamped to a small minimum). */
  durationHours: number;
  /** Zero-based column index within its overlap cluster. */
  column: number;
  /** Total columns in this event's overlap cluster. */
  columns: number;
};

/**
 * Lay out a single day's events: events that overlap in time are split into
 * side-by-side columns. Pure — safe to call per render, never per gesture frame.
 *
 * Exported so consumers can build custom day/week grids on the same overlap
 * model the package uses internally.
 */
export function layoutDayEvents<T>(
  events: CalendarEvent<T>[],
  day: Date,
): PositionedEvent<T>[] {
  const dayStart = startOfDay(day);
  const sorted = events
    .filter((event) => isSameDay(event.start, day))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const positioned: PositionedEvent<T>[] = [];
  let cluster: { event: CalendarEvent<T>; column: number }[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flushCluster = () => {
    const columnEnds: number[] = [];
    for (const item of cluster) {
      let column = columnEnds.findIndex((end) => end <= item.event.start.getTime());
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.event.end.getTime());
      } else {
        columnEnds[column] = item.event.end.getTime();
      }
      item.column = column;
    }
    for (const item of cluster) {
      positioned.push({
        event: item.event,
        startHours: differenceInMinutes(item.event.start, dayStart) / MINUTES_PER_HOUR,
        durationHours: Math.max(
          differenceInMinutes(item.event.end, item.event.start) / MINUTES_PER_HOUR,
          MIN_DURATION_HOURS,
        ),
        column: item.column,
        columns: columnEnds.length,
      });
    }
    cluster = [];
  };

  for (const event of sorted) {
    if (cluster.length > 0 && event.start.getTime() >= clusterEnd) flushCluster();
    cluster.push({ event, column: 0 });
    clusterEnd = Math.max(clusterEnd, event.end.getTime());
  }
  if (cluster.length > 0) flushCluster();

  return positioned;
}
