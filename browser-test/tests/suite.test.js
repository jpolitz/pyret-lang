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
const { runProbes, checkExpectations } = require("../shared/engine-probes");

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

// Required at registration time (not inside before()) so an env can declare its
// own setupTimeout. Booting a browser takes seconds; ios-safari's first session
// on a cold runner has to build WebDriverAgent, which takes minutes, and if this
// hook fires first it aborts the driver mid-wait and reports a generic client
// timeout instead of the driver's own diagnosis.
const { setup, label, setupTimeout, engineExpectations } = require("../envs/" + ENV);

// One editor frame for the whole run (specs share it, sequentially).
let session = null;

before(async () => {
  console.log("environment: " + label);
  try {
    const s = await setup();
    const page = s.page;
    await page.inject();
    await page.waitFor("window.PA.editorReady()", 120000);

    // Confirm the engine is the one this env claims BEFORE trusting any result.
    // An env that advertises an old engine but runs a new one turns a green run
    // into a false belief, which is worse than having no such env at all.
    const probes = await runProbes(page);
    console.log("engine probes: " + JSON.stringify(probes));
    const problems = checkExpectations(probes, engineExpectations);
    if (problems.length) {
      throw new Error(
        "engine fidelity check failed for --env=" + ENV + ":\n  " +
          problems.join("\n  ") +
          "\nThis env is running a newer engine than it advertises, so passing " +
          "specs here would prove nothing about the version it claims to test."
      );
    }

    // Absorb the one-time runtime/render warmup so no actual test pays it.
    await warmUp(page);
    session = { page, cleanup: s.cleanup };
  } catch (e) {
    // node:test cancels every registered test when this hook fails, which buries
    // the one real error under hundreds of "did not finish before its parent"
    // lines. Say so up front.
    console.error(
      "\n==== ENVIRONMENT SETUP FAILED (" + ENV + ") ====\n" +
        ((e && e.stack) || e) +
        "\n==== every test failure below is a cascade from this ====\n"
    );
    throw e;
  }
}, { timeout: setupTimeout || 240000 });

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
