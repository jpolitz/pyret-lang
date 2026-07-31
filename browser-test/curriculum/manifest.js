/*
 * manifest.js -- work out which .arr files are student entry points, and get
 * their contents.
 *
 * "Student entry point" is not a property of the starter-files repo -- that
 * repo also holds ~19 libraries (imported, never opened) and a couple of files
 * named "... - not used.arr". The curriculum is what decides: a file is an
 * entry point exactly when a lesson links to it, either as a `pyret.url` in
 * `shared/langs/en-us/starterFiles/*.json` or as an `#shareurl=` link in the
 * Data Science dataset table. So the manifest is *derived* from the curriculum
 * at a pinned commit (see pins.js), not hand-maintained here.
 *
 * Everything is fetched over the network and cached on disk under .cache/
 * (gitignored), keyed by ref, so repeat runs and offline reruns are cheap.
 * build() is called by run.js BEFORE the node:test child is spawned, because
 * node:test needs the full test list at module load; the child then reads the
 * resolved manifest synchronously from the cache.
 */
const fs = require("fs");
const path = require("path");
const P = require("./pins");

const CACHE = path.join(__dirname, ".cache");

function cachePath(ref, kind, key) {
  const safe = key.replace(/[^A-Za-z0-9._-]+/g, "_");
  return path.join(CACHE, ref.replace(/[^A-Za-z0-9._-]+/g, "_"), kind, safe);
}

async function fetchText(url, cacheFile) {
  if (cacheFile && fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
  const resp = await fetch(url, { headers: { "user-agent": "pyret-browser-test" } });
  if (!resp.ok) {
    const err = new Error(`GET ${url} -> ${resp.status} ${resp.statusText}`);
    err.status = resp.status;
    throw err;
  }
  const text = await resp.text();
  if (cacheFile) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, text);
  }
  return text;
}

// Pull every starter-files raw URL out of a curriculum source file. Both
// carriers are plain text with the URL embedded (JSON string values;
// asciidoc `link:URL[label]`), so one scan handles both, and the terminator set
// is just what ends a URL in those two syntaxes: `"` and `[`/`]`.
//
// Characters deliberately NOT treated as terminators, because real starter file
// names contain them un-encoded:
//   ( )  "State Demographics (Intro) Starter File.arr"
//   '    "Sally's%20Lemonade.arr"
const URL_RE = /https:\/\/raw\.githubusercontent\.com\/bootstrapworld\/starter-files\/[^\s"`\[\]<>\\]+/g;

function scrapeUrls(text) {
  return (text.match(URL_RE) || []).map((u) => u.replace(/[.,]+$/, ""));
}

// .../starter-files/<ref>/<path> -> <path>, where <ref> is a branch, a tag, a
// sha, or the `refs/heads/<branch>` long form the curriculum also uses.
const REF_RE = /^(refs\/(?:heads|tags)\/[^/]+|[^/]+)\//;

function refAndPath(url) {
  const rest = url.replace(/^https:\/\/raw\.githubusercontent\.com\/bootstrapworld\/starter-files\//, "");
  if (rest === url) return null;
  const m = rest.match(REF_RE);
  if (!m) return null; // no ref segment, so no file either
  const raw = rest.slice(m[0].length);
  if (raw === "") return null;
  let repoPath = raw;
  try {
    repoPath = decodeURIComponent(raw);
  } catch (e) { /* leave it percent-encoded rather than dropping the entry */ }
  return { ref: m[1], repoPath };
}

/*
 * Build the entry point list. Returns
 *   { starterRef, starterCommit, curriculumCommit,
 *     entries: [{ repoPath, url, name, sources: [curriculum paths],
 *                 linkedRef, code|null, fetchStatus }] }
 *
 * An entry whose file does not exist at the pinned ref keeps code === null and
 * a fetchStatus; the suite turns those into a failing "the curriculum links to
 * a file that isn't there" test rather than silently dropping them.
 */
async function build({ ref = P.STARTER_FILES_REF, concurrency = 8 } = {}) {
  const bySource = new Map();
  for (const src of P.CURRICULUM_SOURCES) {
    const text = await fetchText(
      P.curriculumUrl(src),
      cachePath("curriculum-" + P.CURRICULUM_COMMIT, "src", src)
    );
    bySource.set(src, scrapeUrls(text));
  }

  const entries = new Map();
  for (const [src, urls] of bySource) {
    for (const url of urls) {
      const parsed = refAndPath(url);
      if (!parsed || !parsed.repoPath.endsWith(".arr")) continue;
      const { repoPath } = parsed;
      if (!entries.has(repoPath)) {
        // Fetch each entry point at the ref the curriculum links it at. That is
        // `fall2026` for all but two links, which still say `refs/heads/main`;
        // normalizing those to the tag would test a file no student loads, so
        // the difference is kept and reported instead.
        //
        // First link wins if the same file were ever linked at two refs. No
        // file is today, and it would be a curriculum bug rather than a case
        // to model, so this stays a one-ref-per-file map.
        entries.set(repoPath, {
          repoPath,
          name: repoPath,
          linkedRef: parsed.ref,
          pinned: parsed.ref === P.STARTER_FILES_REF,
          url: P.starterFileUrl(repoPath, parsed.ref === P.STARTER_FILES_REF ? ref : parsed.ref),
          sources: [],
        });
      }
      const e = entries.get(repoPath);
      if (!e.sources.includes(src)) e.sources.push(src);
    }
  }

  const list = [...entries.values()].sort((a, b) => (a.repoPath < b.repoPath ? -1 : 1));
  // Fetch the .arr contents, a few at a time.
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const e = list[next++];
      try {
        e.code = await fetchText(e.url, cachePath(e.pinned ? ref : e.linkedRef, "arr", e.repoPath));
        e.fetchStatus = 200;
      } catch (err) {
        e.code = null;
        e.fetchStatus = err.status || String(err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  return {
    starterRef: ref,
    starterCommit: P.STARTER_FILES_COMMIT,
    curriculumCommit: P.CURRICULUM_COMMIT,
    entries: list,
  };
}

// The whole starter-files tree at `ref`, via the GitHub API -- used only by the
// coverage test ("every .arr in the repo is either an entry point or a known
// non-entry point"). Unauthenticated and rate limited, so the caller treats a
// failure as "couldn't check", not "check failed".
async function repoTree(ref) {
  const file = cachePath(ref, "meta", "tree.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const headers = { "user-agent": "pyret-browser-test", accept: "application/vnd.github+json" };
  // Unauthenticated the API allows 60 requests/hour per IP, shared with
  // everything else on the same egress; a token (CI's `github.token` is
  // enough, no extra permissions) raises that to 1000. Optional either way.
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.authorization = "Bearer " + token;
  const resp = await fetch(
    `https://api.github.com/repos/bootstrapworld/starter-files/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { headers }
  );
  if (!resp.ok) throw new Error(`GitHub tree API -> ${resp.status} ${resp.statusText}`);
  const json = await resp.json();
  const paths = (json.tree || []).filter((t) => t.type === "blob").map((t) => t.path);
  const out = { ref, sha: json.sha, truncated: !!json.truncated, paths };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}

function writeResolved(manifest, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest));
  return file;
}

module.exports = {
  CACHE,
  build,
  repoTree,
  writeResolved,
  scrapeUrls,
  refAndPath,
  fetchText,
  cachePath,
};
