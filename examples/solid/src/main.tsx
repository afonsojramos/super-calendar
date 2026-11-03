import { hydrate, render } from "@solidjs/web";
import { App, viewFromSearch } from "./App";
import "./style.css";

const root = document.getElementById("app");
if (!root) throw new Error("Calendar mount element is missing");
const view = viewFromSearch(location.search);
if (location.pathname === "/ssr") hydrate(() => <App initialView={view} />, root);
else render(() => <App initialView={view} />, root);
