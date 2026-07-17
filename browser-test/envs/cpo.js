/*
 * Environment adapter: code.pyret.org /editor (the reference environment).
 *
 * Running the assertions here reproduces the upstream mocha suite's outcomes on
 * the real /editor page -- the role the old fidelity check played. Needs the CPO
 * server running at BASE_URL.
 */
const { launchChromium, newPageWithRewrite } = require("../shared/browser");
const { findEditorFrame } = require("../shared/find-frame");

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";
// PYRET_COMPILER=ts loads the TypeScript-compiler flavor of the editor
// (the ?compiler=ts opt-in); default is the stock Pyret-hosted compiler.
const COMPILER = process.env.PYRET_COMPILER || "pyret";

async function setup() {
  const browser = await launchChromium();
  const page = await newPageWithRewrite(browser);
  page.setDefaultTimeout(60000);
  const query = COMPILER === "pyret" ? "" : "?compiler=" + COMPILER;
  await page.goto(BASE_URL + "/editor" + query, { waitUntil: "domcontentloaded", timeout: 120000 });
  const frame = await findEditorFrame(page);
  return { page, frame, cleanup: () => browser.close() };
}

module.exports = { setup, label: `code.pyret.org /editor (reference, ${COMPILER} compiler)` };
