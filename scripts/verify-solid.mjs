// Exercise the real Solid compiler, browser layout, pointer capture, and hydration.
// Uses an isolated headless Chrome profile and an owned Vite server. Set CHROME
// to override the browser executable. No application or browser state is reused.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
assert(
  args.length === 0 || (args.length === 1 && args[0] === "--dist"),
  "Usage: node scripts/verify-solid.mjs [--dist]",
);
const distribution = args[0] === "--dist";
const resolvedArtifacts = new Set();
const example = join(root, "examples/solid");
const require = createRequire(import.meta.url);
const { createServer } = await import(pathToFileURL(require.resolve("vite", { paths: [example] })));
const chromePath =
  process.env.CHROME ??
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find(existsSync);
assert(chromePath, "Install Chrome/Chromium or set CHROME to its executable");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await pause(50);
  }
  throw new Error(`Timed out: ${description}`);
}

const server = await createServer({
  root: example,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
  plugins: distribution
    ? [
        {
          name: "calendar-built-artifacts",
          enforce: "pre",
          resolveId(source, _importer, options) {
            if (source === "@super-calendar/solid") {
              const target = options.ssr ? "server" : "client";
              resolvedArtifacts.add(target);
              return join(root, `packages/solid/dist/${target}/index.js`);
            }
            if (source === "@super-calendar/core/vanilla")
              return join(root, "packages/core/dist/vanilla.mjs");
          },
        },
      ]
    : [],
});
const profile = await mkdtemp(join(tmpdir(), "calendar-solid-"));
let chrome;
let socket;
let reactServer;
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const endpoint = await until(async () => {
    try {
      return await readFile(join(profile, "DevToolsActivePort"), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return null;
    }
  }, "Chrome startup");
  const port = endpoint.split("\n")[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let nextId = 0;
  const pending = new Map();
  const diagnostics = [];
  let loadedClientArtifact = false;
  let loadedReactArtifact = false;
  let heldFeedRequest;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      clearTimeout(call.timer);
      if (message.error) call.reject(new Error(JSON.stringify(message.error)));
      else call.resolve(message.result);
    } else if (message.method === "Network.responseReceived") {
      if (message.params.response.url.includes("/packages/solid/dist/client/index.js"))
        loadedClientArtifact = true;
      if (message.params.response.url.includes("/packages/dom/dist/index.mjs"))
        loadedReactArtifact = true;
    } else if (message.method === "Runtime.exceptionThrown") {
      diagnostics.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    } else if (message.method === "Fetch.requestPaused") {
      heldFeedRequest = message.params.requestId;
    } else if (
      message.method === "Runtime.consoleAPICalled" &&
      ["error", "warning"].includes(message.params.type)
    ) {
      diagnostics.push(message.params.args.map((arg) => arg.description ?? arg.value).join(" "));
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    return result.result.value;
  };
  const waitFor = (expression, description = expression) =>
    until(() => evaluate(`Boolean(${expression})`), description);
  const rect = (selector) =>
    evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw Error('Missing element: ' + ${JSON.stringify(selector)});
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  })()`);
  const mouse = (type, x, y) =>
    send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
    });
  const click = async (selector) => {
    const r = await rect(selector);
    await mouse("mousePressed", r.x + r.width / 2, r.y + r.height / 2);
    await mouse("mouseReleased", r.x + r.width / 2, r.y + r.height / 2);
  };
  const navigate = async (path) => {
    await send("Page.navigate", { url: new URL(path, origin).href });
    await waitFor(
      "document.querySelector('main') && document.readyState === 'complete'",
      `load ${path}`,
    );
    // A reactive theme update proves that the page has mounted or hydrated.
    await click("header button");
    await waitFor("document.querySelector('main').dataset.theme === 'dark'");
    assert.deepEqual(diagnostics.splice(0), [], `Browser diagnostics on ${path}`);
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `new MutationObserver(() => {
    window.firstMain ??= document.querySelector('main');
    window.firstEvent ??= document.querySelector('[data-slot="event"]');
  }).observe(document, { childList: true, subtree: true });`,
  });

  for (const route of ["/", "/ssr"]) {
    for (const view of [
      "month",
      "week",
      "day",
      "3days",
      "custom",
      "schedule",
      "year",
      "months",
      "resources",
      "feed",
    ]) {
      await navigate(`${route}?view=${view}`);
      if (view === "feed") {
        await waitFor(
          "document.querySelector('[aria-label=\"Event feed\"] [role=status]').textContent === 'Feed up to date'",
        );
        assert.equal(
          await evaluate(
            "document.querySelector('[aria-label=\"Interactive calendar\"]').textContent.includes('Feed planning')",
          ),
          true,
        );
      }
      assert.equal(await evaluate("document.querySelector('select').value"), view);
      assert.equal(
        await evaluate("document.querySelector('main') === window.firstMain"),
        true,
        `retain ${view} root`,
      );
      if (["week", "day", "3days", "custom", "resources"].includes(view)) {
        assert.equal(
          await evaluate("document.querySelector('[data-slot=event]') === window.firstEvent"),
          true,
          `retain ${view} event during hydration/theme change`,
        );
      }
      assert.equal(await evaluate("/NaN/.test(document.querySelector('main').innerHTML)"), false);
      console.log(`${route === "/ssr" ? "hydrate" : "mount"}: ${view}`);
    }
  }

  await navigate("/ssr?view=feed");
  const feedStatus =
    "document.querySelector('[aria-label=\"Event feed\"] [role=status]').textContent";
  await waitFor(`${feedStatus} === 'Feed up to date'`);
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "*/events.json", requestStage: "Request" }],
  });
  await click('[aria-label="Event feed"] button');
  await until(() => heldFeedRequest, "intercept a feed refresh");
  await waitFor(`${feedStatus} === 'Loading feed'`);
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"Interactive calendar\"]').textContent.includes('Feed planning')",
    ),
    true,
    "keep events while refreshing",
  );
  await send("Fetch.fulfillRequest", {
    requestId: heldFeedRequest,
    responseCode: 200,
    body: Buffer.from(JSON.stringify([{ start: "invalid", end: "2026-11-02T10:00:00" }])).toString(
      "base64",
    ),
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
  });
  heldFeedRequest = undefined;
  await waitFor(`${feedStatus}.startsWith('Could not refresh:')`);
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"Interactive calendar\"]').textContent.includes('Feed planning')",
    ),
    true,
    "keep events after a rejected feed",
  );
  await click('[aria-label="Event feed"] button');
  await until(() => heldFeedRequest, "intercept recovery refresh");
  await send("Fetch.fulfillRequest", {
    requestId: heldFeedRequest,
    responseCode: 200,
    body: Buffer.from(
      JSON.stringify([
        { title: "Refreshed planning", start: "2026-11-02T09:00:00", end: "2026-11-02T10:00:00" },
      ]),
    ).toString("base64"),
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
  });
  await waitFor(`${feedStatus} === 'Feed up to date'`);
  await waitFor(
    "document.querySelector('[aria-label=\"Interactive calendar\"]').textContent.includes('Refreshed planning')",
  );
  await send("Fetch.disable");
  assert.deepEqual(diagnostics.splice(0), [], "No feed loading, recovery, or hydration warnings");
  console.log(
    "feed: client mount, hydration, pending refresh, validation error, retained data, and recovery",
  );

  await navigate("/ssr?view=week");
  const eventSelector = '[data-slot="event"][aria-label^="Planning,"]';
  let box = await rect(eventSelector);
  await evaluate(
    `window.draggedElement = document.querySelector(${JSON.stringify(eventSelector)})`,
  );
  const columnWidth = await evaluate(
    "document.querySelector('[data-slot=dayColumn]').getBoundingClientRect().width",
  );
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await mouse("mousePressed", x, y);
  await mouse("mouseMoved", x + columnWidth, y + 56);
  assert.equal(
    await evaluate("window.draggedElement.isConnected"),
    true,
    "pointer capture survives a reactive drag preview",
  );
  await mouse("mouseReleased", x + columnWidth, y + 56);
  await waitFor(
    "document.querySelector('[role=status]').textContent.includes('Tue 3 Nov, 10:00')",
    "cross-day move commits",
  );
  box = await rect(eventSelector);
  await mouse("mousePressed", box.x + box.width / 2, box.y + box.height - 3);
  await mouse("mouseMoved", box.x + box.width / 2, box.y + box.height + 53);
  await mouse("mouseReleased", box.x + box.width / 2, box.y + box.height + 53);
  await waitFor(
    "document.querySelector('[role=status]').textContent.includes('12:00')",
    "resize commits",
  );
  console.log("pointer: move across days and resize after hydration");

  await click('.pickers [data-slot="trigger"]');
  await waitFor("document.querySelector('[role=dialog]')");
  await click('[role="dialog"] [data-day="2026-11-03"]');
  await waitFor("!document.querySelector('[role=dialog]')");
  assert.match(
    await evaluate("document.querySelector('.pickers [data-slot=trigger]').textContent"),
    /3 Nov 2026/,
  );
  console.log("picker: selection updates controlled value and dismisses popover");

  await navigate("/ssr?view=week");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  assert.deepEqual(
    await evaluate(`(() => {
      const event = document.querySelector(${JSON.stringify(eventSelector)});
      const grips = [...event.querySelectorAll('[style*="ns-resize"]')];
      return [event, ...grips].map(element => getComputedStyle(element).touchAction);
    })()`),
    ["pan-y", "pan-y", "pan-y"],
    "events and both resize grips preserve vertical touch scrolling",
  );
  const statusBeforeScroll = await evaluate("document.querySelector('[role=status]').textContent");
  await evaluate(
    "window.touchScroller = document.querySelector('[data-slot=dayColumn]').parentElement.parentElement; window.touchScroller.scrollTop = 0",
  );
  box = await rect(eventSelector);
  const scrollBeforeTouch = await evaluate("window.touchScroller.scrollTop");
  const scrollContact = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [scrollContact] });
  for (const offset of [30, 60, 90]) {
    await send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...scrollContact, y: scrollContact.y - offset }],
    });
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitFor(
    `window.touchScroller.scrollTop > ${scrollBeforeTouch + 20}`,
    "an event swipe scrolls the time grid",
  );
  assert.equal(
    await evaluate("document.querySelector('[role=status]').textContent"),
    statusBeforeScroll,
  );
  console.log("touch: event and grip scroll styles, plus a real event swipe without dragging");
  await navigate("/ssr?view=week");
  box = await rect(eventSelector);
  const contact = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
  const statusBeforeTouch = await evaluate("document.querySelector('[role=status]').textContent");
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
  await pause(350);
  await send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...contact, y: contact.y + 56 }],
  });
  await send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  assert.equal(
    await evaluate("document.querySelector('[role=status]').textContent"),
    statusBeforeTouch,
  );
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [contact] });
  await pause(350);
  await send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ ...contact, y: contact.y + 56 }],
  });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await waitFor(
    "document.querySelector('[role=status]').textContent.includes('Mon 2 Nov, 10:00')",
    "held touch move commits after cancellation",
  );
  await send("Emulation.setTouchEmulationEnabled", { enabled: false });
  console.log("touch: held drag cancellation and a subsequent committed move");

  for (const orientation of ["horizontal", "vertical"]) {
    await navigate("/ssr?view=resources");
    if (orientation === "vertical") await click('.orientation input[type="checkbox"]');
    const resourceEvent = '[data-slot="event"][aria-label="Planning"]';
    await evaluate(`document.querySelector(${JSON.stringify(resourceEvent)}).focus()`);
    for (const type of ["keyDown", "keyUp"]) {
      await send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
      });
    }
    await waitFor("document.querySelector('[role=status]').textContent === 'Selected Planning'");
    box = await rect(resourceEvent);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const endX = startX + (orientation === "horizontal" ? 80 : 0);
    const endY = startY + (orientation === "vertical" ? 48 : 0);
    await mouse("mousePressed", startX, startY);
    await mouse("mouseMoved", endX, endY);
    await mouse("mouseReleased", endX, endY);
    await waitFor(
      "document.querySelector('[role=status]').textContent === 'Moved Planning to Studio'",
    );
    const label = await evaluate(
      `document.querySelector(${JSON.stringify(resourceEvent)}).textContent`,
    );
    assert.match(label, /10:00/);
    assert.match(label, /11:00/);
    await evaluate(
      `document.addEventListener('gotpointercapture', e => { window.resourceCapture = e.target; }, { once: true })`,
    );
    box = await rect(resourceEvent);
    const gripX = box.x + (orientation === "horizontal" ? box.width - 3 : box.width / 2);
    const gripY = box.y + (orientation === "vertical" ? box.height - 3 : box.height / 2);
    const resizeX = gripX + (orientation === "horizontal" ? 80 : 0);
    const resizeY = gripY + (orientation === "vertical" ? 48 : 0);
    await mouse("mousePressed", gripX, gripY);
    await mouse("mouseMoved", resizeX, resizeY);
    assert.equal(
      await evaluate(
        `window.resourceCapture === document.querySelector(${JSON.stringify(resourceEvent)})`,
      ),
      true,
      "resize captures the persistent event button",
    );
    await mouse("mouseReleased", resizeX, resizeY);
    await waitFor(
      `document.querySelector(${JSON.stringify(resourceEvent)}).textContent.includes('12:00')`,
    );
    console.log(
      `resource ${orientation}: keyboard activation, pointer move and resize after hydration`,
    );
  }

  await navigate("/ssr?view=months");
  const virtualWindow = `(() => {
    const viewport = document.querySelector('[data-virtual-list]').getBoundingClientRect();
    const rows = [...document.querySelectorAll('[data-virtual-row]')];
    const visible = rows.map(row => ({ element: row, rect: row.getBoundingClientRect() }))
      .filter(row => row.rect.bottom > viewport.top && row.rect.top < viewport.bottom);
    return rows.length > 0 && rows.length < 12 && visible.length > 0
      && visible.every(row => row.element.querySelectorAll('[role=gridcell]').length >= 28)
      && visible.some(row => row.rect.top <= viewport.top + 1)
      && visible.some(row => row.rect.bottom >= viewport.bottom - 1);
  })()`;
  await waitFor(virtualWindow, "month rows fill the initial viewport");
  const before = await evaluate(
    "[...document.querySelectorAll('[data-virtual-row]')].map(e => e.dataset.virtualRow).join(',')",
  );
  await evaluate("document.querySelector('[data-virtual-list]').scrollTop += 1800");
  await waitFor(
    `[...document.querySelectorAll('[data-virtual-row]')].map(e => e.dataset.virtualRow).join(',') !== ${JSON.stringify(before)}`,
  );
  await waitFor(virtualWindow, "bounded month rows fill the viewport after scrolling");
  // Reserve scrollbar space on every OS, including macOS with overlay scrollbars.
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = 'html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; }';
    document.head.append(style);
  })()`);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor("window.innerWidth === 390");
  assert(
    await evaluate("document.documentElement.clientWidth < window.innerWidth"),
    "resize coverage includes space reserved for a vertical scrollbar",
  );
  await waitFor(virtualWindow, "bounded month rows fill the viewport after resizing");
  assert.deepEqual(diagnostics, [], "No browser errors or Solid reactivity/hydration warnings");
  console.log("virtualization: bounded rows through scrolling and viewport resize");
  if (distribution) {
    assert(resolvedArtifacts.has("server"), "SSR uses the built server artifact");
    assert(
      resolvedArtifacts.has("client") && loadedClientArtifact,
      "Chrome executes the built client artifact",
    );
    console.log(
      "distribution: built Solid client/server and core entries pass the full browser scenarios",
    );
  }

  reactServer = await createServer({
    root: join(root, "examples/web"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
    resolve: distribution
      ? {
          alias: {
            "@super-calendar/dom": join(root, "packages/dom/dist/index.mjs"),
            "@super-calendar/core": join(root, "packages/core/dist/index.mjs"),
          },
        }
      : undefined,
    plugins: [
      {
        name: "resource-regression-fixture",
        configureServer(vite) {
          vite.middlewares.use("/__resource-regression", async (request, response, next) => {
            try {
              const html = await vite.transformIndexHtml(
                request.originalUrl,
                '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/ResourceTimeline.fixture.tsx"></script></body></html>',
              );
              response.setHeader("Content-Type", "text/html");
              response.end(html);
            } catch (error) {
              next(error);
            }
          });
        },
      },
    ],
  });
  await reactServer.listen();
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const resourceEvent = '[data-slot="event"][aria-label="Planning"]';
  const readCalls = () => evaluate("JSON.parse(document.querySelector('output').textContent)");
  const loadResource = async (orientation) => {
    await send("Page.navigate", {
      url: new URL(
        `/__resource-regression?orientation=${orientation}`,
        reactServer.resolvedUrls.local[0],
      ).href,
    });
    await waitFor("document.querySelector('output') && document.readyState === 'complete'");
    await waitFor(`document.querySelector(${JSON.stringify(resourceEvent)})`);
    assert.deepEqual(diagnostics.splice(0), [], "React resource mount diagnostics");
  };
  const keyActivate = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    for (const type of ["keyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", {
        type,
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
      });
  };
  for (const orientation of ["horizontal", "vertical"]) {
    const dx = orientation === "horizontal" ? 80 : 0;
    const dy = orientation === "vertical" ? 80 : 0;
    await loadResource(orientation);
    await keyActivate(resourceEvent);
    assert.deepEqual(await readCalls(), [{ type: "press", title: "Planning" }]);
    await click(resourceEvent);
    assert.equal((await readCalls()).length, 2, "pointer click activates once");
    const lockedEvent = '[data-slot="event"][aria-label="Locked"]';
    await keyActivate(lockedEvent);
    assert.deepEqual((await readCalls()).at(-1), { type: "press", title: "Locked" });
    assert.equal(
      await evaluate(
        `document.querySelector(${JSON.stringify(lockedEvent)}).querySelector('[aria-hidden]') === null`,
      ),
      true,
    );
    box = await rect(lockedEvent);
    await mouse("mousePressed", box.x + box.width / 2, box.y + box.height / 2);
    await mouse("mouseMoved", box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await mouse("mouseReleased", box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    assert.equal(
      (await readCalls()).some((call) => call.type === "drag"),
      false,
      "locked event cannot move",
    );

    await loadResource(orientation);
    box = await rect(resourceEvent);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await mouse("mousePressed", x, y);
    await evaluate(
      `window.heldEvent = document.querySelector(${JSON.stringify(resourceEvent)}); document.querySelector('#insert').click()`,
    );
    await waitFor("document.querySelector('[aria-label=Earlier]')");
    assert.equal(
      await evaluate(
        `window.heldEvent === document.querySelector(${JSON.stringify(resourceEvent)})`,
      ),
      true,
    );
    await mouse("mouseMoved", x + dx, y + dy);
    await mouse("mouseReleased", x + dx, y + dy);
    assert.deepEqual(await readCalls(), [
      { type: "drag", title: "Planning", start: 10, end: 11, resource: "a" },
    ]);

    box = await rect(resourceEvent);
    const gripX = box.x + (orientation === "horizontal" ? box.width - 3 : box.width / 2);
    const gripY = box.y + (orientation === "vertical" ? box.height - 3 : box.height / 2);
    await evaluate(
      "document.addEventListener('gotpointercapture', e => { window.captureOwner = e.target; window.capturedPointer = e.pointerId; }, { once: true })",
    );
    await mouse("mousePressed", gripX, gripY);
    await mouse("mouseMoved", gripX + dx, gripY + dy);
    assert.equal(
      await evaluate(
        `window.captureOwner === document.querySelector(${JSON.stringify(resourceEvent)})`,
      ),
      true,
    );
    await mouse("mouseReleased", gripX + dx, gripY + dy);
    assert.deepEqual((await readCalls()).at(-1), {
      type: "drag",
      title: "Planning",
      start: 10,
      end: 12,
      resource: "a",
    });

    await loadResource(orientation);
    box = await rect(resourceEvent);
    await mouse("mousePressed", box.x + box.width / 2, box.y + box.height / 2);
    await mouse("mouseMoved", box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await evaluate("document.querySelector('#remove').click()");
    await waitFor(`!document.querySelector(${JSON.stringify(resourceEvent)})`);
    await mouse("mouseReleased", box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    assert.deepEqual(await readCalls(), [], "removed event does not commit a drop");

    await loadResource(orientation);
    const lane = await rect('[data-resource-id="b"]');
    const startX = lane.x + (orientation === "horizontal" ? 320 : lane.width / 2);
    const startY = lane.y + (orientation === "vertical" ? 320 : lane.height / 2);
    await evaluate(
      "document.addEventListener('gotpointercapture', e => { window.captureOwner = e.target; window.capturedPointer = e.pointerId; }, { once: true })",
    );
    await mouse("mousePressed", startX, startY);
    await mouse("mouseMoved", startX + dx, startY + dy);
    await evaluate("window.captureOwner.releasePointerCapture(window.capturedPointer)");
    await mouse("mouseReleased", startX + dx, startY + dy);
    assert.deepEqual(await readCalls(), [], "capture loss cancels creation");
    await mouse("mousePressed", startX, startY);
    await mouse("mouseMoved", startX + dx, startY + dy);
    await mouse("mouseReleased", startX + dx, startY + dy);
    assert.deepEqual(await readCalls(), [{ type: "create", start: 12, end: 13, resource: "b" }]);

    await loadResource(orientation);
    await click("#disable-on-action");
    await click(resourceEvent);
    assert.deepEqual(
      await readCalls(),
      [{ type: "press", title: "Planning" }],
      "press callback can disable editing without repeating",
    );
    await click("#editable");
    box = await rect(resourceEvent);
    await mouse("mousePressed", box.x + box.width / 2, box.y + box.height / 2);
    await mouse("mouseMoved", box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    await mouse("mouseReleased", box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
    assert.deepEqual(
      await readCalls(),
      [
        { type: "press", title: "Planning" },
        { type: "drag", title: "Planning", start: 10, end: 11, resource: "a" },
      ],
      "drop callback can disable editing without activating the event",
    );
    await click(resourceEvent);
    assert.equal((await readCalls()).length, 3, "a later click still activates a locked event");
    assert.deepEqual(diagnostics.splice(0), [], "React resource interaction diagnostics");
    console.log(
      `React resource ${orientation}: activation, locked events, live insertion/removal, resize capture, cancellation, and fresh creation`,
    );
  }
  if (distribution) assert(loadedReactArtifact, "Chrome executes the built React DOM artifact");
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill("SIGTERM");
    await exited;
  }
  await server.close();
  await reactServer?.close();
  await rm(profile, { recursive: true, force: true });
}
