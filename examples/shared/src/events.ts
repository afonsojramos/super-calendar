import type { CalendarEvent } from "@super-calendar/core";

export type EventMeta = {
  id: string;
  kind: "work" | "music" | "health" | "exam" | "social" | "travel";
};

/**
 * The demo event set, shared by the web and native examples so both render the
 * exact same data. Events are anchored to "today" (offsets in days from the
 * current date) so the calendar is always populated.
 */
export function buildEvents(): CalendarEvent<EventMeta>[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const at = (offsetDays: number, hour: number, minute = 0) => {
    const d = new Date(base);
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  return [
    // A packed "today" (seven events) so the month cell overflows into "+N more".
    { id: "11", kind: "social", title: "☕ Coffee with Alex", start: at(0, 8), end: at(0, 8, 30) },
    { id: "1", kind: "work", title: "👥 Team standup", start: at(0, 9), end: at(0, 9, 30) },
    { id: "2", kind: "health", title: "🦷 Dentist", start: at(0, 11), end: at(0, 11, 45) },
    {
      id: "3",
      kind: "social",
      title: "🥪 Lunch with Sam",
      start: at(0, 12, 30),
      end: at(0, 13, 30),
    },
    // Long title + an evening slot below the morning scroll offset.
    {
      id: "4",
      kind: "music",
      title: "🎸 King Gizzard & the Lizard Wizard",
      start: at(0, 19),
      end: at(0, 23),
    },
    // Locked so it can't be dragged (draggable: false), showing how to fix a
    // single event in place while every other event stays movable.
    {
      id: "5",
      kind: "exam",
      title: "🚗 Driving theory exam",
      start: at(1, 9),
      end: at(1, 10, 30),
      draggable: false,
    },
    { id: "6", kind: "health", title: "🩺 GP appointment", start: at(1, 15), end: at(1, 15, 30) },
    { id: "7", kind: "health", title: "💪 Physio", start: at(2, 10), end: at(2, 10, 45) },
    { id: "8", kind: "work", title: "📊 Project review", start: at(2, 14), end: at(2, 15) },
    { id: "12", kind: "health", title: "🏋️ Gym", start: at(0, 16), end: at(0, 17) },
    // A multi-day event: one continuous bar across the days it spans in month
    // view, clipped to each day's column on the week/day time grid.
    { id: "9", kind: "travel", title: "✈️ Lisbon trip", start: at(2, 17), end: at(5, 21) },
    // An all-day event: renders in the lane above the grid, not in the columns.
    {
      id: "10",
      kind: "social",
      title: "🎂 Mum's birthday",
      start: at(0, 0),
      end: at(1, 0),
      allDay: true,
    },
    // Two all-day events tomorrow, so the all-day lane stacks more than one.
    {
      id: "13",
      kind: "travel",
      title: "🏖️ Bank holiday",
      start: at(1, 0),
      end: at(2, 0),
      allDay: true,
    },
    {
      id: "14",
      kind: "work",
      title: "🎉 Company offsite",
      start: at(1, 0),
      end: at(2, 0),
      allDay: true,
    },
    // One all-day event a week earlier, so swiping back reaches a one-row lane
    // and swiping forward an empty one.
    {
      id: "15",
      kind: "social",
      title: "🎬 Film festival",
      start: at(-7, 0),
      end: at(-6, 0),
      allDay: true,
    },
    // A background event: a shaded range behind the grid. The native example
    // draws it with renderBackgroundEvent, so it carries a label and can be pressed.
    {
      id: "16",
      kind: "work",
      title: "🧘 Focus time",
      start: at(1, 13),
      end: at(1, 15),
      display: "background",
    },
  ];
}
