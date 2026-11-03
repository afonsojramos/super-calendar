import { vi } from "vitest";
import { waitFor } from "@testing-library/dom";
import type { CalendarEvent, EventSourceOptions } from "../index";
import { createEventSource } from "../index";
import { act, renderState } from "../../../../tests/support/solid-render";

const event = {
  title: "Planning",
  start: new Date(2026, 6, 20, 9),
  end: new Date(2026, 6, 20, 10),
};
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

it("reloads when the source function changes", async () => {
  const first = vi.fn(async () => [event]);
  const second = vi.fn(async () => [{ ...event, title: "Changed" }]);
  const view = renderState((props) => createEventSource(() => props.source), { source: first });
  await waitFor(() => expect(view.result.events()[0]?.title).toBe("Planning"));
  view.rerender({ source: second });
  await waitFor(() => expect(view.result.events()[0]?.title).toBe("Changed"));
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});

it("reacts to feed format and mapper changes", async () => {
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => [
          { title: "JSON", start: event.start.toISOString(), end: event.end.toISOString() },
        ],
        text: async () =>
          "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260720T090000Z\nDTEND:20260720T100000Z\nSUMMARY:ICS\nEND:VEVENT\nEND:VCALENDAR",
      }) as Response,
  );
  const initial: { options: EventSourceOptions<unknown> } = { options: { format: "json" } };
  const view = renderState(
    (props) =>
      createEventSource(
        () => "/feed",
        () => props.options,
      ),
    initial,
  );
  await waitFor(() => expect(view.result.events()[0]?.title).toBe("JSON"));
  view.rerender({ options: { format: "ics" } });
  await waitFor(() => expect(view.result.events()[0]?.title).toBe("ICS"));
  view.rerender({ options: { format: "json", map: () => [event] } });
  await waitFor(() => expect(view.result.events()[0]?.title).toBe("Planning"));
});

it("ignores a superseded AbortError without hiding the new request's loading state", async () => {
  const seen: AbortSignal[] = [];
  globalThis.fetch = vi.fn(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) throw new Error("Expected a request signal");
        seen.push(signal);
        signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")));
      }),
  );
  const view = renderState((props) => createEventSource(() => props.url), { url: "/first" });
  view.rerender({ url: "/second" });
  await act(async () => {});
  expect(seen).toHaveLength(2);
  expect(seen[0].aborted).toBe(true);
  expect(view.result.loading()).toBe(true);
  expect(view.result.error()).toBeNull();
  view.unmount();
  await act(async () => {});
  expect(seen[1].aborted).toBe(true);
  expect(view.result.error()).toBeNull();
});

it("ignores a custom source that resolves after its owner is disposed", async () => {
  let resolve!: (events: CalendarEvent[]) => void;
  const pending = new Promise<CalendarEvent[]>((accept) => {
    resolve = accept;
  });
  const source = vi.fn(() => pending);
  const view = renderState(() => createEventSource(() => source), {});
  view.unmount();
  await act(async () => {
    resolve([event]);
    await pending;
  });
  expect(view.result.events()).toEqual([]);
  await view.result.refetch();
  expect(source).toHaveBeenCalledTimes(1);
});
