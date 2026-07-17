/*
 * browser.js -- one place to launch headless Chromium for the env adapters.
 *
 * If GOOGLE_CHROME_BINARY is set, use that Chrome build; otherwise fall back to
 * Playwright's bundled Chromium (`npx playwright install chromium`). This keeps
 * local runs (system Chrome) and CI (Playwright's Chromium) both working without
 * per-env duplication.
 *
 * PYRET_ORIGIN_REWRITE=<public-origin>=<local-origin> (e.g.
 * "https://example.com:4999=http://localhost:4999") transparently serves
 * requests for a deployment's baked public origin from the local server.
 * Useful when the CPO build's APP_BASE_URL points at a TLS-terminating proxy
 * that is not reachable from the machine running the tests (e.g. testing an
 * exe.dev-proxied instance from inside its VM).
 */
const { chromium } = require("playwright");

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

// A page whose context applies PYRET_ORIGIN_REWRITE (plain newPage when unset).
async function newPageWithRewrite(browser) {
  const rewrite = process.env.PYRET_ORIGIN_REWRITE;
  if (!rewrite || !rewrite.includes("=")) {
    return browser.newPage();
  }
  const eq = rewrite.indexOf("=");
  const pub = rewrite.slice(0, eq);
  const local = rewrite.slice(eq + 1);
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  await ctx.route(pub + "/**", async (route) => {
    const req = route.request();
    const url = req.url().replace(pub, local);
    try {
      const resp = await ctx.request.fetch(url, {
        method: req.method(),
        headers: { ...req.headers(), host: new URL(local).host },
        data: req.postDataBuffer() || undefined,
        maxRedirects: 0,
      });
      await route.fulfill({ response: resp });
    } catch (e) {
      await route.abort();
    }
  });
  return ctx.newPage();
}

module.exports = { launchChromium, newPageWithRewrite };
