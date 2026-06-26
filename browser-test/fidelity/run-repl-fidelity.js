/*
 * run-repl-fidelity.js -- fidelity check for the REPL-based ports
 * (testRunAndUseRepl / checkTableRendersCorrectly) against CPO /editor, so the
 * logic can be validated quickly without booting VS Code.
 *
 *   BASE_URL=http://localhost:4999 node fidelity/run-repl-fidelity.js
 */
const { chromium } = require("playwright");
const { loadSpecsFromFile } = require("../shared/load-cpo-specs");
const { makePlaywrightPage } = require("../shared/playwright-page");
const { runSpecs } = require("../shared/run-specs");

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";
const CHROME = process.env.GOOGLE_CHROME_BINARY || "/bin/google-chrome";

(async () => {
  const typeCheck = loadSpecsFromFile("type-check.js");
  const tables = loadSpecsFromFile("tables.js");
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const results = {};
  try {
    await page.goto(BASE_URL + "/editor", { waitUntil: "domcontentloaded" });
    const adapter = makePlaywrightPage(page.mainFrame());
    await adapter.inject();
    await adapter.waitFor("window.PA.editorReady()", 60000);

    console.log("== CPO /editor fidelity: type-check (test/type-check.js) ==");
    results.typeCheck = await runSpecs(adapter, typeCheck, { log: console.log });
    console.log("== CPO /editor fidelity: tables (test/tables.js) ==");
    results.tables = await runSpecs(adapter, tables, { log: console.log });
  } finally {
    await browser.close();
  }
  let pass = 0, fail = 0;
  for (const k of Object.keys(results)) { pass += results[k].pass; fail += results[k].fail; }
  console.log("\n==== REPL FIDELITY TOTAL: " + pass + " passing, " + fail + " failing ====");
  for (const k of Object.keys(results)) results[k].failures.forEach((f) => console.log("  " + k + ": " + f.label + " :: " + f.error));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL:", e); process.exit(2); });
