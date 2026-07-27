/*
 * webdriver-page.js
 *
 * The WebDriver twin of shared/playwright-page.js: the same three-method `page`
 * adapter (see cpo-assertions.js), backed by a safaridriver session instead of a
 * Playwright Frame. Everything the assertions send across this boundary is a JS
 * expression string, and everything that comes back is plain JSON (see the
 * header of page-assertions.js), so the two backends are genuinely
 * interchangeable -- no DOM handles cross it.
 *
 * NOTE on frames: this is currently used only by --env=cpo, where the editor IS
 * the main frame, so there is no frame switching at all. Porting the embed /
 * vscode envs would need more than a `findEditorFrame` equivalent: WebDriver has
 * a single *current* frame rather than independent frame handles, so the adapter
 * would have to switch to default content and descend the frame path before
 * EVERY eval, since anything else in the session can move it.
 */
const { SOURCE } = require("./page-assertions");

function makeWebDriverPage(session) {
  return {
    // Define window.PA in the page (idempotent). SOURCE is already a complete
    // "(function(){...})()" expression, so it needs no wrapping.
    async inject() {
      await session.execute(SOURCE);
    },
    // Evaluate an expression string and return the JSON value.
    async eval(expr) {
      // Wrap so a bare expression (e.g. "window.PA.run()") is returned. WebDriver
      // maps a JS `undefined` result to null, which the callers already tolerate.
      return session.execute("return (" + expr + ");");
    },
    // Poll an expression until truthy or timeout (ms). Matches
    // playwright-page.js's `polling: 100`.
    async waitFor(expr, timeout) {
      const limit = timeout || 30000;
      const deadline = Date.now() + limit;
      for (;;) {
        if (await session.execute("return !!(" + expr + ");")) return;
        if (Date.now() >= deadline) {
          throw new Error(
            "timed out after " + limit + "ms waiting for: " + expr
          );
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
}

module.exports = { makeWebDriverPage };
