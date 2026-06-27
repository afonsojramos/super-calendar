module.exports = (api) => {
  api.cache(true);
  // babel-preset-expo wires up the Reanimated v4 / worklets plugin automatically.
  return {
    presets: ["babel-preset-expo"],
  };
};
