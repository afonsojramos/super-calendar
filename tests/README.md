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

`pnpm build && pnpm bench:web` runs Vitest against production builds of the same
fixture for React DOM and Solid. The projects run sequentially. Each interaction
has one discarded warmup and seven measured samples. Browser errors, missing
content, incorrect commits, and unbounded mounted month rows fail the run.
Timing values are informational until repeated runs establish regression limits.

The catalog in `tests/performance/interactions.ts` owns the interaction IDs,
workloads, and timing boundaries. It generates this map and the report rows.
After changing the catalog, run `pnpm bench:map` and format this file. A Vitest
check rejects a stale map.

<!-- interaction-map:start -->

| ID              | Interaction                  | Workload                              | Timing boundary                                                           |
| --------------- | ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `dense.mount`   | Open a dense week            | 1,000 timed events                    | Navigation start to rendered events and two animation frames              |
| `dense.update`  | Replace every event title    | 1,000 timed events                    | Button activation to all new titles and two animation frames              |
| `dense.chooser` | Open the event chooser       | 1,000 editable events                 | Button activation to 1,000 choices and two animation frames               |
| `months.scroll` | Scroll the month list        | 121 months, 4,000 px scroll           | Scroll assignment to changed virtual rows and two animation frames        |
| `week.next`     | Navigate to the next week    | One event, seven days                 | Button activation to the next date and columns, then two animation frames |
| `week.month`    | Switch from week to month    | One event                             | Button activation to month days and two animation frames                  |
| `event.dialog`  | Open event actions           | One editable event                    | Chooser activation to the action dialog and two animation frames          |
| `event.action`  | Move an event with an action | One event, 15 minutes later           | Action activation to the committed range and two animation frames         |
| `event.move`    | Drop an event on another day | One event, one day and one hour later | Pointer release to the committed event and two animation frames           |
| `event.resize`  | Extend an event              | One event, one hour longer            | Pointer release to the committed event and two animation frames           |
| `event.create`  | Create a timed event         | One existing event, two-hour sweep    | Pointer release to the created event and two animation frames             |

<!-- interaction-map:end -->

Button measurements use DOM button activation. Pointer measurements use real
browser mouse input and start at release, after the sweep. Every measurement
ends after its expected DOM update and two animation frames. These timings
include frame scheduling. They are not INP, continuous input latency, or a
count of dropped frames.

The dense update also records Chromium's `ScriptDuration` and `TaskDuration`
deltas in milliseconds. Script time is part of task time; do not add them.
Both include fixture and measurement overhead. The legacy renderer JSON reports
retain mounted node counts and raw/gzipped JavaScript and CSS sizes. Bundle
sizes include the fixture and framework, rather than only the library package.

### Compare a baseline and candidate

Use identical fixtures and inputs on the same hardware, runtime, and browser.
Stop other builds and tests before measuring. Build both revisions first, then
run them sequentially. Repeat with the order reversed before claiming an
improvement, and retain every raw sample. A difference must exceed run-to-run
variation to support an improvement claim.

Use an existing clean baseline checkout with built packages. Run these commands
from the candidate checkout so both revisions use its fixture and timing code:

```sh
CALENDAR_PERFORMANCE_PACKAGE_ROOT=/absolute/path/to/baseline \
CALENDAR_PERFORMANCE_OUTPUT=dist/performance/base pnpm bench:web
CALENDAR_PERFORMANCE_OUTPUT=dist/performance/candidate pnpm bench:web
pnpm bench:report --baseline dist/performance/base
```

`CALENDAR_PERFORMANCE_PACKAGE_ROOT` selects the built core and renderer packages.
The candidate checkout supplies the fixture and its framework dependencies.
Run `pnpm bench:report` without `--baseline` for a candidate-only table.
Reports with different harness hashes, host, CPU, runtime, browser, viewport,
or time zone show **Not comparable** instead of a percentage.

`dist/performance/report.md` contains the PR table. The JSON files retain every
sample, commit, working-tree state, collection time, environment, and fixture
hash. The table shows median, p95, minimum, and maximum. With seven samples,
p95 is the maximum; it is not a reliable tail-latency estimate.

CI measures the PR base and head on the same runner with the current fixture,
then uploads the reports as the `renderer-performance` artifact for 90 days.
The Actions summary shows the same table. For PRs from this repository, a
separate job updates one performance comment, and skips superseded heads or
bases. That job executes no code from a PR checkout. Fork and Dependabot PRs
keep the summary and artifact without a comment. Main-branch runs retain
candidate-only reports for history; compare historical values only when their
environments and timing definitions match.

### Measurement gaps

The table explicitly marks resource timelines, date pickers, continuous drag
and scroll frame pacing, and native release performance as **Not measured**.
Functional coverage of those interactions is not performance evidence.

Profile native interactions in a release build on a physical device. Record the
device, OS, refresh rate, event workload, and build revision. Measure input
response and JS/UI frame times separately. Development builds, native-web tests,
and the recorded-gesture unit harness do not establish native performance.
