#!/usr/bin/env node
/*
 * baseline.js -- record what every student entry point currently does, as a
 * starting point for expectations.js.
 *
 *   node curriculum/baseline.js --env=cpo [--grep=<regex>] > /tmp/baseline.js
 *
 * expectations.js is a REVIEWED file: it says what each starter file is
 * *supposed* to do, and the point of the suite is that a change to Pyret which
 * changes any of those answers fails a test. But 158 entries is more than
 * anyone should type, and re-pinning to a new term means redoing them. So this
 * script drives the same harness the suite does, classifies each file, and
 * prints a table in expectations.js's shape.
 *
 * The output is a DRAFT, not an answer. Two categories always need a human:
 *
 *   teaching-error -- "this file does not compile" is only correct if the
 *                     lesson is about fixing it (core/Bug Hunting.arr). For
 *                     any other file it means the starter file is genuinely
 *                     broken: re-label it `broken-upstream`, give it a `note`
 *                     saying what is wrong, and report it to Bootstrap -- the
 *                     fix belongs in their repo, not here.
 *   needs-google-login
 *                  -- correct only when the error really is the missing Google
 *                     session; the classifier checks the message, but confirm
 *                     the file is genuinely spreadsheet-backed.
 *
 * See README.md ("Re-pinning to a new term") for the full procedure.
 */
const fs = require("fs");
const path = require("path");
const { makePlaywrightPage } = require("../shared/playwright-page");
const { warmUp } = require("../shared/cpo-assertions");
const A = require("./assertions");
const PR = require("./probes");

function arg(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--" + name) return argv[i + 1];
    if (argv[i].startsWith("--" + name + "=")) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

function classify(st) {
  if (st.timedOut) return { outcome: "TIMED-OUT", review: true };
  if (st.animating) {
    const body = { outcome: "interactive" };
    if (st.windowKind && st.windowKind !== "animation") body.windowKind = st.windowKind;
    if (!st.drewFrame) body.drawsFrame = false;
    return body;
  }
  if (st.errorCount === 0) {
    // Check/examples blocks are part of the lesson (some pass as shipped, some
    // are the exercise and fail until the student writes the function), so the
    // counts travel with the expectation. Omitted when zero.
    return {
      outcome: "runs",
      ...(st.checkBlocks ? { checkBlocks: st.checkBlocks } : {}),
      ...(st.failedBlocks ? { failedCheckBlocks: st.failedBlocks } : {}),
    };
  }
  if (st.errorText.indexOf(A.GOOGLE_AUTH_ERROR) !== -1) return { outcome: "needs-google-login" };
  // "No Spreadsheet with id "PASTE THE URL ... HERE"" is a template waiting for
  // the student's own sheet, not a broken file. Still flagged for review: the
  // same message with a REAL id means a dataset that no longer loads.
  if (st.errorText.indexOf(A.NO_SPREADSHEET) !== -1) {
    const id = (st.errorText.match(/No Spreadsheet with id "([^"]*)"/) || [])[1] || "";
    return { outcome: "placeholder", errorContains: [id.slice(0, 40)], review: true };
  }
  // A draft handle on the error message, cut before the srcloc and the code
  // snippet -- those carry line numbers and program text, which is exactly the
  // part that churns. The human reviewing this decides whether to keep,
  // tighten or replace it, and whether the file is broken ON PURPOSE
  // (teaching-error) or by accident (broken-upstream).
  const handle = st.errorText.split(/definitions:\/\/|interactions:\/\//)[0].trim().slice(0, 60);
  return { outcome: "teaching-error", errorContains: [handle], review: true };
}

(async () => {
  const env = arg("env") || "cpo";
  const grep = arg("grep") ? new RegExp(arg("grep")) : null;
  process.env.PYRET_ENV = env;
  // Same default as curriculum/run.js: baseline against an editor that CAN
  // read public sheets, since that is what the recorded outcomes describe.
  if (process.env.PYRET_SHEETS === undefined) process.env.PYRET_SHEETS = "public";

  const manifest = require("./manifest");
  const P = require("./pins");
  const ref = process.env.CURRICULUM_STARTER_REF || P.STARTER_FILES_REF;
  const resolved = await manifest.build({ ref });
  const entries = resolved.entries
    .filter((e) => e.code != null)
    .filter((e) => !grep || grep.test(e.repoPath));

  const { setup } = require("../envs/" + env);
  const s = await setup();
  const page = makePlaywrightPage(s.frame);
  await A.inject(page);
  await page.waitFor("window.PA.editorReady()", 120000);
  await warmUp(page);
  const publicSheets = await page.eval("window.PUBLIC_SHEETS === true");
  console.error("editor ready (public sheets: " + publicSheets + "); baselining " +
    entries.length + " entry points");

  const rows = [];
  for (const e of entries) {
    let row;
    try {
      const st = await A.runFile(page, e.code, { what: e.repoPath, timeout: 180000 });
      row = { path: e.repoPath, ...classify(st), elapsedMs: st.elapsedMs };
      if (row.outcome === "runs") row.definedNames = PR.definedNames(e.code).slice(0, 4);
      // A file that reads a sheet behaves differently on a plain editor, so
      // the expectation has to say which one this is (expectations.forEntry).
      if (/load-spreadsheet|shared-gdrive/.test(e.code)) row.readsSheet = true;
    } catch (err) {
      row = { path: e.repoPath, outcome: "HARNESS-ERROR", note: String(err.message).slice(0, 200), review: true };
    }
    rows.push(row);
    console.error(
      (row.review ? "!! " : "   ") + row.outcome.padEnd(20) + " " + row.path +
      (row.note ? "  -- " + row.note : ""));
  }
  await s.cleanup();

  const byOutcome = {};
  for (const r of rows) byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
  console.error("\nsummary: " + JSON.stringify(byOutcome, null, 2));

  const out = [];
  out.push("// DRAFT baseline produced by curriculum/baseline.js -- review before use.");
  out.push("// starter-files@" + ref + "  curriculum@" + resolved.curriculumCommit.slice(0, 12));
  out.push("const entries = {");
  for (const r of rows) {
    const body = { outcome: r.outcome };
    if (r.readsSheet) body.readsSheet = true;
    if (r.windowKind) body.windowKind = r.windowKind;
    if (r.drawsFrame === false) body.drawsFrame = false;
    if (r.checkBlocks) body.checkBlocks = r.checkBlocks;
    if (r.failedCheckBlocks) body.failedCheckBlocks = r.failedCheckBlocks;
    if (r.errorContains) body.errorContains = r.errorContains;
    out.push("  " + JSON.stringify(r.path) + ": " + JSON.stringify(body) + "," +
      (r.review ? "   // REVIEW" : ""));
  }
  out.push("};");
  process.stdout.write(out.join("\n") + "\n");

  fs.writeFileSync(
    path.join(__dirname, ".cache", "baseline-raw.json"),
    JSON.stringify(rows, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
