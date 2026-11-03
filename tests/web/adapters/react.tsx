import "./react-list";
import { vi, type MockInstance } from "vitest";
import { createElement, useState, type ComponentType } from "react";
import { render as renderRoot, renderHook, type RenderResult } from "@testing-library/react";
import { useEventSource, useNow } from "@super-calendar/core";
import type { EventSource, EventSourceOptions } from "@super-calendar/core/vanilla";
import { TimeGrid, type TimeGridProps } from "../../../packages/dom/src/TimeGrid";
import {
  DatePicker,
  DateRangePicker,
  type DatePickerProps,
  type DateRangePickerProps,
} from "../../../packages/dom/src/DateRangePicker";

export { act, cleanup, fireEvent } from "@testing-library/react";
import {
  Agenda,
  Calendar,
  MonthList,
  MonthView,
  ResourceTimeline,
  YearView,
  type ResourceTimelineProps,
  type MonthListProps,
  type DomRenderEventArgs as RenderEventArgs,
} from "../../../packages/dom/src";
export {
  Agenda,
  Calendar,
  DatePicker,
  DateRangePicker,
  MonthList,
  MonthView,
  ResourceTimeline,
  TimeGrid,
  YearView,
};
export type {
  ResourceTimelineProps,
  TimeGridProps,
  RenderEventArgs,
  DatePickerProps,
  MonthListProps,
};
export const rendererName = "React DOM";

export function render<P extends object>(
  View: ComponentType<P>,
  initial: P,
): Omit<RenderResult, "rerender"> & { rerender: (props: P) => void } {
  const view = renderRoot(createElement(View, initial));
  return { ...view, rerender: (props: P) => view.rerender(createElement(View, props)) };
}

export function ControlledTimeGrid(props: TimeGridProps) {
  const [date, setDate] = useState(props.date);
  return (
    <TimeGrid
      {...props}
      date={date}
      onChangeDate={(next) => {
        props.onChangeDate?.(next);
        setDate(next);
      }}
    />
  );
}

export function ControlledDatePicker(props: Omit<DatePickerProps, "onChange">) {
  const [value, setValue] = useState(props.value);
  return <DatePicker {...props} value={value} onChange={setValue} />;
}

export function ControlledDateRangePicker(props: Omit<DateRangePickerProps, "onChange">) {
  const [value, setValue] = useState(props.value);
  return <DateRangePicker {...props} value={value} onChange={setValue} />;
}

export function renderNow(options: Parameters<typeof useNow>[1] = {}) {
  const view = renderHook(() => useNow(true, options));
  return { ...view, result: () => view.result.current };
}

export function renderEventSource(initial: {
  source: EventSource;
  options?: EventSourceOptions<unknown>;
}) {
  const view = renderHook((props) => useEventSource(props.source, props.options), {
    initialProps: initial,
  });
  return {
    ...view,
    result: {
      events: () => view.result.current.events,
      loading: () => view.result.current.loading,
      error: () => view.result.current.error,
      refetch: () => view.result.current.refetch(),
    },
  };
}

let warnings: MockInstance;
let errors: MockInstance;
beforeEach(() => {
  warnings = vi.spyOn(console, "warn");
  errors = vi.spyOn(console, "error");
});
afterEach(() => {
  try {
    expect(warnings).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    warnings.mockRestore();
    errors.mockRestore();
  }
});
