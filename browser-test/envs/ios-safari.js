/*
 * Environment adapter: code.pyret.org /editor in real Safari on an iOS Simulator.
 *
 * This is the old-Safari authority. Everything else in this harness runs an
 * engine that is close to Safari (Playwright's WebKit) or not Safari at all
 * (Chromium); a simulator runtime is Apple's actual shipped WebKit +
 * JavaScriptCore for that iOS version, which is the only way to catch "JSC
 * didn't implement this yet" and "JSC got this wrong" bugs before a teacher on
 * an old iPad does.
 *
 * Pin the runtime to the OLDEST iOS still worth supporting, not the newest
 * available -- the point is to run the engine that has the bug. See
 * IOS_PLATFORM_VERSION in .github/workflows/browser-test.yml for the current
 * pin and the reasoning.
 *
 * Playwright cannot drive iOS Safari, so this env goes through Appium's
 * XCUITest driver over WebDriver, and builds the suite's `page` adapter with
 * makeWebDriverPage instead of makePlaywrightPage. The specs and assertions are
 * unchanged -- they only ever see the three-method adapter contract.
 *
 * Requirements (see the test-ios-safari job in the workflow):
 *   - macOS host with Xcode and the target iOS simulator runtime installed
 *   - a booted simulator whose UDID is in SIM_UDID
 *   - an Appium server with the xcuitest driver, at APPIUM_HOST:APPIUM_PORT
 *   - webdriverio, which is NOT in package.json: it is a macOS-only dependency
 *     of this one env, and adding it would make every ubuntu matrix job install
 *     it. The workflow does `npm i --no-save webdriverio`; do the same locally.
 *
 * The simulator shares the host's network stack, so the CPO server at
 * localhost:4999 is reachable from simulator Safari with no tunnel.
 */
const { remote } = require("webdriverio");
const { makeWebDriverPage } = require("../shared/webdriver-page");
const { ProceduralError } = require("../shared/errors");

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";
const APPIUM_HOST = process.env.APPIUM_HOST || "127.0.0.1";
const APPIUM_PORT = parseInt(process.env.APPIUM_PORT || "4723", 10);
const PLATFORM_VERSION = process.env.IOS_PLATFORM_VERSION || "17.0";
const DEVICE_NAME = process.env.IOS_DEVICE_NAME || "iPad (10th generation)";

// Three nested waits guard session creation, and they MUST be ordered
// innermost-shortest or the outer one aborts the inner mid-flight and you get a
// generic client-side timeout instead of the driver's own diagnosis -- which is
// exactly what happened on the first attempt: WebDriverAgent built fine, wdio
// gave up at its 5-minute default, and the useful error never got written.
//
//   WDA_LAUNCH_TIMEOUT   Appium waits for WebDriverAgent (builds it if cold)
//   CONNECTION_RETRY     wdio waits for POST /session to come back
//   SETUP_TIMEOUT        node:test waits for the before() hook
const WDA_LAUNCH_TIMEOUT = parseInt(process.env.WDA_LAUNCH_TIMEOUT || "360000", 10);
const CONNECTION_RETRY_TIMEOUT = WDA_LAUNCH_TIMEOUT + 180000;
const SETUP_TIMEOUT = CONNECTION_RETRY_TIMEOUT + 180000;

// getContext/getContexts return either a plain context name or a detailed
// { id, title, url, bundleId } object depending on the driver and the options
// in play, so always go through this rather than comparing a value directly --
// an object is never === "NATIVE_APP", which would silently look like success
// while the session was still in the native context and every executeScript
// came back null.
function contextId(c) {
  if (!c) return undefined;
  return typeof c === "string" ? c : c.id;
}

// With browserName: Safari the XCUITest driver normally lands in the web
// context already, but it can come back in NATIVE_APP if the page is still
// loading when the session is created. Switching explicitly makes the failure
// mode a clear error rather than a hang.
async function ensureWebContext(driver) {
  const deadline = Date.now() + 60000;
  let contexts = [];
  for (;;) {
    const current = contextId(await driver.getContext());
    if (current && current !== "NATIVE_APP") return current;
    contexts = await driver.getContexts();
    const web = contexts.map(contextId).find((id) => id && id !== "NATIVE_APP");
    if (web) {
      await driver.switchContext(web);
      return web;
    }
    if (Date.now() > deadline) {
      throw new ProceduralError(
        "no Safari web context appeared within 60s (contexts: " +
          JSON.stringify(contexts) + ") -- the simulator booted but the page " +
          "never loaded, or the remote debugger never attached."
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function setup() {
  const driver = await remote({
    hostname: APPIUM_HOST,
    port: APPIUM_PORT,
    path: "/",
    logLevel: "warn",
    // Must outlast Appium's own WDA wait -- see the timeout ladder above.
    connectionRetryTimeout: CONNECTION_RETRY_TIMEOUT,
    capabilities: {
      platformName: "iOS",
      browserName: "Safari",
      "appium:automationName": "XCUITest",
      "appium:platformVersion": PLATFORM_VERSION,
      "appium:deviceName": DEVICE_NAME,
      ...(process.env.SIM_UDID ? { "appium:udid": process.env.SIM_UDID } : {}),
      // Chart rendering keeps the page busy for a long time; don't let the
      // driver give up on attaching to it.
      "appium:webviewConnectTimeout": 120000,
      "appium:safariInitialUrl": BASE_URL + "/editor",
      "appium:newCommandTimeout": 0,
      // The driver builds WebDriverAgent with xcodebuild on first use, and a
      // cold build on a CI runner takes minutes -- well past the 60s default,
      // which fails with a misleading "ECONNREFUSED 127.0.0.1:8100" while the
      // build is still running. One retry rather than the default two, so a
      // genuine failure doesn't sit through the long timeout twice.
      "appium:wdaLaunchTimeout": WDA_LAUNCH_TIMEOUT,
      "appium:wdaStartupRetries": 1,
      // Without this, xcodebuild output is swallowed unless the driver decides
      // an error is present -- so a real build failure looks like a timeout.
      "appium:showXcodeLog": true,
    },
  });

  await ensureWebContext(driver);
  await driver.setTimeout({ pageLoad: 120000, script: 120000 });
  // safariInitialUrl already navigated; this makes the target explicit and
  // re-navigates if the session was recycled onto about:blank.
  await driver.url(BASE_URL + "/editor");

  // Unlike the Playwright envs there is no frame hunt: on /editor the editor IS
  // the top-level document (see shared/find-frame.js), so the session's default
  // browsing context is already the right one.
  return {
    page: makeWebDriverPage(driver),
    cleanup: () => driver.deleteSession(),
  };
}

const label =
  "code.pyret.org /editor (real Safari, iOS " + PLATFORM_VERSION + " simulator)";

module.exports = { setup, label, setupTimeout: SETUP_TIMEOUT };
