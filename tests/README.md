# Tests

Use Vitest for unit, component, and shared browser tests. Choose a location by what the test
verifies:

| Location                       | Purpose                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `web/contracts/`               | Shared React DOM and Solid behavior, with the same cases run for both renderers.           |
| `web/adapters/`                | Framework wiring for shared contracts.                                                     |
| `web/browser/contracts/`       | Real-browser behavior shared by React DOM and Solid, against source and built packages.    |
| `web/browser/fixtures/`        | Shared browser UI and its framework adapters.                                              |
| `architecture/`                | Package boundaries, public API parity, documentation consistency, and worklet compilation. |
| `tooling/`                     | Test tooling, including the shared web parity gate.                                        |
| `setup/`                       | Vitest environment setup and platform mocks.                                               |
| `support/`                     | Reusable rendering and time-zone helpers imported by tests.                                |
| `types/`                       | Test-only ambient type declarations.                                                       |
| `packages/*/src/**/__tests__/` | Core logic and framework-specific behavior beside the source they exercise.                |

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
- `pnpm exec vitest run --project native`: run one project. Other project names are
  `node`, `dom`, `solid`, and `solid-server`.

The root `vitest.config.mts` owns discovery, environment setup, and framework
aliases. Shared contracts are typechecked against both adapters. Tests import
library source, so they do not require a build.

The separate `vitest.browser.config.mts` runs browser contracts with real layout
and input. See the [browser test guide](web/README.md#browser-contracts) for setup.
Solid hydration and package verification commands live in `scripts/` and are documented
in the [Solid package README](../packages/solid/README.md#run-the-example). Device
gesture checks use the [native example workflow](../AGENTS.md#running-the-native-example-on-a-device-or-emulator).
