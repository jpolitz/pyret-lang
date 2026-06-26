/*
 * run-cpo-fidelity.js
 *
 * FIDELITY CHECK for the in-page assertion port.
 *
 * The embed target reuses code.pyret.org/test-util/util.js *unchanged*. The
 * vscode target cannot (selenium can't reach a vscode webview), so it uses the
 * in-page port shared/page-assertions.js + shared/cpo-assertions.js. To show
 * that port is faithful, we run the ported assertions, via Playwright, against
 * the very same CPO /editor page and the very same specs that util.js checks.
 * If they all pass here, the port is a faithful stand-in for util.js, so a pass
 * in the vscode webview means the same thing as an upstream pass.
 *
 * Usage:
 *   BASE_URL=http://localhost:4999 node fidelity/run-cpo-fidelity.js [limitPerSuite]
 */
const { chromium } = require("playwright");
const { loadSpecsFromFile } = require("../shared/load-cpo-specs");
const { makePlaywrightPage } = require("../shared/playwright-page");
const { runSpecs } = require("../shared/run-specs");

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";
const CHROME = process.env.GOOGLE_CHROME_BINARY || "/bin/google-chrome";
const limit = process.argv[2] ? parseInt(process.argv[2], 10) : Infinity;

function take(arr, n) {
  return n === Infinity ? arr : arr.slice(0, n);
}

(async () => {
  const errors = take(loadSpecsFromFile("errors.js"), limit);
  const checkBlocks = take(loadSpecsFromFile("check-blocks.js"), limit);
  const charts = take(loadSpecsFromFile("chart.js"), Math.min(limit, 2));

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  const results = {};
  try {
    await page.goto(BASE_URL + "/editor", { waitUntil: "domcontentloaded" });
    const adapter = makePlaywrightPage(page.mainFrame());
    await adapter.inject();
    await adapter.waitFor("window.PA.editorReady()", 60000);

    console.log("== CPO /editor fidelity: check-blocks (test/check-blocks.js) ==");
    results.checkBlocks = await runSpecs(adapter, checkBlocks, { log: console.log });

    console.log("== CPO /editor fidelity: errors (test/errors.js) ==");
    results.errors = await runSpecs(adapter, errors, { log: console.log });

    console.log("== CPO /editor fidelity: charts (test/chart.js) ==");
    results.charts = await runSpecs(adapter, charts, { log: console.log });
  } finally {
    await browser.close();
  }

  let pass = 0, fail = 0;
  for (const k of Object.keys(results)) { pass += results[k].pass; fail += results[k].fail; }
  console.log("\n==== CPO FIDELITY TOTAL: " + pass + " passing, " + fail + " failing ====");
  for (const k of Object.keys(results)) {
    if (results[k].failures.length) {
      console.log("FAILURES in " + k + ":");
      results[k].failures.forEach((f) => console.log("  " + f.label + " :: " + f.error));
    }
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL:", e); process.exit(2); });
