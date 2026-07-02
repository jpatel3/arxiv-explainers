#!/usr/bin/env node
// Add an explainer to the arxiv-explainers site.
//
// Handles three source types:
//   *.md / *.markdown  -> copied to explainers/<slug>.md   (opens in viewer.html)
//   *.html / *.htm     -> copied to explainers/<slug>.html  (linked directly)
//   *.tar/.tgz/.tar.gz -> a z.ai "space" Next.js export: stripped of server
//                         bits, built to a static export, dropped into
//                         explainers/<slug>/ and linked at index.html
//
// It validates inputs, auto-slugs the title, refuses duplicates, updates
// explainers.json, ensures .nojekyll exists, and (unless --no-commit) commits.
//
// Usage:
//   node tools/add-explainer.mjs <source> --title "..." --arxiv "<url|id>" \
//        [--date YYYY-MM-DD] [--slug my-slug] [--force] [--no-commit]

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");

// ---------- tiny helpers ----------
const RESET = "\x1b[0m", RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", BOLD = "\x1b[1m";
const die = (msg) => { console.error(`${RED}✗ ${msg}${RESET}`); process.exit(1); };
const step = (msg) => console.log(`${BOLD}▸${RESET} ${msg}`);
const ok = (msg) => console.log(`${GREEN}✓${RESET} ${msg}`);
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
const runQuiet = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts }).trim();

// ---------- arg parsing ----------
function parseArgs(argv) {
  const opts = { commit: true, force: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-commit") opts.commit = false;
    else if (a === "--force") opts.force = true;
    else if (a === "--title") opts.title = argv[++i];
    else if (a === "--arxiv") opts.arxiv = argv[++i];
    else if (a === "--date") opts.date = argv[++i];
    else if (a === "--slug") opts.slug = argv[++i];
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("--")) die(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  opts.source = positional[0];
  return opts;
}

const HELP = `${BOLD}add-explainer${RESET} — add a paper explainer to the site

  node tools/add-explainer.mjs <source> --title "Title" --arxiv "<url|id>" [options]

  <source>          .md, .html, or a z.ai .tar/.tgz Next.js export
  --title  "..."    Display title (required)
  --arxiv  "..."    arXiv URL or id, e.g. 2412.08972 (required)
  --date   Y-M-D    Defaults to today
  --slug   name     Defaults to a slug of the title
  --force           Overwrite an existing explainer with the same slug
  --no-commit       Stage changes but don't create a git commit
`;

// ---------- validation ----------
function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeArxiv(input) {
  // Accept a full URL or a bare id; return a canonical abs URL.
  const idRe = /(\d{4}\.\d{4,5}(v\d+)?|[a-z-]+(\.[A-Z]{2})?\/\d{7})/i;
  let id = input.trim();
  const urlMatch = id.match(/arxiv\.org\/(abs|pdf)\/([^\s?#]+)/i);
  if (urlMatch) id = urlMatch[2].replace(/\.pdf$/i, "");
  const m = id.match(idRe);
  if (!m) die(`Not a recognizable arXiv id or URL: "${input}"`);
  return `https://arxiv.org/abs/${m[1]}`;
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- manifest ----------
const MANIFEST = path.join(REPO, "explainers.json");
function readManifest() {
  let raw;
  try { raw = fs.readFileSync(MANIFEST, "utf8"); }
  catch { die(`Cannot read ${MANIFEST}`); }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) die("explainers.json is not a JSON array");
    return data;
  } catch (e) { die(`explainers.json is not valid JSON: ${e.message}`); }
}
function writeManifest(entries) {
  fs.writeFileSync(MANIFEST, JSON.stringify(entries, null, 2) + "\n");
}

// ---------- repo/pages metadata ----------
function pagesInfo() {
  let user = null, repo = path.basename(REPO);
  try {
    const url = runQuiet("git", ["-C", REPO, "remote", "get-url", "origin"]);
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
    if (m) { user = m[1]; repo = m[2]; }
  } catch { /* no remote yet */ }
  return { user, repo };
}

// ---------- Next.js static export ----------
const SERVER_ONLY_PATHS = [
  "src/app/api", "src/app/route.ts", "src/app/route.js",
  "prisma", "examples", ".zscripts", "Caddyfile", "db",
  "mini-services", "download", "tool-results", "src/lib/db.ts",
  "server.ts", "server.js", "bun.lock",
];

function findProjectRoot(dir) {
  if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  const subs = fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "__MACOSX");
  if (subs.length === 1) return findProjectRoot(path.join(dir, subs[0].name));
  die("Could not locate package.json in the archive.");
}

function buildNextExport(tarPath, slug, basePath) {
  step("Extracting archive…");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-"));
  run("tar", ["-xf", tarPath, "-C", tmp]);
  const proj = findProjectRoot(tmp);

  const pkg = JSON.parse(fs.readFileSync(path.join(proj, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps.next) die("Archive is not a Next.js app (no `next` dependency).");

  step("Stripping server-only files…");
  for (const rel of SERVER_ONLY_PATHS) {
    fs.rmSync(path.join(proj, rel), { recursive: true, force: true });
  }
  // Drop prisma deps and db/prisma scripts so `npm install` stays server-free.
  for (const grp of ["dependencies", "devDependencies"]) {
    if (pkg[grp]) { delete pkg[grp]["@prisma/client"]; delete pkg[grp]["prisma"]; }
  }
  if (pkg.scripts) for (const k of Object.keys(pkg.scripts)) {
    if (/prisma|db:/.test(pkg.scripts[k]) || /^db:/.test(k)) delete pkg.scripts[k];
  }
  fs.writeFileSync(path.join(proj, "package.json"), JSON.stringify(pkg, null, 2));

  step("Writing static-export next.config.mjs…");
  for (const f of ["next.config.js", "next.config.ts", "next.config.mjs", "next.config.cjs"]) {
    fs.rmSync(path.join(proj, f), { force: true });
  }
  fs.writeFileSync(path.join(proj, "next.config.mjs"), `
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const basePath = ${JSON.stringify(basePath)};
export default {
  output: "export",
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: { root: path.resolve(__dirname) },
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
};
`.trimStart());

  step("Installing dependencies (npm install)…");
  run("npm", ["install", "--no-audit", "--no-fund",
    "--fetch-timeout=600000", "--fetch-retries=10"], { cwd: proj });

  step("Building static export (next build)…");
  run(path.join(proj, "node_modules/.bin/next"), ["build"], { cwd: proj });

  const out = path.join(proj, "out");
  if (!fs.existsSync(path.join(out, "index.html"))) {
    die("Build finished but out/index.html is missing — export may have failed.");
  }
  return out;
}

// ---------- main ----------
function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.source) { console.log(HELP); process.exit(opts.help ? 0 : 1); }

  if (!opts.title) die("--title is required");
  if (!opts.arxiv) die("--arxiv is required");
  if (!fs.existsSync(opts.source)) die(`Source not found: ${opts.source}`);

  const arxiv = normalizeArxiv(opts.arxiv);
  const date = opts.date || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`--date must be YYYY-MM-DD (got "${date}")`);
  const slug = opts.slug ? slugify(opts.slug) : slugify(opts.title);
  if (!slug) die("Could not derive a slug from the title; pass --slug.");

  const manifest = readManifest();
  if (manifest.some((e) => e.arxiv === arxiv))
    die(`An explainer for ${arxiv} is already in the manifest.`);

  const ext = opts.source.toLowerCase();
  const isTar = /\.(tar|tgz|tar\.gz)$/.test(ext);
  const isMd = /\.(md|markdown)$/.test(ext);
  const isHtml = /\.html?$/.test(ext);
  if (!isTar && !isMd && !isHtml)
    die("Source must be a .md, .html, or .tar/.tgz Next.js export.");

  const { user, repo } = pagesInfo();
  const created = []; // paths to git-add

  let file; // manifest "file" value
  if (isTar) {
    const destDir = path.join(REPO, "explainers", slug);
    if (fs.existsSync(destDir) && !opts.force)
      die(`explainers/${slug}/ already exists (use --force to overwrite).`);
    const basePath = `/${repo}/explainers/${slug}`;
    const out = buildNextExport(opts.source, slug, basePath);
    step(`Copying export → explainers/${slug}/`);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    fs.cpSync(out, destDir, { recursive: true });
    // Sanity: assets should carry the basePath prefix.
    const idx = fs.readFileSync(path.join(destDir, "index.html"), "utf8");
    if (!idx.includes(basePath)) die("Exported HTML lacks the expected basePath — aborting.");
    file = `explainers/${slug}/index.html`;
    created.push(destDir);
  } else {
    const outExt = isMd ? "md" : "html";
    const dest = path.join(REPO, "explainers", `${slug}.${outExt}`);
    if (fs.existsSync(dest) && !opts.force)
      die(`explainers/${slug}.${outExt} already exists (use --force to overwrite).`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(opts.source, dest);
    file = `explainers/${slug}.${outExt}`;
    created.push(dest);
    ok(`Copied → ${file}`);
  }

  // .nojekyll (required so GitHub Pages serves _next/ folders)
  const nojekyll = path.join(REPO, ".nojekyll");
  if (!fs.existsSync(nojekyll)) { fs.writeFileSync(nojekyll, ""); created.push(nojekyll); }

  step("Updating explainers.json…");
  manifest.unshift({ title: opts.title, arxiv, date, file });
  writeManifest(manifest);
  created.push(MANIFEST);

  if (opts.commit) {
    step("Committing…");
    run("git", ["-C", REPO, "add", ...created]);
    run("git", ["-C", REPO, "commit", "-q", "-m",
      `Add explainer: ${opts.title} (${arxiv.replace("https://arxiv.org/abs/", "arXiv:")})`]);
    ok("Committed. Push with: git push");
  } else {
    ok("Staged (no commit). Review, then commit + push.");
  }

  console.log();
  ok(`Added "${opts.title}"`);
  console.log(`${DIM}  file:   ${file}${RESET}`);
  console.log(`${DIM}  date:   ${date}${RESET}`);
  if (user) console.log(`${DIM}  live:   https://${user}.github.io/${repo}/${file.replace(/index\.html$/, "")}${RESET}`);
  console.log(`${DIM}  preview: (cd ${path.dirname(REPO)} && python3 -m http.server 8000) → http://localhost:8000/${repo}/${file.replace(/index\.html$/, "")}${RESET}`);
}

main();
