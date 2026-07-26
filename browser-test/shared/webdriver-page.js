/*
 * webdriver-page.js
 *
 * The same `page` adapter as playwright-page.js (the three-method contract
 * documented in cpo-assertions.js), backed by a WebDriver session instead of a
 * Playwright Frame. This is what lets the suite run against real Safari on an
 * iOS Simulator, which Playwright cannot drive at all.
 *
 * Two differences from the Playwright adapter:
 *   - executeScript takes a function *body*, so SOURCE (already a self-invoking
 *     expression) and the spec expressions both need an explicit `return`.
 *   - WebDriver has no waitForFunction, so waitFor is a poll loop here. It polls
 *     at 250ms rather than Playwright's 100ms: each tick is a full HTTP round
 *     trip through Appium to the simulator's remote debugger, and the slow waits
 *     in this suite (chart rendering) run for minutes.
 */
const { SOURCE } = require("./page-assertions");

function makeWebDriverPage(driver) {
  return {
    // Define window.PA in the editor document (idempotent).
    async inject() {
      await driver.execute("return " + SOURCE);
    },
    // Evaluate an expression string and return the JSON value.
    async eval(expr) {
      return driver.execute("return (" + expr + ");");
    },
    // Poll an expression until truthy or timeout (ms).
    async waitFor(expr, timeout) {
      const deadline = Date.now() + (timeout || 30000);
      for (;;) {
        if (await driver.execute("return !!(" + expr + ");")) return;
        if (Date.now() > deadline) {
          throw new Error(
            "timed out after " + (timeout || 30000) + "ms waiting for: " + expr
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },
  };
}

module.exports = { makeWebDriverPage };
