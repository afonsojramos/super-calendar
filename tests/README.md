# Tests

Use Vitest for unit, component, and shared browser tests. Choose a location by what the test
verifies:

| Location                       | Purpose                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `web/contracts/`               | Shared React DOM and Solid behavior, with the same cases run for both renderers.           |
| `web/adapters/`                | Framework wiring for shared contracts.                                                     |
| `web/browser/contracts/`       | Real-browser behavior shared by React DOM and Solid, against source and built packages.    |
| `web/browser/fixtures/`        | Shared browser UI and its framework adapters.                                              |
| `demos/`                       | Smoke tests against the assembled static Pages artifact.                                   |
| `performance/`                 | Production renderer and bundle measurements, reported without timing thresholds.           |
| `architecture/`                | Package boundaries, public API parity, documentation consistency, and worklet compilation. |
| `tooling/`                     | Test tooling, including the shared web parity gate.                                        |
| `setup/`                       | Vitest environment setup and platform mocks.                                               |
| `support/`                     | Reusable rendering and time-zone helpers imported by tests.                                |
| `types/`                       | Test-only ambient type declarations.                                                       |
| `packages/*/src/**/__tests__/` | Core logic and framework-specific behavior beside the source they exercise.                |
| `examples/*/src/**/__tests__/` | Example integration behavior, including deployment paths.                                  |

Read the [shared web test guide](web/README.md) before adding a React DOM/Solid
contract. Keep assertions in test files and reusable harness code in adapters or
support files.

## Run tests

- `pnpm test`: run all five Vitest projects once.
- `pnpm test:watch`: watch for changes.
- `pnpm test:parity`: run all projects and verify that every shared web case passed
  once for React DOM and once for Solid.
- `pnpm test:browser`: after `pnpm build`, run the shared browser contracts and
  require the same cases to pass for each framework's source and built packages.
- `pnpm test:react18:browser`: after `pnpm build`, run the shared creation-preview
  contracts against React 18 source and built entries in Chromium.
- `pnpm build:demos && pnpm test:demos`: build and check the three published demos.
- `pnpm build && pnpm bench:web`: collect production renderer and bundle baselines.
- `pnpm exec vitest run --project native`: run one project. Other project names are
  `node`, `dom`, `solid`, and `solid-server`.

The root `vitest.config.mts` owns discovery, environment setup, and framework
aliases. Shared contracts are typechecked against both adapters. Tests import
library source, so they do not require a build.

The native project pins `test-renderer` to 1.2.0 for React 19.2. Version 1.3.1
pulls in `react-reconciler@0.34.0`, which requires React 19.3. Update the renderer
with the Expo and React toolchain, and check peer dependencies before running tests.

The separate `vitest.browser.config.mts` runs browser contracts with real layout
and input. See the [browser test guide](web/README.md#browser-contracts) for setup.
Solid hydration and package verification commands live in `scripts/` and are documented
in the [Solid package README](../packages/solid/README.md#run-the-example). Device
gesture checks use the [native example workflow](../AGENTS.md#running-the-native-example-on-a-device-or-emulator).

## Performance baselines

`pnpm bench:web` runs Vitest against production builds of the same fixture for
React DOM and Solid. It measures a 1,000-event week, an update of all event titles,
and scrolling through 121 months. The scrolling check also verifies bounded
mounted rows, and both tests fail on browser errors or missing content. Fixture
builds run in separate Node processes with `NODE_ENV=production`, independently
of Vitest's test environment. Build guards require Vite's production mode and
reject bundled React development modules.

Reports in `dist/performance/react.json` and `dist/performance/solid.json` contain
seven measured samples after one discarded warmup, medians and p95 values, DOM
node counts, and raw/gzipped JavaScript and CSS sizes. They record the commit,
working-tree state, runtime, browser, CPU, and viewport. The bundle measurements
include the fixture and framework, so they are consumer bundle baselines rather
than package tarball sizes.

Load timing includes local asset loading and rendering. Update and scroll timings
run from the action until all updated titles or the new virtualized rows are in
the DOM, then through two animation frames, including frame scheduling.
Compare results on the same machine and browser. CI uploads a report for each
commit; timing values are informational until repeated runs establish useful
regression limits. Structural assertions remain blocking checks.
