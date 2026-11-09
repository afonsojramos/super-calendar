import assert from "node:assert/strict";
import { build } from "vite";
import { fixtureConfig } from "../tests/web/browser/fixture-config.ts";

const [renderer, directory] = process.argv.slice(2);
assert(process.argv.length === 4 && (renderer === "react" || renderer === "solid") && directory);
assert.equal(process.env.NODE_ENV, "production", "Benchmark builds require NODE_ENV=production");
const { config } = fixtureConfig(
  renderer,
  "dist",
  19,
  process.env.CALENDAR_PERFORMANCE_PACKAGE_ROOT,
);
await build({
  ...config,
  mode: "production",
  logLevel: "silent",
  plugins: [
    ...(config.plugins ?? []),
    {
      name: "require-production-benchmark",
      configResolved(resolved) {
        assert(
          resolved.isProduction && resolved.env.PROD,
          "Benchmark must use production framework code",
        );
      },
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk") {
            assert(
              !Object.keys(output.modules).some((id) =>
                /react[^/]*\/.*\.development\.js$/.test(id),
              ),
              "Benchmark included development React code",
            );
          }
        }
      },
    },
  ],
  build: { outDir: directory, emptyOutDir: true },
});
