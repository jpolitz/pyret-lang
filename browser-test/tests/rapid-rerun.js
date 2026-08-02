/*
 * rapid-rerun.js -- two things outlive a finished run: the animation that
 * restores the interactions prompt, and the 1-second timer that arms the
 * Stop button. A second run started inside that second runs among both
 * leftovers, and they must not affect it: the prompt stays hidden until the
 * run really ends (a visible prompt is how DOM readers decide a run is
 * over), and a Stop clicked the moment the button arms -- which is the
 * FIRST run's timer arming it -- cleanly breaks the live run.
 *
 * One check, one click: run something trivial, immediately start a run that
 * never terminates, and at the first moment Stop is possible require that
 * the editor still claims the run (replWidget.isRunning()) and shows no
 * prompt. If the leftover fade resurrected the prompt, it stays visible
 * from then on, so this single look catches it. Then Stop, and require a
 * user break and a working editor.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ProceduralError } = require("../shared/errors");

const FOREVER = "fun loop(n):\n  loop(n + 1)\nend\nloop(0)\n";

const IDLE = "window.replWidget.isRunning() !== true && " +
  "(function(){var pc=document.querySelector('.prompt-container');" +
  "return !pc || pc.offsetParent !== null;})()";

const BREAK_ARMED =
  "(function(){var b=document.getElementById('breakButton');return !!(b && !b.disabled);})()";

// Read once, atomically: is the run still claimed, is the prompt showing,
// and click Stop in the same turn (before break processing can muddy either).
const CHECK_AND_STOP = `(function(){
  var pc = document.querySelector(".prompt-container");
  var b = document.getElementById("breakButton");
  var st = {
    claimed: window.replWidget.isRunning() === true,
    promptVisible: !pc || pc.offsetParent !== null,
    armed: !!(b && !b.disabled)
  };
  if (st.armed) b.click();
  return st;
})()`;

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

async function run(page, code) {
  await install(page, code);
  await page.eval("window.PA.clearOutput()");
  await page.eval("window.PA.run()");
}

module.exports = function registerRapidRerun(getSession) {
  test("a run begun immediately after another is not affected by the first run's leftovers",
    { timeout: 120000 }, async () => {
      const page = getSession().page;

      await run(page, "1 + 1\n");
      await page.waitFor(IDLE, 30000);

      await run(page, FOREVER);
      // The button arms at most ~1s in, via the FIRST run's leftover timer
      // (this run is younger than its own timer's schedule) -- and that
      // moment is past any leftover prompt animation, so one look suffices.
      await page.waitFor(BREAK_ARMED, 10000);
      const st = await page.eval(CHECK_AND_STOP);
      assert.ok(st.armed && st.claimed,
        "the editor stopped claiming a run that cannot have ended: " + JSON.stringify(st));
      assert.ok(!st.promptVisible,
        "the prompt is visible mid-run -- the previous run's leftover animation " +
        "resurrected it, which is what makes DOM readers call a live run finished: " +
        JSON.stringify(st));

      await page.waitFor(IDLE, 30000);
      const out = await page.eval(OUTPUT_TEXT);
      assert.ok(out.indexOf("stopped by user") !== -1,
        "Stop ended the run, but not as a user break; the editor shows: " +
        JSON.stringify(out.slice(0, 200)));

      await run(page, "40 + 2\n");
      await page.waitFor(IDLE, 30000);
      assert.ok((await page.eval(OUTPUT_TEXT)).indexOf("42") !== -1,
        "a run after the Stop did not produce its result");
    });
};
