import { createRef, useState } from "react";
import { act, render } from "@testing-library/react";
import { TimeGrid, type DomRenderEventArgs } from "../TimeGrid";
import type { CalendarEvent, CalendarHandle } from "@super-calendar/core/vanilla";
const day = new Date(2026, 5, 26);

it("scrolls through a React object ref on every call", () => {
  const ref = createRef<CalendarHandle>();
  const events: CalendarEvent[] = [
    { title: "Focus", start: new Date(2026, 5, 26, 14), end: new Date(2026, 5, 26, 16) },
  ];
  const { container } = render(
    <TimeGrid ref={ref} date={day} mode="day" events={events} hourHeight={48} minHour={6} />,
  );
  const scroller = [...container.querySelectorAll<HTMLElement>("div")].find(
    (el) => el.style.overflowY === "auto",
  )!;
  act(() => ref.current!.scrollToTime(14 * 60, { animated: false }));
  expect(scroller.scrollTop).toBe((14 - 6) * 48);
  scroller.scrollTop = 0;
  act(() => ref.current!.scrollToTime(14 * 60));
  expect(scroller.scrollTop).toBe((14 - 6) * 48);
});

describe("dom TimeGrid background band keys", () => {
  it("keeps a later band mounted when an earlier one is removed", () => {
    const mounts: string[] = [];
    const Band = ({ event }: DomRenderEventArgs) => {
      useState(() => mounts.push(event.title ?? ""));
      return <span>{event.title}</span>;
    };
    const first: CalendarEvent = {
      title: "First",
      start: new Date(2026, 5, 26, 8),
      end: new Date(2026, 5, 26, 9),
      display: "background",
    };
    const second: CalendarEvent = {
      title: "Second",
      start: new Date(2026, 5, 26, 10),
      end: new Date(2026, 5, 26, 11),
      display: "background",
    };
    const { rerender } = render(
      <TimeGrid
        date={day}
        mode="day"
        events={[first, second]}
        hourHeight={48}
        renderBackgroundEvent={Band}
      />,
    );
    rerender(
      <TimeGrid
        date={day}
        mode="day"
        events={[second]}
        hourHeight={48}
        renderBackgroundEvent={Band}
      />,
    );
    expect(mounts).toEqual(["First", "Second"]);
  });
});
