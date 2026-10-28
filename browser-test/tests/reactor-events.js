/*
 * reactor-events.js -- a reactor's `on-event` option subscribes to custom
 * event sources for the lifetime of the interaction: values emitted by the
 * source reach the handler in order, stop-when ends the subscription, and a
 * handler error surfaces like any other reactor error.
 */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { IDLE, install, runProgram, outputHas, waitOrFail } = require("./helpers");

const TRACE_PROGRAM = [
  "import reactors as R",
  "r = reactor:",
  "  init: 0,",
  "  on(R.every(0.05)): lam(w, n): w + n end,",
  "  stop-when: lam(w): w >= 10 end,",
  "  close-when-stop: true",
  "end",
  "r.start-trace().interact().get-trace()",
  "",
].join("\n");

const MIXED_PROGRAM = [
  "import reactors as R",
  "fast = R.every(0.02)",
  "slow = R.every(0.11)",
  "r = reactor:",
  "  init: {fast: 0, slow: 0, ticks: 0},",
  "  seconds-per-tick: 0.01,",
  "  on-tick: lam(w): w.{ticks: w.ticks + 1} end,",
  "  on(fast): lam(w, n): w.{fast: n} end,",
  "  on-event: [list: R.on(slow, lam(w, n): w.{slow: n} end)],",
  "  stop-when: lam(w): w.slow >= 2 end,",
  "  close-when-stop: true",
  "end",
  "final = r.interact().get-value()",
  "check:",
  "  final.slow is 2",
  "  final.fast >= 5 is true",
  "  final.ticks >= 10 is true",
  "end",
  "",
].join("\n");

const ERROR_PROGRAM = [
  "import reactors as R",
  "r = reactor:",
  "  init: 0,",
  "  on-event: [list: R.on(R.every(0.05), lam(w, n): raise(\"boom from the handler\") end)]",
  "end",
  "r.interact()",
  "",
].join("\n");

const TYPED_PROGRAM = [
  "import reactors as R",
  "fun add(w :: Number, n :: Number) -> Number: w + n end",
  "r :: R.Reactor<Number> = reactor:",
  "  init: 0,",
  "  on(R.every(0.05)): add",
  "end",
  "check:",
  "  R.react(r, R.custom-event(R.every(1), 4)) raises \"No on-event handler\"",
  "  e :: R.Event = R.custom-event(R.every(1), 4)",
  "  R.react(r.react(e), R.custom-event(R.every(1), 2)) raises \"No on-event handler\"",
  "end",
  "",
].join("\n");

// Count the interval timers started by R.every (its callback is the only one
// on the page that emits a Pyret number), so the test can see that a source
// subscribed by a running reactor is torn down again when the reactor stops.
const COUNT_INTERVALS = `(function(){
  if (window.__intervalStats) { window.__intervalStats.set = 0; window.__intervalStats.cleared = 0; return true; }
  var stats = window.__intervalStats = { set: 0, cleared: 0, live: new Set() };
  var realSet = window.setInterval, realClear = window.clearInterval;
  window.setInterval = function(fn) {
    var id = realSet.apply(window, arguments);
    if (String(fn).indexOf("emit(") !== -1) { stats.set += 1; stats.live.add(id); }
    return id;
  };
  window.clearInterval = function(id) {
    if (stats.live.has(id)) { stats.cleared += 1; stats.live.delete(id); }
    return realClear.apply(window, arguments);
  };
  return true;
})()`;

module.exports = function registerReactorEvents(getSession) {
  test("stopping the reactor unsubscribes its event sources",
    { timeout: 120000 }, async () => {
      const page = getSession().page;
      await page.eval(COUNT_INTERVALS);
      await runProgram(page, TRACE_PROGRAM);
      await waitOrFail(page, `${outputHas("[list: 0, 1, 3, 6, 10]")} && ${IDLE}`, 60000,
        "the traced reactor never produced the expected trace");
      const stats = await page.eval(
        "({set: window.__intervalStats.set, cleared: window.__intervalStats.cleared})");
      assert.ok(stats.set >= 1, "the every() source never started its timer");
      assert.equal(stats.cleared, stats.set,
        "a timer started by an event source outlived the reactor");
    });

  test("an on-event program runs under the type checker",
    { timeout: 120000 }, async () => {
      const page = getSession().page;
      await install(page, TYPED_PROGRAM);
      await page.eval("window.PA.clearOutput()");
      await page.eval("window.PA.runTypeCheck()");
      await waitOrFail(page, `${outputHas("Looks shipshape")} && ${IDLE}`, 60000,
        "the typed on-event program did not pass its check block");
    });

  test("custom event values reach the reactor in order until stop-when",
    { timeout: 120000 }, async () => {
      const page = getSession().page;
      await runProgram(page, TRACE_PROGRAM);
      await waitOrFail(page, `${outputHas("[list: 0, 1, 3, 6, 10]")} && ${IDLE}`, 60000,
        "the traced reactor never produced the expected trace");
    });

  test("on-tick and several event sources interleave in one reactor",
    { timeout: 120000 }, async () => {
      const page = getSession().page;
      await runProgram(page, MIXED_PROGRAM);
      await waitOrFail(page, `${outputHas("Looks shipshape")} && ${IDLE}`, 60000,
        "the mixed reactor's check block did not pass");
    });

  test("an error in an on-event handler ends the interaction with that error",
    { timeout: 120000 }, async () => {
      const page = getSession().page;
      await runProgram(page, ERROR_PROGRAM);
      await waitOrFail(page, `${outputHas("boom from the handler")} && ${IDLE}`, 60000,
        "the handler error was not reported");
      await runProgram(page, "40 + 2\n");
      await waitOrFail(page, `${outputHas("42")} && ${IDLE}`, 30000,
        "a run after the failed reactor never produced its result");
    });
};
