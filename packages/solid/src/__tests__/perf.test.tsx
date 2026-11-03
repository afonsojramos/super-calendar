import { untrack } from "solid-js";
import { MonthView, type CalendarEvent, type SolidMonthEventArgs } from "../index";
import { render } from "../../../../tests/support/solid-render";

// Solid has no React commit phase. Its corresponding cost guard preserves mounted
// days and custom renderers while updating the selection in place.
describe("Solid MonthView render cost", () => {
  it("updates selection without remounting days or event renderers", () => {
    let mounts = 0;
    const Chip = (props: SolidMonthEventArgs) => {
      untrack(() => mounts++);
      return <span>{props.event.title}</span>;
    };
    const date = new Date(2030, 0, 1);
    const events: CalendarEvent[] = [
      { title: "Planning", start: new Date(2030, 0, 8, 9), end: new Date(2030, 0, 8, 10) },
    ];
    const props = { date, events, weekStartsOn: 1 as const, renderEvent: Chip };
    const view = render(MonthView, {
      ...props,
      selectedRange: { start: new Date(2030, 0, 6), end: new Date(2030, 0, 10) },
    });
    const cells = [...view.container.querySelectorAll("[data-day]")];
    const chip = view.getByText("Planning");
    const afterMount = mounts;
    expect(afterMount).toBe(1);
    const end = view.container.querySelector('[data-day="2030-01-12"]')!;
    expect(end.hasAttribute("data-range")).toBe(false);
    view.rerender({
      ...props,
      selectedRange: { start: new Date(2030, 0, 6), end: new Date(2030, 0, 12) },
    });
    expect(end.hasAttribute("data-range")).toBe(true);
    const updated = [...view.container.querySelectorAll("[data-day]")];
    expect(updated).toHaveLength(cells.length);
    cells.forEach((cell, index) => expect(updated[index]).toBe(cell));
    expect(view.getByText("Planning")).toBe(chip);
    expect(mounts).toBe(afterMount);
  });
});
