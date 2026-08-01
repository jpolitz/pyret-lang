/*
 * specs/index.js -- every starter-file spec, merged and validated against the
 * manifest.
 *
 * One row per student entry point, keyed by its path in
 * bootstrapworld/starter-files. Three outcomes:
 *
 *   runs         finishes with an empty error area. checkBlocks /
 *                failedCheckBlocks pin the check/examples results where the
 *                file has them (some blocks are MEANT to fail -- they are the
 *                exercise). `repl` lists what to type into the interactions
 *                window afterwards: [expression, expectedSubstring|null],
 *                matched against the rendered text or an image's aria-label;
 *                null means "renders without erroring".
 *
 *   interactive  opens a window and waits for the student. windowKind is
 *                "animation" (a reactor, painting a <canvas>) or "chart"
 *                (Bootstrap's Interactive Chart, drawing an <svg>);
 *                drawsFrame: false marks reactors whose to-draw: the student
 *                is meant to write.
 *
 *   errors       fails, in the recorded way: every errorContains string must
 *                appear; compileError: true requires it to fail at compile
 *                time (no stacktrace). `note` says why it errors;
 *                upstream: true means the breakage is a bug in the starter
 *                file itself -- report it to Bootstrap, don't absorb it here.
 *
 * readsSheet marks the files that open a Google Sheet (empirically recorded:
 * the set that failed at Google auth on a sheetless editor -- a grep for
 * load-spreadsheet misses the ones whose sheet load hides inside a library).
 * On an editor that cannot reach sheets, any readsSheet file is judged as
 * "blocked at Google auth" instead of its recorded outcome, and its repl
 * entries are skipped.
 *
 * These rows are REVIEWED data. drafter.js proposes rows for new files; a
 * human confirms outcomes and trims repl lists before committing them.
 */
const fs = require("fs");
const path = require("path");

const specs = {};
for (const f of fs.readdirSync(__dirname).sort()) {
  if (f === "index.js" || !f.endsWith(".js")) continue;
  const table = require(path.join(__dirname, f));
  for (const [key, row] of Object.entries(table)) {
    if (specs[key]) throw new Error("duplicate spec for " + key + " (in " + f + ")");
    specs[key] = row;
  }
}

const OUTCOMES = ["runs", "interactive", "errors"];

// Validate against the manifest: exactly one spec per entry, no orphans, and
// every row well-formed. Throwing at load time makes a malformed table fail
// every test with a message that names the row, instead of failing some file
// mid-run with a puzzle.
function validate(manifest) {
  const paths = new Set(manifest.entries.map((e) => e.path));
  for (const p of paths) {
    if (!specs[p]) throw new Error("manifest entry has no spec: " + p);
  }
  for (const [p, row] of Object.entries(specs)) {
    if (!paths.has(p)) throw new Error("spec for a file not in the manifest: " + p);
    if (!OUTCOMES.includes(row.outcome)) {
      throw new Error(p + ": unknown outcome " + JSON.stringify(row.outcome));
    }
    if (row.outcome === "errors" && (!row.errorContains || row.errorContains.length === 0)) {
      throw new Error(p + ": an errors row must pin errorContains");
    }
    if (row.repl && row.outcome !== "runs") {
      throw new Error(p + ": repl entries only make sense on a runs row " +
        "(the interactions window is unusable after a run that does not complete)");
    }
  }
  return specs;
}

module.exports = { specs, validate, OUTCOMES };
