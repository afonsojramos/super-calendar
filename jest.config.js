const babelTransform = {
  "^.+\\.(ts|tsx)$": [
    "babel-jest",
    {
      babelrc: false,
      configFile: false,
      presets: [
        ["@babel/preset-env", { targets: { node: "current" } }],
        "@babel/preset-typescript",
        ["@babel/preset-react", { runtime: "automatic" }],
      ],
    },
  ],
};

// Tests import the core package by name; resolve it to source so no build is needed.
const moduleNameMapper = {
  "^@super-calendar/core$": "<rootDir>/packages/core/src/index.ts",
};

module.exports = {
  watchman: false,
  projects: [
    {
      // Pure logic (core) + native non-component tests (theme, docs-sync). Plain Node.
      displayName: "node",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/packages/core/src/**/*.test.ts",
        "<rootDir>/packages/native/src/**/*.test.ts",
        "<rootDir>/tests/**/*.test.ts",
      ],
      transform: babelTransform,
      moduleNameMapper,
    },
    {
      // react-dom component tests via jsdom.
      displayName: "dom",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/packages/dom/src/**/*.test.tsx"],
      setupFiles: ["<rootDir>/jest.setup.dom.js"],
      transform: babelTransform,
      moduleNameMapper,
    },
    {
      // React Native component tests via Test Renderer + the RN preset.
      displayName: "native",
      preset: "@react-native/jest-preset",
      testMatch: ["<rootDir>/packages/native/src/**/*.test.tsx"],
      setupFiles: ["<rootDir>/jest.setup.components.js"],
      transform: {
        "^.+\\.(js|jsx|ts|tsx)$": [
          "babel-jest",
          { babelrc: false, configFile: false, presets: ["module:@react-native/babel-preset"] },
        ],
      },
      transformIgnorePatterns: [
        "node_modules/.pnpm/(?!(react-native|@react-native\\+|@legendapp\\+))",
      ],
      moduleNameMapper,
    },
  ],
};
