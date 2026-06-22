const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

const config = getDefaultConfig(__dirname);

// Watch the library source so edits hot-reload into the example.
config.watchFolders = [root];

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
