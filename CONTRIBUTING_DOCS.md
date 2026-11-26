# Write consumer documentation

Use MDX with YAML frontmatter for Mintlify pages in `docs/`. Site navigation and redirects live in [docs.json](docs/docs.json).

When public API or behavior changes, update the relevant guides, [the API reference](docs/reference/api.mdx), and the affected package's `README.md` in the same change. Document exported components, props, types, and behavior. Verify names and defaults against the package entry point and component types. For native `Calendar` props, start at [the native entry point](packages/native/src/index.tsx).

## Terminology

- Use "the calendar" or "the library" for the package.
- Use "consumer" for a developer who uses the library in their app.
- Use "event" for a `CalendarEvent` and "occurrence" for an expanded recurring event.
- Use the public mode names `month`, `week`, `day`, `3days`, `custom`, `schedule`, and `year`.

## Style

- Use active voice and address the reader as "you". Keep each sentence to one idea.
- Use sentence case for headings.
- Use bold for UI labels. Use code formatting for props, types, paths, and commands.
- Give examples the reader can copy and run against the documented API.

## Publishable pages

[The package docs builder](scripts/build-package-docs.mjs) selects pages from the Mintlify navigation and converts MDX to Markdown for publication with each package. Check the builder when adding an MDX component to a bundled page. Run `pnpm exec vitest run tests/tooling/package-docs.test.ts` to verify all four bundles. Run `npx --yes mint@4.3.81 broken-links` from `docs/` to match the CI link check.
