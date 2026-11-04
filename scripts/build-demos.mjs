import { spawnSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist/demos");
for (const args of [
  ["--filter", "@super-calendar/core", "build"],
  ["--filter", "@super-calendar/example-native", "exec", "expo", "export", "--platform", "web"],
  ["--filter", "@super-calendar/example-web", "exec", "--", "vite", "build", "--base=/dom/"],
  ["--filter", "@super-calendar/example-solid", "exec", "--", "vite", "build", "--base=/solid/"],
]) {
  const result = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Demo build failed: pnpm ${args.join(" ")}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, "examples/native/dist"), output, { recursive: true });
await cp(resolve(root, "examples/web/dist"), resolve(output, "dom"), { recursive: true });
await cp(resolve(root, "examples/solid/dist"), resolve(output, "solid"), { recursive: true });
