/*
 * effective-ids.js -- a long editor session must survive its own compiles.
 *
 * There was an issue in the TS compiler where it faithfully ported a recursive
 * scan for an unused JS name from `anf-loop-compiler.arr`. This blew out the JS
 * stack (when the Pyret stack was fine before).
 *
 * This test runs many distinct programs in a row to pump the name set until
 * it's large and makes sure nothing breaks.
 *
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ProceduralError } = require("../shared/errors");

const COMPILES = Number(process.env.PYRET_EFFECTIVE_IDS_COMPILES || 120);

// The words the overflow actually arrives as, so a failure can name itself
// instead of presenting as "run 93 printed nothing".
const STACK_ERROR = "Maximum call stack size exceeded";

const IDLE = "window.replWidget.isRunning() !== true && " +
  "(function(){var pc=document.querySelector('.prompt-container');" +
  "return !pc || pc.offsetParent !== null;})()";

const OUTPUT_TEXT = `(function(){
  var out = document.getElementById("output");
  return out ? (out.innerText || "").replace(/\\s+/g, " ").trim() : "";
})()`;

async function install(page, code) {
  for (let i = 0; i < 20; i++) {
    await page.eval("window.PA.setDefinitions(" + JSON.stringify(code) + ")");
    if ((await page.eval("window.PA.cmValue()")) === code) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new ProceduralError("could not install the program into the editor (doc-sync race)");
}

module.exports = function registerEffectiveIds(getSession) {
  test("an editor that has compiled many programs still compiles the next one",
    { timeout: COMPILES * 6000 + 180000 }, async () => {
      const page = getSession().page;
      const flavor = await page.eval("window.CPO_COMPILER || 'pyret'");

      for (let i = 1; i <= COMPILES; i++) {
        const program = i + " + 1\n";
        const expected = String(i + 1);

        await install(page, program);
        await page.eval("window.PA.clearOutput()");
        await page.eval("window.PA.run()");

        try {
          await page.waitFor(IDLE, 60000);
        } catch (e) {
          // A wedged editor this deep into the loop is the same finding as a
          // wrong answer: the session stopped being able to compile.
          throw new ProceduralError(
            "compile " + i + " of " + COMPILES + " (" + flavor + ") never returned the " +
            "editor to idle; the session stopped accepting work");
        }

        const shown = await page.eval(OUTPUT_TEXT);
        if (shown.indexOf(expected) === -1) {
          // Name the regression when the output is its signature, and stop at
          // the first bad compile -- WHICH compile broke is the measurement.
          const overflowed = shown.indexOf(STACK_ERROR) !== -1;
          assert.fail(
            "compile " + i + " of " + COMPILES + " on the " + flavor + " compiler did not " +
            "produce " + expected + (overflowed
              ? ": it overflowed the stack. freshId's scan for an unused JS name is growing " +
                "with the number of compiles this page has done -- effectiveIds persists " +
                "while compileModule rewinds jsNames (anf-loop-compiler.ts)."
              : "; the editor shows: " + JSON.stringify(shown.slice(0, 200))));
        }
      }

      // The session is not merely un-crashed: it is still correct and still
      // idle, which is what the next thing a user types depends on.
      const sticky = await page.eval("window.PA.stickyErrors()");
      assert.deepStrictEqual(sticky, [],
        "the editor carries a sticky error after " + COMPILES + " compiles: " + sticky.join(" | "));
    });
};
