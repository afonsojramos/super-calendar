import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: (["react", "solid"] as const).map((renderer) => ({
      extends: false,
      test: {
        maxWorkers: 1,
        name: `${renderer}-performance`,
        include: ["tests/performance/**/*.test.ts"],
        testTimeout: 30_000,
        hookTimeout: 60_000,
        provide: { browserRenderer: renderer },
      },
    })),
  },
});
