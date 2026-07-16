# super-calendar — agent guide

## What this is

A render-agnostic calendar, gesture-driven and virtualized, published as three packages from a pnpm monorepo:

- `@super-calendar/core` — `packages/core`. Pure logic, no rendering. Peer deps: `date-fns`, `react`. Entry: `packages/core/src/index.ts`.
- `@super-calendar/dom` — `packages/dom`. react-dom renderer. Adds `@legendapp/list`, `react-dom`.
- `@super-calendar/native` — `packages/native`. React Native renderer. Adds `@legendapp/list`, `react-native`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`. Has a `./picker` subpath export. Entry: `packages/native/src/index.tsx`.

Both renderers depend on core via `workspace:*`. The npm slug and repo are `super-calendar`; the directory on disk still says `bigger`.

## Principles

- This is a library, so customizability is key, but good defaults are equally important. Expose props, theme tokens, and render overrides for flexibility, while making the zero-config path look and behave well out of the box.
- Treat the public API (the package `exports`) as a contract: don't make breaking changes casually.
- Keep the dom and native public surfaces aligned. For the shared components (`MonthView`, `MonthList`, `TimeGrid`), a prop added on one renderer should carry the same name on the other; a genuinely web-only prop is allowed but must be allowlisted in `tests/renderer-parity.test.ts`, which guards `dom ⊆ native ∪ platform`. Native is the reference and may carry extra RN-only props (Agenda, MonthPager, styling). The `Calendar` wrappers differ by design and aren't parity-checked, so mirror shared additions there by hand.
- Document the public API only (exports from each package). At the end of any piece of work, check whether it changed the public API or behavior; if so, update the docs in the same change before calling it done: `docs/` (Mintlify `.mdx`), `docs/reference/api.mdx`, and the package `README.md`.
- Core stays render-agnostic. Don't import `react-dom` or `react-native` into `packages/core`, and don't pull a renderer's peers into core.

## Project specifics to watch

- **The `react-native` export condition resolves to TypeScript source, not `dist`.** `core` and `native` map `"react-native": "./src/index.ts(x)"` in their `exports`. Metro/RN (the native example) consumes source live, no build needed. The web/dom side and the docs demo consume built `dist`, so they need `pnpm build` to pick up changes. If an edit shows in native but not on web, this is why.
- **Native animation runs in Reanimated v4 worklets on the UI thread** (`Calendar.tsx`, `TimeGrid.tsx`, `picker.tsx`, and others). Code in those paths follows worklet rules (`'worklet'` directives, `runOnJS` to cross back to JS); don't treat it like ordinary JS.
- **`date-fns` is a peer with range `>=3`,** so the library must stay compatible across v3 and v4. Don't use an API that exists in only one major.
- **Packaging is CI-gated by `attw` + `publint` per package.** The dual ESM/CJS `exports` maps are load-bearing; don't hand-edit them carelessly or CI fails.

## Commands (run from the repo root)

- `pnpm lint` / `pnpm lint:fix` — oxlint (type-aware)
- `pnpm format` / `pnpm format:fix` — oxfmt
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — jest
- `pnpm build` — tsdown across all packages (`pnpm -r build`)
- `pnpm bench` — core benchmarks (runs under bun)
- `pnpm parity:visual` screenshots both web renderers side by side for manual visual parity (see Scripts)

Use pnpm or nub, not npm/npx; both install correctly from the shared `pnpm-lock.yaml` now that the workspace uses the default isolated layout (CI stays on pnpm). Two rules keep that true: never reintroduce `nodeLinker: hoisted` (nub mislinks under it, and hoisted splits react whenever the lockfile carries mixed react versions; run `pnpm dedupe` after partial bumps), and never re-add `disableHierarchicalLookup` to the example's metro config (Metro needs hierarchical symlink resolution for isolated layouts). CI runs lint, format, typecheck (root + both examples), test, build, then attw + publint per package and a docs broken-link check.

## Scripts

`scripts/` holds dev tooling that runs directly with `node` (zero deps, no build step).

- `scripts/visual-parity.mjs` (`pnpm parity:visual`) drives system Chrome over CDP to screenshot the dom (`examples/web`) and native-on-react-native-web (`examples/native`) renderers across every view at one fixed viewport, then writes `visual-parity/index.html` with the pairs side by side for eyeballing. It's a manual aid for keeping the two **web** outputs aligned when changing shared layout/styling; the automated guard is still `tests/renderer-parity.test.ts` (prop-name parity only). Start both dev servers first (`cd examples/web && pnpm dev`, `cd examples/native && pnpm start`). Output is gitignored. Override targets with `DOM_URL`, `NATIVE_URL`, `CHROME`, `VIEWS`, `WIDTH`, `HEIGHT`.

## Tests

Jest has three projects: `node` (core logic + native non-component tests), `dom` (jsdom, react-dom components), `native` (react-test-renderer + RN preset). Tests import `@super-calendar/core` by name, resolved to source, so no build is needed first. Add tests next to the code under `packages/*/src/**` (or `tests/**` for cross-cutting ones).

## Examples

`examples/native` and `examples/web` are runnable demos. The web build powers the live demo on the home/demo page of the docs site, deployed to GitHub Pages by `.github/workflows/demo.yml`.

## Documentation

`docs/` is a Mintlify site. Pages are MDX with YAML frontmatter; configuration lives in `docs/docs.json`. Keep docs in sync with each package's `README.md` and the exported types (`packages/native/src/index.tsx`, `packages/core/src/index.ts`).

Terminology:

- "the calendar" or "the library" means the package itself.
- "consumer" means a developer using the library in their app.
- "event" is a `CalendarEvent`; "occurrence" is an expanded recurring event.
- Modes are `month`, `week`, `day`, `3days`, `custom`, `schedule`.

Style:

- Active voice, second person ("you"). Concise sentences, one idea each.
- Sentence case for headings.
- Bold for UI elements (tabs, buttons); code formatting for prop names, types, file names, and commands.
- Prefer real, copy-pasteable code that matches the actual API. When unsure of exported names or `Calendar` props, check `packages/native/src/index.tsx`.
- Don't invent props or defaults; if unsure, link to the TypeScript types. Don't document internal components or unexported helpers.

## Conventions

- Conventional commits; releases are automated with release-please. Commit only when asked, one line, imperative mood. Never mention Claude or AI in commits or docs.
- Never use em-dashes in prose.
