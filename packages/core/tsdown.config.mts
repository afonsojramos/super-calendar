import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/vanilla.ts"],
  format: ["esm", "cjs"],
  dts: true,
  // Runs under React Native and any bundler; don't assume node/browser.
  platform: "neutral",
  outDir: "dist",
  clean: true,
});
