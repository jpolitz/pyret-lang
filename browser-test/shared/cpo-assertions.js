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

module.exports = {
  ensureRendered,
  setDefinitionsRunAndWait,
  checkAllTestsPassed,
  runAndCheckAllTestsPassed,
  testErrorRendersString,
  testRunsAndHasCheckBlocks,
};
