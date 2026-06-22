const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

const config = getDefaultConfig(__dirname);

// Watch the library source so edits hot-reload into the example.
config.watchFolders = [root];

// The linked library has its OWN node_modules (react, react-native, reanimated,
// …) for its own tests/build. When Metro bundles the library's source it walks
// up from ../src and resolves those copies before consulting extraNodeModules,
// duplicating React / React Native / Reanimated in the bundle — which crashes
// the app at startup ("ExceptionsManager should be set up after React DevTools",
// "[runtime not ready]: TypeError: property is not writable"). Block the
// library's node_modules so every import falls back to the example's single copy.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const libNodeModules = new RegExp(`^${escapeRegExp(path.join(root, 'node_modules') + path.sep)}`);
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  libNodeModules,
];

// Resolve the library to its source, and force a single copy of every peer
// dependency (from the example's node_modules) so React/Reanimated aren't
// duplicated across the example and the linked library.
const peers = Object.keys(pkg.peerDependencies ?? {});
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.extraNodeModules = {
  [pkg.name]: root,
  ...Object.fromEntries(
    peers.map((name) => [name, path.resolve(__dirname, 'node_modules', name)]),
  ),
};

module.exports = config;
