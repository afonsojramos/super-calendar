import { transformAsync } from "@babel/core";
import { build } from "tsdown";

for (const [target, generate] of [
  ["client", "dom"],
  ["server", "ssr"],
]) {
  await build({
    config: false,
    entry: ["src/index.ts"],
    deps: { onlyBundle: [], dts: { neverBundle: ["csstype"] } },
    format: "esm",
    platform: "neutral",
    outDir: `dist/${target}`,
    clean: true,
    dts: true,
    tsconfig: "tsconfig.build.json",
    plugins: [
      {
        name: "solid-templates",
        async transform(code, id) {
          if (!id.endsWith(".tsx")) return;
          const result = await transformAsync(code, {
            filename: id,
            babelrc: false,
            configFile: false,
            presets: ["@babel/preset-typescript"],
            plugins: [["@solidjs/babel-plugin", { generate, hydratable: true }]],
            sourceMaps: true,
          });
          return { code: result.code, map: result.map };
        },
      },
    ],
  });
}
