import type { ComponentType, CSSProperties, ReactElement } from "react";
import { useMemo } from "react";
import {
  type CalendarEvent,
  eventTimeLabel,
  formatHour,
  layoutDayEvents,
} from "@super-calendar/core";
import { createSlots, type ResolvedSlot, type SlotStyleProps } from "./slots";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/**
 * Styleable parts of {@link ResourceTimeline}. Pass a class or inline style per
 * slot via the `classNames` / `styles` props.
 */
export type ResourceTimelineSlot =
  | "header"
  | "corner"
  | "timeAxis"
  | "hourTick"
  | "resourceLabel"
  | "row"
  | "track"
  | "gridLines"
  | "event"
  | "eventBox";

/** A schedulable lane (room, person, machine) that events are grouped under. */
export interface Resource {
  /** Stable id events reference via their `resourceId`. */
  id: string;
  /** Row label; falls back to the id. */
  title?: string;
}

/** Props passed to a custom resource-timeline event renderer. */
export interface ResourceEventArgs<T = unknown> {
  event: CalendarEvent<T>;
  /** Pixel width of the event bar. */
  width: number;
  onPress: () => void;
}

/** Props for {@link ResourceTimeline}. */
export interface ResourceTimelineProps<T = unknown> extends SlotStyleProps<ResourceTimelineSlot> {
  /** The day to lay out along the horizontal axis. */
  date: Date;
  /** The rows, top to bottom. */
  resources: Resource[];
  /** Events; each is placed in the row named by `resourceId(event)`. */
  events: CalendarEvent<T>[];
  /** Read an event's resource id. Default: `event.resourceId`. */
  resourceId?: (event: CalendarEvent<T>) => string | undefined;
  /** First hour shown (default 0). */
  startHour?: number;
  /** Last hour shown, exclusive (default 24). */
  endHour?: number;
  /** Pixels per hour along the axis (default 80). */
  hourWidth?: number;
  /** Height of each resource row in px (default 56). */
  rowHeight?: number;
  /** Width of the left resource-label column in px (default 140). */
  labelWidth?: number;
  /** 12-hour AM/PM axis labels (default false). */
  ampm?: boolean;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<DomCalendarTheme>;
  /** Custom event renderer; falls back to the built-in bar. */
  renderEvent?: ComponentType<ResourceEventArgs<T>>;
  /** Tap an event. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function DefaultBar<T>({
  event,
  boxProps,
  theme,
}: ResourceEventArgs<T> & { boxProps: ResolvedSlot; theme: DomCalendarTheme }) {
  const time = eventTimeLabel({
    mode: "day",
    isAllDay: false,
    start: event.start,
    end: event.end,
    ampm: false,
    showTime: true,
  });
  const base: CSSProperties = { height: "100%", boxSizing: "border-box", overflow: "hidden" };
  const themed: CSSProperties = {
    padding: "2px 6px",
    borderRadius: 6,
    background: theme.eventBackground,
    color: theme.eventText,
    fontSize: 12,
  };
  return (
    <div
      className={boxProps.className}
      data-slot={boxProps["data-slot"]}
      style={
        boxProps.className
          ? { ...base, ...boxProps.style }
          : { ...base, ...themed, ...boxProps.style }
      }
    >
      <div
        style={{
          fontWeight: 600,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {event.title}
      </div>
      {time ? <div style={{ opacity: 0.75, fontSize: 11 }}>{time}</div> : null}
    </div>
  );
}

/**
 * A horizontal resource timeline: rows are resources (rooms, people, machines)
 * and the x-axis is one day's hours. Events sit in their resource's row, and
 * overlapping events in the same row stack into sub-lanes (via the shared
 * `layoutDayEvents`). A static v1 — no drag or zoom yet.
 *
 * @example
 * ```tsx
 * <ResourceTimeline
 *   date={new Date()}
 *   resources={[{ id: "a", title: "Room A" }, { id: "b", title: "Room B" }]}
 *   events={events} // each event carries a `resourceId`
 * />
 * ```
 */
export function ResourceTimeline<T = unknown>({
  date,
  resources,
  events,
  resourceId = (event) => (event as { resourceId?: string }).resourceId,
  startHour = 0,
  endHour = 24,
  hourWidth = 80,
  rowHeight = 56,
  labelWidth = 140,
  ampm = false,
  theme: themeOverrides,
  renderEvent,
  onPressEvent,
  className,
  style,
  classNames,
  styles,
}: ResourceTimelineProps<T>): ReactElement {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const slot = createSlots<ResourceTimelineSlot>({ classNames, styles });
  const Renderer = renderEvent;

  const hours = useMemo(
    () => Array.from({ length: Math.max(0, endHour - startHour) }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const trackWidth = (endHour - startHour) * hourWidth;

  // Group the positioned (overlap-resolved) events by resource, once.
  const byResource = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutDayEvents<T>>>();
    for (const resource of resources) {
      const own = events.filter((e) => resourceId(e) === resource.id);
      map.set(resource.id, layoutDayEvents(own, date));
    }
    return map;
  }, [resources, events, resourceId, date]);

  const gridLines = `repeating-linear-gradient(to right, transparent 0, transparent ${hourWidth - 1}px, ${theme.gridLine} ${hourWidth - 1}px, ${theme.gridLine} ${hourWidth}px)`;

  return (
    <div
      className={className}
      style={{ fontFamily: theme.fontFamily, color: theme.text, overflowX: "auto", ...style }}
    >
      <div style={{ minWidth: labelWidth + trackWidth }}>
        {/* Header: corner + hour axis */}
        <div
          {...slot("header", {
            base: { display: "flex" },
            themed: { borderBottom: `1px solid ${theme.gridLine}` },
          })}
        >
          <div {...slot("corner", { base: { width: labelWidth, flex: "none" } })} />
          <div
            {...slot("timeAxis", { base: { position: "relative", height: 24, width: trackWidth } })}
          >
            {hours.map((h) => (
              <div
                key={h}
                {...slot("hourTick", {
                  base: { position: "absolute", left: (h - startHour) * hourWidth, top: 4 },
                  themed: { fontSize: 10, color: theme.textMuted },
                })}
              >
                {formatHour(h, { ampm })}
              </div>
            ))}
          </div>
        </div>

        {/* Resource rows */}
        {resources.map((resource) => {
          const positioned = byResource.get(resource.id) ?? [];
          return (
            <div
              key={resource.id}
              {...slot("row", {
                base: { display: "flex", height: rowHeight },
                themed: { borderBottom: `1px solid ${theme.gridLine}` },
              })}
            >
              <div
                {...slot("resourceLabel", {
                  base: {
                    width: labelWidth,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    boxSizing: "border-box",
                  },
                  themed: {
                    fontSize: 13,
                    fontWeight: 600,
                    borderRight: `1px solid ${theme.gridLine}`,
                  },
                })}
              >
                {resource.title ?? resource.id}
              </div>
              <div {...slot("track", { base: { position: "relative", width: trackWidth } })}>
                <div
                  aria-hidden
                  {...slot("gridLines", {
                    base: { position: "absolute", inset: 0, pointerEvents: "none" },
                    themed: { backgroundImage: gridLines },
                  })}
                />
                {positioned.map((pe, idx) => {
                  const left = clamp(pe.startHours - startHour, 0, endHour - startHour) * hourWidth;
                  const right =
                    clamp(pe.startHours + pe.durationHours - startHour, 0, endHour - startHour) *
                    hourWidth;
                  const width = Math.max(right - left, 2);
                  // Overlapping events in a row share the height as stacked sub-lanes.
                  const laneHeight = rowHeight / pe.columns;
                  const onPress = () => onPressEvent?.(pe.event);
                  const args: ResourceEventArgs<T> = { event: pe.event, width, onPress };
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={onPress}
                      aria-label={pe.event.title}
                      {...slot("event", {
                        base: {
                          position: "absolute",
                          left,
                          width,
                          top: pe.column * laneHeight,
                          height: laneHeight,
                          padding: 1,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          font: "inherit",
                          textAlign: "left",
                          boxSizing: "border-box",
                        },
                      })}
                    >
                      {Renderer ? (
                        <Renderer {...args} />
                      ) : (
                        <DefaultBar {...args} theme={theme} boxProps={slot("eventBox")} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
