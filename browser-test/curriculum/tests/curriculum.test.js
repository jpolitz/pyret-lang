/*
 * curriculum.test.js -- "would a Bootstrap student's starter file still work?"
 *
 * One loop anyone can hold in their head: for each entry in manifest.json,
 * fetch the file at the pin, install it in the editor, Run, require the
 * outcome its spec row declares, then type its repl entries and match what
 * renders. Run it via the wrapper:
 *
 *   node curriculum/run.js
 *   node curriculum/run.js --grep 'Rocket Height'
 *   node curriculum/run.js --compiler=ts --sheets=none
 *
 * Three parts (--parts= to select): `pin` (the starter-files tag still points
 * at the commit the specs were recorded against), `shareurl` (the delivery
 * path a student's click takes, for the few names that cover every rare
 * character), and `files` (everything else -- one test per starter file).
 *
 * One editor serves all files. If any file's test fails -- wrong outcome OR
 * the editor got into a state we couldn't drive -- the editor is thrown away
 * and the next file boots a fresh one, so a failure can never cascade into
 * the files after it. Green runs pay zero reboots.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { execFile } = require("child_process");

const { makePlaywrightPage } = require("../../shared/playwright-page");
const { warmUp } = require("../../shared/cpo-assertions");
const { launchChromium, wireBrowserLogs } = require("../../shared/browser");
const { findEditorFrame } = require("../../shared/find-frame");
const { ProceduralError } = require("../../shared/errors");
const H = require("../harness");

const MANIFEST = require("../manifest.json");
const SPECS = require("../specs").validate(MANIFEST);

const BASE_URL = process.env.BASE_URL || "http://localhost:4999";
const COMPILER = process.env.PYRET_COMPILER || "pyret";
const SHEETS = process.env.PYRET_SHEETS || "public";
const GREP = process.env.CURRICULUM_GREP ? new RegExp(process.env.CURRICULUM_GREP) : null;

const PARTS = ["pin", "shareurl", "files"];
const chosen = (process.env.CURRICULUM_PARTS || "all") === "all"
  ? PARTS
  : process.env.CURRICULUM_PARTS.split(",").map((s) => s.trim()).filter((s) => s !== "");
const unknown = chosen.filter((p) => !PARTS.includes(p));
if (chosen.length === 0 || unknown.length > 0) {
  throw new Error("CURRICULUM_PARTS must name parts among: " + PARTS.join(", "));
}

// Per-file budget. The first file in a run pays the compile of several
// thousand lines of Bootstrap library over the network; after the module
// cache warms, the rest take seconds.
const RUN_TIMEOUT = Number(process.env.CURRICULUM_RUN_TIMEOUT_MS || 180000);
const TEST_TIMEOUT = RUN_TIMEOUT + 120000;

const entries = MANIFEST.entries.filter((e) => !GREP || GREP.test(e.path));

/* ------------------------------------------------- the shared editor */

let session = null;

async function bootEditor() {
  const params = [];
  if (COMPILER !== "pyret") params.push("compiler=" + COMPILER);
  if (SHEETS === "public") params.push("sheets=public");
  const url = BASE_URL + "/editor" + (params.length ? "?" + params.join("&") : "");

  const browser = await launchChromium();
  try {
    const hostPage = await browser.newPage();
    wireBrowserLogs(hostPage);
    hostPage.setDefaultTimeout(60000);
    await hostPage.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    const frame = await findEditorFrame(hostPage);
    const page = makePlaywrightPage(frame);
    await H.inject(page);
    await page.waitFor("window.PA.editorReady()", 180000);
    const sticky = await page.eval("window.PA.stickyErrors()");
    if (sticky.length > 0) {
      throw new Error("the editor booted into an error state: " + sticky.join(" | "));
    }
    const gotCompiler = await page.eval("window.CPO_COMPILER || 'pyret'");
    if (gotCompiler !== COMPILER) {
      throw new Error("expected the " + COMPILER + " compiler flavor, but the editor loaded " + gotCompiler);
    }
    // Read the sheets capability off the page, not off what we asked for, so
    // the two cannot drift: a server without the dev-only proxy simply does
    // not enable it, and asking for it against such a server is an error
    // rather than 76 files failing for the wrong reason.
    const publicSheets = await page.eval("window.PUBLIC_SHEETS === true");
    if (SHEETS === "public" && !publicSheets) {
      throw new Error(
        "--sheets=public was requested, but this editor cannot reach sheets. The " +
        "public-sheets path only exists on a development server (see " +
        "code.pyret.org/src/server.js); check BASE_URL, or pass --sheets=none.");
    }
    await warmUp(page);
    return { browser, page, publicSheets };
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }
}

async function ensureSession() {
  if (!session) {
    session = await bootEditor();
  }
  return session;
}

// Throw the editor away; the next test boots a fresh one. Called on ANY
// failure, so a file that wedges the editor cannot make the files after it
// lie.
async function discardSession() {
  if (session) {
    const s = session;
    session = null;
    await s.browser.close().catch(() => {});
  }
}

before(async () => {
  console.log("editor: " + BASE_URL + " (" + COMPILER + " compiler, sheets=" + SHEETS + ")");
  console.log("starter-files: " + MANIFEST.starterFiles.ref +
    " (recorded at " + MANIFEST.starterFiles.commit.slice(0, 12) + ")");
  console.log("entry points: " + entries.length + " of " + MANIFEST.entries.length);
  if (chosen.includes("files") || chosen.includes("shareurl")) {
    const s = await ensureSession();
    console.log("google sheets: " + (s.publicSheets
      ? "readable via the dev-only public proxy"
      : "not readable -- readsSheet files are judged as blocked at Google auth"));
  }
}, { timeout: 300000 });

after(async () => {
  await discardSession();
});

/* --------------------------------------------------------------- pin */

if (chosen.includes("pin")) {
  // The specs were recorded against starterFiles.commit. If the term tag has
  // moved, every row is suspect: re-pin (see README) rather than trusting a
  // green run against different files.
  test("the starter-files tag still points at the recorded commit", { timeout: 60000 }, async () => {
    const ref = MANIFEST.starterFiles.ref;
    const out = await new Promise((resolve, reject) => {
      execFile("git",
        ["ls-remote", "https://github.com/bootstrapworld/starter-files", ref, ref + "^{}"],
        { timeout: 45000 },
        (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
    const lines = out.trim().split("\n").filter((l) => l !== "");
    assert.ok(lines.length > 0, "git ls-remote found no ref named " + JSON.stringify(ref));
    // For an annotated tag the peeled ^{} line is the commit; for a
    // lightweight tag or branch the plain line already is.
    const peeled = lines.find((l) => l.endsWith("^{}"));
    const sha = (peeled || lines[0]).split(/\s+/)[0];
    assert.strictEqual(sha, MANIFEST.starterFiles.commit,
      ref + " has moved off the commit these specs were recorded against. " +
      "Re-pin: update manifest.json, run drafter.js, review its report, and " +
      "re-verify the specs (README, 'Re-pinning').");
  });
}

/* ---------------------------------------------------------- shareurl */

if (chosen.includes("shareurl")) {
  // The #shareurl= delivery path is one code path whose failure modes are
  // per-character, so a handful of names covering every rare character is
  // the whole test. Each costs a full editor boot; the manifest marks them.
  describe("shareurl", () => {
    for (const entry of entries.filter((e) => e.shareurl)) {
      test(entry.path, { timeout: 300000 }, async () => {
        const code = await H.fetchStarter(MANIFEST, entry);
        const raw = H.starterFileUrl(MANIFEST, entry);
        const params = COMPILER !== "pyret" ? "?compiler=" + COMPILER : "";
        const url = BASE_URL + "/editor" + params + "#shareurl=" + raw;
        const browser = await launchChromium();
        try {
          const hostPage = await browser.newPage();
          wireBrowserLogs(hostPage);
          hostPage.setDefaultTimeout(60000);
          await hostPage.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
          const frame = await findEditorFrame(hostPage);
          const page = makePlaywrightPage(frame);
          await H.inject(page);
          await page.waitFor("window.PA.editorReady()", 180000);
          const got = await page.eval("window.PA.cmValue()");
          assert.strictEqual(got, code,
            "the editor opened via #shareurl= does not hold the file's contents");
        } finally {
          await browser.close().catch(() => {});
        }
      });
    }
  });
}

/* ------------------------------------------------------------- files */

if (chosen.includes("files")) {
  describe("files", () => {
    for (const entry of entries) {
      const spec = SPECS[entry.path];
      test(entry.path, { timeout: TEST_TIMEOUT }, async () => {
        const code = await H.fetchStarter(MANIFEST, entry);
        const s = await ensureSession();
        try {
          const st = await H.runFile(s.page, code, { what: entry.path, timeout: RUN_TIMEOUT });
          const { probed } = H.judge(st, spec, { publicSheets: s.publicSheets, what: entry.path });
          if (probed && spec.repl) {
            await H.runRepl(s.page, spec.repl, entry.path);
          }
          await H.settle(s.page, entry.path);
        } catch (e) {
          // Whatever went wrong, do not hand the next file this editor.
          await discardSession();
          throw e;
        }
      });
    }
  });
}
