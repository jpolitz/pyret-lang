/*
 * page-assertions.js
 *
 * A driver-agnostic, IN-PAGE port of the content predicates from
 * code.pyret.org/test-util/util.js. Everything here runs *inside the editor
 * document* (the CPO editor, whether it is a top-level page, an embed iframe,
 * or a vscode webview frame) and returns plain JSON. It has no dependency on
 * selenium or playwright, so the SAME predicate code can be evaluated by any
 * runner.
 *
 * Each function mirrors the corresponding logic in util.js. The mapping:
 *   util.setDefinitions / setCodemirror        -> PA.setDefinitions
 *   util.evalDefinitions                        -> PA.run / PA.runTypeCheck
 *   util.waitForBreakButton (elementIsDisabled) -> PA.breakDone
 *   util.pyretLoaded                            -> PA.pyretLoaded
 *   util.checkAllTestsPassed                    -> PA.shipshapeResult + waits
 *   util.testErrorRendersString                 -> PA.compileErrorPresent + PA.outputText
 *   util.testRunsAndHasCheckBlocks              -> PA.collectCheckBlocks
 *
 * This module exports the browser-side source as a string (SOURCE) that a
 * runner injects once to define `window.PA`, plus the node-side orchestration
 * in cpo-assertions.js calls into it.
 */

// The function below is stringified and injected into the editor frame.
function PYRET_PAGE_ASSERTIONS() {
  const PA = {
    // ---- readiness ----
    pyretLoaded() {
      const loader = document.getElementById("loader");
      if (!loader) return true; // loader already removed
      return getComputedStyle(loader).display === "none";
    },
    cmPresent() {
      const cm = document.querySelector(".CodeMirror");
      return !!(cm && cm.CodeMirror);
    },
    editorReady() {
      return PA.pyretLoaded() && PA.cmPresent();
    },

    // ---- input (mirrors util.setCodemirror on the definitions CM) ----
    setDefinitions(code) {
      const CM = document.querySelector(".CodeMirror").CodeMirror;
      const first = CM.firstLine();
      const last = CM.lastLine();
      CM.replaceRange(code, { line: first, ch: 0 }, { line: last + 1, ch: 0 });
      return true;
    },
    run() {
      document.getElementById("runButton").click();
      return true;
    },
    // Empty #output before a run. CPO clears output on run, but when we reuse a
    // single frame across many sequential programs (instead of a fresh page per
    // test as upstream chart.js does), this removes any chance of reading the
    // previous run's stale .testing-summary / .check-results-done-rendering
    // before the new run repopulates them.
    clearOutput() {
      const out = document.getElementById("output");
      if (out) out.innerHTML = "";
      return true;
    },
    runTypeCheck() {
      document.getElementById("runDropdown").click();
      document.getElementById("select-tc-run").click();
      return true;
    },

    // ---- run lifecycle ----
    breakDone() {
      // util.waitForBreakButton waits until #breakButton is disabled.
      const b = document.getElementById("breakButton");
      return !!b && b.disabled === true;
    },
    testingSummaryPresent() {
      return !!document.querySelector("#output .testing-summary");
    },
    doneRendering() {
      return !!document.querySelector(".check-results-done-rendering");
    },
    compileErrorPresent() {
      return !!document.querySelector("#output .compile-error");
    },

    // ---- output reading (mirrors the "remove output CodeMirrors then read
    // text" pattern used by testErrorRendersString / testRunsAndHasCheckBlocks
    // to avoid false positives from the code snippets) ----
    removeOutputCodeMirrors() {
      document.querySelectorAll("#output .CodeMirror").forEach((e) => e.remove());
      return true;
    },
    outputText() {
      const out = document.getElementById("output");
      return out ? out.innerText : "";
    },

    // ---- checkAllTestsPassed: "Looks shipshape" present => pass; otherwise
    // collect failed/errored blocks for the error message (mirrors util.js). ----
    shipshapeResult() {
      const out = document.getElementById("output");
      const text = out ? out.innerText : "";
      const shipshape = text.indexOf("Looks shipshape") !== -1;
      const failedEls = out
        ? Array.from(out.querySelectorAll(".check-block-failed, .check-block-errored"))
        : [];
      const failures = failedEls.map((cb) => {
        const header = cb.querySelector(".check-block-header");
        if (header) header.click();
        const tests = Array.from(cb.querySelectorAll(".check-block-test"));
        return tests.length === 0 ? [cb.innerText] : tests.map((t) => t.innerText);
      });
      return { shipshape, failures };
    },

    // ---- testRunsAndHasCheckBlocks: gather check blocks (skipping the first,
    // exactly like util.js's cbs.slice(1)), expand each, read its tests; if a
    // block has no .check-block-test children, treat it as specLen "Passed". ----
    collectCheckBlocks(specLens) {
      const out = document.getElementById("output");
      const cbs = out ? Array.from(out.querySelectorAll(".check-block")) : [];
      return cbs.slice(1).map((cb, i) => {
        const header = cb.querySelector(".check-block-header");
        if (header) header.click();
        const tests = Array.from(cb.querySelectorAll(".check-block-test"));
        if (tests.length === 0) {
          return new Array(specLens[i]).fill("Passed");
        }
        return tests.map((t) => t.innerText);
      });
    },
  };
  window.PA = PA;
  return true;
}

// Serialize the function body so a runner can inject it: `(<fn>)()`.
const SOURCE = "(" + PYRET_PAGE_ASSERTIONS.toString() + ")()";

module.exports = { SOURCE };
