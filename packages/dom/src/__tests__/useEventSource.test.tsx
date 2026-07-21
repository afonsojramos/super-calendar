import { act, renderHook, waitFor } from "@testing-library/react";
import { useEventSource } from "@super-calendar/core";

const jsonFeed = [
  { title: "Standup", start: "2026-07-20T09:00:00.000Z", end: "2026-07-20T10:00:00.000Z" },
];
const icsFeed = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:20260720T090000Z
DTEND:20260720T100000Z
SUMMARY:Imported standup
END:VEVENT
END:VCALENDAR`;

const mockFetch = (impl: (url: string) => Promise<Partial<Response>>) => {
  const fn = jest.fn((url: string) => impl(url) as Promise<Response>);
  (globalThis as { fetch: unknown }).fetch = fn;
  return fn;
};

describe("useEventSource", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as { fetch: unknown }).fetch = realFetch;
  });

  it("loads a JSON feed and revives the dates", async () => {
    mockFetch(async () => ({ ok: true, json: async () => jsonFeed }));
    const { result } = renderHook(() => useEventSource("https://example.com/events"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].start).toBeInstanceOf(Date);
    expect(result.current.error).toBeNull();
  });

  it("parses an .ics feed by extension", async () => {
    mockFetch(async () => ({ ok: true, text: async () => icsFeed }));
    const { result } = renderHook(() => useEventSource("https://example.com/feed.ics"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events[0].title).toBe("Imported standup");
  });

  it("supports a custom async function source and manual refetch", async () => {
    let calls = 0;
    const source = async () => {
      calls += 1;
      return [
        {
          title: `Batch ${calls}`,
          start: new Date(2026, 6, 20, 9),
          end: new Date(2026, 6, 20, 10),
        },
      ];
    };
    const { result } = renderHook(() => useEventSource(source));
    await waitFor(() => expect(result.current.events[0]?.title).toBe("Batch 1"));
    await act(() => result.current.refetch());
    expect(result.current.events[0].title).toBe("Batch 2");
  });

  it("keeps the previous events and reports the error on a failed refetch", async () => {
    let fail = false;
    mockFetch(async () =>
      fail ? { ok: false, status: 500 } : { ok: true, json: async () => jsonFeed },
    );
    const { result } = renderHook(() => useEventSource("https://example.com/events"));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    fail = true;
    await act(() => result.current.refetch());
    expect(result.current.error?.message).toContain("500");
    expect(result.current.events).toHaveLength(1);
  });

  it("applies a custom map to reshape the feed", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => [
        { name: "Booking", from: "2026-07-20T09:00:00Z", to: "2026-07-20T10:00:00Z" },
      ],
    }));
    const { result } = renderHook(() =>
      useEventSource("https://example.com/bookings", {
        map: (items) =>
          (items as { name: string; from: string; to: string }[]).map((b) => ({
            title: b.name,
            start: new Date(b.from),
            end: new Date(b.to),
          })),
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events[0].title).toBe("Booking");
  });

  it("aborts the in-flight request on unmount and on source change", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const fn = jest.fn((_url: string, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return new Promise(() => {}) as Promise<Response>; // never resolves; stays in flight
    });
    (globalThis as { fetch: unknown }).fetch = fn;

    const { rerender, unmount } = renderHook(({ url }) => useEventSource(url), {
      initialProps: { url: "https://example.com/one" },
    });
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]?.aborted).toBe(false);

    // A new source supersedes the first request and aborts it.
    rerender({ url: "https://example.com/two" });
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[0]?.aborted).toBe(true);
    expect(seen[1]?.aborted).toBe(false);

    // Unmount aborts whatever is still in flight.
    unmount();
    expect(seen[1]?.aborted).toBe(true);
  });

  it("refetches on the configured interval and stops on unmount", async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = mockFetch(async () => ({ ok: true, json: async () => jsonFeed }));
      const { unmount } = renderHook(() =>
        useEventSource("https://example.com/events", { refetchIntervalMs: 60_000 }),
      );
      await act(async () => {}); // let the initial fetch settle
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await act(async () => {
        jest.advanceTimersByTime(120_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(4);

      unmount();
      await act(async () => {
        jest.advanceTimersByTime(300_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it("ignores a superseded fetch when the source changes mid-flight", async () => {
    // The generation counter must drop the in-flight response for the old source
    // so a slow first request can't overwrite the newer source's result.
    let resolveSlow: (value: Partial<Response>) => void = () => {};
    const slow = new Promise<Partial<Response>>((resolve) => {
      resolveSlow = resolve;
    });
    mockFetch((url) =>
      url.includes("slow") ? slow : Promise.resolve({ ok: true, json: async () => jsonFeed }),
    );
    const { result, rerender } = renderHook(({ url }) => useEventSource(url), {
      initialProps: { url: "https://example.com/slow" },
    });
    // Switch sources while the first request is still pending.
    rerender({ url: "https://example.com/fast" });
    await waitFor(() => expect(result.current.events[0]?.title).toBe("Standup"));

    // The slow request now resolves late; its generation is stale, so it's dropped.
    await act(async () => {
      resolveSlow({ ok: true, json: async () => [{ ...jsonFeed[0], title: "Stale" }] });
      await slow;
    });
    expect(result.current.events[0].title).toBe("Standup");
  });
});
