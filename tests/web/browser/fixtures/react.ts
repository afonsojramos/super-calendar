import { createElement, useLayoutEffect, useState, version, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
export {
  Calendar,
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

export function useFixtureMount(callback: () => void) {
  useLayoutEffect(callback, []);
}

export function mount(View: ComponentType) {
  document.documentElement.dataset.reactVersion = version;
  createRoot(document.getElementById("root")!).render(createElement(View));
}
