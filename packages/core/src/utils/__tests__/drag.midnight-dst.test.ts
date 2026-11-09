import { useTimeZone } from "../../../../../tests/support/timezone";
import { monthCreateRange } from "../drag";
import { eventDayKeys } from "../layout";

useTimeZone("America/Sao_Paulo");

describe("month creation across a midnight clock change", () => {
  it.each([
    { anchor: 3, hover: 3, first: 3, end: 4, days: [3] },
    { anchor: 4, hover: 4, first: 4, end: 5, days: [4] },
    { anchor: 3, hover: 4, first: 3, end: 5, days: [3, 4] },
    { anchor: 4, hover: 3, first: 3, end: 5, days: [3, 4] },
    { anchor: 5, hover: 5, first: 5, end: 6, days: [5] },
  ])(
    "creates only the selected days from $anchor to $hover",
    ({ anchor, hover, first, end, days }) => {
      const from = new Date(2018, 10, anchor, 12);
      const to = new Date(2018, 10, hover, 15);
      const range = monthCreateRange(from, to);
      expect(new Date(2018, 10, 4).getHours()).toBe(1);
      expect(range).toEqual({ start: new Date(2018, 10, first), end: new Date(2018, 10, end) });
      expect(eventDayKeys({ title: "Draft", ...range })).toEqual(
        days.map((day) => new Date(2018, 10, day).toISOString()),
      );
      expect(from).toEqual(new Date(2018, 10, anchor, 12));
      expect(to).toEqual(new Date(2018, 10, hover, 15));
    },
  );
});
