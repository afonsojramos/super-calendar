#!/usr/bin/env node
// Visual parity tool: screenshots the dom renderer (examples/web) and the native
// renderer on react-native-web (examples/native) in identical conditions (same
// viewport, same views, same data), then writes a side-by-side index.html so the
// two web outputs can be compared by eye.
//
// It is a manual aid, not an automated assertion (real-browser screenshots are too
// environment-sensitive for CI); the static API guard in tests/architecture/renderer-parity.test.ts
// stays the source of truth for prop-name parity. Run this when changing shared
// layout/styling to confirm the renderers still look alike.
//
// Prerequisites: both example dev servers running, and Google Chrome installed.
//   Terminal 1:  cd examples/web    && pnpm dev      # dom renderer  -> http://localhost:5173
//   Terminal 2:  cd examples/native && pnpm start    # native (rnw)  -> http://localhost:8081
//   Then:        pnpm parity:visual
//
// Output: ./visual-parity/<view>.<renderer>.png and ./visual-parity/index.html
//
// Env overrides: DOM_URL, NATIVE_URL, CHROME (browser binary), OUT (output dir),
//   WIDTH, HEIGHT, VIEWS (comma list, e.g. VIEWS=week,month).

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

const DOM_URL = process.env.DOM_URL ?? "http://localhost:5173";
const NATIVE_URL = process.env.NATIVE_URL ?? "http://localhost:8081";
const OUT = process.env.OUT ?? join(process.cwd(), "visual-parity");
const WIDTH = Number(process.env.WIDTH ?? 1440);
const HEIGHT = Number(process.env.HEIGHT ?? 1000);
const DEBUG_PORT = 9456;
const VIEWS = (process.env.VIEWS ?? "month,week,3days,day,schedule,picker,list")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const RENDERERS = [
  { id: "dom", label: "@super-calendar/dom", url: DOM_URL },
  { id: "native", label: "@super-calendar/native (rnw)", url: NATIVE_URL },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error("Could not find Chrome/Chromium. Set CHROME=/path/to/chrome and re-run.");
  }
  return found;
}

async function reachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

// Minimal CDP client over the DevTools WebSocket (no external dependencies).
async function connectChrome() {
  const profile = mkdtempSync(join(tmpdir(), "visual-parity-"));
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://localhost:${DEBUG_PORT}/json`)).json();
      wsUrl = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error("Chrome DevTools endpoint never came up.");

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");

  return {
    async navigate(url) {
      await send("Page.navigate", { url });
    },
    async evaluate(expression) {
      const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return r.result?.result?.value;
    },
    async screenshot(path) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path, Buffer.from(r.result.data, "base64"));
    },
    close() {
      ws.close();
      chrome.kill("SIGTERM");
    },
  };
}

// Click a view tab by its (case-insensitive, exact) label text. The tab label is
// the same in both examples, so one selector drives both renderers.
function clickTabExpr(view) {
  return `(() => {
    const re = new RegExp('^' + ${JSON.stringify(view)} + '$', 'i');
    const leaf = [...document.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && re.test((el.textContent || '').trim()),
    );
    if (!leaf) return false;
    leaf.click();
    return true;
  })()`;
}

async function captureRenderer(page, renderer) {
  console.log(`\n→ ${renderer.label} (${renderer.url})`);
  await page.navigate(renderer.url);
  await sleep(4000); // let the SPA mount (native-on-web is the slower of the two)
  const captured = [];
  for (const view of VIEWS) {
    const ok = await page.evaluate(clickTabExpr(view));
    if (!ok) {
      console.log(`  · ${view}: tab not found, skipped`);
      continue;
    }
    await sleep(1600); // let the view settle (LegendList paints, layout measures)
    const file = `${view}.${renderer.id}.png`;
    await page.screenshot(join(OUT, file));
    captured.push({ view, file });
    console.log(`  · ${view} → ${file}`);
  }
  return captured;
}

function writeIndex(results) {
  // results: { [rendererId]: Map<view, file> }
  const rows = VIEWS.map((view) => {
    const cells = RENDERERS.map((r) => {
      const file = results[r.id]?.get(view);
      const inner = file
        ? `<img src="${file}" alt="${r.id} ${view}" loading="lazy" />`
        : `<div class="missing">not captured (server down?)</div>`;
      return `<td><div class="label">${r.label}</div>${inner}</td>`;
    }).join("");
    return `<tr><th>${view}</th>${cells}</tr>`;
  }).join("\n");

  const html = `<!doctype html>
<meta charset="utf-8" />
<title>super-calendar visual parity</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; color: #1a1b1e; }
  h1 { font-size: 18px; }
  p { color: #6b7280; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; vertical-align: top; padding: 16px 12px 0 0; text-transform: capitalize; width: 64px; }
  td { vertical-align: top; padding: 8px; width: 50%; }
  .label { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
  img { width: 100%; border: 1px solid #e2e4e9; border-radius: 8px; display: block; }
  .missing { color: #9aa1ac; border: 1px dashed #e2e4e9; border-radius: 8px; padding: 24px; text-align: center; }
</style>
<h1>super-calendar: dom vs native (react-native-web) parity</h1>
<p>Captured at ${WIDTH}×${HEIGHT}. Open each pair side by side and compare.</p>
<table><tbody>
${rows}
</tbody></table>
`;
  writeFileSync(join(OUT, "index.html"), html);
}

async function main() {
  const up = Object.fromEntries(
    await Promise.all(RENDERERS.map(async (r) => [r.id, await reachable(r.url)])),
  );
  const live = RENDERERS.filter((r) => up[r.id]);
  if (live.length === 0) {
    console.error(
      [
        "Neither example server is reachable. Start them first:",
        "  cd examples/web    && pnpm dev      # dom    -> " + DOM_URL,
        "  cd examples/native && pnpm start    # native -> " + NATIVE_URL,
      ].join("\n"),
    );
    process.exit(1);
  }
  for (const r of RENDERERS) {
    if (!up[r.id])
      console.warn(`! ${r.label} not reachable at ${r.url}; its column will be blank.`);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const page = await connectChrome();
  const results = {};
  try {
    for (const r of live) {
      const captured = await captureRenderer(page, r);
      results[r.id] = new Map(captured.map((c) => [c.view, c.file]));
    }
  } finally {
    page.close();
  }

  writeIndex(results);
  console.log(`\n✓ Wrote ${OUT}/index.html, open it to compare.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
