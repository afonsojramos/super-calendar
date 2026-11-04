import { createSignal, type Component } from "solid-js";
import { render } from "@solidjs/web";
export {
  MonthList,
  ResourceTimeline,
  TimeGrid,
  DatePicker,
  DateRangePicker,
} from "@calendar-browser/library";

export function useFixtureState<T>(initial: T) {
  return createSignal<T>(() => initial);
}

export function mount(View: Component) {
  render(() => View({}), document.getElementById("root")!);
}
