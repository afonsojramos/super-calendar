import { LegendList } from "@legendapp/list/react";
import { format, isSameDay, type Locale, startOfDay } from "date-fns";
import { type ComponentType, type CSSProperties, type ReactElement, useMemo } from "react";
import type { CalendarEvent } from "@super-calendar/core";
import { eventTimeLabel, getIsToday, isAllDayEvent } from "@super-calendar/core";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/** Props passed to a custom agenda (schedule) event renderer. */
export interface DomAgendaEventArgs<T = unknown> {
  /** The event to render. */
  event: CalendarEvent<T>;
  /** Always "schedule"; lets a renderer shared with other views branch on it. */
  mode: "schedule";
  /** Whether the event is all-day. */
  isAllDay: boolean;
  /** Render the time range in 12-hour AM/PM. */
  ampm?: boolean;
  /** Call to fire the view's `onPressEvent` for this row. */
  onPress: () => void;
}

/** A component that renders a single agenda (schedule) event row. */
export type DomAgendaEvent<T = unknown> = ComponentType<DomAgendaEventArgs<T>>;

/** Props for {@link Agenda}. */
export interface AgendaProps<T = unknown> {
  /** Events to list. The consumer controls which (and therefore the date range). */
  events: CalendarEvent<T>[];
  /** date-fns locale for the day headers and time labels. */
  locale?: Locale;
  /** Render times in 12-hour AM/PM (default false, 24h). */
  ampm?: boolean;
  /** Highlight this date's header instead of the real "today". */
  activeDate?: Date;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<DomCalendarTheme>;
  /** Height of the scroll viewport, in px (default 480). */
  height?: number | string;
  /** Replace the built-in event row. */
  renderEvent?: DomAgendaEvent<T>;
  /** Tap an event row. */
  onPressEvent?: (event: CalendarEvent<T>) => void;
  /** Tap a day's header. */
  onPressDay?: (date: Date) => void;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

type Row<T> =
  | { kind: "header"; date: Date; key: string }
  | { kind: "event"; event: CalendarEvent<T>; key: string };

function DefaultAgendaRow<T>({
  event,
  isAllDay,
  ampm = false,
  theme,
}: DomAgendaEventArgs<T> & { theme: DomCalendarTheme }) {
  const time =
    eventTimeLabel({
      mode: "schedule",
      isAllDay,
      start: event.start,
      end: event.end,
      ampm,
      showTime: true,
    }) ?? "";
  // A filled card with the title on top and the time below, matching the native
  // schedule row.
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        background: theme.eventBackground,
        color: theme.eventText,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{event.title}</div>
      {time ? <div style={{ fontSize: 13, opacity: 0.75 }}>{time}</div> : null}
    </div>
  );
}

/**
 * A vertical, day-grouped list of events: the schedule view, with plain DOM
 * elements. Events are sorted by start and grouped under a date header per day;
 * the consumer controls which events (and therefore which dates) are shown. The
 * react-dom counterpart of the React Native `Agenda`.
 *
 * @example
 * ```tsx
 * <Agenda events={events} onPressEvent={(e) => console.log(e.title)} />
 * ```
 */
export function Agenda<T = unknown>({
  events,
  locale,
  ampm = false,
  activeDate,
  theme: themeOverrides,
  height = 480,
  renderEvent,
  onPressEvent,
  onPressDay,
  className,
  style,
}: AgendaProps<T>): ReactElement {
  const theme = useMemo(() => mergeDomTheme(themeOverrides), [themeOverrides]);
  const Renderer = renderEvent;

  const rows = useMemo<Row<T>[]>(() => {
    const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
    const out: Row<T>[] = [];
    let currentDay: Date | null = null;
    sorted.forEach((event, index) => {
      if (!currentDay || !isSameDay(event.start, currentDay)) {
        currentDay = startOfDay(event.start);
        out.push({ kind: "header", date: currentDay, key: `h-${currentDay.toISOString()}` });
      }
      out.push({ kind: "event", event, key: `e-${event.start.toISOString()}-${index}` });
    });
    return out;
  }, [events]);

  return (
    <div
      className={className}
      style={{ fontFamily: theme.fontFamily, color: theme.text, ...style }}
    >
      <LegendList
        data={rows}
        keyExtractor={(row: Row<T>) => row.key}
        recycleItems={false}
        estimatedItemSize={44}
        style={{ height, overflowY: "auto" }}
        renderItem={({ item }: { item: Row<T> }) => {
          if (item.kind === "header") {
            const highlighted = activeDate
              ? isSameDay(item.date, activeDate)
              : getIsToday(item.date);
            const label = format(item.date, "EEEE, d LLLL", locale ? { locale } : undefined);
            const color = highlighted ? theme.todayBackground : theme.textMuted;
            return onPressDay ? (
              <button
                type="button"
                onClick={() => onPressDay(item.date)}
                style={{
                  ...headerStyle,
                  color,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  font: "inherit",
                  textAlign: "left",
                }}
              >
                {label}
              </button>
            ) : (
              <div style={{ ...headerStyle, color }}>{label}</div>
            );
          }
          const event = item.event;
          const isAllDay = isAllDayEvent(event);
          const onPress = () => onPressEvent?.(event);
          const args: DomAgendaEventArgs<T> = { event, mode: "schedule", isAllDay, ampm, onPress };
          return (
            <button
              type="button"
              onClick={onPress}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                font: "inherit",
                padding: "2px 12px",
              }}
            >
              {Renderer ? <Renderer {...args} /> : <DefaultAgendaRow {...args} theme={theme} />}
            </button>
          );
        }}
      />
      {rows.length === 0 ? (
        <div style={{ padding: "16px 12px", color: theme.textMuted, fontSize: 14 }}>No events</div>
      ) : null}
    </div>
  );
}

const headerStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 12px 4px",
  fontSize: 13,
  fontWeight: 600,
};
