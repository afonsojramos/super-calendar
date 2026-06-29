import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Resolve the workspace packages to their TypeScript source so the example runs
// without building them first. Their `react-native` export condition is ignored
// by Vite (bundler conditions), and they import nothing from React Native. The
// shared example package holds the base-ui context menu used by both demos.
const root = path.resolve(__dirname, "..", "..");
const shared = path.join(root, "examples/shared/src");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@super-calendar/dom": path.join(root, "packages/dom/src/index.ts"),
      "@super-calendar/core": path.join(root, "packages/core/src/index.ts"),
      "@super-calendar/example-shared/global.css": path.join(shared, "global.css"),
      "@super-calendar/example-shared/menu": path.join(shared, "EventMenuWrapper.tsx"),
      "@super-calendar/example-shared/events": path.join(shared, "events.ts"),
      "@super-calendar/example-shared": path.join(shared, "EventMenu.tsx"),
    },
  },
});
