import { solid } from "./tests/support/solid-plugin.mts";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "vitest-native";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const coreAliases = [
  { find: /^@super-calendar\/core$/, replacement: source("./packages/core/src/index.ts") },
  {
    find: /^@super-calendar\/core\/vanilla$/,
    replacement: source("./packages/core/src/vanilla.ts"),
  },
];

const common = {
  globals: true,
  clearMocks: false,
  pool: "forks" as const,
  testTimeout: 5_000,
  hookTimeout: 5_000,
  sequence: { hooks: "list" as const },
};

export default defineConfig({
  test: {
    maxWorkers: 2,
    projects: [
      {
        extends: false,
        plugins: [solid("ssr")],
        resolve: { alias: coreAliases },
        test: {
          ...common,
          name: "solid-server",
          environment: "node",
          include: ["packages/solid/src/**/*.ssr.test.tsx"],
        },
      },
      {
        extends: false,
        plugins: [solid("dom")],
        resolve: {
          conditions: ["browser", "development"],
          alias: [
            ...coreAliases,
            {
              find: "@calendar-test/renderer",
              replacement: source("./tests/web/adapters/solid.tsx"),
            },
          ],
        },
        test: {
          ...common,
          name: "solid",
          environment: "jsdom",
          server: { deps: { inline: [/solid-js/, /@solidjs\//] } },
          include: ["packages/solid/src/**/*.test.tsx", "tests/web/contracts/**/*.test.tsx"],
          exclude: ["**/*.ssr.test.tsx"],
          setupFiles: ["./tests/setup/dom.js"],
        },
      },
      {
        extends: false,
        resolve: { alias: coreAliases },
        test: {
          ...common,
          name: "node",
          environment: "node",
          include: [
            "packages/core/src/**/*.test.ts",
            "packages/native/src/**/*.test.ts",
            "tests/**/*.test.ts",
          ],
          exclude: ["tests/web/browser/**"],
        },
      },
      {
        extends: false,
        oxc: { jsx: { runtime: "automatic" } },
        resolve: {
          alias: [
            ...coreAliases,
            {
              find: "@calendar-test/renderer",
              replacement: source("./tests/web/adapters/react.tsx"),
            },
          ],
        },
        test: {
          ...common,
          name: "dom",
          environment: "jsdom",
          include: ["packages/dom/src/**/*.test.tsx", "tests/web/contracts/**/*.test.tsx"],
          setupFiles: ["./tests/setup/dom.js"],
        },
      },
      {
        extends: false,
        plugins: [reactNative({ engine: "native", platform: "ios", presets: [] })],
        resolve: { alias: coreAliases },
        test: {
          ...common,
          name: "native",
          environment: "node",
          include: ["packages/native/src/**/*.test.tsx"],
          setupFiles: ["./tests/setup/native.js"],
          sequence: { ...common.sequence, setupFiles: "list" },
        },
      },
    ],
  },
});
