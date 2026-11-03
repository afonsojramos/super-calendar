import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 1,
    projects: (["react", "solid"] as const).flatMap((renderer) =>
      (["source", "dist"] as const).map((artifact) => ({
        extends: false,
        test: {
          name: `${renderer}-${artifact}`,
          environment: "node",
          pool: "forks",
          include: ["tests/web/browser/contracts/**/*.test.ts"],
          testTimeout: 15_000,
          hookTimeout: 30_000,
          provide: { browserRenderer: renderer, browserArtifact: artifact },
        },
      })),
    ),
  },
});
