/*
 * assertions.js -- run one starter file and judge what happened.
 *
 * Failure taxonomy matches the rest of browser-test (see shared/errors.js):
 * a wrong OUTCOME is a node:assert AssertionError; a step that could not be
 * carried out (definitions wouldn't install, the editor never came back) is a
 * ProceduralError.
 *
 * The outcomes a student entry point can have. Every entry point in
 * expectations.js declares exactly one of them, so a file that silently
 * changes category (an interactive file that starts erroring, a spreadsheet
 * file that starts failing to compile) fails rather than passing under a laxer
 * rule:
 *
 *   "runs"          the program finishes with nothing in the error area.
 *
 *   "interactive"   the program opens a window and waits for the student,
 *                   with #breakButton still live. Two shapes, distinguished
 *                   by `windowKind`: a reactor animation (`interact()` /
 *                   `blastoff()`, painting a <canvas>) or one of Bootstrap's
 *                   Interactive Chart windows (`scatter-plot` and friends,
 *                   drawing an <svg>). Either way it must have DRAWN, since
 *                   that is what a student sees; then we press Stop, which is
 *                   also what a student does.
 *
 *   "needs-google-login"
 *                   the program compiles and runs, and dies at
 *                   `load-spreadsheet(...)` because this editor is not signed
 *                   in to Google. Asserted precisely: the error area must hold
 *                   the Google-auth message and nothing else. That is a real
 *                   check, not a skip -- Pyret compiles a whole program before
 *                   running any of it, so reaching a runtime call in
 *                   gdrive-sheets proves every url-file import resolved and
 *                   the whole file passed well-formedness and name
 *                   resolution. What it does NOT prove is anything about the
 *                   data: see README.md.
 *
 *   "placeholder"   the file ships with a blank the student fills in -- most
 *                   often `load-spreadsheet("PASTE THE URL ... HERE")` -- so
 *                   it errors until they do. Deliberate, like teaching-error,
 *                   but for the opposite reason: nothing is wrong with the
 *                   code, it is simply waiting for the student's own data. The
 *                   error must name the placeholder text, which proves the
 *                   file compiled and got as far as trying to load it.
 *
 *   "teaching-error"
 *                   the file is deliberately broken (that is the lesson), so
 *                   it must produce a COMPILE error, and one containing the
 *                   expected text. If Pyret's message for that mistake
 *                   changes, this is where you find out.
 *
 *   "broken-upstream"
 *                   checked exactly like teaching-error, but named apart
 *                   because it means the opposite thing: the starter file has
 *                   a genuine bug and a student opening it today hits a
 *                   compile error the lesson never intended. Keeping it as a
 *                   recorded expectation is what lets the suite be green while
 *                   still naming the breakage; every one of these carries a
 *                   `note` saying what is wrong, and the fix belongs in
 *                   Bootstrap's repo, not here.
 */
const assert = require("node:assert/strict");
const { ProceduralError } = require("../shared/errors");
const CUR = require("./page-curriculum");

// The message CPO surfaces when gdrive-sheets asks for the Sheets API and the
// page never got one, i.e. nobody is signed in. authenticate-storage.js
// rejects the sheetsAPI promise with this exact string.
const GOOGLE_AUTH_ERROR = "no gapi.client";

const OUTCOMES = ["runs", "interactive", "needs-google-login", "placeholder",
                  "teaching-error", "broken-upstream"];

// The message sheets.js reports when a spreadsheet cannot be opened. For a
// placeholder file the "id" is the instruction text the student is meant to
// replace, which is what makes that case recognisable.
const NO_SPREADSHEET = "No Spreadsheet with id";

// window.PA (the shared port of util.js) plus window.CUR (this suite's extra
// predicates). CUR.SOURCE is an IIFE expression, so the plain `eval` adapter
// can install it; both are idempotent.
async function inject(page) {
  await page.inject();
  await page.eval(CUR.SOURCE);
}

// Install the file's text and confirm CodeMirror really holds it. Same reason
// as shared/cpo-assertions.js's setDefinitionsConfirmed: hosts that bind CM to
// a document can push contents back over a single write.
async function installDefinitions(page, code, what) {
  await inject(page);
  for (let i = 0; i < 20; i++) {
    await page.eval("window.PA.setDefinitions(" + JSON.stringify(code) + ")");
    if ((await page.eval("window.PA.cmValue()")) === code) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new ProceduralError("could not install " + what + " into the editor (doc-sync race)");
}

/*
 * Run one starter file and return the state we judged it on.
 *
 * Two phases, because there are two ways to be finished and they are not
 * interchangeable: a batch file ends with #breakButton disabled, an interactive
 * one never does and instead paints a canvas.
 *
 * Phase one waits for the run to BEGIN (CUR.markRun/runStarted). Without it,
 * "#breakButton is disabled" is ambiguous -- it is equally the previous
 * program's finished state -- so a poll landing in the gap between the click
 * and Pyret starting would report this program as finished with empty output,
 * which for the many starter files that print nothing looks exactly like
 * success.
 */
async function runFile(page, code, {
  what, timeout = 120000, startTimeout = 30000, paintMs = 8000,
} = {}) {
  await installDefinitions(page, code, what);
  await page.eval("window.CUR.closeInteractiveWindows()");
  await page.eval("window.PA.clearOutput()");
  await page.eval("window.CUR.markRun()");
  const t0 = Date.now();
  await page.eval("window.PA.run()");
  try {
    await page.waitFor("window.CUR.runStarted()", startTimeout);
  } catch (e) {
    throw new ProceduralError(
      "the editor never started running " + what + " (Run was clicked but #output was " +
      "never cleared); the previous program may still be in flight");
  }

  let st = null;
  let animatingSince = 0;
  while (Date.now() - t0 < timeout) {
    await new Promise((r) => setTimeout(r, 500));
    st = await page.eval("window.CUR.runState()");
    if (st.animating) {
      // The window opens before the first frame is painted, so don't call it
      // "empty" until it has had a few seconds to paint one.
      if (st.drewFrame) break;
      if (animatingSince === 0) animatingSince = Date.now();
      if (Date.now() - animatingSince >= paintMs) break;
      continue;
    }
    if (st.done) break;
  }
  if (st === null) throw new ProceduralError("never observed a run state for " + what);
  st.elapsedMs = Date.now() - t0;
  // Neither finished nor showed a reactor: the run is wedged, and neither
  // "runs" nor "interactive" would be an honest answer.
  st.timedOut = !st.animating && !st.done;

  // Leave the editor usable for the next file no matter which way this one
  // ended: stop a running program, then dismiss any interactive window.
  //
  // Idle is `runState().done` -- prompt back AND break button disabled -- not
  // PA.breakDone(), which is the button alone. repl-ui.js re-shows the prompt
  // in afterRun, the same place it clears its internal `running` flag, so the
  // prompt is the fact that lines up with "a new Run will be accepted". The
  // button alone goes quiet earlier, and a Run clicked in that window is
  // silently dropped by `if(running) { return; }` -- which showed up as the
  // NEXT file reporting that it never started.
  await page.eval("window.CUR.stop()");
  await page.eval("window.CUR.closeInteractiveWindows()");
  let idle = false;
  for (let i = 0; i < 240; i++) {
    idle = (await page.eval("window.CUR.runState()")).done;
    if (idle) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!idle) {
    throw new ProceduralError(
      "the editor would not return to idle after " + what + "; later files cannot be trusted");
  }
  return st;
}

function describeState(st) {
  return JSON.stringify(
    {
      done: st.done, promptVisible: st.promptVisible,
      animating: st.animating, windowKind: st.windowKind,
      drewFrame: st.drewFrame, timedOut: st.timedOut,
      errorCount: st.errorCount, runtimeError: st.runtimeError,
      errorText: st.errorText.slice(0, 400),
      checkBlocks: st.checkBlocks, failedBlocks: st.failedBlocks,
      outputText: st.outputText.slice(0, 200), elapsedMs: st.elapsedMs,
    },
    null, 2);
}

// Judge a run against the declared outcome.
function assertOutcome(st, expected, what) {
  assert.ok(OUTCOMES.includes(expected.outcome),
    "unknown expected outcome " + JSON.stringify(expected.outcome) + " for " + what);
  assert.ok(!st.timedOut,
    what + " neither finished nor drew an animation before the time limit: " + describeState(st));

  switch (expected.outcome) {
    case "runs":
      assert.strictEqual(st.errorCount, 0,
        what + " should run clean, but the editor showed an error: " + describeState(st));
      assert.ok(st.done, what + " should finish, but it was still running: " + describeState(st));
      // Fifteen of these files carry `examples:` / `check:` blocks, and a
      // starter file's blocks are part of the lesson: some are meant to pass
      // as shipped, some are the exercise and are meant to fail until the
      // student writes the function. Both counts are pinned (absent means
      // zero) so a block that appears, disappears, or flips from passing to
      // failing is a failure here rather than something "runs" absorbs.
      assert.strictEqual(st.checkBlocks, expected.checkBlocks || 0,
        what + " rendered a different number of check blocks: " + describeState(st));
      assert.strictEqual(st.failedBlocks, expected.failedCheckBlocks || 0,
        what + " has a different number of FAILING check blocks: " + describeState(st) +
          "\n(a starter file's examples: block is part of the lesson -- see expectations.js)");
      break;

    case "interactive":
      assert.strictEqual(st.errorCount, 0,
        what + " should open an animation, but the editor showed an error: " + describeState(st));
      assert.ok(st.animating,
        what + " should open an interactive window, but none appeared: " + describeState(st));
      // Which kind: a reactor animation or a Bootstrap chart. Recorded rather
      // than accepted either way, so a file that stops charting and starts
      // animating (or the reverse) is a change worth seeing.
      const wantKind = expected.windowKind || "animation";
      assert.strictEqual(st.windowKind, wantKind,
        what + " should open " + (wantKind === "chart" ? "an Interactive Chart" : "a reactor animation") +
          " window: " + describeState(st));
      // Whether the window paints is part of the expectation, not a detail: a
      // reactor whose `to-draw:` the student has to write is SUPPOSED to open
      // an empty window (`drawsFrame: false`), and a reactor that should paint
      // and stops painting is exactly the regression this suite is for.
      if (expected.drawsFrame === false) {
        assert.ok(!st.drewFrame,
          what + " is expected to open an EMPTY animation window (its `to-draw:` is left for " +
            "the student), but it painted a frame: " + describeState(st));
      } else {
        assert.ok(st.drewFrame,
          what + " should paint a frame in its animation window, but the window stayed empty: " +
            describeState(st));
      }
      break;

    case "needs-google-login":
      assert.ok(st.errorCount > 0,
        what + " reads a Google Sheet, so unauthenticated it must fail at load-spreadsheet -- " +
          "but nothing errored. Did it get real data? " + describeState(st));
      // The whole point: the ONLY thing wrong is the missing Google session.
      // One error box, and it is that one -- a second box, or different text,
      // means the file itself broke and the Google failure is just noise on
      // top of it.
      assert.strictEqual(st.errorCount, 1,
        what + " should fail exactly once, at load-spreadsheet: " + describeState(st));
      assert.ok(st.errorText.indexOf(GOOGLE_AUTH_ERROR) !== -1,
        what + " should fail only for lack of a Google session (" +
          JSON.stringify(GOOGLE_AUTH_ERROR) + "), so anything else here is a real failure: " +
          describeState(st));
      break;

    case "placeholder":
      assert.ok(st.errorCount > 0,
        what + " ships with a placeholder for the student's own spreadsheet, so it must " +
          "fail until they replace it -- but nothing errored: " + describeState(st));
      assert.ok(st.errorText.indexOf(NO_SPREADSHEET) !== -1,
        what + " should fail at load-spreadsheet on its placeholder: " + describeState(st));
      for (const must of expected.errorContains || []) {
        assert.ok(st.errorText.indexOf(must) !== -1,
          what + " should name the placeholder text " + JSON.stringify(must) +
            ", but said: " + describeState(st));
      }
      break;

    case "teaching-error":
    case "broken-upstream": {
      const why = expected.outcome === "teaching-error"
        ? " is a deliberately-broken teaching file"
        : " has a known upstream bug (" + (expected.note || "see expectations.js") + ")";
      assert.ok(st.errorCount > 0,
        what + why + " and must still produce an error: " + describeState(st));
      if (expected.outcome === "teaching-error") {
        // The lesson is a mistake in the source, so the error has to be the
        // one the student is looking at -- a compile error, not something that
        // blows up later. (broken-upstream says nothing about the kind: an
        // accidental bug can be either, and errorContains is specific enough.)
        assert.ok(!st.runtimeError,
          what + why + ", so it should fail at COMPILE time, not at run time: " + describeState(st));
      }
      for (const must of expected.errorContains || []) {
        assert.ok(st.errorText.indexOf(must) !== -1,
          what + " should report " + JSON.stringify(must) + ", but said: " + describeState(st));
      }
      break;
    }
  }

}

/*
 * Evaluate an expression in the interactions window and return what rendered.
 * Deliberately NOT shared/cpo-assertions.evalAtReplNoError: that one demands a
 * clean result, and here "the REPL reported an error" is one of the answers we
 * want to assert about.
 */
async function evalAtRepl(page, code, timeout = 20000) {
  await inject(page);
  await page.waitFor("window.PA.replPromptVisible()", 15000);
  const before = await page.eval("window.PA.outputChildCount()");
  await page.eval("window.PA.evalAtRepl(" + JSON.stringify(code) + ")");
  await page.waitFor("window.PA.outputChildCount() > " + before, timeout);
  // Wait generously for the value to render. The TS-compiler flavor compiles
  // each interactions entry through its own bundle and is markedly slower than
  // the Pyret-hosted one, so a short poll here reads a half-rendered result and
  // reports it as "the interactions window errored" -- which is what three
  // library probes did on --compiler=ts while the very same expressions
  // answered correctly when run on their own.
  let res = null;
  for (let i = 0; i < 150; i++) {
    res = await page.eval("window.CUR.lastReplDescription()");
    if (res && (res.text !== "" || res.label)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const cls = await page.eval(
    "(function(){var ch=document.getElementById('output').children;" +
    "var el=ch[ch.length-1];return el?el.className:null;})()");
  return { cls, res };
}

/*
 * Probe the running program the way a student does: type something into the
 * interactions window and look at what comes back.
 *
 * A probe is [expression, expectedSubstring]. The substring is matched against
 * the rendered text OR the aria-label -- the label is how an IMAGE says what it
 * is ("a solid red rectangle of width 300 and height 200 ..."), and images are
 * most of what these files produce.
 */
async function runProbes(page, probes, what) {
  for (const [expr, expected] of probes) {
    const { cls, res } = await evalAtRepl(page, expr);
    assert.ok(
      cls && (cls.indexOf("echo-container") !== -1 || cls.indexOf("trace") !== -1),
      what + ": the interactions window errored on " + JSON.stringify(expr) +
        " -- last output child was " + JSON.stringify(cls) + ", rendered " +
        JSON.stringify(res));
    if (expected === null || expected === undefined) continue;
    const hay = [(res && res.text) || "", (res && res.label) || ""].join(" || ");
    assert.ok(
      hay.indexOf(expected) !== -1,
      what + ": " + JSON.stringify(expr) + " should render something containing " +
        JSON.stringify(expected) + ", but rendered " + JSON.stringify(hay.slice(0, 400)));
  }
}

module.exports = {
  GOOGLE_AUTH_ERROR,
  NO_SPREADSHEET,
  OUTCOMES,
  inject,
  runFile,
  assertOutcome,
  describeState,
  evalAtRepl,
  runProbes,
};
