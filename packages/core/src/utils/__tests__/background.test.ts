import type { CalendarEvent } from "../../types";
import { backgroundBandsForDay, isBackgroundEvent, layoutDayEvents } from "../layout";

const day = new Date(2026, 6, 20);

describe("background events", () => {
  const background: CalendarEvent = {
    title: "Maintenance",
    start: new Date(2026, 6, 20, 9),
    end: new Date(2026, 6, 20, 12),
    display: "background",
  };
  const normal: CalendarEvent = {
    title: "Standup",
    start: new Date(2026, 6, 20, 9),
    end: new Date(2026, 6, 20, 10),
  };

  it("identifies background events", () => {
    expect(isBackgroundEvent(background)).toBe(true);
    expect(isBackgroundEvent(normal)).toBe(false);
  });

  it("excludes background events from the timed layout", () => {
    const positioned = layoutDayEvents([background, normal], day);
    expect(positioned).toHaveLength(1);
    expect(positioned[0].event.title).toBe("Standup");
  });

  it("slices background events into fractional-hour bands for a day", () => {
    const bands = backgroundBandsForDay([background, normal], day);
    expect(bands).toHaveLength(1);
    expect(bands[0].startHours).toBe(9);
    expect(bands[0].endHours).toBe(12);
  });

  it("clips a multi-day background to each day's window", () => {
    const multi: CalendarEvent = {
      title: "Shutdown",
      start: new Date(2026, 6, 19, 22),
      end: new Date(2026, 6, 21, 6),
      display: "background",
    };
    const bands = backgroundBandsForDay([multi], day);
    expect(bands).toHaveLength(1);
    expect(bands[0].startHours).toBe(0);
    expect(bands[0].endHours).toBe(24);
  });
});
