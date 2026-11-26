# super-calendar agent guide

## Packages

- `packages/core` provides render-agnostic logic through `@super-calendar/core/vanilla` and React hooks through the root export. Keep renderer dependencies in their packages.
- `packages/dom`, `packages/native`, and `packages/solid` provide the React DOM, React Native, and Solid 2 renderers. All three depend on the workspace's `@super-calendar/core` package.

## Implementation

- Give the calendar good defaults and expose customization through props, theme tokens, and render overrides.
- Match prop names across DOM and native for the `SHARED_COMPONENTS` in `tests/architecture/renderer-parity.test.ts`. Allowlist web-only props in that test. Mirror shared additions to the `Calendar` wrappers by hand.
- Use pnpm or Nub with the shared `pnpm-lock.yaml`. Keep the default isolated layout and Metro's hierarchical lookup. Leave `nodeLinker: hoisted` and `disableHierarchicalLookup` unset.
- Metro reads core and native TypeScript source through the `react-native` export condition. The React web example resolves DOM and core directly to TypeScript source. Run `pnpm build:demos` to rebuild the demos published for the docs.

## Tests

- Use `pnpm test:parity` to run Vitest and check shared React DOM and Solid case parity. `pnpm test` runs Vitest alone.
- Run `pnpm build` before `pnpm test:browser`. The browser suite exercises source and built packages.
- Put shared React DOM and Solid behavior in [web contracts](tests/web/README.md). Use their browser contracts for real layout, scrolling, pointer capture, and touch input.
- Put renderer-specific tests beside the code. Use the [test directory guide](tests/README.md) for project setup and fixtures.

<a name="running-the-native-example-on-a-device-or-emulator"></a>

## Task guides

- Review code against the [coding standards](CODING_STANDARDS.md).
- Before running the native example on a device, reproducing a native touch or layout bug, or changing pager behavior, read the [native device guide](packages/native/DEVICE_DEBUGGING.md).
- When editing consumer docs or changing public API or behavior, read the [documentation guide](CONTRIBUTING_DOCS.md).

## Commits and releases

- Commit when asked. Use a single-line conventional commit in the imperative mood.
- Squash merges use the PR title for the release-please changelog. Use `fix:` or `feat:` for changes consumers notice. Use `test:`, `chore:`, `ci:`, or `docs:` for other changes.
- To override a changelog entry, put the conventional commit message between `BEGIN_COMMIT_OVERRIDE` and `END_COMMIT_OVERRIDE` in the PR body.
- Use commas or separate sentences in place of em dashes.
