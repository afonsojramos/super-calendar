import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: (["react", "solid"] as const).flatMap((renderer) =>
      (["source", "dist"] as const).flatMap((artifact) =>
        (["chromium", "firefox", "webkit"] as const).map((engine) => ({
          extends: false,
          test: {
            maxWorkers: 1,
            name: `${renderer}-${artifact}-${engine}`,
            environment: "node",
            pool: "forks",
            include: ["tests/web/browser/contracts/**/*.test.ts"],
            exclude: engine === "chromium" ? [] : ["tests/web/browser/contracts/chromium/**"],
            testTimeout: 15_000,
            hookTimeout: 30_000,
            provide: {
              browserRenderer: renderer,
              browserArtifact: artifact,
              browserEngine: engine,
            },
          },
        })),
      ),
    ),
  },
});
