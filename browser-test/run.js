#!/usr/bin/env node
/*
 * run.js -- run code.pyret.org's assertions against one environment.
 *
 *   node run.js --env=cpo|embed|vscode [--suites=all|a,b,...] [--limit=N]
 *
 * One mechanism for all three: an environment adapter (envs/<env>.js) returns a
 * Playwright frame focused on the CPO editor DOM; the shared in-page port of
 * util.js (shared/page-assertions.js + shared/cpo-assertions.js, driven via
 * shared/run-specs.js) then runs the SAME specs -- loaded straight out of the
 * unmodified code.pyret.org/test/*.js by shared/load-cpo-specs.js -- against it.
 *
 *   cpo    = the reference: reproduces upstream's outcomes on /editor
 *   embed  = the embed API's embedded instance
 *   vscode = the pyret-parley.cpo webview (headless VS Code for the Web)
 *
 * Exit code 0 iff every spec passes.
 */
const { loadSpecsFromFile } = require("./shared/load-cpo-specs");
const { makePlaywrightPage } = require("./shared/playwright-page");
const { runSpecs } = require("./shared/run-specs");

// suite name -> the upstream test file whose specs it loads
const SUITES = {
  "check-blocks": "check-blocks.js",
  "errors": "errors.js",
  "charts": "chart.js",
  "type-check": "type-check.js",
  "tables": "tables.js",
};

function arg(name, def) {
  const p = process.argv.find((a) => a.startsWith("--" + name + "="));
  return p ? p.slice(name.length + 3) : def;
}

const env = arg("env");
const suitesArg = arg("suites", "all");
const limit = arg("limit") ? parseInt(arg("limit"), 10) : Infinity;

if (!env || !["cpo", "embed", "vscode"].includes(env)) {
  console.error("usage: node run.js --env=cpo|embed|vscode [--suites=all|check-blocks,errors,...] [--limit=N]");
  process.exit(2);
}
const chosen = suitesArg === "all" ? Object.keys(SUITES) : suitesArg.split(",").map((s) => s.trim());

(async () => {
  const { setup, label } = require("./envs/" + env);
  console.log("== Environment: " + label + " ==");
  const { frame, cleanup } = await setup();
  const results = {};
  try {
    const page = makePlaywrightPage(frame);
    await page.inject();
    await page.waitFor("window.PA.editorReady()", 120000);

    for (const suite of chosen) {
      const file = SUITES[suite];
      if (!file) { console.log("(skip unknown suite " + suite + ")"); continue; }
      let specs = loadSpecsFromFile(file);
      if (limit !== Infinity) specs = specs.slice(0, limit);
      console.log("\n== " + suite + " (" + specs.length + " specs from test/" + file + ") ==");
      results[suite] = await runSpecs(page, specs, { log: console.log });
    }
  } finally {
    await cleanup();
  }

  let pass = 0, fail = 0;
  for (const k of Object.keys(results)) { pass += results[k].pass; fail += results[k].fail; }
  console.log("\n==== " + label + ": " + pass + " passing, " + fail + " failing ====");
  for (const k of Object.keys(results)) {
    results[k].failures.forEach((f) => console.log("  " + k + ": " + f.label + " :: " + f.error));
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL:", e.stack || e.message); process.exit(2); });
