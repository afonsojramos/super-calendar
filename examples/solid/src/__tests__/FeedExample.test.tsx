import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, getByText, waitFor } from "@testing-library/dom";
import { render } from "@solidjs/web";
import { flush } from "solid-js";
import { FeedExample } from "../FeedExample";
import feedJson from "../../public/events.json?raw";

let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(["/", "/solid/"])("loads and refreshes the feed with base %s", async (base) => {
  vi.stubEnv("BASE_URL", base);
  const feedUrl = `${base}events.json`;
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    url === feedUrl
      ? new Response(feedJson, { headers: { "Content-Type": "application/json" } })
      : new Response("Not found", { status: 404 }),
  );
  vi.stubGlobal("fetch", fetch);
  const container = document.createElement("div");
  document.body.append(container);
  dispose = render(() => <FeedExample date={new Date(2026, 10, 2)} />, container);
  flush();

  await waitFor(() => expect(getByText(container, "Feed up to date")).toBeDefined());
  expect(getByText(container, "Feed planning")).toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    feedUrl,
    expect.objectContaining({ signal: expect.anything() }),
  );

  fireEvent.click(getByText(container, "Refresh feed"));
  flush();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(getByText(container, "Feed up to date")).toBeDefined());
});
