/*
 * cpo-assertions.js
 *
 * Node-side orchestration that reproduces the upstream assertion functions from
 * code.pyret.org/test-util/util.js, but expressed against an abstract `page`
 * adapter (so the same assertions run over Selenium, Playwright, or anything
 * that can evaluate JS in the editor frame). The DOM-level work is delegated to
 * window.PA (shared/page-assertions.js), which is a line-for-line port of the
 * util.js predicates.
 *
 * `page` adapter contract:
 *   page.inject()                  -> Promise   ; ensure window.PA is defined
 *   page.eval(exprString)          -> Promise<any> ; evaluate expr in editor frame
 *   page.waitFor(exprString, ms)   -> Promise   ; poll expr until truthy / throw on timeout
 */

// mirrors util.js ensureRendered
function ensureRendered(text) {
  if (text.indexOf("One or more internal errors") > -1) {
    throw new Error(
      'Internal error occurred while rendering output.  Text content of error "' + text + '"'
    );
  }
}

// mirrors util.setDefinitionsEvalAndWait (set definitions, run, wait for break btn)
async function setDefinitionsRunAndWait(page, code, options) {
  await page.inject();
  await page.eval("window.PA.setDefinitions(" + JSON.stringify(code) + ")");
  await page.eval("window.PA.clearOutput()");
  if (options && options.typeCheck) {
    await page.eval("window.PA.runTypeCheck()");
  } else {
    await page.eval("window.PA.run()");
  }
  await page.waitFor("window.PA.breakDone()", 30000);
}

// mirrors util.checkAllTestsPassed
async function checkAllTestsPassed(page, name, timeout) {
  await page.inject();
  await page.waitFor("window.PA.testingSummaryPresent()", timeout || 20000);
  await page.waitFor("window.PA.doneRendering()", 20000);
  const res = await page.eval("window.PA.shipshapeResult()");
  if (res.shipshape) return true;
  throw new Error("Expected all tests to pass, but got: " + JSON.stringify(res.failures));
}

// mirrors util.runAndCheckAllTestsPassed
async function runAndCheckAllTestsPassed(page, code, name, timeout) {
  await page.inject();
  await page.eval("window.PA.setDefinitions(" + JSON.stringify(code) + ")");
  await page.eval("window.PA.clearOutput()");
  await page.eval("window.PA.run()");
  // Wait for the run to actually finish (break button disabled) before reading,
  // so a reused frame can't observe the previous program's results.
  await page.waitFor("window.PA.breakDone()", timeout || 900000);
  return checkAllTestsPassed(page, name, timeout);
}

// mirrors util.testErrorRendersString
async function testErrorRendersString(page, code, expected, options) {
  await setDefinitionsRunAndWait(page, code, options);
  await page.waitFor("window.PA.compileErrorPresent()", 6000);
  await page.eval("window.PA.removeOutputCodeMirrors()");
  const text = await page.eval("window.PA.outputText()");
  ensureRendered(text);
  if (text.indexOf(expected) === -1) {
    throw new Error('Text content of error "' + text + '" did not match "' + expected + '"');
  }
  return true;
}

// mirrors util.testRunsAndHasCheckBlocks
async function testRunsAndHasCheckBlocks(page, code, specs, options) {
  await setDefinitionsRunAndWait(page, code, options);
  await page.waitFor("window.PA.doneRendering()", 20000);
  await page.eval("window.PA.removeOutputCodeMirrors()");
  const specLens = specs.map((s) => s.length);
  const blocks = await page.eval("window.PA.collectCheckBlocks(" + JSON.stringify(specLens) + ")");
  if (specs.length !== blocks.length) {
    throw new Error(
      "Expected to see output for " + specs.length + " check blocks, but saw " + blocks.length
    );
  }
  blocks.forEach((b, i) => {
    if (b.length !== specs[i].length) {
      throw new Error(
        "Expected to see output for " + specs[i].length +
        " tests within check block at index " + i + ", but saw " + b.length
      );
    }
    b.forEach((text, j) => {
      ensureRendered(text);
      specs[i][j].forEach((must) => {
        if (text.indexOf(must) === -1) {
          throw new Error('Text content of error "' + text + '" did not contain "' + must + '"');
        }
      });
    });
  });
  return true;
}

// mirrors util.evalPyretNoError: submit code at the REPL, wait for a new result
// child of #output, and return its .replOutput/.replTextOutput texts (throwing
// if the result is not an echo-container/trace, i.e. an error).
async function evalAtReplNoError(page, code) {
  await page.inject();
  await page.waitFor("window.PA.replPromptVisible()", 15000);
  const before = await page.eval("window.PA.outputChildCount()");
  await page.eval("window.PA.evalAtRepl(" + JSON.stringify(code) + ")");
  await page.waitFor("window.PA.outputChildCount() > " + before, 15000);
  // Let the value render. Assignments legitimately produce no output, so cap the
  // wait rather than require non-empty output.
  let res = null;
  for (let i = 0; i < 30; i++) {
    res = await page.eval("window.PA.lastOutputChild()");
    if (res && res.outputs.length > 0) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!res || !(res.class === "echo-container" || res.class === "trace")) {
    throw new Error("Failed to run Pyret code: " + code);
  }
  return res.outputs;
}

// mirrors util.testRunAndUseRepl: run definitions (optionally type-checked),
// then evaluate a sequence of [code, expectedSubstring] pairs at the REPL.
async function testRunAndUseRepl(page, code, toRepl, options) {
  await setDefinitionsRunAndWait(page, code, options);
  for (const tr of toRepl) {
    const outputs = await evalAtReplNoError(page, tr[0]);
    if (outputs.length === 0 && tr[1] === "") {
      continue;
    } else if (outputs.length === 0 && tr[1] !== "") {
      throw new Error("Expected repl text content " + tr[1] + " but got empty output for repl entry " + tr[0]);
    } else {
      const t = outputs[0];
      if (t.indexOf(tr[1]) === -1) {
        throw new Error("Expected repl text content " + tr[1] + " not contained in output " + t + " for repl entry " + tr[0]);
      }
    }
  }
  return true;
}

// Submit code at the REPL, wait for a new result child, then poll a reader
// expression until it returns a non-null value (the value renders async).
async function evalAtReplThenRead(page, code, readerExpr) {
  await page.waitFor("window.PA.replPromptVisible()", 15000);
  const before = await page.eval("window.PA.outputChildCount()");
  await page.eval("window.PA.evalAtRepl(" + JSON.stringify(code) + ")");
  await page.waitFor("window.PA.outputChildCount() > " + before, 15000);
  let v = null;
  for (let i = 0; i < 50; i++) {
    v = await page.eval(readerExpr);
    if (v !== null && v !== undefined) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  return v;
}

// mirrors util.checkTableRendersCorrectly
async function checkTableRendersCorrectly(page, code, name, timeout) {
  await page.inject();
  await page.eval("window.PA.setDefinitions(" + JSON.stringify(code) + ")");
  await page.eval("window.PA.clearOutput()");
  await page.eval("window.PA.run()");
  await page.waitFor("window.PA.breakDone()", timeout || 900000);
  await page.waitFor("window.PA.tablePre() !== null", 20000);
  const tests = JSON.parse(await page.eval("window.PA.tablePre()"));
  if (!tests.length) throw new Error("No tables tests found");
  for (const t of tests) {
    const cellHTML = await evalAtReplThenRead(
      page, t.table, "window.PA.lastReplTableCellHTML(" + t.row + "," + t.col + ")"
    );
    const valHTML = await evalAtReplThenRead(page, t.val, "window.PA.lastReplOutputHTML()");
    if (cellHTML !== valHTML) {
      throw new Error(
        "Table renders example " + t.val + " incorrectly:\n  cell: " + cellHTML + "\n  val:  " + valHTML
      );
    }
  }
  // NOTE: util.checkTableRendersCorrectly has a checkAllTestsPassed(...) call
  // after its `return maybeTest.then(...)`, i.e. it is unreachable dead code and
  // never runs. We match that: the assertion is the per-cell render comparison.
  return true;
}

module.exports = {
  ensureRendered,
  checkTableRendersCorrectly,
  setDefinitionsRunAndWait,
  checkAllTestsPassed,
  runAndCheckAllTestsPassed,
  testErrorRendersString,
  testRunsAndHasCheckBlocks,
  evalAtReplNoError,
  testRunAndUseRepl,
};
