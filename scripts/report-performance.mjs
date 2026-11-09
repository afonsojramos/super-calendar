import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  defaultPerformanceOutput,
  interactionMapMarkdown,
} from "../tests/performance/interactions.ts";
import { parseReport, renderComparison } from "../tests/performance/report.ts";

const { values } = parseArgs({
  options: {
    candidate: { type: "string", default: defaultPerformanceOutput },
    baseline: { type: "string" },
    output: { type: "string", default: "dist/performance/report.md" },
    map: { type: "boolean", default: false },
  },
});

if (values.map) {
  const file = resolve("tests/README.md");
  const source = await readFile(file, "utf8");
  const start = "<!-- interaction-map:start -->";
  const end = "<!-- interaction-map:end -->";
  assert(source.includes(start) && source.includes(end), "Missing interaction map markers");
  const from = source.indexOf(start) + start.length;
  const to = source.indexOf(end, from);
  assert(to >= from, "Invalid interaction map markers");
  await writeFile(
    file,
    `${source.slice(0, from)}\n${interactionMapMarkdown()}\n${source.slice(to)}`,
  );
} else {
  const readPair = async (directory) =>
    Promise.all(
      ["react", "solid"].map(async (renderer) => {
        const data = await readFile(resolve(directory, `${renderer}-interactions.json`), "utf8");
        assert(data.length < 200_000, "Performance report exceeds the size limit");
        return parseReport(JSON.parse(data));
      }),
    );
  const candidate = await readPair(values.candidate);
  const baseline = values.baseline ? await readPair(values.baseline) : undefined;
  const markdown = renderComparison(candidate, baseline);
  await mkdir(dirname(resolve(values.output)), { recursive: true });
  await writeFile(values.output, markdown);
  await writeFile(
    resolve(dirname(values.output), "report.json"),
    `${JSON.stringify({ head: candidate[0].commit, base: baseline?.[0].commit ?? null }, null, 2)}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}
