import { vi } from "vitest";
import { MonthView, MultiWeekView, render, rendererName, fireEvent } from "@calendar-test/renderer";
import { useTimeZone } from "../../support/timezone";

useTimeZone("America/Sao_Paulo");

describe(rendererName, () => {
  it.each(
    ["month", "multiweek"].flatMap((mode) => [false, true].map((reversed) => ({ mode, reversed }))),
  )(
    "commits only the selected $mode days ending at a midnight change, reversed: $reversed",
    ({ mode, reversed }) => {
      const onCreateEvent = vi.fn();
      const view = render(mode === "month" ? MonthView : MultiWeekView, {
        date: new Date(2018, 10, 3),
        weekStartsOn: 1,
        events: [
          { title: "Other", start: new Date(2018, 10, 2, 9), end: new Date(2018, 10, 2, 10) },
        ],
        onCreateEvent,
      });
      const day = (date: string) => view.container.querySelector(`[data-day="${date}"]`)!;
      fireEvent.pointerDown(day(reversed ? "2018-11-04" : "2018-11-03"), {
        button: 0,
        pointerId: 1,
      });
      fireEvent.pointerEnter(day(reversed ? "2018-11-03" : "2018-11-04"), { pointerId: 1 });
      fireEvent.pointerUp(window, { pointerId: 1 });
      expect(onCreateEvent).toHaveBeenCalledExactlyOnceWith(
        new Date(2018, 10, 3),
        new Date(2018, 10, 5),
      );
    },
  );

  it.each(["month", "multiweek"])(
    "keeps a %s event visible after a midnight clock change",
    (mode) => {
      const view = render(mode === "month" ? MonthView : MultiWeekView, {
        date: new Date(2018, 10, 3),
        weekStartsOn: 1,
        events: [
          {
            title: "Journey",
            start: new Date(2018, 10, 3),
            end: new Date(2018, 10, 8),
            allDay: true,
          },
        ],
      });
      const segments = view.getAllByRole("button", { name: /^Journey,/ });
      expect(segments).toHaveLength(2);
      expect(
        segments.map((segment) => segment.closest("[data-day]")?.getAttribute("data-day")),
      ).toEqual(["2018-11-03", "2018-11-05"]);
    },
  );
});
