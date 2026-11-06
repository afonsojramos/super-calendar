import { vi } from "vitest";
import { renderToString } from "@solidjs/web";
import type { CalendarMode } from "@super-calendar/core/vanilla";
import {
  Calendar,
  createEventSource,
  DatePicker,
  DateRangePicker,
  MonthList,
  ResourceTimeline,
} from "../index";

const date = new Date(2026, 6, 15);
const events = [
  { title: "Planning", start: new Date(2026, 6, 15, 9), end: new Date(2026, 6, 15, 10) },
];

describe("Solid server rendering", () => {
  it("does not start an event source or polling during server rendering", () => {
    const source = vi.fn(async () => events);
    const timer = vi.spyOn(globalThis, "setInterval");
    try {
      const html = renderToString(() => {
        const feed = createEventSource(
          () => source,
          () => ({ refetchIntervalMs: 1000 }),
        );
        return (
          <div>
            {feed.loading() ? "Loading" : "Ready"}: {feed.events().length}
          </div>
        );
      });
      expect(html).toContain("Loading");
      expect(source).not.toHaveBeenCalled();
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
    }
  });
  it.each<CalendarMode>([
    "month",
    "multiweek",
    "week",
    "day",
    "3days",
    "custom",
    "schedule",
    "year",
  ])("renders %s without a document or browser timers", (mode) => {
    expect(typeof document).toBe("undefined");
    const timer = vi.spyOn(globalThis, "setInterval");
    try {
      const html = renderToString(() => (
        <Calendar mode={mode} date={date} now={date} events={events} />
      ));
      expect(html.includes("NaN")).toBe(false);
      expect(html).toContain(mode === "year" ? "July" : "Planning");
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
    }
  });

  it("renders a bounded virtual month list with deterministic hydration identifiers", () => {
    const render = () =>
      renderToString(() => (
        <MonthList date={date} events={events} pastMonths={0} futureMonths={1000} />
      ));
    const html = render();
    expect(html).toBe(render());
    expect(html).toContain("Planning");
    expect((html.match(/data-virtual-row=/g) ?? []).length).toBeLessThan(10);
  });

  it.each(["horizontal", "vertical"] as const)(
    "renders resource lanes in %s orientation",
    (orientation) => {
      const html = renderToString(() => (
        <ResourceTimeline
          date={date}
          now={date}
          events={events}
          resources={[{ id: "a", title: "Room A" }]}
          resourceId={() => "a"}
          orientation={orientation}
        />
      ));
      expect(html).toContain("Room A");
      expect(html).toContain("Planning");
    },
  );

  it("renders closed, labelled picker triggers", () => {
    const html = renderToString(() => (
      <>
        <DatePicker value={date} onChange={() => {}} />
        <DateRangePicker value={null} onChange={() => {}} />
      </>
    ));
    expect(html).toContain("15 Jul 2026");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('role="dialog"');
  });
});
