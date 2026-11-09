import { vi } from "vitest";
import type { CalendarEvent, CreateGhostArgs } from "@super-calendar/core/vanilla";
import {
  Calendar,
  MonthView,
  MultiWeekView,
  fireEvent,
  render,
  rendererName,
} from "@calendar-test/renderer";

const date = new Date(2026, 6, 15);
const events: CalendarEvent[] = [];
const label = (range: CreateGhostArgs) => `${range.start.getDate()} to ${range.end.getDate()}`;
const Draft = (props: CreateGhostArgs) => <span>{`Draft ${label(props)}`}</span>;
const Other = (props: CreateGhostArgs) => <b>{`Other ${label(props)}`}</b>;
const cell = (container: HTMLElement, day: string) =>
  container.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
const previews = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-slot="createGhost"]'),
];
const down = (container: HTMLElement, day: string) =>
  fireEvent.pointerDown(cell(container, day), { pointerId: 1, button: 0 });
const move = (container: HTMLElement, day: string) =>
  fireEvent.pointerEnter(cell(container, day), { pointerId: 1, buttons: 1 });
const up = () => fireEvent.pointerUp(window, { pointerId: 1, button: 0 });

describe(rendererName, () => {
  describe("MonthView creation content", () => {
    it.each([false, true])(
      "shows the committed full range in each covered row, reversed: %s",
      (reversed) => {
        const onCreateEvent = vi.fn();
        const view = render(MonthView, {
          date,
          events,
          weekStartsOn: 1,
          onCreateEvent,
          renderCreateGhost: Draft,
        });
        down(view.container, reversed ? "2026-07-20" : "2026-07-17");
        expect(previews(view.container).map((el) => el.textContent)).toEqual([
          reversed ? "Draft 20 to 21" : "Draft 17 to 18",
        ]);
        move(view.container, reversed ? "2026-07-17" : "2026-07-20");
        expect(previews(view.container).map((el) => el.textContent)).toEqual([
          "Draft 17 to 21",
          "Draft 17 to 21",
        ]);
        up();
        expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
          new Date(2026, 6, 17),
          new Date(2026, 6, 21),
        );
        expect(previews(view.container)).toHaveLength(0);
      },
    );

    it("allows a preview in an empty month without an events prop", () => {
      const view = render(MonthView, { date, onCreateEvent: vi.fn(), renderCreateGhost: Draft });
      down(view.container, "2026-07-15");
      expect(previews(view.container).map((el) => el.textContent)).toEqual(["Draft 15 to 16"]);
    });

    it("does not create on a plain click", () => {
      const onCreateEvent = vi.fn();
      const onPressDay = vi.fn();
      const view = render(MonthView, {
        date,
        events,
        onCreateEvent,
        onPressDay,
        renderCreateGhost: Draft,
      });
      down(view.container, "2026-07-15");
      expect(previews(view.container)).toHaveLength(1);
      up();
      fireEvent.click(cell(view.container, "2026-07-15"));
      expect(onCreateEvent).not.toHaveBeenCalled();
      expect(onPressDay).toHaveBeenCalledExactlyOnceWith(new Date(2026, 6, 15));
      expect(previews(view.container)).toHaveLength(0);
    });

    it.each(["renderer", "callback"])("keeps default behavior with only a %s", (enabled) => {
      const onSelectDrag = vi.fn();
      const view = render(MonthView, {
        date,
        events,
        onSelectDrag,
        onCreateEvent: enabled === "callback" ? vi.fn() : undefined,
        renderCreateGhost: enabled === "renderer" ? Draft : undefined,
      });
      down(view.container, "2026-07-15");
      move(view.container, "2026-07-16");
      expect(onSelectDrag).toHaveBeenCalled();
      expect(previews(view.container)).toHaveLength(0);
      up();
    });

    it("refreshes the renderer and removes content when creation is disabled", () => {
      const props: Parameters<typeof MonthView>[0] = {
        date,
        events,
        onCreateEvent: vi.fn(),
        renderCreateGhost: Draft,
      };
      const view = render(MonthView, props);
      down(view.container, "2026-07-15");
      move(view.container, "2026-07-16");
      view.rerender({ ...props, renderCreateGhost: Other });
      expect(previews(view.container).map((el) => el.textContent)).toEqual(["Other 15 to 17"]);
      view.rerender({ ...props, onCreateEvent: undefined });
      expect(previews(view.container)).toHaveLength(0);
      up();
      expect(props.onCreateEvent).not.toHaveBeenCalled();
    });

    it("clears the preview on unmount without committing", () => {
      const onCreateEvent = vi.fn();
      const view = render(MonthView, { date, events, onCreateEvent, renderCreateGhost: Draft });
      down(view.container, "2026-07-15");
      move(view.container, "2026-07-16");
      expect(previews(view.container)).toHaveLength(1);
      view.unmount();
      expect(previews(view.container)).toHaveLength(0);
      up();
      expect(onCreateEvent).not.toHaveBeenCalled();
    });

    it("retains slot geometry with custom classes and hides content from interaction", () => {
      const view = render(MonthView, {
        date,
        events,
        onCreateEvent: vi.fn(),
        renderCreateGhost: Draft,
        chipHeight: 27,
        classNames: { createGhost: "draft" },
        styles: { createGhost: { backgroundColor: "purple" } },
      });
      down(view.container, "2026-07-15");
      const preview = previews(view.container)[0]!;
      expect(preview.className).toBe("draft");
      expect(preview.style.position).toBe("absolute");
      expect(preview.style.height).toBe("27px");
      expect(preview.style.backgroundColor).toBe("purple");
      expect(preview.style.pointerEvents).toBe("none");
      expect(preview.style.overflow).toBe("hidden");
      expect(preview.getAttribute("aria-hidden")).toBe("true");
      expect(preview.hasAttribute("inert")).toBe(true);
      up();
    });

    it("keeps the range Dates stable during updates within the same day", () => {
      const ids = new WeakMap<Date, number>();
      let next = 0;
      const id = (date: Date) => {
        let value = ids.get(date);
        if (value === undefined) {
          value = next++;
          ids.set(date, value);
        }
        return value;
      };
      const Tracked = (props: CreateGhostArgs) => (
        <span data-range-id={`${id(props.start)}:${id(props.end)}`}>{label(props)}</span>
      );
      const props = { date, events, onCreateEvent: vi.fn(), renderCreateGhost: Tracked };
      const view = render(MonthView, props);
      down(view.container, "2026-07-15");
      const rangeId = () =>
        view.container.querySelector("[data-range-id]")?.getAttribute("data-range-id");
      const initial = rangeId();
      move(view.container, "2026-07-15");
      view.rerender({ ...props, events: [...events] });
      expect(rangeId()).toBe(initial);
      move(view.container, "2026-07-16");
      expect(rangeId()).not.toBe(initial);
      up();
    });

    it("does not render creation content while moving an event", () => {
      const event = {
        title: "Existing",
        start: new Date(2026, 6, 15),
        end: new Date(2026, 6, 16),
        allDay: true,
      };
      const onCreateEvent = vi.fn();
      const onDragEvent = vi.fn();
      const view = render(MonthView, {
        date,
        events: [event],
        onCreateEvent,
        onDragEvent,
        renderCreateGhost: Draft,
      });
      fireEvent.pointerDown(view.getByRole("button", { name: /^Existing,/ }), {
        pointerId: 1,
        button: 0,
      });
      move(view.container, "2026-07-16");
      expect(previews(view.container)).toHaveLength(0);
      up();
      expect(onCreateEvent).not.toHaveBeenCalled();
      expect(onDragEvent).toHaveBeenCalledTimes(1);
    });

    it("ignores disabled destinations", () => {
      const onCreateEvent = vi.fn();
      const view = render(MonthView, {
        date,
        events,
        onCreateEvent,
        renderCreateGhost: Draft,
        isDateDisabled: (day) => day.getDate() === 17,
      });
      down(view.container, "2026-07-15");
      move(view.container, "2026-07-16");
      move(view.container, "2026-07-17");
      expect(previews(view.container)[0]?.textContent).toBe("Draft 15 to 17");
      up();
      expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 6, 15),
        new Date(2026, 6, 17),
      );
    });

    it("clips rows to visible days when weekends and adjacent months are hidden", () => {
      const onCreateEvent = vi.fn();
      const view = render(MonthView, {
        date,
        events,
        onCreateEvent,
        renderCreateGhost: Draft,
        weekStartsOn: 1,
        hiddenDays: [0, 6],
        showAdjacentMonths: false,
      });
      down(view.container, "2026-07-01");
      move(view.container, "2026-07-06");
      const ghosts = previews(view.container);
      expect(ghosts.map((el) => el.textContent)).toEqual(["Draft 1 to 7", "Draft 1 to 7"]);
      expect(ghosts[0]?.closest("[data-day]")?.getAttribute("data-day")).toBe("2026-07-01");
      expect(ghosts[0]?.style.width).toBe("calc(300% - 4px)");
      expect(ghosts[1]?.style.width).toBe("calc(100% - 4px)");
      up();
    });

    it.each(["month", "multiweek"] as const)("forwards content through Calendar %s", (mode) => {
      const onCreateEvent = vi.fn();
      const view = render(Calendar, {
        date,
        events,
        mode,
        onCreateEvent,
        renderCreateGhost: Draft,
      });
      down(view.container, "2026-07-15");
      move(view.container, "2026-07-16");
      expect(previews(view.container)[0]?.textContent).toBe("Draft 15 to 17");
      up();
      expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2026, 6, 15),
        new Date(2026, 6, 17),
      );
    });

    it("renders content directly in MultiWeekView and cancels when its window changes", () => {
      const props = {
        date,
        events,
        numberOfWeeks: 2,
        onCreateEvent: vi.fn(),
        renderCreateGhost: Draft,
      };
      const view = render(MultiWeekView, props);
      down(view.container, "2026-07-15");
      move(view.container, "2026-07-16");
      expect(previews(view.container)[0]?.textContent).toBe("Draft 15 to 17");
      view.rerender({ ...props, date: new Date(2026, 7, 15) });
      expect(previews(view.container)).toHaveLength(0);
      up();
      expect(props.onCreateEvent).not.toHaveBeenCalled();
    });
  });
});
