/*
 * typed-tables.test.js -- editor coverage for the table type checker
 * (lang/src/ts-compiler/src/type-check-tables.ts, documented in
 * lang/TYPED-TABLES.md).
 *
 * What must hold, per compiler flavor:
 *
 *   - both flavors: programs using the Col column-name type in *annotations*
 *     run under the normal (untyped) run -- dynamically Col is just String
 *     (the global exists and desugar-post-tc rewrites Col anns to String).
 *   - ts flavor: "Type-check and Run" accepts schema-typed table programs
 *     (Table<{...}>, Col<S, T>) and rejects a misspelled column name with the
 *     column-listing error.
 *   - pyret flavor: the table type checker is TS-only; "Type-check and Run"
 *     on a schema-typed program is expected to report an error (this test
 *     documents the asymmetry rather than hiding it).
 *
 * Run:  node run.js --env=cpo [--compiler=ts] --grep typed-tables
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { makePlaywrightPage } = require("../shared/playwright-page");
const {
  warmUp,
  runAndCheckAllTestsPassed,
  setDefinitionsRunAndWait,
} = require("../shared/cpo-assertions");

const ENV = process.env.PYRET_ENV;
const COMPILER = process.env.PYRET_COMPILER || "pyret";

if (!ENV || !["cpo", "embed", "vscode"].includes(ENV)) {
  throw new Error("PYRET_ENV must be one of cpo | embed | vscode (got " + JSON.stringify(ENV) + ")");
}

const UNTYPED_COL_PROGRAM = [
  "fun get-col<S>(t :: Table<S>, c :: Col<S, Number>) -> List<Number>:",
  "  t.get-column(c)",
  "end",
  "tbl = table: age row: 7 row: 9 end",
  "check:",
  '  get-col(tbl, "age") is [list: 7, 9]',
  "end",
  "",
].join("\n");

const TYPED_TABLE_PROGRAM = [
  "gradebook :: Table<{name :: String, quiz1 :: Number, quiz2 :: Number}> =",
  "  table: name, quiz1, quiz2",
  '    row: "Bob", 8, 9',
  '    row: "Alice", 6, 8',
  "  end",
  "",
  "fun col-len<S>(t :: Table<S>, c :: Col<S, Number>) -> Number:",
  "  t.get-column(c).length()",
  "end",
  "",
  "totals = extend gradebook using quiz1, quiz2:",
  "  total: quiz1 + quiz2",
  "end",
  "check:",
  '  totals.get-column("total") is [list: 17, 14]',
  '  gradebook.row-n(0)["name"] is "Bob"',
  '  col-len(gradebook, "quiz1") is 2',
  "end",
  "",
].join("\n");

const MISSPELLED_COLUMN_PROGRAM = [
  "gradebook = table: name, midterm row: \"Bob\", 77 end",
  'x = gradebook.get-column("mid")',
  "",
].join("\n");

let session = null;

describe("typed-tables (" + ENV + ", " + COMPILER + " compiler)", () => {
  let page;
  before(async () => {
    const { setup, label } = require("../envs/" + ENV);
    console.log("environment: " + label);
    session = await setup();
    page = makePlaywrightPage(session.frame);
    await page.inject();
    await page.waitFor("window.PA.editorReady()", 120000);
    await warmUp(page);
  });
  after(async () => {
    if (session) await session.cleanup();
  });

  test("typed-tables: Col-annotated program runs (untyped run)", { timeout: 120000 }, async () => {
    await runAndCheckAllTestsPassed(page, UNTYPED_COL_PROGRAM, "col-untyped", 60000);
  });

  if (COMPILER === "ts") {
    test("typed-tables: schema-typed program type-checks and runs (ts)", { timeout: 120000 }, async () => {
      await setDefinitionsRunAndWait(page, TYPED_TABLE_PROGRAM, { typeCheck: true });
      await page.waitFor("window.PA.testingSummaryPresent()", 60000);
      const summary = await page.eval("window.PA.outputText()");
      assert.ok(/shipshape/i.test(summary), "expected all checks to pass, got: " + summary);
    });

    test("typed-tables: misspelled column is a static error (ts)", { timeout: 120000 }, async () => {
      await setDefinitionsRunAndWait(page, MISSPELLED_COLUMN_PROGRAM, { typeCheck: true });
      await page.waitFor("window.PA.compileErrorPresent()", 60000);
      const err = await page.eval("window.PA.outputText()");
      assert.ok(err.includes("mid"), "error should mention the misspelled column, got: " + err.slice(0, 300));
      assert.ok(/column/i.test(err), "error should be the column-name error, got: " + err.slice(0, 300));
    });
  } else {
    test("typed-tables: schema-typed program reports an error under the pyret flavor's type checker", { timeout: 120000 }, async () => {
      // The table type checker is TS-only; the Pyret-hosted checker is
      // expected to reject the schema application (documenting, not hiding,
      // the asymmetry). The program still RUNS under the untyped run.
      await setDefinitionsRunAndWait(page, TYPED_TABLE_PROGRAM, { typeCheck: true });
      await page.waitFor("window.PA.compileErrorPresent() || window.PA.testingSummaryPresent()", 60000);
      const hasError = await page.eval("window.PA.compileErrorPresent()");
      assert.ok(hasError, "expected the pyret-flavor type checker to report an error for schema-typed tables");
      await runAndCheckAllTestsPassed(page, TYPED_TABLE_PROGRAM, "typed-tables-untyped-run", 60000);
    });
  }
});
