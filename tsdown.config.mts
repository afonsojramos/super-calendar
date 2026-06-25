import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.tsx", "./src/picker.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  // The library runs under React Native (and any bundler); don't assume node/browser.
  platform: "neutral",
  outDir: "dist",
  clean: true,
});
