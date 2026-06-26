/*
 * run-vscode-tests.js
 *
 * Runs code.pyret.org's assertions against the *vscode extension's webview*.
 *
 * - Boots real VS Code for the Web (via @vscode/test-web in "server only" mode)
 *   with the Pyret extension (vscode/) loaded as a dev extension, over a folder
 *   containing one .arr file.
 * - Drives it headlessly with Playwright: opens the .arr in the Explorer, which
 *   triggers the `pyret-parley.cpo` custom editor -> a webview rendering the
 *   exact same CPO editor.html (CodeMirror, #runButton, #output, .check-block,
 *   .testing-summary, "Looks shipshape").
 * - Reaches into the webview content frame and runs the SAME specs (loaded
 *   straight out of code.pyret.org/test/*.js) through the SAME assertion logic
 *   (shared/cpo-assertions.js + shared/page-assertions.js), which is a faithful
 *   in-page port of util.js (validated by fidelity/run-cpo-fidelity.js).
 *
 * Env:
 *   VSCODE_SUITES = comma list of: check-blocks,errors,charts   (default all)
 *   VSCODE_LIMIT  = max specs per suite (default Infinity)
 *   VSCODE_TEST_PORT (default 3198)
 */
const path = require("path");
const { open } = require("@vscode/test-web");
const { chromium } = require("playwright");
const { loadSpecsFromFile } = require("../shared/load-cpo-specs");
const { makePlaywrightPage } = require("../shared/playwright-page");
const { runSpecs } = require("../shared/run-specs");

const VSCODE_DIR = path.resolve(__dirname, "..", "..", "vscode");
const WORKSPACE = path.resolve(__dirname, "fixture-workspace");
const CHROME = process.env.GOOGLE_CHROME_BINARY || "/bin/google-chrome";
const PORT = parseInt(process.env.VSCODE_TEST_PORT || "3198", 10);
const LIMIT = process.env.VSCODE_LIMIT ? parseInt(process.env.VSCODE_LIMIT, 10) : Infinity;
const SUITES = (process.env.VSCODE_SUITES || "check-blocks,errors,charts").split(",").map((s) => s.trim());

function take(arr, n) { return n === Infinity ? arr : arr.slice(0, n); }

async function openCustomEditorFrame(page, endpoint) {
  await page.goto(endpoint, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector(".monaco-workbench", { timeout: 120000 });
  await page.waitForTimeout(4000);

  // Open Explorer and click the .arr file (Quick Open doesn't index the
  // in-memory test FS, but the Explorer tree does).
  await page.keyboard.press("Control+Shift+E");
  await page.waitForTimeout(2000);
  const clicked = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".monaco-list-row"));
    const r = rows.find((x) => /test\.arr/.test(x.getAttribute("aria-label") || x.textContent || ""));
    if (r) { r.scrollIntoView(); r.click(); const ev = new MouseEvent("dblclick", { bubbles: true }); r.dispatchEvent(ev); return true; }
    return false;
  });
  if (!clicked) throw new Error("could not find test.arr in Explorer");

  // Find the webview content frame holding the CPO editor.
  let frame = null;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && !frame) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!document.getElementById("runButton"))) { frame = f; break; } } catch (e) {}
    }
    if (!frame) await page.waitForTimeout(500);
  }
  if (!frame) throw new Error("vscode webview editor frame not found");

  // Wait for Pyret to finish loading in the webview.
  await frame.waitForFunction(() => {
    const l = document.getElementById("loader");
    const cm = document.querySelector(".CodeMirror");
    return (!l || getComputedStyle(l).display === "none") && cm && cm.CodeMirror;
  }, undefined, { timeout: 120000, polling: 200 });
  return frame;
}

(async () => {
  console.log("== Booting VS Code Web + Pyret extension ==");
  const server = await open({
    browserType: "none", extensionDevelopmentPath: VSCODE_DIR, folderPath: WORKSPACE,
    port: PORT, quality: "stable", esm: true, printServerLog: false,
  });
  const endpoint = "http://localhost:" + PORT;
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();

  const results = {};
  try {
    const frame = await openCustomEditorFrame(page, endpoint);
    console.log("Webview editor ready:", frame.url().slice(0, 70));
    const adapter = makePlaywrightPage(frame);
    await adapter.inject();

    const suiteSpecs = {
      "check-blocks": () => take(loadSpecsFromFile("check-blocks.js"), LIMIT),
      "errors": () => take(loadSpecsFromFile("errors.js"), LIMIT),
      "charts": () => take(loadSpecsFromFile("chart.js"), LIMIT),
    };

    for (const suite of SUITES) {
      if (!suiteSpecs[suite]) { console.log("(skip unknown suite", suite, ")"); continue; }
      const specs = suiteSpecs[suite]();
      console.log("\n== vscode webview: " + suite + " (" + specs.length + " specs from test/" + suite + ".js) ==");
      results[suite] = await runSpecs(adapter, specs, { log: console.log });
    }
  } catch (e) {
    console.error("FATAL:", e.stack || e.message);
    process.exitCode = 2;
  } finally {
    await browser.close();
    server.dispose();
  }

  let pass = 0, fail = 0;
  for (const k of Object.keys(results)) { pass += results[k].pass; fail += results[k].fail; }
  console.log("\n==== VSCODE WEBVIEW TOTAL: " + pass + " passing, " + fail + " failing ====");
  for (const k of Object.keys(results)) {
    if (results[k].failures.length) {
      console.log("FAILURES in " + k + ":");
      results[k].failures.forEach((f) => console.log("  " + f.label + " :: " + f.error));
    }
  }
  if (fail > 0 && process.exitCode !== 2) process.exitCode = 1;
})();
