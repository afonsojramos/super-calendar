# super-calendar — agent guide

## What this is

A render-agnostic calendar, gesture-driven and virtualized, with four packages in a pnpm monorepo:

- `@super-calendar/core`: `packages/core`. Pure logic through `./vanilla`; React hooks through the root entry. Peer deps: `date-fns` and optional `react`, required by the root entry.
- `@super-calendar/dom` — `packages/dom`. react-dom renderer. Adds `@legendapp/list`, `react-dom`.
- `@super-calendar/native` — `packages/native`. React Native renderer. Adds `@legendapp/list`, `react-native`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`. Has a `./picker` subpath export. Entry: `packages/native/src/index.tsx`.

- `@super-calendar/solid`: `packages/solid`. Solid 2 renderer. Exact `solid-js` and `@solidjs/web` RC peers, with no React dependency. Entry: `packages/solid/src/index.ts`.

All renderers depend on core via `workspace:*`.

## Principles

- This is a library, so customizability is key, but good defaults are equally important. Expose props, theme tokens, and render overrides for flexibility, while making the zero-config path look and behave well out of the box.
- Treat the public API (the package `exports`) as a contract: don't make breaking changes casually.
- Keep the dom and native public surfaces aligned. For the shared components (`MonthView`, `MonthList`, `TimeGrid`), a prop added on one renderer should carry the same name on the other; a genuinely web-only prop is allowed but must be allowlisted in `tests/architecture/renderer-parity.test.ts`, which guards `dom ⊆ native ∪ platform`. Native is the reference and may carry extra RN-only props (Agenda, MonthPager, styling). The `Calendar` wrappers differ by design and aren't parity-checked, so mirror shared additions there by hand.
- Document the public API only (exports from each package). At the end of any piece of work, check whether it changed the public API or behavior; if so, update the docs in the same change before calling it done: `docs/` (Mintlify `.mdx`), `docs/reference/api.mdx`, and the package `README.md`.
- Core stays render-agnostic. Don't import `react-dom` or `react-native` into `packages/core`, and don't pull a renderer's peers into core.

## Project specifics to watch

- **The `react-native` export condition resolves to TypeScript source, not `dist`.** `core` and `native` map `"react-native": "./src/index.ts(x)"` in their `exports`. Metro/RN (the native example) consumes source live, no build needed. The web/dom side and the docs demo consume built `dist`, so they need `pnpm build` to pick up changes. If an edit shows in native but not on web, this is why.
- **Native animation runs in Reanimated v4 worklets on the UI thread** (`Calendar.tsx`, `TimeGrid.tsx`, `picker.tsx`, and others). Code in those paths follows worklet rules (`'worklet'` directives, `runOnJS` to cross back to JS); don't treat it like ordinary JS.
- **`date-fns` is a peer with range `>=3`,** so the library must stay compatible across v3 and v4. Don't use an API that exists in only one major.
- **Packaging is CI-gated by `attw` + `publint` per package.** The dual ESM/CJS `exports` maps are load-bearing; don't hand-edit them carelessly or CI fails.
- **Solid is ESM-only.** Its `solid` condition exposes source for the Solid compiler; `browser` resolves to the built client and the default condition to the built server. Validate both source and built entries after compiler or packaging changes.

## Commands (run from the repo root)

- `pnpm lint` / `pnpm lint:fix` — oxlint (type-aware)
- `pnpm format` / `pnpm format:fix` — oxfmt
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` runs Vitest once; `pnpm test:watch` starts watch mode.
- `pnpm test:parity` runs all Vitest projects and verifies shared React/Solid case parity.
- `pnpm test:browser` runs shared Vitest browser contracts for React/Solid source and built packages. Run `pnpm build` first.
- `pnpm build` — tsdown across all packages (`pnpm -r build`)
- `pnpm bench` — core benchmarks (runs under bun)
- `pnpm parity:visual` screenshots both web renderers side by side for manual visual parity (see Scripts)

Use pnpm or nub, not npm/npx; both install correctly from the shared `pnpm-lock.yaml` now that the workspace uses the default isolated layout (CI stays on pnpm). Two rules keep that true: never reintroduce `nodeLinker: hoisted` (nub mislinks under it, and hoisted splits react whenever the lockfile carries mixed react versions; run `pnpm dedupe` after partial bumps), and never re-add `disableHierarchicalLookup` to the example's metro config (Metro needs hierarchical symlink resolution for isolated layouts). CI runs lint, format, typecheck (root and all three apps), Vitest parity, build, browser and package checks, then attw + publint per package and a docs broken-link check.

## Scripts

`scripts/` holds dev tooling that runs directly with `node`, using workspace dependencies where needed, with no build step.

- `scripts/visual-parity.mjs` (`pnpm parity:visual`) drives system Chrome over CDP to screenshot the dom (`examples/web`) and native-on-react-native-web (`examples/native`) renderers across every view at one fixed viewport, then writes `visual-parity/index.html` with the pairs side by side for eyeballing. It's a manual aid for keeping the two **web** outputs aligned when changing shared layout/styling; the automated guard is still `tests/architecture/renderer-parity.test.ts` (prop-name parity only). Start both dev servers first (`cd examples/web && pnpm dev`, `cd examples/native && pnpm start`). Output is gitignored. Override targets with `DOM_URL`, `NATIVE_URL`, `CHROME`, `VIEWS`, `WIDTH`, `HEIGHT`.

## Tests

Vitest has five projects: `node` (core logic + native non-component tests), `dom` (React DOM in jsdom), `solid` (Solid in jsdom), `solid-server` (Solid SSR), and `native` (React Native through vitest-native's native engine). Native tests use Testing Library 14: await rendering, events, and updates, and query host elements. The native setup retains the recording gesture and animation harness; device tests verify actual gestures and layout.

Write shared React DOM/Solid behavior in `tests/web/contracts`; read the [shared web test guide](tests/web/README.md) before adding cases. Both projects compile the same JSX for their framework and use the real calendar components. Keep framework-specific tests beside the source under `packages/*/src/**`; use the [test directory guide](tests/README.md) for repository checks, setup, and reusable helpers. Tests resolve core imports to source, so no build is needed. Use `vi` from `vitest` for mocks and timers. The forks pool isolates process state; DST fixtures use `tests/support/timezone.ts` to select and restore their time zone.

For real layout, scrolling, pointer capture, and touch input, add shared cases to `tests/web/browser/contracts`. `vitest.browser.config.mts` runs them against both frameworks' source and built packages, using Playwright as the Chrome driver. `pnpm test:browser` enforces identical passing cases across all four projects. See the shared web test guide for browser setup and fixtures. Keep Solid-specific hydration and package checks in the existing scripts.

## Examples

`examples/native`, `examples/web`, and `examples/solid` are runnable demos. The React web build powers the live demo on the home/demo page of the docs site, deployed to GitHub Pages by `.github/workflows/demo.yml`. The Solid example has client rendering at `/` and hydration at `/ssr`.

### Running the native example on a device or emulator

Use the stock Expo CLI, one command, from `examples/native`:

- `pnpm exec expo run:android` (or `run:ios`) builds the debug dev client, installs it, launches it, and starts Metro. That single process is the dev server; leave it running. It prints the Metro URL and opens the app at it. With one device attached, leave `--device` off: it matches neither the adb serial nor the model name.
- Fast Refresh is on: save a file under `packages/*/src` or `examples/native` and the change pushes to the running app on its own. No reload step. Verified by editing a visible string and watching it update live, then revert.
- Reload or the dev menu when you need them: press `r` (reload) or `m` (dev menu) in the Metro terminal, or shake the device. On a physical device the dev menu often will not open from `adb shell input keyevent 82`; use `m` from the terminal instead.

Do not fight the setup by hand: no second Metro on the same port, and don't `adb reverse` + `am force-stop` + re-open to "reload". Re-opening the dev client serves its cached JS instead of fetching your latest bundle, so edits look like no-ops. If it gets into that state, `adb uninstall <package>` and re-run `expo run:android` for a clean slate. Web parity check is the same idea: `pnpm exec expo start --web` from `examples/native`.

### Reproducing native touch and layout bugs

For a bug that only shows on a device (a gesture, a scroll, a pixel offset), ask the user to connect an Android device before tracing library source; a few device runs settle what static reading cannot.

- Match the reporter's screen: `adb shell wm size 720x1600` and `adb shell wm density 300` (from their screenshot size and DPI). Fractional dp widths only appear at some densities. Restore with `wm size reset` and `wm density reset` when done.
- Drive exact gestures with raw motion events: `adb shell "input motionevent DOWN x y; input motionevent MOVE x y; input motionevent CANCEL x y"`. `CANCEL` reproduces a drag a gesture handler steals; `input swipe` and separately timed `input tap` calls cannot land inside a ~100 ms snap animation.
- Turn the symptom into a number: add a temporary `console.log` (e.g. a pager's resting `contentOffset.x` against its page width, in device pixels via `PixelRatio.get()`) and read it from the Metro output. Remove it before committing.

## Documentation

`docs/` is a Mintlify site. Pages are MDX with YAML frontmatter; configuration lives in `docs/docs.json`. Keep docs in sync with each package's `README.md` and the exported types (`packages/native/src/index.tsx`, `packages/core/src/index.ts`).

Terminology:

- "the calendar" or "the library" means the package itself.
- "consumer" means a developer using the library in their app.
- "event" is a `CalendarEvent`; "occurrence" is an expanded recurring event.
- Modes are `month`, `week`, `day`, `3days`, `custom`, `schedule`, `year`.

Style:

- Active voice, second person ("you"). Concise sentences, one idea each.
- Sentence case for headings.
- Bold for UI elements (tabs, buttons); code formatting for prop names, types, file names, and commands.
- Prefer real, copy-pasteable code that matches the actual API. When unsure of exported names or `Calendar` props, check `packages/native/src/index.tsx`.
- Don't invent props or defaults; if unsure, link to the TypeScript types. Don't document internal components or unexported helpers.

## Conventions

- Conventional commits; releases are automated with release-please. Commit only when asked, one line, imperative mood. Never mention Claude or AI in commits or docs.
- Never use em-dashes in prose.
