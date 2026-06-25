// Micro-benchmarks for the hot pure functions that run on every render/scroll.
// Run: `pnpm bench` (executes TypeScript directly via bun, no build step).
//
// Measures CPU cost of the computational layer only, not React reconciliation,
// the Reanimated UI thread, or @legendapp/list scrolling. Numbers are on V8;
// on-device Hermes is typically a few times slower.
import { buildMonthWeeks } from "../src/utils/dates";
import { eventDayKeys, layoutDayEvents } from "../src/utils/layout";
import { buildMonthGrid } from "../src/utils/monthGrid";
import { expandRecurringEvents } from "../src/utils/recurrence";
import type { CalendarEvent } from "../src/types";

type Row = { name: string; usPerOp: number; opsPerSec: number };

function bench(name: string, fn: () => void, minMs = 400): Row {
  for (let i = 0; i < 50; i++) fn(); // warm up the JIT
  let iters = 0;
  const start = performance.now();
  let elapsed = 0;
  do {
    fn();
    iters++;
    if ((iters & 63) === 0) elapsed = performance.now() - start;
  } while (elapsed < minMs);
  elapsed = performance.now() - start;
  return { name, usPerOp: (elapsed * 1000) / iters, opsPerSec: iters / (elapsed / 1000) };
}

const MONTH = new Date(2026, 5, 15);
const RANGE = { start: new Date(2026, 5, 10), end: new Date(2026, 5, 20) };

function dayEvents(count: number): CalendarEvent[] {
  const day = new Date(2026, 5, 15);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(day);
    start.setHours(0, (i * 13) % (24 * 60 - 90), 0, 0);
    return { start, end: new Date(start.getTime() + (30 + (i % 6) * 20) * 60_000), title: `e${i}` };
  });
}

function monthEvents(count: number): CalendarEvent[] {
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(2026, 5, 1 + (i % 30), (i % 12) + 8, 0, 0);
    const spanDays = i % 7 === 0 ? 3 : 0;
    return {
      start,
      end: new Date(start.getTime() + (spanDays * 24 + 1) * 3_600_000),
      title: `m${i}`,
    };
  });
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event)) {
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
  }
  return map;
}

const daily: CalendarEvent[] = [
  { start: new Date(2026, 0, 1, 9), end: new Date(2026, 0, 1, 10), recurrence: { freq: "daily" } },
];
const weeklyMwf: CalendarEvent[] = [
  {
    start: new Date(2026, 0, 1, 9),
    end: new Date(2026, 0, 1, 10),
    recurrence: { freq: "weekly", weekdays: [1, 3, 5] },
  },
];
const yearStart = new Date(2026, 0, 1);
const yearEnd = new Date(2026, 11, 31);
const twoYearsEnd = new Date(2027, 11, 31);

const d10 = dayEvents(10);
const d50 = dayEvents(50);
const d200 = dayEvents(200);
const m100 = monthEvents(100);
const m500 = monthEvents(500);

const rows: Row[] = [
  bench("buildMonthWeeks (1 month)", () => buildMonthWeeks(MONTH, 1)),
  bench("buildMonthGrid (1 month, range)", () =>
    buildMonthGrid(MONTH, { weekStartsOn: 1, selectedRange: RANGE })),
  bench("buildMonthGrid x3 (pager window)", () => {
    buildMonthGrid(new Date(2026, 4, 15), { selectedRange: RANGE });
    buildMonthGrid(MONTH, { selectedRange: RANGE });
    buildMonthGrid(new Date(2026, 6, 15), { selectedRange: RANGE });
  }),
  bench("layoutDayEvents (10 events)", () => layoutDayEvents(d10, MONTH)),
  bench("layoutDayEvents (50 events)", () => layoutDayEvents(d50, MONTH)),
  bench("layoutDayEvents (200 events)", () => layoutDayEvents(d200, MONTH)),
  bench("groupByDay (100 month events)", () => groupByDay(m100)),
  bench("groupByDay (500 month events)", () => groupByDay(m500)),
  bench("expandRecurring daily/1yr (~365)", () => expandRecurringEvents(daily, yearStart, yearEnd)),
  bench("expandRecurring weekly MWF/2yr (~312)", () =>
    expandRecurringEvents(weeklyMwf, yearStart, twoYearsEnd)),
];

const pad = (s: string, n: number) => s.padEnd(n);
const num = (n: number, d = 2) => n.toFixed(d).padStart(11);
console.log(`\n${pad("benchmark", 42)}${"µs/op".padStart(11)}${"ops/sec".padStart(13)}`);
console.log("-".repeat(66));
for (const r of rows) console.log(`${pad(r.name, 42)}${num(r.usPerOp)}${num(r.opsPerSec, 0)}`);
console.log("\nReference: one 60fps frame = 16667µs; comfortable render budget ~8000µs.");
