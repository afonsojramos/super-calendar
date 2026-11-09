import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { interactions, interactionMapMarkdown } from "../performance/interactions";
import {
  parseReport,
  renderComparison,
  summarize,
  type InteractionReport,
} from "../performance/report";

function report(renderer: "react" | "solid", value = 20): InteractionReport {
  return {
    schemaVersion: 1,
    renderer,
    commit: "a".repeat(40),
    dirty: false,
    harnessHash: "b".repeat(64),
    environment: {
      platform: "linux",
      arch: "x64",
      cpu: "test CPU",
      host: "same runner",
      node: "v24",
      browser: "156",
      viewport: "1100x850",
      timezone: "Europe/Madrid",
    },
    collectedAt: "2026-11-09T00:00:00.000Z",
    warmupRuns: 1,
    measurements: Object.fromEntries(
      interactions.map(({ id }) => [
        id,
        {
          samplesMs: [value - 2, value - 1, value, value, value, value + 1, value + 2],
          ...(id === "dense.update"
            ? { scriptMs: Array(7).fill(value), taskMs: Array(7).fill(value) }
            : {}),
        },
      ]),
    ),
  };
}

describe("interaction performance reports", () => {
  it("keeps the testing guide's interaction map synchronized with the measured catalog", () => {
    const guide = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const normalize = (text: string) =>
      text
        .split("\n")
        .map((line) =>
          line
            .split("|")
            .map((cell) => cell.trim().replace(/^[-:]+$/, "---"))
            .join("|"),
        )
        .join("\n");
    expect(normalize(guide)).toContain(normalize(interactionMapMarkdown()));
  });
  it("retains the sample range and nearest-rank p95 without treating it as a budget", () => {
    expect(summarize([10, 30, 20, 50, 40, 60, 70])).toEqual({
      median: 40,
      p95: 70,
      min: 10,
      max: 70,
      count: 7,
    });
    expect(() => summarize([])).toThrow();
    expect(() => summarize([NaN])).toThrow();
  });

  it("renders identical rows for both frameworks and labels native measurements as absent", () => {
    const table = renderComparison([report("react"), report("solid")]);
    for (const { id } of interactions) expect(table).toContain(id);
    expect(table).toContain("Not measured");
    expect(table).toContain("Native release");
    expect(table).toContain("No baseline");
    expect(table).not.toContain("0.0%");
  });

  it("compares samples only when the hardware, browser, fixture, and timing definitions match", () => {
    const candidate = [report("react", 10), report("solid", 10)];
    const baseline = [report("react", 20), report("solid", 20)];
    expect(renderComparison(candidate, baseline)).toContain("-50.0%");
    for (const mutate of [
      (r: InteractionReport) => {
        r.environment.host = "another runner";
      },
      (r: InteractionReport) => {
        r.environment.browser = "157";
      },
      (r: InteractionReport) => {
        r.harnessHash = "c".repeat(64);
      },
    ]) {
      const incompatible = structuredClone(baseline);
      mutate(incompatible[0]);
      expect(renderComparison(candidate, incompatible)).toContain("Not comparable");
    }
  });

  it("rejects incomplete, duplicate-renderer, or nonnumeric reports rather than displaying green results", () => {
    const missing = report("react");
    delete missing.measurements[interactions[0].id];
    expect(() => parseReport(missing)).toThrow(/measurement/);
    const invalid = report("react");
    invalid.measurements[interactions[0].id].samplesMs[0] = -1;
    expect(() => parseReport(invalid)).toThrow(/sample/);
    expect(() => parseReport({ ...report("react"), commit: "not-a-sha" })).toThrow(/commit/);
    expect(() => renderComparison([report("react"), report("react")])).toThrow(/renderer/);
    expect(() => renderComparison([report("react")])).toThrow(/renderer/);
    expect(() =>
      renderComparison([report("react"), { ...report("solid"), commit: "d".repeat(40) }]),
    ).toThrow(/commits/);
  });

  it("labels dirty working trees and does not call an observed delta a proven improvement", () => {
    const candidate = [report("react"), report("solid")];
    candidate[0].dirty = true;
    const table = renderComparison(candidate, [report("react", 21), report("solid", 21)]);
    expect(table).toContain("dirty");
    expect(table).toContain("informational");
    expect(table).not.toMatch(/improved|regression detected/i);
  });
});
