import { vi } from "vitest";
import { waitFor } from "@testing-library/dom";
import type { CalendarEvent } from "@super-calendar/core/vanilla";
import { rendererName, act, renderEventSource } from "@calendar-test/renderer";

describe(rendererName, () => {
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
    const fn = vi.fn((url: string) => impl(url) as Promise<Response>);
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
      const { result } = renderEventSource({ source: "https://example.com/events" });
      await waitFor(() => expect(result.loading()).toBe(false));
      expect(result.events()).toHaveLength(1);
      expect(result.events()[0].start).toBeInstanceOf(Date);
      expect(result.error()).toBeNull();
    });

    it("does not fetch again after unmount", async () => {
      const fetchMock = mockFetch(async () => ({ ok: true, json: async () => jsonFeed }));
      const { result, unmount } = renderEventSource({ source: "https://example.com/events" });
      await waitFor(() => expect(result.loading()).toBe(false));
      unmount();
      await act(() => result.refetch());
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([0, -1, NaN, Infinity, 2 ** 31, 30 * 24 * 60 * 60 * 1000])(
      "does not poll with an invalid interval %s",
      async (refetchIntervalMs) => {
        vi.useFakeTimers();
        const fetchMock = mockFetch(async () => ({ ok: true, json: async () => jsonFeed }));
        const { unmount } = renderEventSource({
          source: "https://example.com/events",
          options: { refetchIntervalMs },
        });
        try {
          await act(async () => {
            vi.advanceTimersByTime(100);
          });
          expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally {
          unmount();
          vi.useRealTimers();
        }
      },
    );

    it("keeps data during a hung refresh and ignores a late older response", async () => {
      let resolveSlow!: (events: CalendarEvent[]) => void;
      const slow = new Promise<CalendarEvent[]>((resolve) => {
        resolveSlow = resolve;
      });
      let calls = 0;
      const event = { start: new Date(2026, 6, 20, 9), end: new Date(2026, 6, 20, 10) };
      const source = async () => (++calls === 2 ? slow : [{ ...event, title: `Batch ${calls}` }]);
      const { result } = renderEventSource({ source: source });
      await waitFor(() => expect(result.events()[0]?.title).toBe("Batch 1"));
      let pending!: Promise<void>;
      act(() => {
        pending = result.refetch();
      });
      expect(result.loading()).toBe(true);
      expect(result.events()[0].title).toBe("Batch 1");
      await act(() => result.refetch());
      expect(result.events()[0].title).toBe("Batch 3");
      expect(result.loading()).toBe(false);
      await act(async () => {
        resolveSlow([{ ...event, title: "Stale" }]);
        await pending;
      });
      expect(result.events()[0].title).toBe("Batch 3");
      expect(result.error()).toBeNull();
    });

    it("reports a refused request and recovers on refetch", async () => {
      let refused = true;
      mockFetch(async () => {
        if (refused) throw new TypeError("Failed to fetch");
        return { ok: true, json: async () => jsonFeed };
      });
      const { result } = renderEventSource({ source: "https://example.com/events" });
      await waitFor(() => expect(result.loading()).toBe(false));
      expect(result.error()?.message).toBe("Failed to fetch");
      expect(result.events()).toEqual([]);
      refused = false;
      await act(() => result.refetch());
      expect(result.error()).toBeNull();
      expect(result.events()).toHaveLength(1);
    });

    it("keeps the last batch when JSON validation fails", async () => {
      let invalid = false;
      mockFetch(async () => ({
        ok: true,
        json: async () => (invalid ? [{ ...jsonFeed[0], start: "bad" }] : jsonFeed),
      }));
      const { result } = renderEventSource({ source: "https://example.com/events" });
      await waitFor(() => expect(result.loading()).toBe(false));
      invalid = true;
      await act(() => result.refetch());
      expect(result.events()[0].start.toISOString()).toBe(jsonFeed[0].start);
      expect(result.error()?.message).toContain("start");
      invalid = false;
      await act(() => result.refetch());
      expect(result.error()).toBeNull();
    });

    it("parses an .ics feed by extension", async () => {
      mockFetch(async () => ({ ok: true, text: async () => icsFeed }));
      const { result } = renderEventSource({ source: "https://example.com/feed.ics" });
      await waitFor(() => expect(result.loading()).toBe(false));
      expect(result.events()[0].title).toBe("Imported standup");
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
      const { result } = renderEventSource({ source: source });
      await waitFor(() => expect(result.events()[0]?.title).toBe("Batch 1"));
      await act(() => result.refetch());
      expect(result.events()[0].title).toBe("Batch 2");
    });

    it("keeps the previous events and reports the error on a failed refetch", async () => {
      let fail = false;
      mockFetch(async () =>
        fail ? { ok: false, status: 500 } : { ok: true, json: async () => jsonFeed },
      );
      const { result } = renderEventSource({ source: "https://example.com/events" });
      await waitFor(() => expect(result.events()).toHaveLength(1));
      fail = true;
      await act(() => result.refetch());
      expect(result.error()?.message).toContain("500");
      expect(result.events()).toHaveLength(1);
    });

    it("applies a custom map to reshape the feed", async () => {
      mockFetch(async () => ({
        ok: true,
        json: async () => [
          { name: "Booking", from: "2026-07-20T09:00:00Z", to: "2026-07-20T10:00:00Z" },
        ],
      }));
      const { result } = renderEventSource({
        source: "https://example.com/bookings",
        options: {
          map: (items) =>
            (items as { name: string; from: string; to: string }[]).map((b) => ({
              title: b.name,
              start: new Date(b.from),
              end: new Date(b.to),
            })),
        },
      });
      await waitFor(() => expect(result.loading()).toBe(false));
      expect(result.events()[0].title).toBe("Booking");
    });

    it("aborts the in-flight request on unmount and on source change", async () => {
      const seen: (AbortSignal | undefined)[] = [];
      const fn = vi.fn((_url: string, init?: RequestInit) => {
        seen.push(init?.signal ?? undefined);
        return new Promise(() => {}) as Promise<Response>; // never resolves; stays in flight
      });
      (globalThis as { fetch: unknown }).fetch = fn;

      const { rerender, unmount } = renderEventSource({ source: "https://example.com/one" });
      expect(seen[0]).toBeInstanceOf(AbortSignal);
      expect(seen[0]?.aborted).toBe(false);

      // A new source supersedes the first request and aborts it.
      rerender({ source: "https://example.com/two" });
      await waitFor(() => expect(seen).toHaveLength(2));
      expect(seen[0]?.aborted).toBe(true);
      expect(seen[1]?.aborted).toBe(false);

      // Unmount aborts whatever is still in flight.
      unmount();
      expect(seen[1]?.aborted).toBe(true);
    });

    it("refetches on the configured interval and stops on unmount", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = mockFetch(async () => ({ ok: true, json: async () => jsonFeed }));
        const { unmount } = renderEventSource({
          source: "https://example.com/events",
          options: { refetchIntervalMs: 60_000 },
        });
        await act(async () => {}); // let the initial fetch settle
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
          vi.advanceTimersByTime(60_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await act(async () => {
          vi.advanceTimersByTime(120_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);

        unmount();
        await act(async () => {
          vi.advanceTimersByTime(300_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);
      } finally {
        vi.useRealTimers();
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
      const { result, rerender } = renderEventSource({ source: "https://example.com/slow" });
      // Switch sources while the first request is still pending.
      rerender({ source: "https://example.com/fast" });
      await waitFor(() => expect(result.events()[0]?.title).toBe("Standup"));

      // The slow request now resolves late; its generation is stale, so it's dropped.
      await act(async () => {
        resolveSlow({ ok: true, json: async () => [{ ...jsonFeed[0], title: "Stale" }] });
        await slow;
      });
      expect(result.events()[0].title).toBe("Standup");
    });
  });
});
