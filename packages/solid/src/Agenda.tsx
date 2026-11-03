import { Dynamic, type JSX } from "@solidjs/web";
import type { CalendarEvent, EventAccessibilityLabeler } from "@super-calendar/core/vanilla";
import {
  eventTimeLabel,
  getIsToday,
  isAllDayEvent,
  isBackgroundEvent,
} from "@super-calendar/core/vanilla";
import { format, isSameDay, type Locale, startOfDay } from "date-fns";
import { type Component, createMemo, Show } from "solid-js";
import { withDefaults } from "./props";
import { createSlots, type ResolvedSlot, type SlotStyleProps } from "./slots";
import { css, type CSSProperties } from "./styles";
import { mergeSolidTheme, type SolidCalendarTheme } from "./theme";
import { VirtualList } from "./VirtualList";

/**
 * Styleable parts of {@link Agenda}. Pass a class or inline style per slot via the
 * `classNames` / `styles` props.
 */
export type AgendaSlot = "dayHeader" | "eventRow" | "event" | "empty";

/** Props passed to a custom agenda (schedule) event renderer. */
export interface SolidAgendaEventArgs<T = unknown> {
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
export type SolidAgendaEvent<T = unknown> = Component<SolidAgendaEventArgs<T>>;

/** Props for {@link Agenda}. */
export interface AgendaProps<T = unknown> extends SlotStyleProps<AgendaSlot> {
  /** Events to list. The consumer controls which (and therefore the date range). */
  events: CalendarEvent<T>[];
  /** date-fns locale for the day headers and time labels. */
  locale?: Locale;
  /** Render times in 12-hour AM/PM (default false, 24h). */
  ampm?: boolean;
  /** Highlight this date's header instead of the real "today". */
  activeDate?: Date;
  /** Theme overrides; falls back to the default light theme. */
  theme?: Partial<SolidCalendarTheme>;
  /** Height of the scroll viewport, in px (default 480). */
  height?: number | string;
  /** Replace the built-in event row. */
  renderEvent?: SolidAgendaEvent<T>;
  /**
   * Override the screen-reader label for each event row. Receives the event and a
   * `{ mode: "schedule", isAllDay, ampm }` context; return the full text to
   * announce. Defaults to the row's own text content.
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;
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
  | {
      kind: "header";
      date: Date;
      key: string;
    }
  | {
      kind: "event";
      event: CalendarEvent<T>;
      key: string;
    };
function DefaultAgendaRow<T>(
  incoming: SolidAgendaEventArgs<T> & {
    cardProps: ResolvedSlot;
  },
) {
  const props = withDefaults(
    {
      ampm: false,
    } satisfies Partial<
      SolidAgendaEventArgs<T> & {
        cardProps: ResolvedSlot;
      }
    >,
    incoming,
  );
  const time = createMemo(
    () =>
      eventTimeLabel({
        mode: "schedule",
        isAllDay: props.isAllDay,
        start: props.event.start,
        end: props.event.end,
        ampm: props.ampm,
        showTime: true,
      }) ?? "",
  );
  // A filled card with the title on top and the time below, matching the native
  // schedule row.
  return (
    <div {...props.cardProps}>
      <div
        style={css({
          fontWeight: 600,
          fontSize: 14,
        })}
      >
        {props.event.title}
      </div>
      {time() ? (
        <div
          style={css({
            fontSize: 13,
            opacity: 0.75,
          })}
        >
          {time()}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A vertical, day-grouped list of events: the schedule view, with plain DOM
 * elements. Events are sorted by start and grouped under a date header per day;
 * the consumer controls which events (and therefore which dates) are shown. The
 * Solid agenda with measured, virtualized rows.
 *
 * @example
 * ```tsx
 * <Agenda events={events} onPressEvent={(e) => console.log(e.title)} />
 * ```
 */
export function Agenda<T = unknown>(incoming: AgendaProps<T>): JSX.Element {
  const props = withDefaults(
    {
      ampm: false,
      height: 480,
    } satisfies Partial<AgendaProps<T>>,
    incoming,
  );
  const theme = createMemo(() => mergeSolidTheme(props.theme));
  const slot = createSlots<AgendaSlot>(props);
  const Renderer = createMemo(() => props.renderEvent);
  const rows = createMemo<Row<T>[]>(() => {
    const sorted = props.events // Background events shade the grids; they have no agenda row.
      .filter((event) => !isBackgroundEvent(event))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const out: Row<T>[] = [];
    let currentDay: Date | null = null;
    sorted.forEach((event, index) => {
      if (!currentDay || !isSameDay(event.start, currentDay)) {
        currentDay = startOfDay(event.start);
        out.push({
          kind: "header",
          date: currentDay,
          key: `h-${currentDay.toISOString()}`,
        });
      }
      out.push({
        kind: "event",
        event,
        key: `e-${event.start.toISOString()}-${index}`,
      });
    });
    return out;
  });
  const Header = (row: { date: Date }): JSX.Element => {
    const highlighted = createMemo(() =>
      props.activeDate ? isSameDay(row.date, props.activeDate) : getIsToday(row.date),
    );
    const label = createMemo(() => format(row.date, "EEEE, d LLLL", { locale: props.locale }));
    const headerProps = createMemo(() =>
      slot("dayHeader", {
        base: props.onPressDay
          ? {
              display: "block",
              width: "100%",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
              textAlign: "left",
            }
          : { display: "block", width: "100%" },
        themed: {
          padding: "12px 12px 4px",
          fontSize: 13,
          fontWeight: 600,
          color: highlighted() ? theme().todayBackground : theme().textMuted,
        },
      }),
    );
    return (
      <Show when={!!props.onPressDay} fallback={<div {...headerProps()}>{label()}</div>}>
        <button type="button" onClick={() => props.onPressDay?.(row.date)} {...headerProps()}>
          {label()}
        </button>
      </Show>
    );
  };
  const EventRow = (row: { event: CalendarEvent<T> }): JSX.Element => {
    const args = createMemo<SolidAgendaEventArgs<T>>(() => ({
      event: row.event,
      mode: "schedule",
      isAllDay: isAllDayEvent(row.event),
      ampm: props.ampm,
      onPress: () => props.onPressEvent?.(row.event),
    }));
    return (
      <button
        type="button"
        onClick={() => props.onPressEvent?.(row.event)}
        aria-label={props.eventAccessibilityLabel?.(row.event, {
          mode: "schedule",
          isAllDay: isAllDayEvent(row.event),
          ampm: props.ampm,
        })}
        {...slot("eventRow", {
          base: {
            display: "block",
            width: "100%",
            textAlign: "left",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            font: "inherit",
          },
          themed: { padding: "2px 12px" },
        })}
      >
        <Show
          when={Renderer()}
          fallback={
            <DefaultAgendaRow
              {...args()}
              cardProps={slot("event", {
                themed: {
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: theme().eventBackground,
                  color: theme().eventText,
                },
              })}
            />
          }
        >
          <Dynamic component={Renderer()} {...args()} />
        </Show>
      </button>
    );
  };
  return (
    <div
      class={props.className}
      style={css({ fontFamily: theme().fontFamily, color: theme().text, ...props.style })}
    >
      <VirtualList
        data={rows()}
        keyExtractor={(row: Row<T>) => row.key}
        estimatedItemSize={44}
        style={css({ height: props.height, overflowY: "auto" })}
        renderItem={(row) => {
          const header = createMemo(() => (row.item.kind === "header" ? row.item : undefined));
          const event = createMemo(() => (row.item.kind === "event" ? row.item.event : undefined));
          return (
            <>
              <Show when={header()}>{(value) => <Header date={value().date} />}</Show>
              <Show when={event()}>{(value) => <EventRow event={value()} />}</Show>
            </>
          );
        }}
      />
      <Show when={rows().length === 0}>
        <div
          {...slot("empty", {
            themed: { padding: "16px 12px", color: theme().textMuted, fontSize: 14 },
          })}
        >
          No events
        </div>
      </Show>
    </div>
  );
}
