import { transformAsync } from "@babel/core";
import type { Plugin } from "vite";

export function solid(generate: "dom" | "ssr"): Plugin {
  return {
    name: `calendar-solid-${generate}`,
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".tsx") || id.includes("/node_modules/")) return;
      const result = await transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        presets: ["@babel/preset-typescript"],
        plugins: [["@solidjs/babel-plugin", { generate, hydratable: true }]],
      });
      if (!result?.code) throw new Error(`Solid compilation produced no output for ${id}`);
      return { code: result.code, map: result.map };
    },
  };
}
