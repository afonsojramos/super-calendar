# Documentation

The [Mintlify](https://mintlify.com) docs site for super-calendar.

## Develop

Install the Mintlify CLI and run the dev server from this `docs/` folder (where
`docs.json` lives):

```bash
npm i -g mint
mint dev
```

The preview runs at `http://localhost:3000`.

## Structure

- `docs.json` — site config and navigation.
- `index.mdx`, `quickstart.mdx`, `demo.mdx` — getting started.
- `guides/` — feature guides (events, dragging, modes, recurring events, time
  zones, theming, web).
- `reference/api.mdx` — the `Calendar` props and package exports.
- `images/` — screenshots used in the pages.

The `demo` page embeds all three example apps, deployed to GitHub Pages by
`../.github/workflows/demo.yml`. React Native runs at the site root, React DOM at
`/dom/`, and Solid at `/solid/`.

Run `pnpm build:demos` from the repository root to assemble the exact Pages
artifact in `dist/demos`, then `pnpm test:demos` to check all three apps in a
browser. The Demo workflow runs these checks for pull requests. Only `main`
deploys to Pages; pull-request builds have read-only repository permissions.

## Publishing

Changes deploy automatically when merged to the default branch, via the Mintlify
GitHub app connected to this repo.
