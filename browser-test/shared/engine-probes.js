/*
 * engine-probes.js -- assertions about the JS engine an env is ACTUALLY running.
 *
 * Why this exists: --env=ios-safari was built to run the suite against Safari 17
 * on an iOS 17.0 simulator, and it reported a clean 236/236 on a branch whose
 * built cpo-main.jarr provably contained `rawCounts.entries().map(...)` -- an
 * iterator-helpers call that Safari did not ship until 18.4. The buggy path ran
 * (dot-chart-test.arr renders a categorical dot chart, pixel assertions and all)
 * and did not throw, because the iOS Simulator runs against the HOST's
 * frameworks, and the host was a runner with Safari 26.5. The label said 17;
 * the engine was not 17.
 *
 * A version-shaped tier that silently tests the wrong engine is worse than no
 * tier at all: it converts "we have old-Safari coverage" into a false belief.
 * So an env that claims to be an old engine declares `engineExpectations`, and
 * these probes hold it to that claim -- if the engine turns out to be newer than
 * advertised, the run fails loudly instead of passing vacuously.
 *
 * Each probe is an expression evaluated in the editor frame, returning a boolean
 * "does this engine have the feature". Keep them cheap and dependency-free.
 */

const PROBES = [
  {
    key: "iterator-helpers",
    // Iterator.prototype.map and friends. Safari shipped these in 18.4;
    // Chrome 122, Firefox 131, Node 22. This is the one charts-lib tripped on.
    expr: "typeof Array(3).keys().map === 'function'",
    shippedIn: "Safari 18.4",
  },
  {
    key: "array-at",
    // Array.prototype.at -- Safari 15.4. A sanity probe: it should be true
    // everywhere we care about, so a false here means the probe plumbing itself
    // is broken rather than the engine being interesting.
    expr: "typeof Array.prototype.at === 'function'",
    shippedIn: "Safari 15.4",
  },
  {
    key: "async-param-redeclare",
    // WebKit bug 223533: a `var` redeclaring a parameter inside an async
    // function read as undefined. Fixed in Safari 17.4. True means "engine is
    // correct here". Silent wrong-value bug, and a shape code generators emit,
    // so it is worth probing behaviorally rather than by version number.
    expr:
      "(function () { var ok = false;" +
      "  var f = async function (a) { var a; ok = (a === 'x'); };" +
      "  f('x'); return ok; })()",
    shippedIn: "Safari 17.4 (bug 223533 fix)",
  },
];

// Evaluate every probe; returns { key: boolean }.
async function runProbes(page) {
  const results = {};
  for (const p of PROBES) {
    try {
      results[p.key] = !!(await page.eval(p.expr));
    } catch (e) {
      results[p.key] = "error: " + ((e && e.message) || e);
    }
  }
  return results;
}

// Compare probe results against an env's declared expectations.
// Returns a list of human-readable mismatch descriptions (empty means the env
// is running the engine it claims to be).
function checkExpectations(results, expectations) {
  const problems = [];
  for (const [key, expected] of Object.entries(expectations || {})) {
    const probe = PROBES.find((p) => p.key === key);
    const actual = results[key];
    if (actual === expected) continue;
    problems.push(
      key + ": expected " + expected + ", got " + actual +
        (probe ? " (feature shipped in " + probe.shippedIn + ")" : "")
    );
  }
  return problems;
}

module.exports = { PROBES, runProbes, checkExpectations };
