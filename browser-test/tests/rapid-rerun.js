/*
 * rapid-rerun.js -- a second run begun immediately after the first must own
 * the UI: nothing left over from the first run may fake the second one's
 * completion, and a Stop clicked in the leftovers' window must land cleanly.
 *
 * Like stop-during-load.js, this is a state-machine test, not a spec table.
 *
 * Two pieces of run-1 state outlive run 1 by design of the widgets involved:
 *
 *   - showPrompt brings the interactions prompt back with fadeIn(100), and
 *     jQuery starts fx asynchronously -- so when run 2 begins quickly, run
 *     1's fade can still be pending when run 2 hides the prompt. Unflushed,
 *     the pending fade starts afterwards and re-shows the prompt mid-run,
 *     and anything reading "prompt visible" as "no run in flight" acts on a
 *     finished-looking editor that is in fact running.
 *
 *   - setWhileRunning schedules a 1s timer at every run start, and run 1's
 *     timer can fire during run 2 (run 1 finished fast; run 2 started
 *     within the second). It arms the break button earlier than run 2's own
 *     schedule would -- so a Stop can arrive at a moment run 2 believes no
 *     Stop is possible yet.
 *
 * The contract under test, not the cosmetics: while <body> carries the
 * data-pyret-running claim, the prompt is never visible (a DOM reader can
 * never see "done" during a live run), and a Stop clicked whenever the break
 * button arms -- including via run 1's leftover timer -- ends run 2 as a
 * user break and leaves the editor accepting new work.
 *
 * The choreography makes the leftover window real rather than raced-for:
 * run 1 is trivial (finishes well inside its own second), run 2 starts
 * immediately and never terminates, so the earliest armed break button is
 * run 1's dangling timer and the Stop provably lands on a live run.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ProceduralError } = require("../shared/errors");

const PROGRAM_FAST = "1 + 1\n";
const PROGRAM_FOREVER = "fun loop(n):\n  loop(n + 1)\nend\nloop(0)\n";
const PROGRAM_AFTER = "40 + 2\n";

// Sample the three lifecycle facts every 25ms, in-page, so the assertion
// below is over a recording rather than over whichever instants the driver's
// round trips happened to land on.
const START_RECORDER = `(function(){
  var samples = [];
  var iv = setInterval(function(){
    if (samples.length > 4000) return;
    var pc = document.querySelector(".prompt-container");
    var b = document.getElementById("breakButton");
    samples.push({
      t: Date.now(),
      claim: document.body.getAttribute("data-pyret-running") === "true",
      promptVisible: !pc || pc.offsetParent !== null,
      breakEnabled: !!(b && !b.disabled)
    });
  }, 25);
  window.__RAPID_RERUN__ = { samples: samples, stop: function(){ clearInterval(iv); } };
  return true;
})()`;

const DRAIN_RECORDER = `(function(){
  var r = window.__RAPID_RERUN__;
  if (!r) return null;
  r.stop();
  delete window.__RAPID_RERUN__;
  return r.samples;
})()`;

// Stops the recorder and clicks in ONE in-page turn, so every sample
// strictly precedes the Stop. Samples from after the click would flag
// repl-ui's onBreak, which shows the prompt immediately while the claim
// rightly stays held until afterRun -- longstanding cosmetic behavior of
// break PROCESSING, not the pre-stop lie this test exists to catch. (It is
// also why "prompt visible" alone was never a safe done-signal; the claim
// is the authority.)
const CLICK_STOP = `(function(){
  var b = document.getElementById("breakButton");
  if (!b || b.disabled !== false) return { clicked: false };
  if (window.__RAPID_RERUN__) window.__RAPID_RERUN__.stop();
  var claim = document.body.getAttribute("data-pyret-running") === "true";
  b.click();
  return { clicked: true, claimAtClick: claim };
})()`;

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

module.exports = function registerRapidRerun(getSession) {
  test("a run begun immediately after another owns the UI, and a Stop in the leftovers' window lands cleanly",
    { timeout: 120000 }, async () => {
      const page = getSession().page;

      // Run 1: trivial, so it finishes well inside its own 1s spinner timer,
      // leaving that timer dangling into whatever runs next.
      await install(page, PROGRAM_FAST);
      await page.eval("window.PA.clearOutput()");
      await page.eval("window.PA.run()");
      await page.waitFor(IDLE, 30000);

      // Run 2: begins as fast as the editor accepts text, and never
      // terminates -- so every "finished" reading below is a lie by
      // construction, and only a Stop can end it.
      assert.ok(await page.eval(START_RECORDER), "could not start the in-page recorder");
      await install(page, PROGRAM_FOREVER);
      await page.eval("window.PA.run()");
      try {
        await page.waitFor("document.body.getAttribute('data-pyret-running') === 'true'", 10000);
      } catch (e) {
        throw new ProceduralError("run 2 never claimed the UI; the rapid re-run was not exercised");
      }

      // Stop at the first armed moment. With run 2 fresh, that is run 1's
      // dangling timer; if that cosmetic early-arming is ever removed, this
      // waits out run 2's own schedule instead and the contract holds
      // unchanged.
      try {
        await page.waitFor(
          "(function(){var b=document.getElementById('breakButton');return !!(b && !b.disabled);})()",
          10000);
      } catch (e) {
        throw new ProceduralError("the break button never armed during a non-terminating run");
      }
      const stop = await page.eval(CLICK_STOP);
      assert.ok(stop.clicked, "the break button disarmed between observation and click");
      assert.ok(stop.claimAtClick,
        "the editor had released data-pyret-running while a non-terminating program was " +
        "running: the claim does not bracket the run");

      // The Stop must end run 2 as what it is -- a user break -- and hand
      // back an idle editor.
      try {
        await page.waitFor(IDLE, 30000);
      } catch (e) {
        throw new ProceduralError("the editor never returned to idle after Stop");
      }
      const shown = await page.eval(OUTPUT_TEXT);
      assert.ok(shown.indexOf("stopped by user") !== -1,
        "Stop ended the run, but not as a user break; the editor shows: " +
        JSON.stringify(shown.slice(0, 200)));

      // The recording is the heart of the test: at no sampled instant
      // between run 2's start and the Stop click may the editor have claimed
      // a run AND shown the prompt. That conjunction is exactly what a
      // pending fade from run 1 used to produce, and it is what made a DOM
      // reader call a live run finished. (Sampling ends at the click -- see
      // CLICK_STOP -- because break processing shows the prompt while the
      // claim is legitimately still held.)
      const samples = await page.eval(DRAIN_RECORDER);
      assert.ok(samples && samples.length > 0, "the recorder captured nothing");
      const lies = samples.filter((s) => s.claim && s.promptVisible);
      assert.deepStrictEqual(lies, [],
        "the prompt was visible while the editor claimed a run in flight (" +
        lies.length + " of " + samples.length + " samples): leftover state from the " +
        "previous run is faking this one's completion");

      // And the editor takes new work afterwards.
      await install(page, PROGRAM_AFTER);
      await page.eval("window.PA.clearOutput()");
      await page.eval("window.PA.run()");
      await page.waitFor(IDLE, 30000);
      const after = await page.eval(OUTPUT_TEXT);
      assert.ok(after.indexOf("42") !== -1,
        "a run after the Stop did not produce its result; the editor shows: " +
        JSON.stringify(after.slice(0, 200)));
    });
};
