import { vi } from "vitest";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { fireEvent, render, rendererName, TimeGrid } from "@calendar-test/renderer";
import { useTimeZone } from "../../support/timezone";

// São Paulo clocks went forward at midnight on 4 Nov 2018 (00:00 became 01:00)
// and back at midnight on 17 Feb 2019 (00:00 became 23:00 on the 16th again).
useTimeZone("America/Sao_Paulo");

describe(rendererName, () => {
  // title div -> default-event root -> positioned wrapper with the pointer handlers.
  const wrapperOf = (chip: HTMLElement) => chip.parentElement!.parentElement!;
  const spillPreview = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>("[data-dragging]")].find((el) =>
      el.hasAttribute("aria-hidden"),
    );

  function dragUp(event: CalendarEvent, px: number) {
    const onDragEvent = vi.fn();
    const view = render(TimeGrid, {
      date: event.start,
      mode: "week",
      weekStartsOn: 1,
      events: [event],
      hourHeight: 48,
      onDragEvent: onDragEvent,
    });
    const box = wrapperOf(view.getByText("Early"));
    fireEvent.pointerDown(box, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(box, { clientY: 500 - px, pointerId: 1 });
    const preview = spillPreview(view.container);
    const previewGeometry = preview ? [preview.style.top, preview.style.height] : null;
    fireEvent.pointerUp(box, { clientY: 500 - px, pointerId: 1 });
    expect(onDragEvent).toHaveBeenCalledTimes(1);
    const [, start, end] = onDragEvent.mock.calls[0] as [CalendarEvent, Date, Date];
    return { start, end, previewGeometry };
  }

  it("moves an event above a skipped midnight into the previous day", () => {
    const event = {
      title: "Early",
      start: new Date(2018, 10, 4, 2),
      end: new Date(2018, 10, 4, 3),
    };
    expect(event.start.getTime() - new Date(2018, 10, 4).getTime()).toBe(3_600_000);
    // Three rows up asks for 23:00 on the 3rd; the end stops one step after
    // midnight, so the start holds at 23:15 and the hour keeps its length.
    const { start, end, previewGeometry } = dragUp(event, 144);
    expect(start).toEqual(new Date(2018, 10, 3, 23, 15));
    expect(end.getTime() - start.getTime()).toBe(3_600_000);
    expect(previewGeometry).toEqual([`${(24 - 0.75) * 48}px`, `${0.75 * 48}px`]);
  });

  it("moves an event above a repeated midnight onto the later 23:15", () => {
    const event = {
      title: "Early",
      start: new Date(2019, 1, 17, 1),
      end: new Date(2019, 1, 17, 2),
    };
    // Two rows up asks for 23:00 on the 16th, held at 23:15. That clock time
    // happens twice; the one an hour before 00:15 keeps the event's length.
    const { start, end, previewGeometry } = dragUp(event, 96);
    expect(end).toEqual(new Date(2019, 1, 17, 0, 15));
    expect(end.getTime() - start.getTime()).toBe(3_600_000);
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([16, 23, 15]);
    expect(previewGeometry).toEqual([`${(24 - 0.75) * 48}px`, `${0.75 * 48}px`]);
  });
});
