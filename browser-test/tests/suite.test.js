/*
 * suite.test.js -- the node:test entry point.
 *
 * Boots one environment (PYRET_ENV, see shared/envs.js), focuses the editor
 * frame ONCE, then registers one test() per spec loaded from the unmodified
 * code.pyret.org/test/*.js. Each test runs the matching assertion
 * (shared/dispatch.js -> shared/cpo-assertions.js), which uses node:assert for
 * content and ProceduralError for setup problems.
 *
 * Each env hands back its own `page` adapter (the three-method contract in
 * cpo-assertions.js) rather than a raw driver handle, so this file is driver-
 * agnostic: the Playwright envs build theirs from a Frame, ios-safari builds
 * one over a WebDriver session.
 *
 * Run it via the friendly wrapper:   node run.js --env=embed --grep tables
 * or directly:   PYRET_ENV=embed node --test --test-name-pattern=tables tests/suite.test.js
 */
const { test, describe, before, after } = require("node:test");
const { loadSpecsFromFile } = require("../shared/load-cpo-specs");
const { runSpec, specTimeout } = require("../shared/dispatch");
const { warmUp } = require("../shared/cpo-assertions");
const { ENVS } = require("../shared/envs");

const ENV = process.env.PYRET_ENV;
const SUITES = {
  "check-blocks": "check-blocks.js",
  "errors": "errors.js",
  "charts": "chart.js",
  "type-check": "type-check.js",
  "tables": "tables.js",
};

if (!ENV || !ENVS.includes(ENV)) {
  throw new Error("PYRET_ENV must be one of " + ENVS.join(" | ") + " (got " + JSON.stringify(ENV) + ")");
}
const chosen =
  !process.env.PYRET_SUITES || process.env.PYRET_SUITES === "all"
    ? Object.keys(SUITES)
    : process.env.PYRET_SUITES.split(",").map((s) => s.trim());

// One editor frame for the whole run (specs share it, sequentially).
let session = null;

before(async () => {
  const { setup, label } = require("../envs/" + ENV);
  console.log("environment: " + label);
  const s = await setup();
  const page = s.page;
  await page.inject();
  await page.waitFor("window.PA.editorReady()", 120000);
  // Absorb the one-time runtime/render warmup so no actual test pays it.
  await warmUp(page);
  session = { page, cleanup: s.cleanup };
}, { timeout: 240000 });

after(async () => {
  if (session) await session.cleanup();
});

for (const suite of chosen) {
  const file = SUITES[suite];
  if (!file) continue;
  describe(suite, () => {
    for (const s of loadSpecsFromFile(file)) {
      test(s.name || s.program, { timeout: specTimeout(s) }, async () => {
        await runSpec(session.page, s);
      });
    }
  });
}
