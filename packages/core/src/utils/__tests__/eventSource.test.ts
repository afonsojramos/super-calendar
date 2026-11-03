import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { expandRecurringEvents, loadEventSource } from "../../vanilla";

const event = { title: "Planning", start: "2026-07-20T09:00:00Z", end: "2026-07-20T10:00:00Z" };
let server: Server;
let origin: string;
let body: unknown;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/hung") return;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP test server");
  origin = `http://127.0.0.1:${address.port}`;
});

it("aborts a URL request that never responds", async () => {
  const controller = new AbortController();
  const started = once(server, "request");
  const pending = loadEventSource({ source: `${origin}/hung`, signal: controller.signal });
  await started;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("preserves custom data and valid event options", async () => {
  body = [
    {
      ...event,
      resourceId: "room-a",
      metadata: { confirmed: true },
      disabled: false,
      draggable: false,
      display: "background",
      recurrence: {
        freq: "monthly",
        interval: 2,
        count: 4,
        monthDays: [-1, 15],
        months: [1, 6],
        weekdays: [0, 6],
        nthWeekday: { week: -1, weekday: 5 },
      },
    },
  ];
  const events = await loadEventSource({ source: origin });
  expect(events[0]).toMatchObject({
    resourceId: "room-a",
    metadata: { confirmed: true },
    draggable: false,
    disabled: false,
    display: "background",
    recurrence: {
      freq: "monthly",
      interval: 2,
      count: 4,
      monthDays: [-1, 15],
      nthWeekday: { week: -1, weekday: 5 },
    },
  });
});

it.each([
  { freq: "hourly" },
  { freq: "daily", until: "bad" },
  { freq: "weekly", weekdays: [7] },
  { freq: "monthly", monthDays: [0] },
  { freq: "yearly", months: [13] },
  { freq: "monthly", nthWeekday: { week: 0, weekday: 1 } },
  { freq: "daily", interval: -1 },
  { freq: "daily", count: 1.5 },
  { freq: "daily", exdates: ["bad"] },
  { freq: "daily", rdates: {} },
])("rejects malformed recurrence data %j", async (recurrence) => {
  body = [{ ...event, recurrence }];
  await expect(loadEventSource({ source: origin })).rejects.toThrow("recurrence");
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

it("rejects invalid dates before they reach a calendar renderer", async () => {
  body = [{ ...event, start: "not a date" }];
  await expect(loadEventSource({ source: origin })).rejects.toThrow("start");
});

it.each(
  [null, {}, "events", [null], [{ ...event, end: null }], [{ ...event, title: {} }]].map(
    (payload) => [payload],
  ),
)("rejects malformed event data %j", async (payload) => {
  body = payload;
  await expect(loadEventSource({ source: origin })).rejects.toThrow("Event source");
});

it("revives recurring dates so JSON feeds can be expanded", async () => {
  body = [
    {
      ...event,
      recurrence: {
        freq: "daily",
        until: "2026-07-23T09:00:00Z",
        exdates: ["2026-07-21T09:00:00Z"],
        rdates: ["2026-07-25T09:00:00Z"],
      },
    },
  ];
  const events = await loadEventSource({ source: origin });
  expect(
    expandRecurringEvents(
      events,
      new Date("2026-07-20T00:00:00Z"),
      new Date("2026-07-26T00:00:00Z"),
    ).map((value) => value.start.toISOString()),
  ).toEqual([
    "2026-07-20T09:00:00.000Z",
    "2026-07-22T09:00:00.000Z",
    "2026-07-23T09:00:00.000Z",
    "2026-07-25T09:00:00.000Z",
  ]);
});
