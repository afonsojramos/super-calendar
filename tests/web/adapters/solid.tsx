import { createSignal, untrack } from "solid-js";
import type { EventSource, EventSourceOptions } from "@super-calendar/core/vanilla";
import {
  createEventSource,
  createNow,
  MultiWeekView,
  Calendar,
  type CalendarProps,
  type MultiWeekViewProps,
  type NowOptions,
} from "../../../packages/solid/src";
import { TimeGrid, type TimeGridProps } from "../../../packages/solid/src/TimeGrid";
import { renderState } from "../../support/solid-render";
import {
  DatePicker,
  DateRangePicker,
  type DatePickerProps,
  type DateRangePickerProps,
} from "../../../packages/solid/src/DateRangePicker";

export { act, cleanup, fireEvent, render } from "../../support/solid-render";
export {
  Agenda,
  Calendar,
  DatePicker,
  DateRangePicker,
  MonthList,
  MonthView,
  MultiWeekView,
  ResourceTimeline,
  TimeGrid,
  YearView,
  type ResourceTimelineProps,
  type MonthListProps,
  type DatePickerProps,
  type TimeGridProps,
  type SolidRenderEventArgs as RenderEventArgs,
} from "../../../packages/solid/src";
export const rendererName = "Solid";

export function ControlledTimeGrid(props: TimeGridProps) {
  const [date, setDate] = createSignal(untrack(() => props.date));
  return (
    <TimeGrid
      {...props}
      date={date()}
      onChangeDate={(next) => {
        props.onChangeDate?.(next);
        setDate(next);
      }}
    />
  );
}

export function ControlledMultiWeekView(props: MultiWeekViewProps) {
  const [selectedRange, setSelectedRange] = createSignal(untrack(() => props.selectedRange));
  return (
    <MultiWeekView
      {...props}
      events={props.events ? [...props.events] : undefined}
      selectedRange={selectedRange()}
      onSelectDrag={(start, end) => {
        setSelectedRange({ start, end });
        props.onSelectDrag?.(start, end);
      }}
      onCreateEvent={(start, end) => props.onCreateEvent?.(start, end)}
    />
  );
}

export function ControlledDragCalendar(
  props: CalendarProps & { refreshEventsOnDragStart: boolean },
) {
  const [started, setStarted] = createSignal(false);
  return (
    <>
      <output aria-label="Drag started">{String(started())}</output>
      <Calendar
        {...props}
        events={props.refreshEventsOnDragStart && started() ? props.events?.slice() : props.events}
        onDragStart={(event) => {
          setStarted(true);
          props.onDragStart?.(event);
        }}
      />
    </>
  );
}

export function ControlledDatePicker(props: Omit<DatePickerProps, "onChange">) {
  const [value, setValue] = createSignal(untrack(() => props.value));
  return <DatePicker {...props} value={value()} onChange={setValue} />;
}

export function ControlledDateRangePicker(props: Omit<DateRangePickerProps, "onChange">) {
  const [value, setValue] = createSignal(untrack(() => props.value));
  return <DateRangePicker {...props} value={value()} onChange={setValue} />;
}

export function renderNow(options: Omit<NowOptions, "enabled"> = {}) {
  return renderState(() => createNow(() => options), {});
}

export function renderEventSource(initial: {
  source: EventSource;
  options?: EventSourceOptions<unknown>;
}) {
  return renderState(
    (props) =>
      createEventSource(
        () => props.source,
        () => props.options ?? {},
      ),
    initial,
  );
}
