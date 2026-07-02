# arXiv Explainers

A personal library of AI-generated **visual explainers** of arXiv papers, published as a
static site on GitHub Pages.

🔗 **Live site:** https://jpatel3.github.io/arxiv-explainers/

## How it works

It's a zero-build static site:

- `index.html` reads `explainers.json` in the browser and renders a chronological list.
- Explainer files live in `explainers/`. Self-contained `.html` files are linked
  directly; `.md` files open in `viewer.html`, which renders them with marked.js.

## Adding a new explainer (the easy way)

Use the helper script — it handles all three source types, updates `explainers.json`,
adds `.nojekyll`, and commits:

```bash
# A z.ai "space" Next.js export (.tar / .tgz): stripped, built to a static
# export, and dropped into explainers/<slug>/ automatically.
./tools/add-explainer.sh ~/Downloads/workspace-abc123.tar \
  --title "RuleArena — Can LLMs Follow Real-World Rules?" \
  --arxiv 2412.08972

# A self-contained HTML page or a Markdown write-up:
./tools/add-explainer.sh ~/Downloads/explainer.html --title "…" --arxiv 1706.03762
./tools/add-explainer.sh ~/notes/paper.md            --title "…" --arxiv 2401.00001

git push        # → live in ~30s
```

Options: `--date YYYY-MM-DD` (defaults to today), `--slug my-slug` (defaults to a
slug of the title), `--force` (overwrite an existing slug), `--no-commit` (stage only).
Run `./tools/add-explainer.sh --help` for the full list. Requires Node and, for `.tar`
exports, network access to `npm install` the app's dependencies.

## Adding a new explainer (manually)

If you'd rather not use the script:

1. **Save the explainer** into `explainers/`:
   - A self-contained HTML page → `explainers/<slug>.html`
   - A Markdown write-up → `explainers/<slug>.md`
   - A Next.js export → build it to a static export and copy the output into
     `explainers/<slug>/` (see the script for the exact steps), and make sure a
     `.nojekyll` file exists at the repo root so the `_next/` folder is served.

2. **Add one entry** to the top of the array in `explainers.json`:

   ```json
   {
     "title": "Attention Is All You Need",
     "arxiv": "https://arxiv.org/abs/1706.03762",
     "date": "2026-06-29",
     "file": "explainers/attention-is-all-you-need.html"
   }
   ```

   | Field   | Meaning                                                        |
   | ------- | -------------------------------------------------------------- |
   | `title` | Display title in the catalog                                   |
   | `arxiv` | Link to the paper (the arXiv id is auto-extracted for display) |
   | `date`  | `YYYY-MM-DD`; the list is sorted newest-first by this          |
   | `file`  | Repo-relative path to the explainer file                       |

3. **Commit and push** — the site updates within ~30 seconds.

   ```bash
   git add -A && git commit -m "Add explainer: <title>" && git push
   ```

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

A plain `file://` open works too, but `fetch()` of the manifest needs a local server in
some browsers — the command above avoids that.
