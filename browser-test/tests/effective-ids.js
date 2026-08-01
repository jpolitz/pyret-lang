/*
 * effective-ids.js -- a long editor session must survive its own compiles.
 *
 * Like stop-during-load.js and rapid-rerun.js, this is a state-machine test:
 * its subject is what the editor accumulates over a session, not any one
 * program's value.
 *
 * The shape of the bug it pins (ts backend, anf-loop-compiler.ts):
 *
 *   freshId scans for an unused JS name by asking jsNames for a candidate and
 *   retrying while effectiveIds already holds it. compileModule rewinds
 *   jsNames' counter between compiles, but effectiveIds is a module-level Map
 *   that lives as long as the page -- so compile N's scan re-collides with the
 *   names issued by all N-1 compiles before it, and the scan gets one step
 *   deeper every time. As recursion that step was a stack frame, and a real
 *   session overflowed with "Maximum call stack size exceeded" about a hundred
 *   compiles in. Stock Pyret has the identical shape (fresh-id in
 *   anf-loop-compiler.arr) and survives it only because its recursion runs on
 *   the runtime's trampolined stack.
 *
 * So the failure is invisible to any test that reboots the editor, and
 * invisible to a short one: it is a function of how many compiles one page has
 * done. This test is therefore the one thing the suite could not otherwise
 * see -- many compiles, one editor, no reboot.
 *
 * Each iteration compiles DISTINCT source (`i + 1`), for two reasons: it
 * defeats any caching that would let a repeated program skip the compile the
 * bug lives in, and it makes each run's expected value unique, so "run i
 * produced run i's answer" is checkable rather than inferred.
 *
 * The count only has to clear the overflow threshold with margin. It is
 * deliberately not tuned to the ~100 observed in the wild -- that number is a
 * property of one build's stack budget, not of the contract -- so the default
 * is comfortably past it and the env knob exists for bisecting.
 *
 * Under the stock compiler this passes trivially (trampolined stack). It is
 * still worth running there: "an editor left open all class stays healthy" is
 * a contract both flavors owe, and stock is where a future regression would
 * otherwise go unnoticed.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ProceduralError } = require("../shared/errors");

const COMPILES = Number(process.env.PYRET_EFFECTIVE_IDS_COMPILES || 120);

// The words the overflow actually arrives as, so a failure can name itself
// instead of presenting as "run 93 printed nothing".
const STACK_ERROR = "Maximum call stack size exceeded";

const IDLE = "document.body.getAttribute('data-pyret-running') !== 'true' && " +
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
