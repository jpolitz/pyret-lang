/*
 * page-curriculum.js -- in-page predicates for judging a starter-file run,
 * injected as window.CUR (alongside window.PA from shared/page-assertions.js).
 *
 * A starter file is not shaped like an upstream test program, so three things
 * need describing that PA never has to: a program that is still running on
 * purpose (a reactor or an Interactive Chart, waiting for the student), which
 * KIND of error rendered (compile errors and runtime errors share the same
 * #output container -- a runtime error is the one carrying a .stacktrace),
 * and what the error said.
 */

function PYRET_CURRICULUM_PREDICATES() {
  const CUR = {
    /*
     * One snapshot of everything a judgment depends on, taken in a single
     * round trip so the pieces cannot disagree.
     *
     * "Is a run in flight?" is the editor's own synchronous claim
     * (data-pyret-running, set and cleared by repl-ui.js exactly with its
     * internal `running` flag). done additionally wants the prompt back and
     * the break button disabled -- afterRun's observable tail -- so "done"
     * means "a new Run would be accepted", not merely "the claim cleared".
     */
    runState() {
      const boxes = Array.from(document.querySelectorAll("#output .compile-error"));
      const br = document.getElementById("breakButton");
      const pc = document.querySelector(".prompt-container");
      const out = document.getElementById("output");
      const claimed = document.body.getAttribute("data-pyret-running") === "true";
      const promptVisible = !pc || pc.offsetParent !== null;
      // Both interactive shapes render as a jQuery UI dialog: a reactor holds
      // .repl-animation and paints a <canvas>; an Interactive Chart draws an
      // <svg>. Neither ever finishes on its own, so the window is the
      // evidence that the program reached its waiting-for-the-student state.
      const animation = document.querySelector(".ui-dialog .repl-animation");
      const chart = Array.prototype.filter.call(
        document.querySelectorAll(".ui-dialog"),
        (d) => !d.querySelector(".repl-animation") && !!d.querySelector("svg"))[0] || null;
      return {
        claimed: claimed,
        promptVisible: promptVisible,
        done: !claimed && promptVisible && !!br && br.disabled === true,
        animating: !!(animation || chart),
        windowKind: animation ? "animation" : (chart ? "chart" : null),
        // Separate from `animating`: a reactor whose to-draw: is left for the
        // student legitimately opens an empty window. A chart is only
        // recognised once its <svg> exists, so for charts this is true by
        // construction.
        drewFrame: animation ? !!animation.querySelector("canvas") : !!chart,
        errorCount: boxes.length,
        runtimeError: boxes.some((b) => !!b.querySelector(".stacktrace")),
        errorText: boxes.map((b) => (b.innerText || "").replace(/\s+/g, " ").trim()).join(" | "),
        outputText: out ? (out.innerText || "").replace(/\s+/g, " ").trim() : "",
        checkBlocks: document.querySelectorAll("#output .check-block").length,
        failedBlocks: document.querySelectorAll(
          "#output .check-block-failed, #output .check-block-errored").length,
      };
    },

    /*
     * Run-acceptance sentinel. repl-ui.js empties #output as a run's first
     * act, so a marker dropped in beforehand vanishing is the exact edge --
     * and it also exposes the case where a Run click is silently dropped by
     * the `if (running)` guard, which no amount of waiting would surface.
     */
    markRun() {
      const out = document.getElementById("output");
      if (!out) return false;
      const s = document.createElement("span");
      s.id = "__curriculum_run_mark";
      out.appendChild(s);
      return true;
    },
    runStarted() {
      return document.getElementById("__curriculum_run_mark") === null;
    },

    // What the last interactions-window entry rendered. The typed code is
    // echoed into #output immediately; the VALUE lands inside that entry
    // later, as .replOutput/.replTextOutput -- so until one exists there is
    // nothing to judge, and reading the entry any earlier reports the echo
    // of the question as if it were the answer. The result's aria-label
    // stands in for text where the value is an image ("a solid red
    // rectangle of width 300 ..."), which is most of what these files make.
    lastRendered() {
      const ch = document.getElementById("output").children;
      const el = ch[ch.length - 1];
      if (!el) return null;
      const r = el.querySelector(".replOutput, .replTextOutput");
      if (!r) return null;
      const label = r.getAttribute("aria-label");
      return {
        cls: el.className || "",
        text: (r.innerText || "").replace(/\s+/g, " ").trim(),
        label: label ? label.replace(/\s+/g, " ").trim() : "",
      };
    },

    // Click Stop if it is armed; report whether we actually clicked.
    stop() {
      const b = document.getElementById("breakButton");
      if (!b || b.disabled !== false) return false;
      b.click();
      return true;
    },

    // Dismiss any reactor/chart dialog so the next file gets a clean screen.
    closeInteractiveWindows() {
      let closed = 0;
      for (const d of Array.from(document.querySelectorAll(".ui-dialog"))) {
        const btn = d.querySelector(".ui-dialog-titlebar-close");
        if (btn) { btn.click(); closed++; }
      }
      return closed;
    },
  };
  window.CUR = CUR;
  return true;
}

// An IIFE expression, so a plain eval-string adapter can install it.
const SOURCE = "(" + PYRET_CURRICULUM_PREDICATES.toString() + ")()";

module.exports = { SOURCE };
