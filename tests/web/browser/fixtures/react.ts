import { createElement, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
export {
  MonthList,
  ResourceTimeline,
  TimeGrid,
  DatePicker,
  DateRangePicker,
} from "@calendar-browser/library";

export function useFixtureState<T>(initial: T) {
  const [value, update] = useState(initial);
  return [() => value, update] as const;
}

export function mount(View: ComponentType) {
  createRoot(document.getElementById("root")!).render(createElement(View));
}
