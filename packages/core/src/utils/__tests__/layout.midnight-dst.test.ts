import { startOfDay } from "date-fns";
import { useTimeZone } from "../../../../../tests/support/timezone";
import { eventDayKeys, groupEventsByDay } from "../layout";

useTimeZone("America/Sao_Paulo");

describe("event day keys across a midnight clock change", () => {
  it.each([
    { start: 3, end: new Date(2018, 10, 8), days: [3, 4, 5, 6, 7] },
    { start: 4, end: new Date(2018, 10, 8), days: [4, 5, 6, 7] },
    { start: 3, end: new Date(2018, 10, 5, 0, 30), days: [3, 4, 5] },
  ])("indexes every occupied day from November $start", ({ start, end, days }) => {
    const event = { title: "Journey", start: new Date(2018, 10, start), end };
    expect(new Date(2018, 10, 4).getHours()).toBe(1);
    const expected = days.map((day) => startOfDay(new Date(2018, 10, day)).toISOString());
    expect(eventDayKeys(event)).toEqual(expected);
    const grouped = groupEventsByDay([event]);
    for (const key of expected) expect(grouped.get(key)).toEqual([event]);
    expect(grouped.size).toBe(expected.length);
  });
});
