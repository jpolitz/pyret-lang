/*
 * stop-during-load.js -- pressing Stop while compile is happening (e.g. modules
 * being fetched and during codegen) must leave the editor usable.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ProceduralError } = require("../shared/errors");

// Long enough that the fetch is unambiguously still open when we click (the
// click lands ~1s in, when the break button arms), short enough that the test
// is not slow.
const HOLD_MS = 8000;

const RUN_MARK = "__stop_during_load_mark";
// What the fixture module provides; the program renders it, so seeing it on
// screen means the run reached the end despite Stop.
const IMPORTED_VALUE = "from-url-imports-lib";

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

// #output is emptied at the top of every run, so a marker placed in it
// disappears exactly when a run really begins -- which is how we tell "the Run
// was accepted" from "the Run was silently dropped".
const MARK = `(function(){
  var out = document.getElementById("output");
  if (!out) return false;
  var s = document.createElement("span");
  s.id = ${JSON.stringify(RUN_MARK)};
  out.appendChild(s);
  return true;
})()`;
const MARK_GONE = `document.getElementById(${JSON.stringify(RUN_MARK)}) === null`;

const RUN_BUTTON = `(function(){
  var b = document.getElementById("runButton");
  return b ? { disabled: b.disabled === true,
               text: (b.innerText || "").trim().replace(/\\s+/g, " ") } : null;
})()`;

const CLICK_STOP = `(function(){
  var b = document.getElementById("breakButton");
  if (!b) return { present: false };
  var wasEnabled = b.disabled === false;
  if (wasEnabled) b.click();
  return { present: true, wasEnabled: wasEnabled };
})()`;

module.exports = function registerStopDuringLoad(getSession) {
  test("Stop pressed while an import is still loading leaves the editor usable",
    { timeout: 120000 }, async () => {
      const base = process.env.PYRET_FIXTURE_BASE;
      if (!base) {
        throw new ProceduralError(
          "PYRET_FIXTURE_BASE is unset; run.js sets it when it starts the fixture server");
      }
      const page = getSession().page;
      const url = base + "/pyret-programs/url-imports/lib/provided.arr?delay=" + HOLD_MS;
      const program = 'import url("' + url + '") as S\n\nS.shared-value\n';

      await install(page, program);
      await page.eval("window.PA.clearOutput()");
      const t0 = Date.now();
      await page.eval("window.PA.run()");

      // Press Stop at the first moment a user could: the editor has claimed
      // the run AND the break button has armed. Both must hold -- the claim
      // alone precedes the button by the spinner delay, and neither can appear
      // once the (held) run has somehow finished, so a timeout here means the
      // test never exercised its case.
      try {
        await page.waitFor(
          "window.replWidget.isRunning() === true && " +
          "(function(){var b=document.getElementById('breakButton');return !!(b && !b.disabled);})()",
          Math.floor(HOLD_MS / 2));
      } catch (e) {
        throw new ProceduralError(
          "the break button never armed while the import was being held, so this " +
          "test never exercised its case");
      }
      const clickedAtMs = Date.now() - t0;
      const stop = await page.eval(CLICK_STOP);
      if (!stop.present || !stop.wasEnabled) {
        throw new ProceduralError(
          "Stop was not clickable " + clickedAtMs + "ms into the run, so this test never " +
          "exercised its case (breakButton present=" + stop.present +
          ", enabled=" + stop.wasEnabled + ")");
      }

      // Past the point where the held module is released, plus room for the
      // compile and run that follow it.
      await new Promise((r) => setTimeout(r, (HOLD_MS - clickedAtMs) + 6000));

      const shown = await page.eval(OUTPUT_TEXT);
      assert.ok(
        shown.indexOf(IMPORTED_VALUE) === -1,
        "Stop did not stop the program. " + clickedAtMs + "ms into a run whose import was " +
        "still being fetched, Stop was pressed; the fetch was nevertheless allowed to " +
        "finish, and the program went on to compile and run, rendering " +
        JSON.stringify(IMPORTED_VALUE) + ". The editor shows: " + JSON.stringify(shown.slice(0, 200)));

      const btn = await page.eval(RUN_BUTTON);
      assert.ok(btn, "the Run button is missing from the editor");
      assert.equal(btn.disabled, false,
        "after Stop, the Run button is still disabled (it reads " + JSON.stringify(btn.text) +
        "): repl-ui.js's afterRun never ran, so the editor never left the running state");

      // Does the editor accept work again?
      await install(page, "1 + 1\n");
      assert.ok(await page.eval(MARK), "could not mark #output");
      await page.eval("window.PA.run()");
      let accepted = false;
      for (let i = 0; i < 100; i++) {
        if (await page.eval(MARK_GONE)) { accepted = true; break; }
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(accepted,
        "after Stop, a later Run never started: #output was never cleared, which is " +
        "runMainCode's `if(running) { return; }` dropping it because the stopped run " +
        "left `running` true. The editor is wedged until reload.");

      // Hand the next suite an idle editor.
      let idle = false;
      for (let i = 0; i < 150; i++) {
        const b = await page.eval(RUN_BUTTON);
        if (b && b.disabled === false && b.text === "Run") { idle = true; break; }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!idle) {
        throw new ProceduralError(
          "the editor never went idle after this test, so later suites cannot be trusted");
      }
    });
};
