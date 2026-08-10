#!/usr/bin/env node
/*
 * drafter.js -- the re-pin tool. Re-derives "which .arr files do Bootstrap's
 * lessons hand to students?" from the curriculum repo, compares that against
 * the checked-in manifest.json, and prints a report plus draft rows for
 * anything new. Nothing here runs during the test suite: the suite reads only
 * the static manifest and specs, and this is where the scraping and the
 * probe-seeding heuristics live instead -- their output is a DRAFT a human
 * reviews and commits, so a heuristic miss is an editing chore, not a test
 * silently checking the wrong thing.
 *
 *   node curriculum/drafter.js                       # against the pinned curriculum
 *   node curriculum/drafter.js --curriculum=<sha>    # against another commit
 *   node curriculum/drafter.js --ref=<starter ref>   # fetch files at another ref
 *
 * The report covers what the old link-lint tests used to assert (dead lesson
 * buttons, links or import headers that bypass the term tag): those are
 * Bootstrap's repo hygiene, worth forwarding upstream at re-pin time, not
 * worth failing Pyret's CI over in between.
 *
 * A drafted spec row's `outcome` is "REVIEW": classifying it takes a real run
 * (does it finish? open a window? error on purpose?), and judging WHY it does
 * what it does takes a human -- "does not compile" is a lesson in one file
 * and an upstream bug in another. Run the file, decide, then commit the row.
 *
 * Re-pinning to a new term is the same procedure at full width: update
 * manifest.json's refs/commits, delete .cache/, run this, and review every
 * changed row. See README.md.
 */
const fs = require("fs");
const path = require("path");

const MANIFEST = require("./manifest.json");

const RAW = "https://raw.githubusercontent.com";

function arg(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--" + name) return argv[i + 1];
    if (argv[i].startsWith("--" + name + "=")) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

const CURRICULUM = arg("curriculum") || MANIFEST.curriculum.commit;
const STARTER_REF = arg("ref") || MANIFEST.starterFiles.ref;

/* ------------------------------------------------------------ fetching */

function cacheFile(kind, key) {
  const safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, "_");
  return path.join(__dirname, ".cache", safe(kind), safe(key));
}

async function fetchText(url, cache) {
  if (cache && fs.existsSync(cache)) return fs.readFileSync(cache, "utf8");
  const resp = await fetch(url, { headers: { "user-agent": "pyret-browser-test" } });
  if (!resp.ok) {
    const err = new Error(`GET ${url} -> ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const text = await resp.text();
  if (cache) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, text);
  }
  return text;
}

/* ------------------------------------------------------------ deriving */

/*
 * Every starter-files raw URL in a curriculum source. Both carriers are plain
 * text with the URL embedded (JSON string values; asciidoc link:URL[label]),
 * so one scan covers both. Parentheses, apostrophes and commas are legal in
 * these file names and stay in the URL; quotes and brackets are what end one.
 */
const URL_RE = /https:\/\/raw\.githubusercontent\.com\/bootstrapworld\/starter-files\/[^\s"`\[\]<>\\]+/g;

// .../starter-files/<ref>/<path>. <ref> is a tag, branch, sha, or the
// refs/heads/<branch> long form.
function refAndPath(url) {
  const rest = url.replace(RAW + "/bootstrapworld/starter-files/", "");
  if (rest === url) return null;
  const m = rest.match(/^(refs\/(?:heads|tags)\/[^/]+|[^/]+)\/(.+)$/);
  if (!m) return null;
  let repoPath = m[2].replace(/[.,]+$/, "");
  try { repoPath = decodeURIComponent(repoPath); } catch (e) { /* keep encoded */ }
  return { ref: m[1], repoPath };
}

async function deriveEntries() {
  const found = new Map(); // repoPath -> { ref, sources: [] }
  for (const src of MANIFEST.curriculum.sources) {
    const url = `${RAW}/bootstrapworld/curriculum/${CURRICULUM}/` +
      src.split("/").map(encodeURIComponent).join("/");
    const text = await fetchText(url, cacheFile("curriculum-" + CURRICULUM, src));
    for (const raw of text.match(URL_RE) || []) {
      const parsed = refAndPath(raw);
      if (!parsed || !parsed.repoPath.endsWith(".arr")) continue;
      if (!found.has(parsed.repoPath)) {
        found.set(parsed.repoPath, { ref: parsed.ref, sources: [] });
      }
      const e = found.get(parsed.repoPath);
      if (!e.sources.includes(src)) e.sources.push(src);
    }
  }
  return found;
}

/* -------------------------------------------------- probe seed heuristics */

// The file's own column-0 bindings, for seeding repl entries. Bindings inside
// function bodies, check blocks and data variants are indented in these
// files, so column-0 is what keeps this safe without a Pyret parser.
const KEYWORDS = new Set([
  "fun", "data", "var", "rec", "when", "if", "ask", "cases", "for", "check",
  "examples", "include", "import", "provide", "use", "type", "newtype", "shadow",
  "block", "end", "else", "let", "letrec", "lam", "table", "load-table", "row",
  "source", "sanitize", "and", "or", "not", "is", "raises", "satisfies",
]);

function definedNames(code) {
  const names = [];
  const add = (n) => { if (n && !KEYWORDS.has(n) && !names.includes(n)) names.push(n); };
  for (const line of code.split("\n")) {
    let m = line.match(/^fun\s+([a-zA-Z][\w-]*)\s*\(/);
    if (m) { add(m[1]); continue; }
    m = line.match(/^(?:var\s+|rec\s+|shadow\s+)?([a-zA-Z][\w-]*)\s*(?:::[^=]+)?=(?!=)\s*\S?/);
    if (m) { add(m[1]); continue; }
  }
  return names;
}

// name = load-table: col, col ... source: -- the sheet-backed tables, whose
// declared columns seed the "schema bound to real data" probes.
const LOAD_TABLE_RE = /^([a-zA-Z][\w-]*)\s*=\s*(?:\r?\n\s*)?load-table:\s*([\s\S]*?)\n\s*source:/gm;

function sheetTables(code) {
  const out = [];
  for (const m of code.matchAll(LOAD_TABLE_RE)) {
    const columns = m[2].split("\n").map((l) => l.replace(/#.*$/, "")).join(" ")
      .split(",").map((c) => c.trim()).filter((c) => c !== "");
    if (columns.length > 0) out.push({ name: m[1], columns });
  }
  return out;
}

function draftRow(repoPath, code) {
  const repl = [];
  for (const n of definedNames(code).slice(0, 2)) repl.push([n, null]);
  for (const t of sheetTables(code).slice(0, 1)) {
    repl.push([t.name, t.columns[0]]);
    repl.push([t.name + ".row-n(0)", t.columns[0]]);
  }
  const lines = [
    "  " + JSON.stringify(repoPath) + ": {",
    '    outcome: "REVIEW", // run it: runs | interactive | errors -- and decide WHY',
  ];
  if (/load-spreadsheet|sheet-by-name/.test(code)) {
    lines.push("    readsSheet: true, // VERIFY: empirical, not a grep -- confirm with --sheets=none");
  }
  if (repl.length > 0) {
    lines.push("    repl: [");
    for (const [e, x] of repl) {
      lines.push("      [" + JSON.stringify(e) + ", " + (x === null ? "null" : JSON.stringify(x)) + "],");
    }
    lines.push("    ],");
  }
  lines.push("  },");
  return lines.join("\n");
}

/* -------------------------------------------------------------- report */

async function main() {
  console.log("deriving entry points from curriculum@" + CURRICULUM.slice(0, 12) +
    " (" + MANIFEST.curriculum.sources.length + " sources)...");
  const derived = await deriveEntries();
  const manifestPaths = new Set(MANIFEST.entries.map((e) => e.path));
  const knownDead = new Set(MANIFEST.knownDeadLinks || []);

  const removed = [...manifestPaths].filter((p) => !derived.has(p)).sort();

  const unpinnedLinks = [...derived.entries()]
    .filter(([, v]) => v.ref !== STARTER_REF)
    .map(([p, v]) => v.ref + " :: " + p).sort();

  // Fetch everything the curriculum links, to find dead links and import
  // headers that bypass the term tag.
  const dead = new Set();
  const unpinnedImports = [];
  const fetched = new Map();
  for (const [repoPath, v] of [...derived.entries()].sort()) {
    const ref = v.ref === STARTER_REF ? STARTER_REF : v.ref;
    const url = `${RAW}/bootstrapworld/starter-files/${ref}/` +
      repoPath.split("/").map(encodeURIComponent).join("/");
    try {
      const code = await fetchText(url, cacheFile("arr-" + ref, repoPath));
      fetched.set(repoPath, code);
      if (/raw\.githubusercontent\.com\/bootstrapworld\/starter-files\/refs\/heads\//.test(code)) {
        unpinnedImports.push(repoPath);
      }
    } catch (err) {
      dead.add(repoPath);
    }
  }

  // A dead link is only NEWS when the recorded set changed. The known ones
  // stay listed (they are lesson buttons that open an empty editor for a
  // student today), but they do not make the run read as drift.
  const deadNew = [...dead].filter((p) => !knownDead.has(p)).sort();
  const deadFixed = [...knownDead].filter((p) => !dead.has(p) && derived.has(p)).sort();
  const added = [...derived.keys()].filter((p) => !manifestPaths.has(p) && !dead.has(p)).sort();

  const report = (title, items) => {
    console.log("\n== " + title + (items.length ? " (" + items.length + ")" : ": none"));
    for (const it of items) console.log("  " + it);
  };

  report("known dead lesson links, still dead (report upstream)",
    [...dead].filter((p) => knownDead.has(p)).sort());
  report("NEW dead lesson links -- report upstream, then record in manifest.knownDeadLinks", deadNew);
  report("known dead links that now EXIST -- move to entries, draft spec rows", deadFixed);
  report("links that bypass the " + STARTER_REF + " tag -- students get whatever the branch holds", unpinnedLinks);
  report("files whose own import headers bypass the tag", unpinnedImports.sort());
  report("linked files MISSING from manifest.json -- add entries and spec rows", added);
  report("manifest entries NO LONGER linked by any lesson -- retire them", removed);

  if (added.length > 0) {
    console.log("\n== draft manifest entries");
    for (const p of added) {
      const v = derived.get(p);
      const row = { path: p };
      if (v.ref !== STARTER_REF) row.ref = v.ref;
      console.log("  " + JSON.stringify(row) + ",");
    }
    console.log("\n== draft spec rows (REVIEW every line before committing)");
    for (const p of added) {
      if (fetched.has(p)) console.log(draftRow(p, fetched.get(p)));
      else console.log("  // " + p + ": could not fetch; is the link dead?");
    }
  }

  const clean = deadNew.length === 0 && deadFixed.length === 0 &&
    added.length === 0 && removed.length === 0;
  console.log("\n" + (clean
    ? "manifest.json matches the curriculum derivation."
    : "manifest.json and the curriculum disagree; review the report above."));
}

main().catch((e) => { console.error(e); process.exit(1); });
