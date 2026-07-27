/*
 * browser.js -- one place to open a browser for the env adapters.
 *
 * launchChromium(): headless Chromium, used directly by the embed / vscode envs.
 * If GOOGLE_CHROME_BINARY is set, use that Chrome build; otherwise fall back to
 * Playwright's bundled Chromium (`npx playwright install chromium`). This keeps
 * local runs (system Chrome) and CI (Playwright's Chromium) both working without
 * per-env duplication.
 *
 * launchEditorSession(url): the browser-agnostic entry point -- load `url`, find
 * the editor, and hand back the `page` adapter the assertions run against.
 * PYRET_BROWSER selects the backend:
 *
 *   chromium (default)  Playwright, exactly as above.
 *   safari              Real Safari over W3C WebDriver (shared/webdriver.js),
 *                       at SAFARI_WEBDRIVER_URL. Playwright cannot drive Apple's
 *                       Safari at all, hence the second backend rather than a
 *                       Playwright browser-type switch. Used to run the suite
 *                       against an old Safari (e.g. 17.0) in a VM; see
 *                       browser-test/README.md.
 *
 * Only --env=cpo goes through launchEditorSession today; the other four envs do
 * enough browser-specific setup (init scripts, keyboard, nested frames) that
 * they stay on launchChromium.
 */
const { chromium } = require("playwright");
const { findEditorFrame } = require("./find-frame");
const { makePlaywrightPage } = require("./playwright-page");

async function launchChromium() {
  const opts = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
  if (process.env.GOOGLE_CHROME_BINARY) {
    opts.executablePath = process.env.GOOGLE_CHROME_BINARY;
  }
  return chromium.launch(opts);
}

async function chromiumEditorSession(url) {
  const browser = await launchChromium();
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  const frame = await findEditorFrame(page);
  return { editor: makePlaywrightPage(frame), cleanup: () => browser.close() };
}

async function safariEditorSession(url) {
  // Required lazily: the Safari path has no npm dependencies, and this keeps
  // shared/webdriver.js off the chromium path entirely.
  const { newSafariSession } = require("./webdriver");
  const { makeWebDriverPage } = require("./webdriver-page");
  const session = await newSafariSession();
  await session.navigate(url);
  // No findEditorFrame equivalent: on /editor the editor is the main frame.
  // See the frame note in shared/webdriver-page.js before porting other envs.
  return { editor: makeWebDriverPage(session), cleanup: () => session.close() };
}

const BACKENDS = {
  chromium: chromiumEditorSession,
  safari: safariEditorSession,
};

async function launchEditorSession(url) {
  const kind = process.env.PYRET_BROWSER || "chromium";
  const backend = BACKENDS[kind];
  if (!backend) {
    throw new Error(
      "PYRET_BROWSER must be one of " + Object.keys(BACKENDS).join(" | ") +
        " (got " + JSON.stringify(kind) + ")"
    );
  }
  return backend(url);
}

module.exports = { launchChromium, launchEditorSession };
