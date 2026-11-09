import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: (["source", "dist"] as const).map((artifact) => ({
      extends: false,
      test: {
        name: `react18-${artifact}-chromium`,
        maxWorkers: 1,
        environment: "node",
        pool: "forks",
        include: [
          "tests/web/browser/contracts/create-content.test.ts",
          "tests/web/browser/contracts/chromium/create-release.test.ts",
          "tests/web/browser/contracts/create-snap.test.ts",
          "tests/web/browser/contracts/multiweek.test.ts",
        ],
        testTimeout: 15_000,
        hookTimeout: 30_000,
        provide: {
          browserRenderer: "react",
          browserArtifact: artifact,
          browserEngine: "chromium",
          browserReactVersion: 18,
        },
      },
    })),
  },
});
