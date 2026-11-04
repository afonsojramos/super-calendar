import path from "node:path";
import type { InlineConfig } from "vite";
import { solid } from "../../support/solid-plugin.mts";

export function fixtureConfig(renderer: "react" | "solid", artifact: "source" | "dist") {
  const root = path.resolve(import.meta.dirname, "../../..");
  const pkg = renderer === "react" ? "dom" : "solid";
  const relativeEntry =
    artifact === "source"
      ? "src/index.ts"
      : renderer === "react"
        ? "dist/index.mjs"
        : "dist/client/index.js";
  const entry = path.join(root, "packages", pkg, relativeEntry);
  const fixture = path.join(root, "tests/web/browser/fixtures");
  const config: InlineConfig = {
    configFile: false,
    root: fixture,
    optimizeDeps: {
      entries: [path.join(fixture, "main.tsx"), entry],
      exclude: ["@calendar-browser/library"],
    },
    logLevel: "error",
    plugins: renderer === "solid" ? [solid("dom")] : [],
    oxc: { jsx: { runtime: "automatic" } },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
    resolve: {
      dedupe: ["react", "react-dom", "solid-js", "@solidjs/web"],
      alias: [
        { find: "@calendar-browser/adapter", replacement: path.join(fixture, `${renderer}.ts`) },
        { find: "@calendar-browser/library", replacement: entry },
        {
          find: /^@super-calendar\/core$/,
          replacement: path.join(
            root,
            "packages/core",
            artifact === "source" ? "src/index.ts" : "dist/index.mjs",
          ),
        },
        {
          find: /^@super-calendar\/core\/vanilla$/,
          replacement: path.join(
            root,
            "packages/core",
            artifact === "source" ? "src/vanilla.ts" : "dist/vanilla.mjs",
          ),
        },
      ],
    },
  };
  return { config, entry };
}
