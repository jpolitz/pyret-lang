/*
 * browser.js -- one place to launch a headless browser for the env adapters.
 *
 * If GOOGLE_CHROME_BINARY is set, use that Chrome build; otherwise fall back to
 * Playwright's bundled Chromium (`npx playwright install chromium`). This keeps
 * local runs (system Chrome) and CI (Playwright's Chromium) both working without
 * per-env duplication.
 *
 * launchWebKit gives the --env=webkit tier its browser: Playwright's bundled
 * WebKit, which runs on Linux and so gives everyone a Safari-ish signal in the
 * normal matrix. It is NOT Safari -- it is upstream WebKit, which can have
 * features enabled that the shipping Safari of the same version number does not
 * (this is why --env=ios-safari exists). Treat it as a fast smoke tier and the
 * simulator as the authority.
 */
const { chromium, webkit } = require("playwright");

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

async function launchWebKit() {
  return webkit.launch({ headless: true });
}

module.exports = { launchChromium, launchWebKit };
