// Fails when a build output is missing or older than the sources it is built
// from, so tests that load `dist` never run against a stale build.
// Usage: node scripts/check-fresh-build.mjs [packages|demos]
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const packages = ["core", "dom", "native", "solid"];
const ignored = new Set(["node_modules", "dist", ".expo", "android", "ios", "__tests__"]);

function newestSource(paths) {
  let newest = { path: "", time: 0 };
  const visit = (path) => {
    if (!existsSync(path)) return;
    const info = statSync(path);
    if (info.isDirectory()) {
      for (const entry of readdirSync(path)) if (!ignored.has(entry)) visit(join(path, entry));
    } else if (!/\.test\.[cm]?[jt]sx?$/.test(path) && info.mtimeMs > newest.time) {
      newest = { path, time: info.mtimeMs };
    }
  };
  for (const path of paths) visit(resolve(root, path));
  return newest;
}

function oldestOutput(path) {
  let oldest = Infinity;
  const visit = (current) => {
    const info = statSync(current);
    if (info.isDirectory()) for (const entry of readdirSync(current)) visit(join(current, entry));
    else oldest = Math.min(oldest, info.mtimeMs);
  };
  if (existsSync(path)) visit(path);
  return oldest;
}

function assertFresh(output, sources, command) {
  const built = oldestOutput(resolve(root, output));
  if (built === Infinity) throw new Error(`${output} is missing. Run \`${command}\` first.`);
  const source = newestSource(sources);
  if (source.time > built) {
    throw new Error(
      `${output} is older than ${relative(root, source.path)}. Run \`${command}\` first.`,
    );
  }
}

export function checkPackages() {
  for (const name of packages) {
    const dir = `packages/${name}`;
    assertFresh(
      `${dir}/dist`,
      [
        `${dir}/src`,
        `${dir}/scripts`,
        `${dir}/package.json`,
        `${dir}/tsdown.config.mts`,
        `${dir}/tsconfig.build.json`,
      ],
      "pnpm build",
    );
  }
}

export function checkDemos() {
  assertFresh(
    "dist/demos",
    [
      ...packages.map((name) => `packages/${name}/src`),
      "examples/native",
      "examples/web",
      "examples/solid",
      "scripts/build-demos.mjs",
    ],
    "pnpm build:demos",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const target = process.argv[2] ?? "packages";
  if (target === "packages") checkPackages();
  else if (target === "demos") checkDemos();
  else throw new Error(`Unknown build target: ${target}`);
}
