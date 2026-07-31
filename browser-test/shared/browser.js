/*
 * browser.js -- one place to launch headless Chromium for the env adapters.
 *
 * If GOOGLE_CHROME_BINARY is set, use that Chrome build; otherwise fall back to
 * Playwright's bundled Chromium (`npx playwright install chromium`). This keeps
 * local runs (system Chrome) and CI (Playwright's Chromium) both working without
 * per-env duplication.
 */
const { chromium } = require("playwright");

// Relay the page's own story -- console, uncaught exceptions, failed
// requests -- into the runner's stdout, so it survives into CI logs. The
// editor reports its failures where a browser-side developer would look
// (e.g. beforePyret's bundle-load fallbacks console.error the reason and the
// exact URL), and until this relay existed that story was generated on every
// failing CI run and then discarded with the headless browser: the vscode x
// pyret runtime-load failure spent days as "doneRendering timed out" while
// the console held the actual error. Covers all frames of the page,
// including the vscode webview's.
function wireBrowserLogs(page) {
  const clip = (s) => {
    s = String(s);
    return s.length > 400 ? s.slice(0, 400) + " ...[clipped]" : s;
  };
  page.on("console", (msg) => {
    console.log("[browser " + msg.type() + "] " + clip(msg.text()));
  });
  page.on("pageerror", (err) => {
    console.log("[browser pageerror] " + clip(err));
  });
  page.on("requestfailed", (req) => {
    const f = req.failure();
    console.log("[browser requestfailed] " + req.method() + " " + clip(req.url()) +
      " -- " + (f ? f.errorText : "unknown"));
  });
  page.on("response", (resp) => {
    if (resp.status() >= 400) {
      console.log("[browser http " + resp.status() + "] " + clip(resp.url()));
    }
  });
}

/*
 * SHOW_BROWSER opens a real window instead of running headless, so a run can be
 * watched and poked at. Same name as code.pyret.org/test-util/util.js's knob,
 * so it is one thing to remember across both suites.
 *
 * SLOWMO_MS delays every Playwright action by that many ms. Worth pairing with
 * SHOW_BROWSER: the assertions drive the editor far faster than a person can
 * follow, and at 0 the interesting moment is over before you have seen it.
 *
 * For stepping rather than watching, Playwright brings two things Selenium did
 * not, and neither needs a change here: PWDEBUG=1 opens the Inspector and
 * pauses before the first action, and an `await page.pause()` dropped into a
 * test halts THERE with the page live and the devtools console usable -- which
 * beats watching a whole suite go by to reach one state.
 *
 * Headless stays the default: CI has no display, and a run that silently waits
 * on a window nobody can see is worse than one that just runs.
 */
async function launchChromium() {
  const opts = {
    headless: !process.env.SHOW_BROWSER,
    slowMo: Number(process.env.SLOWMO_MS) || 0,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  };
  if (process.env.GOOGLE_CHROME_BINARY) {
    opts.executablePath = process.env.GOOGLE_CHROME_BINARY;
  }
  return chromium.launch(opts);
}

module.exports = { launchChromium, wireBrowserLogs };
