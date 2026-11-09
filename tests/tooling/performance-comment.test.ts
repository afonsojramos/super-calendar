import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const job = workflow.split("  performance-comment:\n")[1]?.split("\n  package-health:")[0];
if (!job) throw new Error("Missing performance comment job");
const block = job.match(/script: \|\n((?: {12}[^\n]*\n?)+)/)?.[1];
if (!block) throw new Error("Missing performance comment script");
const script = new Script(`(async () => {\n${block.replace(/^ {12}/gm, "")}\n})()`);
const head = "a".repeat(40);
const base = "b".repeat(40);
const marker = "<!-- super-calendar-interaction-performance -->";

function harness() {
  const files: Record<string, string> = {
    "performance/report.json": JSON.stringify({ head, base }),
    "performance/report.md": "## UI interaction timings\n\nMeasured table\n",
  };
  const issues = { listComments: vi.fn(), updateComment: vi.fn(), createComment: vi.fn() };
  const github = {
    rest: {
      issues,
      pulls: {
        get: vi
          .fn()
          .mockResolvedValue({ data: { state: "open", head: { sha: head }, base: { sha: base } } }),
      },
    },
    paginate: vi.fn().mockResolvedValue([]),
  };
  const context = {
    repo: { owner: "owner", repo: "calendar" },
    payload: { pull_request: { number: 42, head: { sha: head }, base: { sha: base } } },
    serverUrl: "https://github.com",
    runId: 123,
  };
  const run = () =>
    script.runInNewContext({
      require: (name: string) => {
        if (name !== "node:fs/promises") throw new Error(`Unexpected import ${name}`);
        return {
          readFile: async (file: string) => {
            if (!(file in files)) throw new Error(`Unexpected file ${file}`);
            return files[file];
          },
        };
      },
      github,
      context,
      core: { info: vi.fn() },
    }) as Promise<void>;
  return { files, github, issues, run };
}

describe("performance comment workflow", () => {
  it("creates one marked comment and links the raw run evidence", async () => {
    const test = harness();
    await test.run();
    expect(test.issues.createComment).toHaveBeenCalledOnce();
    expect(test.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ issue_number: 42, body: expect.stringContaining(marker) }),
    );
    expect(test.issues.createComment.mock.calls[0][0].body).toContain(
      "https://github.com/owner/calendar/actions/runs/123",
    );
  });

  it("updates only its existing bot comment when a run is repeated", async () => {
    const test = harness();
    test.github.paginate.mockResolvedValue([
      { id: 1, user: { login: "human" }, body: marker },
      { id: 2, user: { login: "github-actions[bot]" }, body: marker },
    ]);
    await test.run();
    expect(test.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 2 }),
    );
    expect(test.issues.createComment).not.toHaveBeenCalled();
  });

  it.each(["head", "base", "closed"])("ignores a superseded %s", async (change) => {
    const test = harness();
    test.github.rest.pulls.get.mockResolvedValue({
      data: {
        state: change === "closed" ? "closed" : "open",
        head: { sha: change === "head" ? "c".repeat(40) : head },
        base: { sha: change === "base" ? "c".repeat(40) : base },
      },
    });
    await test.run();
    expect(test.github.paginate).not.toHaveBeenCalled();
    expect(test.issues.createComment).not.toHaveBeenCalled();
    expect(test.issues.updateComment).not.toHaveBeenCalled();
  });

  it.each(["wrong revision", "oversized", "invalid table"])(
    "rejects a %s artifact",
    async (change) => {
      const test = harness();
      if (change === "wrong revision")
        test.files["performance/report.json"] = JSON.stringify({ head: base, base });
      else
        test.files["performance/report.md"] =
          change === "oversized" ? "x".repeat(60001) : "not a timing report";
      await expect(test.run()).rejects.toThrow(/does not match/);
      expect(test.issues.createComment).not.toHaveBeenCalled();
    },
  );

  it("surfaces API failures instead of reporting a published table", async () => {
    const test = harness();
    test.issues.createComment.mockRejectedValue(new Error("permission denied"));
    await expect(test.run()).rejects.toThrow("permission denied");
  });

  it("keeps PR execution outside the job with comment permissions", () => {
    expect(job).toContain("pull-requests: write");
    expect(job).toContain("actions: read");
    expect(job).not.toContain("actions/checkout");
    expect(job).not.toMatch(/\brun:/);
    expect(job).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });
});
