const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

// Standard Expo + workspace setup: watch the whole workspace so edits to the
// @super-calendar packages hot-reload. The packages expose a `react-native`
// export condition pointing at their source, so Metro bundles TypeScript source
// directly. Resolution stays hierarchical (Metro follows symlinks), so the
// isolated layouts of pnpm and nub both work; each transitive dep resolves from
// its own package, and same-version peers dedupe through the virtual store.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// Uniwind (Tailwind classes on native components) powers the "tailwind" demo
// tab; its wrapper must be the outermost one.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
});
