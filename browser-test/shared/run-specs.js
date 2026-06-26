/*
 * run-specs.js -- run a list of loaded CPO specs against a `page` adapter using
 * the shared cpo-assertions (which delegate DOM work to window.PA). Returns
 * {pass, fail, failures}. Used by both the CPO fidelity check and the vscode
 * webview runner so they exercise identical assertions on identical inputs.
 */
const A = require("./cpo-assertions");

async function runOneSpec(page, s) {
  if (s.kind === "checkBlocks") {
    return A.testRunsAndHasCheckBlocks(page, s.code, s.specs, s.options);
  } else if (s.kind === "errorString") {
    return A.testErrorRendersString(page, s.code, s.expected, s.options);
  } else if (s.kind === "pyretFile") {
    return A.runAndCheckAllTestsPassed(page, s.code, s.program, s.baseTimeout || 900000);
  } else if (s.kind === "allTestsPass") {
    return A.runAndCheckAllTestsPassed(page, s.code, s.name, 20000);
  }
  throw new Error("run-specs: unsupported spec kind: " + s.kind);
}

async function runSpecs(page, specs, opts) {
  opts = opts || {};
  const log = opts.log || function () {};
  const out = { pass: 0, fail: 0, failures: [] };
  for (const s of specs) {
    const label = s.name || s.program || "(unnamed)";
    try {
      await runOneSpec(page, s);
      out.pass++;
      log("  ✔ " + label);
    } catch (e) {
      out.fail++;
      out.failures.push({ label, error: e.message });
      log("  ✘ " + label + " :: " + String(e.message).split("\n")[0]);
    }
  }
  return out;
}

module.exports = { runSpecs, runOneSpec };
