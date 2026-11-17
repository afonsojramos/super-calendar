// Every shared test file must execute the same cases with both real renderers.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const browser = args[0] === "--browser";
if (browser) args.shift();
const engines = ["chromium", "firefox", "webkit"];
let engine;
if (browser && args[0] === "--engine") {
  engine = args[1];
  args.splice(0, 2);
  assert(engines.includes(engine), `--engine must be one of ${engines.join(", ")}`);
}
assert(
  args.length === 0 || (args.length === 2 && args[0] === "--report"),
  "Usage: node scripts/verify-web-test-parity.mjs [--browser [--engine chromium|firefox|webkit]] [--report vitest-results.json]",
);
const renderers = browser
  ? ["React DOM", "Solid"].flatMap((renderer) =>
      ["source", "dist"].flatMap((artifact) =>
        (engine ? [engine] : engines).map((name) => `${renderer} (${artifact}, ${name})`),
      ),
    )
  : ["React DOM", "Solid"];
const temporary = args.length ? null : await mkdtemp(join(tmpdir(), "calendar-test-parity-"));
const reportPath = temporary ? join(temporary, "results.json") : resolve(args[1]);
try {
  if (temporary) {
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        ...(browser ? ["--config", "vitest.browser.config.mts"] : []),
        ...(engine ? ["--project", `*-${engine}`] : []),
        "--reporter=default",
        "--reporter=json",
        "--outputFile",
        reportPath,
      ],
      {
        cwd: root,
        stdio: "inherit",
      },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, "The full test suite must pass before checking parity");
  }
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert(Array.isArray(report.testResults), "Expected a Vitest JSON report");
  assert.equal(report.success, true, "The full reported test run must pass");
  const contractsRoot = join(root, browser ? "tests/web/browser/contracts" : "tests/web/contracts");
  const files = (await readdir(contractsRoot, { recursive: true })).filter((name) =>
    /\.test\.tsx?$/.test(name),
  );
  assert(files.length > 0, "No shared web contracts found");
  let matched = 0;
  for (const name of files) {
    const expectedRenderers =
      browser && name.startsWith(`chromium/`)
        ? renderers.filter((renderer) => renderer.endsWith(", chromium)"))
        : renderers;
    if (!expectedRenderers.length) continue;
    const suites = report.testResults.filter((result) => result.name === join(contractsRoot, name));
    assert.equal(
      suites.length,
      expectedRenderers.length,
      `${name} must run ${expectedRenderers.map((renderer) => `once for ${renderer}`).join(" and ")}`,
    );
    const cases = expectedRenderers.map((renderer) => {
      const candidates = suites.filter(
        (result) => result.assertionResults[0]?.ancestorTitles[0] === renderer,
      );
      assert.equal(candidates.length, 1, `${name} must have one ${renderer} result`);
      const suite = candidates[0];
      assert.equal(suite.status, "passed", `${renderer}: ${name} must pass`);
      assert(suite.assertionResults.length > 0, `${renderer}: ${name} has no cases`);
      return suite.assertionResults
        .map((test) => {
          assert.equal(test.status, "passed", `${renderer}: ${test.fullName} must pass`);
          assert.equal(test.ancestorTitles[0], renderer, `${name} contains a different renderer`);
          assert(test.fullName.startsWith(`${renderer} `), `${name} must identify its renderer`);
          return test.fullName.slice(renderer.length + 1);
        })
        .sort();
    });
    // Sorting preserves duplicate names and expanded parameterized cases.
    for (const other of cases.slice(1)) {
      assert.deepEqual(
        other,
        cases[0],
        `${name} must execute identical cases for React DOM and Solid`,
      );
    }
    matched += cases[0].length;
  }
  console.log(
    `All ${matched} shared web cases passed for ${renderers.join(" and ")} across ${files.length} suites.`,
  );
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
