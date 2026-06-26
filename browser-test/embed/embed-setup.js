/*
 * embed-setup.js
 *
 * Mocha setup/teardown helpers that put a Selenium driver INSIDE an embedded
 * Pyret instance, so the *unmodified* assertions from
 * code.pyret.org/test-util/util.js can run against the embed iframe.
 *
 * How embedding works (see code.pyret.org/test-util/embed/embed1.js):
 *   - The host page /embed/embed1.html creates an <iframe id="embed1">
 *     whose src is `${BASE_URL}/editor#controlled=true`.
 *   - The host exposes window.embedAPI (sendReset/postMessage) and collects
 *     incoming postMessages in window.messages.
 *
 * After we switchTo().frame('embed1'), every driver.findElement / executeScript
 * runs against the *editor document inside the iframe* -- which is the exact
 * same CPO editor DOM (#output, .CodeMirror, #runButton, .check-block,
 * .testing-summary, "Looks shipshape"). So util.js's assertions work verbatim.
 *
 * The only embed-specific step is initialization: in controlled mode the editor
 * does NOT populate its own contents (beforePyret.js:1453) -- it waits for a
 * `reset` message. So setup sends one reset to bring the editor up, exactly like
 * the upstream embed test (code.pyret.org/test/embed.js).
 */

const path = require("path");
const tester = require(path.resolve(__dirname, "../../code.pyret.org/test-util/util.js"));

function waitForInit(browser, n) {
  browser.wait(function () {
    return browser.executeScript(
      "return window.messages && window.messages.filter(function(m){" +
      "return m.data.protocol === 'pyret' && m.data.data.type === 'pyret-init';" +
      "}).length === " + n + ";"
    );
  }, 30000);
}

// Returns a mocha `before`/`beforeEach` function. After it runs, `this.browser`
// is a driver focused inside the embed1 iframe and Pyret is fully loaded.
function setupEmbedSingle() {
  return function () {
    this.timeout(60000);
    // Build the browser + set this.base exactly like util.js does.
    tester.setup.call(this);
    var browser = this.browser;
    var base = this.base;

    browser.get(base + "/embed/embed1.html?" + base);
    waitForInit(browser, 1);

    // Initialize the controlled editor with a runnable starter context.
    browser.executeScript(
      "window.embedAPI.sendReset({" +
      "definitionsAtLastRun: false," +
      "editorContents: 'use context starter2024\\n\\n'," +
      "replContents: ''," +
      "interactionsSinceLastRun: []" +
      "});"
    );

    browser.switchTo().frame("embed1");
    return tester.waitForPyretLoad(browser, 60000);
  };
}

module.exports = {
  setupEmbedSingle,
  teardown: tester.teardownMulti,
  tester,
};
