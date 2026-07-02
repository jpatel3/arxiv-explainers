# arXiv Explainers — Design

**Date:** 2026-06-27
**Status:** Approved (pending user review of this spec)
**Owner:** jpatel3

## Purpose

A personal, growing library for hosting AI-generated **visual explainers** of arXiv
papers. The user frequently reads papers with the help of AI tools (e.g. z.ai) that
produce rich, visual explanations. This repo collects those explainers and publishes
them as a browsable static site on GitHub Pages.

Live URL: `https://jpatel3.github.io/arxiv-explainers/`

## Goals

- **Low per-paper friction.** Adding a new explainer should be: drop a file, add one
  manifest line, `git push`.
- **Support a mix of formats.** Self-contained HTML explainers *and* Markdown explainers.
- **Zero build pipeline.** Pure static site — nothing to break, deploys instantly via
  GitHub Pages.
- **Simple chronological catalog.** A clean list, newest first.

## Non-Goals (YAGNI)

- No rich cards, thumbnails, tags, or search (can be added later if the library grows).
- No build step, no Jekyll, no GitHub Actions.
- No automated metadata extraction — the manifest is hand-edited (one line per paper).
- No tests (static content; verification is opening the page).

## Architecture

Approach **A: zero-build, client-side manifest.** GitHub Pages serves the repo root.
The landing page reads a JSON manifest at runtime and renders the catalog in the browser.

### Repo structure

```
arxiv-explainers/
├── index.html        # landing page; fetches explainers.json, renders the list
├── explainers.json   # manifest: [{ title, arxiv, date, file }]
├── explainers/       # the explainer files
│   ├── <slug>.html   # self-contained HTML explainers → linked directly
│   └── <slug>.md     # markdown explainers → opened via viewer.html
├── viewer.html       # renders a .md explainer via ?file=… using marked.js (CDN)
├── assets/
│   └── style.css     # shared styling for index + viewer
├── README.md         # "how to add a new explainer" cheatsheet
└── docs/superpowers/specs/   # this design doc + future specs
```

### Components

- **`index.html`** — Fetches `explainers.json`, sorts entries by `date` descending,
  and renders each as a list row: **title** (link) · arXiv link · date. Determines the
  link target by file extension: `.html` → link directly to the file; `.md` → link to
  `viewer.html?file=<path>`. Shows an empty state when the manifest is empty and skips
  malformed entries.
- **`explainers.json`** — The single source of truth for the catalog. An array of
  objects: `{ "title": string, "arxiv": string (URL), "date": "YYYY-MM-DD", "file": string (repo-relative path) }`.
- **`viewer.html`** — Reads the `file` query param, fetches the Markdown file, renders
  it with `marked.js` (loaded from a CDN), and applies shared styling. Shows a clear
  error message if the file is missing or fails to load.
- **`assets/style.css`** — Shared, lightweight styling for the index and viewer. Clean,
  readable, mobile-friendly.
- **`README.md`** — Step-by-step instructions for adding a new explainer.

## Data Flow

1. Browser loads `index.html`.
2. JS `fetch('explainers.json')` → parse → sort by date desc.
3. For each valid entry, render a row; click navigates to the explainer (direct `.html`
   or `viewer.html` for `.md`).

## Adding a New Explainer (everyday workflow)

1. Save the explainer as `explainers/<slug>.html` (or `.md`).
2. Prepend one entry to `explainers.json`:
   ```json
   { "title": "Paper Title", "arxiv": "https://arxiv.org/abs/XXXX.XXXXX", "date": "2026-06-27", "file": "explainers/<slug>.html" }
   ```
3. `git add -A && git commit && git push` → live in ~30 seconds.

## Error Handling

- **Empty manifest** → index renders a friendly "No explainers yet" empty state.
- **Malformed manifest entry** (missing required fields) → that entry is skipped; the
  rest still render.
- **Manifest fails to load / invalid JSON** → index shows an error message.
- **Missing `.md` file in viewer** → viewer shows a clear "could not load" message.

## Deployment

- Repo created on GitHub via `gh repo create jpatel3/arxiv-explainers --public`.
- GitHub Pages enabled, serving from the `main` branch root (`/`).
- No CI/CD; pushing to `main` publishes.

## Verification

- Open `index.html` locally (or the Pages URL) and confirm the list renders with correct
  links and dates.
- Confirm an `.html` explainer opens directly and a `.md` explainer renders via the viewer.

## Pipeline / tooling (added 2026-07-02)

Explainers arrive in three shapes; the second was painful enough by hand to
warrant automation:

- Plain `.html` / `.md` — copied straight into `explainers/`.
- **z.ai "space" exports** — full Next.js apps (`.tar`). These need a one-time
  static build before they can be hosted: strip server-only bits (`/api` route,
  Prisma/db, websocket examples), configure `output: "export"` with
  `basePath`/`assetPrefix` set to `/<repo>/explainers/<slug>`, `npm install`,
  `next build`, then copy `out/` into `explainers/<slug>/`. A root `.nojekyll`
  is required so GitHub Pages serves the `_next/` folder.

**Decision:** automate this with a local, validated helper script
(`tools/add-explainer.sh` → `tools/add-explainer.mjs`) rather than a CI build.
Rationale: keeps the zero-build hosting model (nothing runs on push), gives fast
local iteration, and avoids a CI pipeline that can break. The script derives the
Pages base path from the git remote, auto-slugs the title, refuses duplicate
arXiv ids, sanity-checks that exported HTML carries the expected base path, and
commits (unless `--no-commit`). Pushing stays manual.

## Future Enhancements (out of scope for now)

- Tags + client-side filtering/search.
- Auto-generated thumbnails / preview cards.
- Optional CI safety-net that rebuilds `.tar` exports on push.
