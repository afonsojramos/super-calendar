import { vi } from "vitest";
import { addDays, addWeeks, format, startOfWeek } from "date-fns";
import type { CalendarEvent, WeekStartsOn } from "@super-calendar/core/vanilla";
import {
  act,
  Calendar,
  MultiWeekView,
  MonthView,
  fireEvent,
  render,
  rendererName,
} from "@calendar-test/renderer";

const date = new Date(2030, 11, 29);
const key = (date: Date) => format(date, "yyyy-MM-dd");
const cell = (root: HTMLElement, day: string) =>
  root.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
const days = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("[data-day]")];
const base = { date, weekStartsOn: 1 as WeekStartsOn };
const meeting: CalendarEvent = {
  title: "Meeting",
  start: new Date(2030, 11, 30, 9),
  end: new Date(2030, 11, 30, 10),
};

describe(rendererName, () => {
  describe("MultiWeekView", () => {
    it.each([2, 3, 4, 8])(
      "renders %i complete weeks across the year boundary without hour columns",
      (numberOfWeeks) => {
        const view = render(MultiWeekView, { ...base, numberOfWeeks });
        const shown = days(view.container).map((day) => day.dataset.day);
        const first = startOfWeek(date, { weekStartsOn: 1 });
        expect(shown).toEqual(
          Array.from({ length: numberOfWeeks * 7 }, (_, n) => key(addDays(first, n))),
        );
        expect(view.getByRole("grid").getAttribute("aria-label")).toContain("2030");
        expect(view.getByRole("grid").getAttribute("aria-label")).toContain("2031");
        expect(view.queryByText("09:00")).toBeNull();
        expect(view.container.querySelector('[data-slot="hours"]')).toBeNull();
      },
    );

    it("defaults to two weeks and retains event-grid cells with no events", () => {
      const view = render(MultiWeekView, base);
      expect(days(view.container)).toHaveLength(14);
      expect(days(view.container)[0].style.borderTopWidth).toBe("1px");
      expect(view.container.querySelectorAll('[data-day][tabindex="0"]')).toHaveLength(0);
    });

    it.each([
      ["multiweek", MultiWeekView],
      ["month", MonthView],
    ] as const)(
      "updates hidden weekdays and keeps header and cell tracks aligned in %s",
      (_name, Component) => {
        const view = render(Component, { ...base, hiddenDays: [] as number[], events: [] });
        view.rerender({ ...base, hiddenDays: [0, 6], events: [] });
        expect(
          days(view.container).every(
            (day) => ![0, 6].includes(new Date(`${day.dataset.day}T12:00:00`).getDay()),
          ),
        ).toBe(true);
        expect(view.queryByText("Sun")).toBeNull();
        expect(view.queryByText("Sat")).toBeNull();
        expect(view.getByText("Mon").parentElement!.style.gridTemplateColumns).toBe(
          "repeat(5, minmax(0, 1fr))",
        );
        expect(days(view.container)[0].parentElement!.style.gridTemplateColumns).toBe(
          "repeat(5, minmax(0, 1fr))",
        );
      },
    );

    it("updates the date, week start and count without keeping old cells", () => {
      const view = render(MultiWeekView, { ...base, numberOfWeeks: 2 });
      view.rerender({ ...base, date: new Date(2031, 1, 5), numberOfWeeks: 4 });
      expect(days(view.container)).toHaveLength(28);
      expect(cell(view.container, "2030-12-30")).toBeNull();
      expect(days(view.container)[0].dataset.day).toBe("2031-02-03");
      view.rerender({ date: new Date(2031, 1, 5), weekStartsOn: 0, numberOfWeeks: 3 });
      expect(days(view.container)[0].dataset.day).toBe("2031-02-02");
      expect(days(view.container)).toHaveLength(21);
    });

    it("roves over visible enabled dates and stops at either endpoint", () => {
      const view = render(MultiWeekView, {
        ...base,
        hiddenDays: [0, 6],
        keyboardDayNavigation: true,
        isDateDisabled: (day: Date) => day.getDate() === 24,
      });
      const grid = view.getByRole("grid");
      const focused = () =>
        view.container.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.dataset.day;
      expect(focused()).toBe("2030-12-23");
      fireEvent.keyDown(grid, { key: "ArrowLeft" });
      expect(focused()).toBe("2030-12-23");
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      expect(focused()).toBe("2030-12-25");
      fireEvent.keyDown(grid, { key: "ArrowDown" });
      expect(focused()).toBe("2031-01-01");
      fireEvent.keyDown(grid, { key: "End" });
      expect(focused()).toBe("2031-01-03");
      fireEvent.keyDown(grid, { key: "ArrowRight" });
      expect(focused()).toBe("2031-01-03");
      fireEvent.keyDown(grid, { key: "Home" });
      expect(focused()).toBe("2030-12-23");
    });

    it("prefers a visible selection and removes disabled tab stops without stealing focus", () => {
      const props = {
        ...base,
        keyboardDayNavigation: true,
        selectedDates: [new Date(2030, 11, 30)],
        hiddenDays: [] as number[],
        isDateDisabled: (_day: Date) => false,
      };
      const view = render(MultiWeekView, props);
      expect(cell(view.container, "2030-12-30").tabIndex).toBe(0);
      const outside = document.createElement("button");
      document.body.append(outside);
      outside.focus();
      view.rerender({ ...props, isDateDisabled: () => true });
      expect(view.container.querySelectorAll('[data-day][tabindex="0"]')).toHaveLength(0);
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it.each(["paging", "hidden", "disabled", "all disabled"])(
      "keeps owned DOM focus aligned after %s changes",
      (change) => {
        const props = {
          ...base,
          keyboardDayNavigation: true,
          hiddenDays: [] as number[],
          isDateDisabled: (_date: Date) => false,
        };
        const view = render(MultiWeekView, props);
        act(() => cell(view.container, "2030-12-26").focus());
        view.rerender({
          ...props,
          ...(change === "paging"
            ? { date: addWeeks(date, 2) }
            : change === "hidden"
              ? { hiddenDays: [2] }
              : {
                  isDateDisabled: (day: Date) => change === "all disabled" || day.getDate() === 26,
                }),
        });
        const target =
          change === "all disabled"
            ? view.getByRole("grid")
            : view.container.querySelector('[data-day][tabindex="0"]');
        expect(document.activeElement).toBe(target);
        if (change !== "all disabled")
          expect(target!.getAttribute("aria-disabled")).not.toBe("true");
      },
    );

    it("keeps focus on the grid when paging into an entirely disabled window", () => {
      const props = { ...base, keyboardDayNavigation: true, isDateDisabled: () => false };
      const view = render(MultiWeekView, props);
      act(() => cell(view.container, "2030-12-26").focus());
      view.rerender({ ...props, date: addWeeks(date, 2), isDateDisabled: () => true });
      expect(document.activeElement).toBe(view.getByRole("grid"));
      expect(view.container.querySelector('[data-day][tabindex="0"]')).toBeNull();
    });

    describe("held touch updates", () => {
      beforeEach(() => vi.useFakeTimers());
      afterEach(() => vi.useRealTimers());

      it.each(
        [0, 400].flatMap((delay) =>
          [
            "selection callback",
            "event removed",
            "event locked",
            "start callback",
            "minDate",
            "maxDate",
            "predicate",
          ].map((change) => ({ delay, change })),
        ),
      )("cancels a $delay ms hold when $change changes", async ({ delay, change }) => {
        const onSelectDrag = vi.fn();
        const replacement = vi.fn();
        const onCreateEvent = vi.fn();
        const onDragEvent = vi.fn();
        const onDragStart = vi.fn();
        const props = {
          ...base,
          events: [meeting],
          onSelectDrag,
          onCreateEvent,
          onDragEvent,
          onDragStart,
          eventStartEditable: true,
        };
        const view = render(MultiWeekView, props);
        const moving = change.startsWith("event") || change === "start callback";
        const origin = moving ? view.getByTitle("Meeting") : cell(view.container, "2030-12-30");
        const point = { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10 };
        fireEvent.pointerDown(origin, point);
        await act(() => vi.advanceTimersByTime(delay));
        onDragStart.mockClear();
        view.rerender({
          ...props,
          ...(change === "selection callback" ? { onSelectDrag: replacement } : {}),
          ...(change === "event removed" ? { events: [] } : {}),
          ...(change === "event locked" ? { eventStartEditable: false } : {}),
          ...(change === "start callback" ? { onDragStart: replacement } : {}),
          ...(change === "minDate" ? { minDate: new Date(2031, 0, 4) } : {}),
          ...(change === "maxDate" ? { maxDate: new Date(2030, 11, 31) } : {}),
          ...(change === "predicate" ? { isDateDisabled: () => true } : {}),
        });
        const original = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
        Object.defineProperty(document, "elementFromPoint", {
          configurable: true,
          value: () => cell(view.container, "2031-01-02"),
        });
        try {
          await act(() => vi.advanceTimersByTime(400));
          fireEvent.pointerMove(document, { ...point, clientY: 150 });
          fireEvent.pointerUp(document, { ...point, clientY: 150 });
          expect(onSelectDrag).not.toHaveBeenCalled();
          expect(replacement).not.toHaveBeenCalled();
          expect(onCreateEvent).not.toHaveBeenCalled();
          expect(onDragEvent).not.toHaveBeenCalled();
          expect(onDragStart).not.toHaveBeenCalled();
        } finally {
          if (original) Object.defineProperty(document, "elementFromPoint", original);
          else delete (document as { elementFromPoint?: unknown }).elementFromPoint;
          view.unmount();
        }
      });
    });

    it.each(["month", "multiweek"] as const)(
      "passes %s to visible and overflow custom chips",
      (mode) => {
        const events = Array.from({ length: 4 }, (_, i) => ({ ...meeting, title: `Custom ${i}` }));
        const view = render(Calendar, {
          ...base,
          mode,
          events,
          maxVisibleEventCount: 1,
          renderMonthEvent: (props: {
            event: CalendarEvent;
            mode?: string;
            onPress: () => void;
          }) => (
            <span>
              {props.mode}:{props.event.title}
            </span>
          ),
        });
        expect(view.getByText(`${mode}:Custom 0`)).toBeTruthy();
        fireEvent.click(view.getByLabelText(/more events, 30 December/));
        expect(view.getByText(`${mode}:Custom 3`)).toBeTruthy();
      },
    );

    it("reports multiweek to custom event labels and omits the time line", () => {
      const label = vi.fn(() => "Custom meeting label");
      const view = render(MultiWeekView, {
        ...base,
        events: [meeting],
        eventAccessibilityLabel: label,
      });
      expect(view.getByLabelText("Custom meeting label")).toBeTruthy();
      expect(label).toHaveBeenCalledWith(meeting, {
        mode: "multiweek",
        isAllDay: false,
        ampm: false,
      });
      expect(view.getByTitle("Meeting").textContent).toBe("Meeting");
    });

    it.each([false, true])(
      "creates an exclusive-midnight span across rows and years, reversed=%s",
      (reverse) => {
        const onCreateEvent = vi.fn();
        const view = render(MultiWeekView, { ...base, onCreateEvent });
        const endpoints = ["2030-12-27", "2031-01-02"];
        if (reverse) endpoints.reverse();
        fireEvent.pointerDown(cell(view.container, endpoints[0]), { button: 0 });
        fireEvent.pointerEnter(cell(view.container, endpoints[1]));
        fireEvent.pointerUp(window);
        expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
          new Date(2030, 11, 27),
          new Date(2031, 0, 3),
        );
      },
    );

    it("moves an event across a year boundary preserving its time and duration", () => {
      const onDragEvent = vi.fn();
      const view = render(MultiWeekView, { ...base, events: [meeting], onDragEvent });
      fireEvent.pointerDown(view.getByTitle("Meeting"), { button: 0 });
      fireEvent.pointerEnter(cell(view.container, "2031-01-02"));
      fireEvent.pointerUp(window);
      expect(onDragEvent).toHaveBeenCalledExactlyOnceWith(
        meeting,
        new Date(2031, 0, 2, 9),
        new Date(2031, 0, 2, 10),
      );
    });

    it.each(["date", "numberOfWeeks", "hiddenDays", "unmount"])(
      "cancels a stale sweep after %s changes",
      (change) => {
        const onCreateEvent = vi.fn();
        const props = { ...base, numberOfWeeks: 2, hiddenDays: [] as number[], onCreateEvent };
        const view = render(MultiWeekView, props);
        fireEvent.pointerDown(cell(view.container, "2030-12-27"), { button: 0 });
        fireEvent.pointerEnter(cell(view.container, "2031-01-02"));
        if (change === "unmount") view.unmount();
        else
          view.rerender({
            ...props,
            ...(change === "date"
              ? { date: addWeeks(date, 2) }
              : change === "numberOfWeeks"
                ? { numberOfWeeks: 3 }
                : { hiddenDays: [0, 6] }),
          });
        fireEvent.pointerUp(window);
        expect(onCreateEvent).not.toHaveBeenCalled();
      },
    );

    it("dismisses overflow when the displayed window changes", () => {
      const events = Array.from({ length: 4 }, (_, i) => ({ ...meeting, title: `Meeting ${i}` }));
      const props = { ...base, events, maxVisibleEventCount: 1 };
      const view = render(MultiWeekView, props);
      fireEvent.click(view.getByLabelText(/more events, 30 December/));
      expect(view.getByRole("dialog")).toBeTruthy();
      view.rerender({ ...props, date: addWeeks(date, 2) });
      expect(view.queryByRole("dialog")).toBeNull();
    });

    it("renders spanning events in each covered row and omits background events", () => {
      const view = render(MultiWeekView, {
        ...base,
        events: [
          { title: "Trip", start: new Date(2030, 11, 28), end: new Date(2031, 0, 2), allDay: true },
          { ...meeting, title: "Background", display: "background" },
        ],
      });
      expect(view.getAllByTitle("Trip")).toHaveLength(2);
      expect(view.queryByText("Background")).toBeNull();
    });
  });

  describe("multiweek Calendar", () => {
    it.each([2, 3, 4, 8])("pages %i weeks in either direction", (numberOfWeeks) => {
      const onChangeDate = vi.fn();
      const view = render(Calendar, { ...base, mode: "multiweek", numberOfWeeks, onChangeDate });
      fireEvent.keyDown(view.getByRole("grid"), { key: "PageDown" });
      fireEvent.keyDown(view.getByRole("grid"), { key: "PageUp" });
      expect(onChangeDate.mock.calls).toEqual([
        [addWeeks(date, numberOfWeeks)],
        [addWeeks(date, -numberOfWeeks)],
      ]);
    });
    it("expands recurrence throughout the full requested period", () => {
      const recurring: CalendarEvent = {
        ...meeting,
        start: new Date(2030, 11, 1, 9),
        end: new Date(2030, 11, 1, 10),
        recurrence: { freq: "daily" },
      };
      const view = render(Calendar, {
        ...base,
        mode: "multiweek",
        numberOfWeeks: 4,
        events: [recurring],
      });
      expect(view.getAllByTitle("Meeting")).toHaveLength(28);
    });
    it("preserves hourly custom views longer than seven days", () => {
      const view = render(Calendar, { ...base, mode: "custom", numberOfDays: 14 });
      expect(view.queryByRole("grid")).toBeNull();
      expect(view.getAllByText("09:00").length).toBeGreaterThan(0);
    });
  });
});
