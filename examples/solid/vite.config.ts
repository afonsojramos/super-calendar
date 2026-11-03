import { readFile } from "node:fs/promises";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    solid({ ssr: true }),
    {
      name: "calendar-ssr-example",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url ?? "/", "http://localhost");
          if (url.pathname !== "/ssr") return next();
          try {
            const { renderPage } = await server.ssrLoadModule("/src/server.tsx");
            const { html, hydration } = renderPage(url.search);
            const template = await readFile(new URL("./index.html", import.meta.url), "utf8");
            const page = await server.transformIndexHtml(
              "/ssr",
              template.replace("<!--app-->", html).replace("<!--hydration-->", hydration),
            );
            response.setHeader("Content-Type", "text/html");
            response.end(page);
          } catch (error) {
            next(error);
          }
        });
      },
    },
  ],
});
