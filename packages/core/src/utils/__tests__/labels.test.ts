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
