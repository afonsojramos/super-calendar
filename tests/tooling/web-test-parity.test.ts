import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
function passingReport(browser = false) {
  const contractsRoot = path.join(
    root,
    browser ? "tests/web/browser/contracts" : "tests/web/contracts",
  );
  const files = readdirSync(contractsRoot, { recursive: true })
    .map(String)
    .filter((name) => /\.test\.tsx?$/.test(name));
  const renderers = browser
    ? ["React DOM (source)", "Solid (source)", "React DOM (dist)", "Solid (dist)"]
    : ["React DOM", "Solid"];
  return {
    success: true,
    testResults: files.flatMap((file) =>
      renderers.map((renderer) => ({
        name: path.join(contractsRoot, file),
        status: "passed",
        assertionResults: ["first case", "parameterized case", "parameterized case"].map(
          (name) => ({
            status: "passed",
            ancestorTitles: [renderer, "Calendar"],
            fullName: `${renderer} Calendar ${name}`,
          }),
        ),
      })),
    ),
  };
}

function verify(report: ReturnType<typeof passingReport>, browser = false) {
  const directory = mkdtempSync(path.join(tmpdir(), "calendar-parity-test-"));
  try {
    const reportPath = path.join(directory, "report.json");
    writeFileSync(reportPath, JSON.stringify(report));
    return spawnSync(
      process.execPath,
      [
        "scripts/verify-web-test-parity.mjs",
        ...(browser ? ["--browser"] : []),
        "--report",
        reportPath,
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 5_000,
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("shared web test gate", () => {
  it("accepts matching browser cases for both source and built renderers", () => {
    expect(verify(passingReport(true), true).status).toBe(0);
  });

  it.each(["missing", "duplicate", "different"])("rejects a %s browser run", (kind) => {
    const report = passingReport(true);
    if (kind === "missing") report.testResults.pop();
    if (kind === "duplicate") report.testResults[3] = report.testResults[0];
    if (kind === "different") report.testResults[3].assertionResults.pop();
    expect(verify(report, true).status).not.toBe(0);
  });

  it("accepts both renderers, including repeated parameterized case names", () => {
    const result = verify(passingReport());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("shared web cases passed for React DOM and Solid");
  });

  it("rejects an entirely missing shared file", () => {
    const report = passingReport();
    report.testResults.splice(0, 2);
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must run once for React DOM and once for Solid");
  });

  it("rejects a contract that only ran for one renderer", () => {
    const report = passingReport();
    report.testResults.splice(1, 1);
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must run once for React DOM and once for Solid");
  });

  it("rejects accidentally running the same adapter twice", () => {
    const report = passingReport();
    report.testResults[1] = report.testResults[0];
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must have one React DOM result");
  });

  it("rejects a missing duplicate case", () => {
    const report = passingReport();
    report.testResults[1].assertionResults.pop();
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must execute identical cases");
  });

  it("rejects different cases with the same total count", () => {
    const report = passingReport();
    report.testResults[1].assertionResults[0].fullName = "Solid Calendar another case";
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must execute identical cases");
  });

  it.each(["pending", "todo", "failed"])("rejects a %s case", (status) => {
    const report = passingReport();
    report.testResults[1].assertionResults[0].status = status;
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must pass");
  });
});
