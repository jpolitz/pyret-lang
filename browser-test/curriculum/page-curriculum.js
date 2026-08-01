/*
 * page-curriculum.js
 *
 * In-page predicates for the curriculum suite, in the same style as
 * shared/page-assertions.js (which this suite also injects and relies on for
 * setDefinitions / run / breakDone / the REPL). Everything here runs inside the
 * editor document and returns plain JSON, so it works in any environment the
 * harness can reach.
 *
 * These exist because a starter file is not shaped like an upstream test
 * program. Three things upstream never has to describe:
 *
 *  - "the program is still running, on purpose". Many starter files end in
 *    `r.interact()` / `blastoff(...)`, which opens an animation and waits for
 *    the student. CPO renders that as a jQuery UI dialog holding
 *    `.repl-animation` with a <canvas> in it, and #breakButton stays enabled
 *    forever. `animating` is how we see that the program got all the way to a
 *    drawn frame; `stop()` is how we end it so the next file can reuse the
 *    editor.
 *
 *  - "which kind of error". CPO renders compile errors and runtime errors into
 *    the SAME `#output .compile-error` container -- the difference is that a
 *    runtime error carries a `.stacktrace`. Starter files legitimately produce
 *    each kind (a deliberately-buggy file must produce a compile error; a
 *    spreadsheet-backed file compiles fine and then fails at the Google call),
 *    so the two have to be told apart rather than lumped into "errored".
 *
 *  - "what the error said". Needed to distinguish "this editor cannot sign in
 *    to Google" from "this file is broken".
 */

function PYRET_CURRICULUM_ASSERTIONS() {
  const CUR = {
    // One snapshot of everything the outcome classification depends on, taken
    // in a single round trip so the pieces cannot disagree with each other.
    runState() {
      const out = document.getElementById("output");
      const boxes = Array.from(document.querySelectorAll("#output .compile-error"));
      const br = document.getElementById("breakButton");
      // "Is a run in flight?" is read off the interactions prompt, not off
      // #breakButton.
      //
      // repl-ui.js hides `.prompt-container` SYNCHRONOUSLY in runMainCode and
      // shows it again in afterRun, so it is an exact bracket around the run.
      // #breakButton is not: setWhileRunning enables it from a
      // setTimeout(..., RUNNING_SPINWHEEL_DELAY_MS = 1000), so for the first
      // second of every run the button still reads as idle. A poll landing in
      // that window sees "finished" with an empty #output -- and for the many
      // starter files that print nothing, that is indistinguishable from a
      // clean run. reactive/Package Delivery.arr is the case that caught this:
      // it reported a clean finish at 527ms and its actual well-formedness
      // error arrived at 5079ms.
      const pc = document.querySelector(".prompt-container");
      const promptVisible = !pc || pc.offsetParent !== null;
      // Two different ways a program deliberately takes over the screen and
      // then waits for the student, both drawn as a jQuery UI dialog:
      //
      //   animation  a reactor's `interact()`, whose content is
      //              `.repl-animation` and which paints into a <canvas>
      //   chart      Bootstrap's `scatter-plot`/`bar-chart`/... , which open
      //              an "Interactive Chart" window drawn as <svg>
      //
      // Both leave #breakButton live forever, so neither can be told apart
      // from a hang by the run lifecycle alone -- the window is the evidence.
      // Which of the two it is gets recorded in expectations, so a file that
      // switches from one to the other is a change rather than a detail.
      const animation = document.querySelector(".ui-dialog .repl-animation");
      const chart = Array.prototype.filter.call(
        document.querySelectorAll(".ui-dialog"),
        (d) => !d.querySelector(".repl-animation") && !!d.querySelector("svg"))[0] || null;
      // The editor's own synchronous claim (repl-ui sets it in
      // runMainCode/runner, clears it in afterRun). The prompt/button
      // reading below is kept as a cross-check, but this attribute is the
      // authoritative half: the prompt can be resurrected mid-run by a
      // queued fade, and the button armed by a stale timer, and both
      // conjured a false "done" that made the harness stop live runs.
      const claimed = document.body.getAttribute("data-pyret-running") === "true";
      return {
        promptVisible: promptVisible,
        done: !claimed && promptVisible && !!br && br.disabled === true,
        animating: !!(animation || chart),
        windowKind: animation ? "animation" : (chart ? "chart" : null),
        // ...and it painted. Separate from `animating` because a reactor with
        // its `to-draw:` commented out -- which is the assignment in several
        // Bootstrap:2 files -- legitimately opens the window and draws
        // nothing. A chart window is only recognised once its <svg> exists,
        // so for charts this is true by construction.
        drewFrame: animation ? !!animation.querySelector("canvas") : !!chart,
        errorCount: boxes.length,
        // A `.stacktrace` under the error box means the program compiled and
        // then failed while running.
        runtimeError: boxes.some((b) => !!b.querySelector(".stacktrace")),
        errorText: boxes.map((b) => (b.innerText || "").replace(/\s+/g, " ").trim()).join(" | "),
        outputText: out ? (out.innerText || "").replace(/\s+/g, " ").trim() : "",
        // Check/examples results. Safe to read as soon as `done` is true:
        // repl-ui.js runs afterRun (which is what re-shows the prompt) in the
        // .fin() of the displayResult promise, so the blocks are in the DOM
        // before the prompt comes back.
        checkBlocks: document.querySelectorAll("#output .check-block").length,
        failedBlocks: document.querySelectorAll(
          "#output .check-block-failed, #output .check-block-errored").length,
      };
    },

    // Did the run we just asked for actually begin? repl-ui.js's runMainCode
    // empties #output as its first act, so a sentinel dropped in beforehand
    // vanishing is an exact edge. It also catches the case runMainCode handles
    // with `if(running) { return; }`: a Run clicked while something is still
    // in flight is silently ignored, and without this the harness would go on
    // to judge the PREVIOUS program's output as this file's.
    markRun() {
      const out = document.getElementById("output");
      if (!out) return false;
      const mark = document.createElement("span");
      mark.id = "__curriculum_run_mark";
      out.appendChild(mark);
      return true;
    },
    runStarted() {
      return document.getElementById("__curriculum_run_mark") === null;
    },

    // Press Stop. Returns whether there was anything to stop, which is itself
    // informative: a file we expected to be interactive that had already
    // finished is a change worth seeing.
    stop() {
      const b = document.getElementById("breakButton");
      if (b && !b.disabled) { b.click(); return true; }
      return false;
    },

    // Close any animation dialogs left over from a previous file. They are
    // draggable overlays over the whole page, and a stale one would sit on top
    // of the next file's own animation.
    // Close any animation or chart windows left over from a previous file.
    // They are draggable overlays over the whole page, and one that survives
    // would sit on top of the next file's own window -- and, worse, make the
    // next file look like it drew one when it did not.
    //
    // Clicking the titlebar's close button is the student's gesture and is
    // tried first; anything still standing after that is removed outright,
    // because by this point the program behind it has already been stopped and
    // a stale overlay would corrupt every later reading.
    closeInteractiveWindows() {
      const bs = document.querySelectorAll(".ui-dialog .ui-dialog-titlebar-close");
      for (let i = 0; i < bs.length; i++) bs[i].click();
      let removed = 0;
      document.querySelectorAll(".ui-dialog").forEach((d) => { d.remove(); removed++; });
      return { clicked: bs.length, removed: removed };
    },

    // The rendered description of the last REPL value. CPO puts an aria-label
    // on rendered values -- for an image it is the scene description ("a solid
    // red rectangle of width 300 and height 200 ..."), which is the only
    // machine-readable handle on "an image actually drew". Falls back to the
    // text for non-image values.
    lastReplDescription() {
      const ch = document.getElementById("output").children;
      const el = ch[ch.length - 1];
      if (!el) return null;
      const r = el.querySelector(".replOutput, .replTextOutput");
      if (!r) return null;
      const label = r.getAttribute("aria-label");
      return {
        cls: el.className,
        label: label ? label.replace(/\s+/g, " ").trim() : null,
        text: (r.innerText || "").replace(/\s+/g, " ").trim(),
      };
    },

    // ----- lifecycle timeline ------------------------------------------
    //
    // Timestamped record of every #breakButton disabled-flip and every
    // prompt-container visibility change, plus harness-placed markers. This
    // exists because the stopClicked=true failures require the break button
    // to become ENABLED inside the ~25ms between the harness's done-poll
    // (which requires it disabled) and its stop() call -- and the only
    // enabler in repl-ui.js is setWhileRunning's 1s timer, whose schedule
    // cannot obviously hit that window. The observer sees which flip
    // actually happened and when, instead of us inferring it.
    //
    // MutationObserver callbacks run as microtasks, so entries land in
    // event-loop order with ~no perturbation of the page.
    startLifecycleLog() {
      if (window.__CUR_LC_OBS) { window.__CUR_LC_OBS.disconnect(); }
      const log = [];
      window.__CUR_LC = log;
      const t0 = performance.now();
      window.__CUR_LC_T0 = t0;
      const push = (ev, detail) =>
        log.push({ t: Math.round((performance.now() - t0) * 10) / 10, ev: ev, detail: detail });
      const br = document.getElementById("breakButton");
      const pc = document.querySelector(".prompt-container");
      push("start", {
        breakDisabled: !!(br && br.disabled),
        promptVisible: !pc || pc.offsetParent !== null,
      });
      const obs = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.target === br && m.attributeName === "disabled") {
            push("break", { disabled: br.disabled });
          } else if (pc && (m.target === pc)) {
            push("prompt", { visible: pc.offsetParent !== null });
          }
        }
      });
      if (br) obs.observe(br, { attributes: true, attributeFilter: ["disabled"] });
      if (pc) obs.observe(pc, { attributes: true, attributeFilter: ["style", "class"] });
      window.__CUR_LC_OBS = obs;
      return true;
    },
    markLifecycle(name) {
      if (!window.__CUR_LC) return false;
      window.__CUR_LC.push({
        t: Math.round((performance.now() - window.__CUR_LC_T0) * 10) / 10,
        ev: "mark", detail: name,
      });
      return true;
    },
    drainLifecycleLog() {
      const log = window.__CUR_LC || [];
      if (window.__CUR_LC_OBS) { window.__CUR_LC_OBS.disconnect(); window.__CUR_LC_OBS = null; }
      window.__CUR_LC = null;
      return log;
    },
  };
  window.CUR = CUR;
  return true;
}

const SOURCE = "(" + PYRET_CURRICULUM_ASSERTIONS.toString() + ")()";

module.exports = { SOURCE };
