/*
 * Environment adapter: code.pyret.org /editor (the reference environment).
 *
 * Running the assertions here reproduces the upstream mocha suite's outcomes on
 * the real /editor page -- the role the old fidelity check played. Needs the CPO
 * server running at BASE_URL.
 */
const { launchChromium } = require("../shared/browser");
const { findEditorFrame } = require("../shared/find-frame");
const { makePlaywrightPage } = require("../shared/playwright-page");

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";

async function setup() {
  const browser = await launchChromium();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(BASE_URL + "/editor", { waitUntil: "domcontentloaded", timeout: 120000 });
  const frame = await findEditorFrame(page);
  return { page: makePlaywrightPage(frame), cleanup: () => browser.close() };
}

module.exports = { setup, label: "code.pyret.org /editor (reference)" };
