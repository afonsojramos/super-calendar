import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { RecurrenceRule } from "../../types";

const cases: [string, RecurrenceRule, number][] = [
  ["daily", { freq: "daily" }, 1],
  ["weekly", { freq: "weekly" }, 1],
  ["monthly", { freq: "monthly" }, 1],
  ["yearly", { freq: "yearly" }, 1],
  ["weekly weekdays", { freq: "weekly", weekdays: [4] }, 1],
  ["monthly last day", { freq: "monthly", monthDays: [-1] }, 31],
  ["monthly nth weekday", { freq: "monthly", nthWeekday: { week: 1, weekday: 4 } }, 1],
  ["yearly nth weekday", { freq: "yearly", nthWeekday: { week: 1, weekday: 4 } }, 1],
  ["yearly months", { freq: "yearly", months: [1] }, 1],
];

let worker: Worker;
beforeEach(async () => {
  // A worker bounds the regression even if expansion stops yielding and loops forever.
  // Node's native TypeScript loader executes the same source used by the other tests.
  worker = new Worker(
    `const { parentPort, workerData } = require("node:worker_threads");
     const { expandRecurringEvents } = require(workerData.module);
     parentPort.once("message", rule => {
       const events = expandRecurringEvents([{
         start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10),
         recurrence: { ...rule, interval: Number.MAX_SAFE_INTEGER }
       }], new Date(2026, 0, 1), new Date(2026, 11, 31));
       parentPort.postMessage(events.map(event => [event.start.getTime(), event.end.getTime()]));
     });
     parentPort.postMessage("ready");`,
    {
      eval: true,
      workerData: { module: fileURLToPath(new URL("../recurrence.ts", import.meta.url)) },
    },
  );
  await new Promise<void>((resolve, reject) => {
    worker.once("message", () => resolve());
    worker.once("error", reject);
  });
});

afterEach(async () => {
  await worker.terminate();
});

it.each(cases)("stops %s recurrence when the next date overflows", async (_name, rule, day) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Recurrence expansion did not terminate")), 2000);
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.postMessage(rule);
    });
    expect(result).toEqual([
      [new Date(2026, 0, day, 9).getTime(), new Date(2026, 0, day, 10).getTime()],
    ]);
  } finally {
    clearTimeout(timer);
  }
});
