import { eventAccessibilityLabel } from "../eventDisplay";
import { dayAccessibilityLabel, defaultCalendarLabels, resolveCalendarLabels } from "../labels";

describe("resolveCalendarLabels", () => {
  it("returns the English defaults when nothing is passed", () => {
    expect(resolveCalendarLabels()).toBe(defaultCalendarLabels);
  });

  it("keeps the defaults for keys the consumer omits", () => {
    const labels = resolveCalendarLabels({ today: "dzisiaj" });
    expect(labels.today).toBe("dzisiaj");
    expect(labels.selected).toBe("selected");
    expect(labels.eventCount(2)).toBe("2 events");
  });
});

describe("defaultCalendarLabels", () => {
  it("names the page a move action jumps by", () => {
    expect(defaultCalendarLabels.moveToNextPage(7)).toBe("Move to next week");
    expect(defaultCalendarLabels.moveToNextPage(1)).toBe("Move to next day");
    expect(defaultCalendarLabels.moveToPreviousPage(3)).toBe("Move to previous 3 days");
  });

  it("pluralizes the minute step", () => {
    expect(defaultCalendarLabels.moveLater(1)).toBe("Move 1 minute later");
    expect(defaultCalendarLabels.shorten(30)).toBe("Shorten by 30 minutes");
  });
});

describe("eventAccessibilityLabel with labels", () => {
  const start = new Date(2026, 0, 6, 9);
  const end = new Date(2026, 0, 6, 10);
  const labels = resolveCalendarLabels({
    allDayEvent: "dia inteiro",
    timeRange: (from, to) => `${from} até ${to}`,
  });

  it("uses the translated time range", () => {
    expect(
      eventAccessibilityLabel({
        title: "Reunião",
        isAllDay: false,
        start,
        end,
        ampm: false,
        labels,
      }),
    ).toBe("Reunião, 09:00 até 10:00");
  });

  it("uses allDayEvent, and an explicit allDayLabel wins over it", () => {
    const args = { title: "Viagem", isAllDay: true, start, end, ampm: false, labels };
    expect(eventAccessibilityLabel(args)).toBe("Viagem, dia inteiro");
    expect(eventAccessibilityLabel({ ...args, allDayLabel: "Todo o dia" })).toBe(
      "Viagem, Todo o dia",
    );
  });
});

describe("dayAccessibilityLabel", () => {
  it("joins the date and the state words in English by default", () => {
    expect(
      dayAccessibilityLabel({
        dateLabel: "Friday, 17 July 2026",
        isToday: true,
        isSelected: true,
        eventCount: 1,
        labels: defaultCalendarLabels,
      }),
    ).toBe("Friday, 17 July 2026, today, selected, 1 event");
  });

  it("uses the translated words", () => {
    const labels = resolveCalendarLabels({
      today: "dzisiaj",
      unavailable: "niedostępny",
      hasEvents: "ma wydarzenia",
      eventCount: (count) => `wydarzenia: ${count}`,
    });
    expect(
      dayAccessibilityLabel({
        dateLabel: "wtorek, 6 października 2026",
        isToday: true,
        isDisabled: true,
        hasEvents: true,
        eventCount: 5,
        labels,
      }),
    ).toBe("wtorek, 6 października 2026, dzisiaj, niedostępny, ma wydarzenia, wydarzenia: 5");
  });

  it("leaves the count out when eventCount is omitted", () => {
    expect(dayAccessibilityLabel({ dateLabel: "6 October", labels: defaultCalendarLabels })).toBe(
      "6 October",
    );
  });
});
