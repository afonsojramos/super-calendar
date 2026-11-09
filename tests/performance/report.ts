import { interactions, unmeasuredInteractions, type InteractionId } from "./interactions.ts";

export interface InteractionReport {
  schemaVersion: 1;
  renderer: "react" | "solid";
  commit: string;
  dirty: boolean;
  harnessHash: string;
  environment: {
    platform: string;
    arch: string;
    cpu: string;
    host: string;
    node: string;
    browser: string;
    viewport: string;
    timezone: string;
  };
  collectedAt: string;
  warmupRuns: number;
  measurements: Record<string, { samplesMs: number[]; scriptMs?: number[]; taskMs?: number[] }>;
}

export function summarize(samples: number[]) {
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Invalid performance sample");
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1)!,
    count: sorted.length,
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a performance report object");
  return value as Record<string, unknown>;
}

export function parseReport(input: unknown): InteractionReport {
  const value = object(input);
  if (value.schemaVersion !== 1) throw new Error("Unsupported performance report version");
  if (value.renderer !== "react" && value.renderer !== "solid") throw new Error("Invalid renderer");
  if (typeof value.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.commit))
    throw new Error("Invalid commit");
  if (typeof value.harnessHash !== "string" || !/^[a-f0-9]{64}$/.test(value.harnessHash))
    throw new Error("Invalid harness hash");
  if (typeof value.dirty !== "boolean") throw new Error("Missing working-tree state");
  if (typeof value.collectedAt !== "string" || !Number.isFinite(Date.parse(value.collectedAt)))
    throw new Error("Invalid collection time");
  if (value.warmupRuns !== 1) throw new Error("Expected one discarded warmup");
  const environment = object(value.environment);
  for (const key of ["platform", "arch", "cpu", "host", "node", "browser", "viewport", "timezone"])
    if (
      typeof environment[key] !== "string" ||
      !environment[key] ||
      String(environment[key]).length > 200
    )
      throw new Error(`Invalid environment ${key}`);
  const measurements = object(value.measurements);
  if (Object.keys(measurements).length !== interactions.length)
    throw new Error("Unexpected measurement catalog");
  for (const { id } of interactions) {
    if (!measurements[id]) throw new Error(`Missing measurement ${id}`);
    const measurement = object(measurements[id]);
    for (const key of ["samplesMs", "scriptMs", "taskMs"]) {
      const samples = measurement[key];
      if (samples === undefined && key !== "samplesMs" && id !== "dense.update") continue;
      if (
        !Array.isArray(samples) ||
        samples.length !== 7 ||
        samples.some((sample) => typeof sample !== "number")
      )
        throw new Error(`Invalid samples for ${id}.${key}`);
      summarize(samples);
    }
  }
  return value as unknown as InteractionReport;
}

function rendererPair(input: InteractionReport[]) {
  if (input.length !== 2 || new Set(input.map(({ renderer }) => renderer)).size !== 2)
    throw new Error("Expected one report for each renderer");
  const reports = input.map(parseReport);
  if (new Set(reports.map(({ commit }) => commit)).size !== 1)
    throw new Error("Renderer reports name different commits");
  return reports;
}

function comparable(a: InteractionReport, b: InteractionReport) {
  return (
    a.harnessHash === b.harnessHash &&
    Object.keys(a.environment).every(
      (key) =>
        a.environment[key as keyof typeof a.environment] ===
        b.environment[key as keyof typeof b.environment],
    )
  );
}

const cell = (samples: number[]) => {
  const stats = summarize(samples);
  return `${stats.median.toFixed(1)} / ${stats.p95.toFixed(1)} (${stats.min.toFixed(1)}–${stats.max.toFixed(1)})`;
};

export function renderComparison(
  candidateInput: InteractionReport[],
  baselineInput?: InteractionReport[],
) {
  const candidate = rendererPair(candidateInput);
  const baseline = baselineInput && rendererPair(baselineInput);
  const lines = [
    "## UI interaction timings",
    "",
    "Times are median / p95 (min–max), in milliseconds, from seven samples after one warmup. With seven samples, p95 is the maximum. Deltas are informational, not a statistical significance test or a regression budget.",
    "",
    "| Interaction | Renderer | Baseline ms | Candidate ms | Median delta |",
    "| --- | --- | --- | --- | --- |",
  ];
  const addRow = (
    id: InteractionId,
    renderer: string,
    current: number[],
    previous: number[] | undefined,
    matches: boolean,
    suffix = "",
  ) => {
    const delta = !previous
      ? "No baseline"
      : !matches
        ? "Not comparable"
        : summarize(previous).median === 0
          ? "Zero baseline"
          : `${((summarize(current).median / summarize(previous).median - 1) * 100).toFixed(1)}%`;
    lines.push(
      `| \`${id}${suffix}\` | ${renderer} | ${previous ? cell(previous) : "Not measured"} | ${cell(current)} | ${delta} |`,
    );
  };
  for (const { id } of interactions) {
    for (const report of candidate) {
      const previous = baseline?.find((entry) => entry.renderer === report.renderer);
      const current = report.measurements[id];
      const old = previous?.measurements[id];
      const matches = previous ? comparable(report, previous) : false;
      addRow(id, report.renderer, current.samplesMs, old?.samplesMs, matches);
      for (const metric of ["scriptMs", "taskMs"] as const) {
        if (current[metric])
          addRow(id, report.renderer, current[metric], old?.[metric], matches, `.${metric}`);
      }
    }
  }
  lines.push(
    "",
    "Script time is part of main-thread task time. Both include the fixture and measurement overhead. Settled-update timings include frame scheduling; they are not INP or continuous gesture latency.",
  );
  for (const report of candidate) {
    const previous = baseline?.find((entry) => entry.renderer === report.renderer);
    lines.push(
      "",
      `${report.renderer}: candidate \`${report.commit}\`${report.dirty ? " (dirty working tree)" : ""}${previous ? `; baseline \`${previous.commit}\`${previous.dirty ? " (dirty working tree)" : ""}` : ""}.`,
    );
  }
  lines.push("", "| Coverage gap | Status |", "| --- | --- |");
  for (const row of unmeasuredInteractions)
    lines.push(`| ${row.name} | Not measured. ${row.reason}. |`);
  return `${lines.join("\n")}\n`;
}
