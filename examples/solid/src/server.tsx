import { generateHydrationScript, renderToString } from "@solidjs/web";
import { App, viewFromSearch } from "./App";

export function renderPage(search = "") {
  return {
    html: renderToString(() => <App initialView={viewFromSearch(search)} />),
    hydration: generateHydrationScript(),
  };
}
