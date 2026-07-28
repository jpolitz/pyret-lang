/*
 * suite.test.js -- the node:test entry point.
 *
 * Boots one environment (PYRET_ENV = cpo | embed | vscode), focuses the editor
 * frame ONCE, then registers one test() per spec loaded from the unmodified
 * code.pyret.org/test/*.js. Each test runs the matching assertion
 * (shared/dispatch.js -> shared/cpo-assertions.js), which uses node:assert for
 * content and ProceduralError for setup problems.
 *
 * Run it via the friendly wrapper:   node run.js --env=embed --grep tables
 * or directly:   PYRET_ENV=embed node --test --test-name-pattern=tables tests/suite.test.js
 */
const { test, describe, before, after } = require("node:test");
const { loadSpecsFromFile } = require("../shared/load-cpo-specs");
const { makePlaywrightPage } = require("../shared/playwright-page");
const { runSpec, specTimeout } = require("../shared/dispatch");
const { warmUp } = require("../shared/cpo-assertions");

const ENV = process.env.PYRET_ENV;
const SUITES = {
  "check-blocks": "check-blocks.js",
  "errors": "errors.js",
  "charts": "chart.js",
  "type-check": "type-check.js",
  "tables": "tables.js",
  "url-imports": "url-imports.js",
};

if (!ENV || !["cpo", "embed", "embed-static", "vscode", "vscode-ovsx"].includes(ENV)) {
  throw new Error("PYRET_ENV must be one of cpo | embed | embed-static | vscode | vscode-ovsx (got " + JSON.stringify(ENV) + ")");
}
// An unrecognized (or empty) selection is an error, not a silent no-op: naming
// a suite that doesn't exist used to skip it and exit 0, which looks exactly
// like a clean run. Note "" is checked separately from undefined -- only the
// latter means "no selection given, run everything".
const rawSuites = process.env.PYRET_SUITES;
const chosen =
  rawSuites === undefined || rawSuites === "all"
    ? Object.keys(SUITES)
    : rawSuites.split(",").map((s) => s.trim()).filter((s) => s !== "");
const known = Object.keys(SUITES).join(", ");
if (chosen.length === 0) {
  throw new Error("PYRET_SUITES selected no suites (got " + JSON.stringify(rawSuites) + "); known suites are " + known);
}
const unknown = chosen.filter((s) => !SUITES[s]);
if (unknown.length > 0) {
  throw new Error("unknown suite(s): " + unknown.join(", ") + "; known suites are " + known);
}

// One editor frame for the whole run (specs share it, sequentially).
let session = null;
// Whatever setup() opened has to be closed even when a LATER step in this hook
// throws, so the teardown handle is claimed the moment it exists rather than
// riding along on `session` (which is only assigned once the hook fully
// succeeds). A leaked Chromium + dev server keeps open handles on the
// `node --test` process forever, so it never exits, the reporter never flushes
// its failure summary, and a fast readable hook failure turns into a silent
// 25-minute CI timeout -- exactly how the vscode env's boot-timeout error hid
// itself instead of printing its diagnostics.
let teardown = null;

before(async () => {
  const { setup, label } = require("../envs/" + ENV);
  console.log("environment: " + label);
  const s = await setup();
  teardown = s.cleanup;
  const page = makePlaywrightPage(s.frame);
  await page.inject();
  await page.waitFor("window.PA.editorReady()", 120000);
  // editorReady is satisfiable by a DEAD editor: its pyretLoaded() reads "the
  // #loader overlay is hidden", and beforePyret's terminal load-failure path
  // (runtime bundle and backup both failed) hides that overlay while posting a
  // sticky error banner. In that state the page also keeps #breakButton at its
  // initial disabled state, so warmUp's breakDone() is vacuously true and the
  // first wait that can fail is doneRendering's full 120s timeout -- which is
  // how a runtime that never loaded spent a while diagnosed as "rendering
  // hangs in CI". Read the banner and fail with the editor's own words.
  const sticky = await page.eval("window.PA.stickyErrors()");
  if (sticky.length > 0) {
    throw new Error("the editor booted into an error state: " + sticky.join(" | "));
  }
  // Absorb the one-time runtime/render warmup so no actual test pays it.
  await warmUp(page);
  session = { page };
}, { timeout: 240000 });

after(async () => {
  if (teardown) await teardown();
});

for (const suite of chosen) {
  const file = SUITES[suite];
  describe(suite, () => {
    for (const s of loadSpecsFromFile(file)) {
      test(s.name || s.program, { timeout: specTimeout(s) }, async () => {
        await runSpec(session.page, s);
      });
    }
  });
}
