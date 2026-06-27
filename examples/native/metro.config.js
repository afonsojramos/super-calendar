const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

// Standard Expo + pnpm-workspace setup: watch the whole workspace so edits to
// the @super-calendar packages hot-reload, and resolve modules from both the
// app's and the workspace root's node_modules. The packages expose a
// `react-native` export condition pointing at their source, so Metro bundles
// TypeScript source directly. pnpm's non-flat layout needs hierarchical lookup
// disabled so a single copy of each peer (react, react-native, reanimated) wins.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..", "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
