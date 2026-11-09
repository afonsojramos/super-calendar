import { MonthView, MultiWeekView, render, rendererName } from "@calendar-test/renderer";
import { useTimeZone } from "../../support/timezone";

useTimeZone("America/Sao_Paulo");

describe(rendererName, () => {
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
