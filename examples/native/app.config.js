// Extends app.json with a web base URL for hosting under a sub-path (the GitHub
// Pages demo lives at /react-native-super-calendar/). Set EXPO_BASE_URL at
// export time; leave it unset for local dev so the app serves from the root.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  return {
    ...config,
    experiments: {
      ...config.experiments,
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
