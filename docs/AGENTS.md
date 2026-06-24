# Documentation project instructions

## About this project

- This is the Mintlify documentation site for **react-native-bigger-calendar**, a
  gesture-driven, virtualized calendar for React Native and the web.
- Pages are MDX files with YAML frontmatter. Configuration lives in `docs.json`.
- The library source it documents is in `../src`; the runnable example is in
  `../example`. Keep the docs in sync with the library's `README.md` and the
  exported types in `../src/index.tsx`.
- The live demo on the home/demo page embeds the example's web build, deployed to
  GitHub Pages by `.github/workflows/demo.yml`.

## Terminology

- "the calendar" or "the library" — the package itself.
- "consumer" — a developer using the library in their app.
- "event" — a `CalendarEvent`; "occurrence" — an expanded recurring event.
- Modes are `month`, `week`, `day`, `3days`, `custom`, `schedule`.

## Style preferences

- Use active voice and second person ("you").
- Keep sentences concise, one idea per sentence.
- Use sentence case for headings.
- Bold for UI elements (tabs, buttons); code formatting for prop names, types,
  file names, and commands.
- Prefer real, copy-pasteable code that matches the library's actual API. When in
  doubt, check `../src/index.tsx` for exported names and the `Calendar` props.

## Content boundaries

- Document the public API only (exports from `react-native-bigger-calendar`).
- Don't document internal components or unexported helpers.
- Don't invent props or defaults. If unsure, link to the TypeScript types.
