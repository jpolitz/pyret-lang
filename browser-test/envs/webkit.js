/*
 * Environment adapter: code.pyret.org /editor in Playwright's bundled WebKit.
 *
 * Same page and same specs as --env=cpo, different engine. This is the cheap
 * always-on Safari-ish tier: it runs on Linux, so it fits the normal ubuntu
 * matrix and Ben can run it locally.
 *
 * It is deliberately NOT the authority on "does Safari have this feature" --
 * Playwright ships upstream WebKit, whose feature flags can be ahead of the
 * Safari release with the same version number. --env=ios-safari (real Apple
 * JavaScriptCore, pinned iOS runtime) is the authority; this tier is for
 * catching engine regressions fast.
 *
 * Needs the CPO server running at BASE_URL.
 */
const { launchWebKit } = require("../shared/browser");
const { findEditorFrame } = require("../shared/find-frame");
const { makePlaywrightPage } = require("../shared/playwright-page");

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";

async function setup() {
  const browser = await launchWebKit();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(BASE_URL + "/editor", { waitUntil: "domcontentloaded", timeout: 120000 });
  const frame = await findEditorFrame(page);
  return { page: makePlaywrightPage(frame), cleanup: () => browser.close() };
}

module.exports = { setup, label: "code.pyret.org /editor (Playwright WebKit)" };
