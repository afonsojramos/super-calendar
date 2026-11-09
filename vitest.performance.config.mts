import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    projects: (["react", "solid"] as const).map((renderer, index) => ({
      extends: false,
      test: {
        maxWorkers: 1,
        sequence: { groupOrder: index },
        name: `${renderer}-performance`,
        include: ["tests/performance/**/*.test.ts"],
        testTimeout: 60_000,
        hookTimeout: 60_000,
        provide: { browserRenderer: renderer },
      },
    })),
  },
});
