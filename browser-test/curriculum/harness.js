/*
 * harness.js -- fetch a starter file, run it, judge it, probe it.
 *
 * Failure taxonomy matches browser-test proper (shared/errors.js): a wrong
 * outcome is a node:assert AssertionError; a step that could not be carried
 * out at all (the editor never accepted the run, a probe never rendered) is a
 * ProceduralError. The caller treats EITHER as grounds to reboot the editor
 * before the next file -- see tests/curriculum.test.js.
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ProceduralError } = require("../shared/errors");
const CUR = require("./page-curriculum");

const RAW = "https://raw.githubusercontent.com";

// The message CPO surfaces when gdrive-sheets asks for the Sheets API on a
// page with no Google session (authenticate-storage.js rejects with exactly
// this). It is what every readsSheet file must die with on a sheetless
// editor.
const GOOGLE_AUTH_ERROR = "no gapi.client";

/* ------------------------------------------------------------- fetching */

function starterFileUrl(manifest, entry) {
  const ref = entry.ref || manifest.starterFiles.ref;
  const encoded = entry.path.split("/").map(encodeURIComponent).join("/");
  return `${RAW}/bootstrapworld/starter-files/${ref}/${encoded}`;
}

function cachePath(manifest, entry) {
  const ref = entry.ref || manifest.starterFiles.ref;
  const safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, "_");
  return path.join(__dirname, ".cache", safe(ref), safe(entry.path));
}

// The file's text, from the on-disk cache or the network. The manifest is
// static, so this is the suite's only network dependency per file.
async function fetchStarter(manifest, entry) {
  const file = cachePath(manifest, entry);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const url = starterFileUrl(manifest, entry);
  const resp = await fetch(url, { headers: { "user-agent": "pyret-browser-test" } });
  if (!resp.ok) {
    throw new ProceduralError(`GET ${url} -> ${resp.status} ${resp.statusText}`);
  }
  const text = await resp.text();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

/* -------------------------------------------------------------- running */

async function inject(page) {
  await page.inject();
  await page.eval(CUR.SOURCE);
}

// Install text and confirm CodeMirror holds it (hosts that bind CM to a
// document can push contents back over a single write).
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
 * Run one starter file and return the state to judge.
 *
 * Two ways to be finished, and they are not interchangeable: a batch program
 * reaches runState().done; an interactive one never does and instead opens a
 * window -- which gets a paint window (paintMs) before an unpainted one is
 * accepted as final, because the dialog opens before the first frame lands.
 */
async function runFile(page, code, { what, timeout = 180000, startTimeout = 30000, paintMs = 8000 } = {}) {
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
      "the editor never started running " + what + " (Run was clicked but #output " +
      "was never cleared)");
  }

  let st = null;
  let animatingSince = 0;
  while (Date.now() - t0 < timeout) {
    await new Promise((r) => setTimeout(r, 500));
    st = await page.eval("window.CUR.runState()");
    if (st.animating) {
      if (st.drewFrame) break;
      if (animatingSince === 0) animatingSince = Date.now();
      if (Date.now() - animatingSince >= paintMs) break;
      continue;
    }
    if (st.done) break;
  }
  if (st === null) throw new ProceduralError("never observed a run state for " + what);
  st.elapsedMs = Date.now() - t0;
  st.timedOut = !st.animating && !st.done;
  return st;
}

/*
 * Return the editor to idle after a judged run, whatever the run did: stop an
 * animating program (the break button is its only off switch, and it arms on
 * repl-ui's 1s timer), dismiss its window, and wait for done. A caller whose
 * editor will not settle should throw -- and reboot.
 */
async function settle(page, what) {
  const st = await page.eval("window.CUR.runState()");
  if (st.animating || st.claimed) {
    try {
      await page.waitFor(
        "(function(){var b=document.getElementById('breakButton');return !!(b && !b.disabled);})()",
        5000);
      await page.eval("window.CUR.stop()");
    } catch (e) { /* nothing armed to stop; fall through to the idle wait */ }
  }
  await page.eval("window.CUR.closeInteractiveWindows()");
  try {
    await page.waitFor("window.CUR.runState().done", 20000);
  } catch (e) {
    throw new ProceduralError("the editor would not return to idle after " + what);
  }
}

/* -------------------------------------------------------------- judging */

function describe(st) {
  return JSON.stringify({
    done: st.done, animating: st.animating, windowKind: st.windowKind,
    drewFrame: st.drewFrame, timedOut: st.timedOut,
    errorCount: st.errorCount, runtimeError: st.runtimeError,
    errorText: (st.errorText || "").slice(0, 400),
    checkBlocks: st.checkBlocks, failedBlocks: st.failedBlocks,
    outputText: (st.outputText || "").slice(0, 200), elapsedMs: st.elapsedMs,
  }, null, 2);
}

/*
 * Judge a run against its spec row.
 *
 * publicSheets says whether THIS editor can reach Google Sheets. A readsSheet
 * file on a sheetless editor is judged as "blocked at Google auth" whatever
 * its recorded outcome -- precisely one error, and it is the auth one. That
 * is a real check (Pyret compiles the whole program before running any of
 * it, so dying inside load-spreadsheet proves the file compiled and every
 * import resolved), and running with --sheets=none is also what verifies the
 * readsSheet markings themselves.
 */
function judge(st, spec, { publicSheets, what }) {
  assert.ok(!st.timedOut,
    what + " neither finished nor opened an interactive window in time: " + describe(st));

  if (spec.readsSheet && !publicSheets) {
    assert.ok(st.errorCount > 0,
      what + " reads a Google Sheet, so on this sheetless editor it must fail at " +
      "load-spreadsheet -- but nothing errored. Did it get data? " + describe(st));
    assert.strictEqual(st.errorCount, 1,
      what + " should fail exactly once, at the Google call: " + describe(st));
    assert.ok(st.errorText.indexOf(GOOGLE_AUTH_ERROR) !== -1,
      what + " should fail only for lack of a Google session (" +
      JSON.stringify(GOOGLE_AUTH_ERROR) + "): " + describe(st));
    return { probed: false };
  }

  switch (spec.outcome) {
    case "runs":
      assert.strictEqual(st.errorCount, 0,
        what + " should run clean, but the editor showed an error: " + describe(st));
      assert.ok(st.done,
        what + " should finish, but it was still running: " + describe(st));
      assert.strictEqual(st.checkBlocks, spec.checkBlocks || 0,
        what + " rendered a different number of check blocks: " + describe(st));
      assert.strictEqual(st.failedBlocks, spec.failedCheckBlocks || 0,
        what + " has a different number of FAILING check blocks (a starter file's " +
        "examples: are part of the lesson -- some are meant to fail until the student " +
        "writes the function): " + describe(st));
      return { probed: true };

    case "interactive": {
      assert.strictEqual(st.errorCount, 0,
        what + " should open an interactive window, but the editor showed an error: " + describe(st));
      assert.ok(st.animating,
        what + " should open an interactive window, but none appeared: " + describe(st));
      const wantKind = spec.windowKind || "animation";
      assert.strictEqual(st.windowKind, wantKind,
        what + " should open " + (wantKind === "chart" ? "an Interactive Chart" : "a reactor animation") +
        ": " + describe(st));
      if (spec.drawsFrame === false) {
        assert.ok(!st.drewFrame,
          what + " should open an EMPTY window (its to-draw: is the student's to write), " +
          "but it painted a frame: " + describe(st));
      } else {
        assert.ok(st.drewFrame,
          what + " should paint a frame, but its window stayed empty: " + describe(st));
      }
      return { probed: false };
    }

    case "errors": {
      assert.ok(st.errorCount > 0,
        what + " must error (" + (spec.note || "see its spec row") + "), but ran clean: " +
        describe(st));
      if (spec.compileError) {
        assert.ok(!st.runtimeError,
          what + " must fail at COMPILE time (the mistake is the one the student is " +
          "looking at), not at run time: " + describe(st));
      }
      for (const must of spec.errorContains || []) {
        assert.ok(st.errorText.indexOf(must) !== -1,
          what + " should report " + JSON.stringify(must) + ", but said: " + describe(st));
      }
      return { probed: false };
    }

    default:
      throw new Error("unknown outcome " + JSON.stringify(spec.outcome) + " for " + what);
  }
}

/* -------------------------------------------------------------- probing */

// Evaluate one expression in the interactions window and return what
// rendered. Refuses to type while the editor claims a run in flight -- text
// typed into a running editor is silently dropped.
async function evalAtRepl(page, code, timeout = 30000) {
  await page.waitFor(
    "window.PA.replPromptVisible() && document.body.getAttribute('data-pyret-running') !== 'true'",
    15000);
  const before = await page.eval("window.PA.outputChildCount()");
  await page.eval("window.PA.evalAtRepl(" + JSON.stringify(code) + ")");
  await page.waitFor("window.PA.outputChildCount() > " + before, timeout);
  // Give the value time to render fully -- the ts flavor compiles each entry
  // and is slower than stock; reading a half-rendered result reports a
  // phantom error.
  let res = null;
  for (let i = 0; i < 150; i++) {
    res = await page.eval("window.CUR.lastRendered()");
    if (res && (res.text !== "" || res.label !== "")) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return res;
}

// Type each spec.repl entry and hold it to its expectation. An entry is
// [expression, expectedSubstring|null]; the substring is matched against the
// rendered text or an image's aria-label; null means "evaluates and renders".
async function runRepl(page, entries, what) {
  for (const [expr, expected] of entries) {
    const res = await evalAtRepl(page, expr);
    const ok = res && (res.cls.indexOf("echo-container") !== -1 || res.cls.indexOf("trace") !== -1);
    assert.ok(ok,
      what + ": the interactions window errored on " + JSON.stringify(expr) +
      " -- last output child was " + JSON.stringify(res && res.cls) +
      ", rendered " + JSON.stringify(res && (res.text || res.label)));
    if (expected === null || expected === undefined) continue;
    const hay = ((res.text || "") + " || " + (res.label || ""));
    assert.ok(hay.indexOf(expected) !== -1,
      what + ": " + JSON.stringify(expr) + " should render something containing " +
      JSON.stringify(expected) + ", but rendered " + JSON.stringify(hay.slice(0, 400)));
  }
}

module.exports = {
  GOOGLE_AUTH_ERROR,
  starterFileUrl,
  fetchStarter,
  inject,
  installDefinitions,
  runFile,
  settle,
  judge,
  describe,
  evalAtRepl,
  runRepl,
};
