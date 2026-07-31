/*
 * starter-files.test.js -- "do the Bootstrap curricular files still work?"
 *
 * Boots ONE editor (the same env adapters the rest of browser-test uses) and
 * drives every student entry point through it. Run it via the wrapper:
 *
 *   node curriculum/run.js --env=cpo
 *   node curriculum/run.js --env=cpo --grep 'Rocket Height'
 *   node curriculum/run.js --env=cpo --parts=links,libraries
 *
 * The manifest (which files are entry points, and their contents) is resolved
 * by curriculum/run.js BEFORE this process starts, because node:test needs the
 * whole test list at module load; it arrives here as a JSON file named by
 * CURRICULUM_MANIFEST. See manifest.js for how it is derived.
 *
 * Four groups of tests, in the order they build on each other:
 *
 *   links       the manifest itself -- every link resolves, every link is
 *               pinned, every .arr in the repo is accounted for. These are
 *               about the curriculum, not about Pyret, and they are pinned to
 *               a known state so a change shows up as a failure instead of
 *               quietly changing what the rest of the suite covers.
 *
 *   shareurl    the link a student actually clicks: `/editor#shareurl=<raw
 *               url>`. Every other group installs the text straight into
 *               CodeMirror, so this is the only one that exercises delivery.
 *
 *   libraries   one test per distinct import header. Runs the header on its
 *               own and exercises the library it pulls in from the
 *               interactions window. This is the "the library loads and works"
 *               check, and it is separate from the entry point run because for
 *               most files the interactions window is unusable afterwards (see
 *               probes.importPrelude).
 *
 *   entry-points  one test per student entry point: install the file verbatim,
 *               Run, and require the outcome expectations.js declares for it
 *               (runs / interactive / needs-google-login / teaching-error /
 *               broken-upstream), plus -- for the files that finish --
 *               evaluating the file's own definitions in the interactions
 *               window.
 */
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const { makePlaywrightPage } = require("../../shared/playwright-page");
const { warmUp } = require("../../shared/cpo-assertions");
const { ProceduralError } = require("../../shared/errors");
const P = require("../pins");
const A = require("../assertions");
const PR = require("../probes");
const EXPECT = require("../expectations");

const ENV = process.env.PYRET_ENV;
const ENVS = ["cpo", "embed", "embed-static", "vscode", "vscode-ovsx"];
if (!ENV || !ENVS.includes(ENV)) {
  throw new Error("PYRET_ENV must be one of " + ENVS.join(" | ") + " (got " + JSON.stringify(ENV) + ")");
}

const MANIFEST_FILE = process.env.CURRICULUM_MANIFEST;
if (!MANIFEST_FILE || !fs.existsSync(MANIFEST_FILE)) {
  throw new Error("CURRICULUM_MANIFEST must point at a resolved manifest (run via curriculum/run.js)");
}
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8"));

const PARTS = {
  links: "links",
  shareurl: "shareurl",
  libraries: "libraries",
  "entry-points": "entry-points",
};
const rawParts = process.env.CURRICULUM_PARTS;
const chosen =
  rawParts === undefined || rawParts === "all"
    ? Object.keys(PARTS)
    : rawParts.split(",").map((s) => s.trim()).filter((s) => s !== "");
if (chosen.length === 0) {
  throw new Error("CURRICULUM_PARTS selected nothing; known parts are " + Object.keys(PARTS).join(", "));
}
const unknownParts = chosen.filter((p) => !PARTS[p]);
if (unknownParts.length > 0) {
  throw new Error("unknown part(s): " + unknownParts.join(", ") +
    "; known parts are " + Object.keys(PARTS).join(", "));
}

// Per-test budget. A file whose library is not yet in the editor's module cache
// pays the compile of ~3k lines of Pyret over the network; after the first file
// in a group the rest are seconds.
const RUN_TIMEOUT = Number(process.env.CURRICULUM_RUN_TIMEOUT_MS || 180000);
const TEST_TIMEOUT = RUN_TIMEOUT + 120000;

const usable = MANIFEST.entries.filter((e) => e.code !== null && e.code !== undefined);

let session = null;
let teardown = null;

before(async () => {
  const { setup, label } = require("../../envs/" + ENV);
  console.log("environment: " + label);
  console.log("starter-files ref: " + MANIFEST.starterRef +
    " (pinned commit " + MANIFEST.starterCommit.slice(0, 12) + ")");
  console.log("curriculum commit: " + MANIFEST.curriculumCommit.slice(0, 12));
  console.log("entry points: " + usable.length + " of " + MANIFEST.entries.length + " links");
  const s = await setup();
  teardown = s.cleanup;
  const page = makePlaywrightPage(s.frame);
  await A.inject(page);
  try {
    await page.waitFor("window.PA.editorReady()", 120000);
  } catch (e) {
    const diag = await page.eval(
      "({ pyretLoaded: window.PA.pyretLoaded(), cmPresent: window.PA.cmPresent()," +
      "   contentsSettled: window.EDITOR_CONTENTS_SETTLED === true," +
      "   stickyErrors: window.PA.stickyErrors() })");
    throw new Error("editor never became ready: " + JSON.stringify(diag));
  }
  const sticky = await page.eval("window.PA.stickyErrors()");
  if (sticky.length > 0) {
    throw new Error("the editor booted into an error state: " + sticky.join(" | "));
  }
  const wantCompiler = process.env.PYRET_COMPILER || "pyret";
  const gotCompiler = await page.eval("window.CPO_COMPILER || 'pyret'");
  if (gotCompiler !== wantCompiler) {
    throw new Error("expected the " + wantCompiler + " compiler flavor, but the editor loaded " + gotCompiler);
  }
  // Is this editor on the test-only public-Google-Sheets path? Read from the
  // page rather than from the flag we passed in, so "we asked for it" and "it
  // is actually on" cannot drift apart -- and so a run against a server that
  // does not offer the proxy degrades to the honest expectation instead of
  // failing 76 files for the wrong reason.
  const publicSheets = await page.eval("window.PUBLIC_SHEETS === true");
  if (process.env.PYRET_SHEETS === "public" && !publicSheets) {
    throw new Error(
      "PYRET_SHEETS=public was requested, but the editor did not enable the " +
      "public-sheets path. That switch is only honoured by a development " +
      "server (src/server.js renders PUBLIC_SHEETS_PROXY); check BASE_URL.");
  }
  console.log("google sheets: " + (publicSheets
    ? "readable via the test-only public proxy"
    : "not readable (no Google session) -- sheet-backed files stop at load-spreadsheet"));
  // Absorb the one-time runtime/render warmup so no starter file pays it.
  await warmUp(page);
  session = { page, hostPage: s.page, publicSheets };
}, { timeout: 300000 });

after(async () => {
  if (teardown) await teardown();
});

/* ------------------------------------------------------------------ links */

if (chosen.includes("links")) {
  describe("links", () => {
    // Which files the curriculum points at that are not there. Pinned to the
    // known set: a NEW broken link is a regression the curriculum authors want
    // to know about, and a FIXED one should be removed from the list here.
    test("every starter file the curriculum links to exists", () => {
      const missing = MANIFEST.entries
        .filter((e) => e.code === null || e.code === undefined)
        .map((e) => e.repoPath)
        .sort();
      assert.deepStrictEqual(missing, EXPECT.knownMissingLinks.slice().sort(),
        "the set of dead 'Starter File' links changed.\nEach entry is linked from " +
        "shared/langs/en-us/starterFiles/*.json but 404s at " + MANIFEST.starterRef +
        ".\nIf one was fixed upstream, drop it from expectations.knownMissingLinks.");
    });

    // Most links say `fall2026`; a couple still say `refs/heads/main`, which
    // means those two entry points are whatever main happens to hold today.
    test("every starter file link is pinned to the term's tag", () => {
      const floating = MANIFEST.entries
        .filter((e) => !e.pinned)
        .map((e) => e.linkedRef + " :: " + e.repoPath)
        .sort();
      assert.deepStrictEqual(floating, EXPECT.knownUnpinnedLinks.slice().sort(),
        "the set of links that bypass the " + P.STARTER_FILES_REF + " tag changed");
    });

    // Files inside the starter files themselves can also float: several `use
    // context url-file(...)` headers point at refs/heads/main.
    test("every import header is pinned to the term's tag", () => {
      const floating = [];
      for (const e of usable) {
        if (/raw\.githubusercontent\.com\/bootstrapworld\/starter-files\/refs\/heads\//.test(e.code)) {
          floating.push(e.repoPath);
        }
      }
      assert.deepStrictEqual(floating.sort(), EXPECT.knownUnpinnedImports.slice().sort(),
        "the set of starter files whose own imports bypass the " + P.STARTER_FILES_REF +
        " tag changed");
    });

    // Everything in the repo is either an entry point or a known non-entry
    // point (a library, or a file marked "not used"). This is what makes
    // "all the student entry points" checkable rather than asserted.
    test("every .arr in starter-files is either an entry point or a known non-entry point", async () => {
      const M = require("../manifest");
      let tree;
      try {
        tree = await M.repoTree(MANIFEST.starterRef);
      } catch (e) {
        throw new ProceduralError(
          "could not list the starter-files tree (GitHub API): " + e.message +
          " -- this test needs one unauthenticated API call; rerun, or set " +
          "CURRICULUM_PARTS to skip the links group");
      }
      const entryPaths = new Set(MANIFEST.entries.map((e) => e.repoPath));
      const unaccounted = tree.paths
        .filter((p) => p.endsWith(".arr"))
        .filter((p) => !entryPaths.has(p))
        .filter((p) => !p.startsWith("libraries/"))
        .sort();
      assert.deepStrictEqual(unaccounted, EXPECT.knownNonEntryPoints.slice().sort(),
        "a starter-files .arr is neither linked by the curriculum nor a known non-entry point.\n" +
        "If it is a new student file, it should be linked from the curriculum (and will then " +
        "be covered here automatically); if it is not, add it to expectations.knownNonEntryPoints.");
    });

    // The expectations below were recorded against one commit of the tag. A
    // tag that has moved does not necessarily mean anything is broken, but it
    // does mean this suite is no longer describing the state it was baselined
    // against, which is worth saying out loud rather than absorbing silently.
    test("the " + P.STARTER_FILES_REF + " tag still points at the pinned commit", async () => {
      const M = require("../manifest");
      // /git/trees/{ref} resolves ref -> commit -> tree and reports the TREE
      // sha, so asking for the tag and for the pinned commit and comparing the
      // two answers detects any content change under the tag.
      let atTag, atPin;
      try {
        atTag = await M.repoTree(MANIFEST.starterRef);
        atPin = await M.repoTree(MANIFEST.starterCommit);
      } catch (e) {
        throw new ProceduralError("could not compare the tag to the pin (GitHub API): " + e.message);
      }
      assert.strictEqual(atTag.sha, atPin.sha,
        "starter-files " + MANIFEST.starterRef + " has moved off the pinned commit " +
        MANIFEST.starterCommit + ".\nThe expectations in curriculum/expectations.js were " +
        "recorded against the pin; re-pin and re-baseline (see curriculum/README.md).");
    });
  });
}

/* --------------------------------------------------------------- shareurl */

/*
 * The link a student actually clicks.
 *
 * Every "Starter File" link in the curriculum is
 *   https://pyret.bootstrapworld.org/editor#shareurl=<raw github url>
 * and beforePyret.js turns that hash into `makeUrlFile(url).getContents()`,
 * which fetches the .arr and installs it as the editor's initial contents.
 * Everything else in this suite installs the same text through CodeMirror
 * directly (one editor, 158 files, no reboots), so this group is what says the
 * DELIVERY path works and not just the programs -- a broken #shareurl would
 * make every one of those links open an empty editor while the rest of the
 * suite stayed green.
 *
 * It costs a full editor boot per file, so it runs one entry point per
 * top-level curriculum area, plus EVERY file whose name holds a character
 * rarer than a space -- an apostrophe, an ampersand, a comma, parentheses.
 * Spaces are in nearly every one of these names and so are covered by the
 * per-area picks anyway; the rare ones are where an encoding bug would hide,
 * and there are only nine, so none of them is left to chance:
 *
 *   Sally's Lemonade.arr
 *   Dogs, Rabbits, Cats, & Tarantulas Starter File.arr
 *   Simple Game (no collision).arr
 *   State Demographics (Intro) Starter File.arr        ... and five more
 *
 * cpo only: #shareurl is a code.pyret.org editor feature. The embedded hosts
 * (embed API, vscode webview) feed contents in over their own reset protocol,
 * so there is no shareurl path there to test.
 */
const NEEDS_ESCAPING = /['&,#+()]/;

function shareUrlSample() {
  const picked = new Map();
  const byArea = new Map();
  for (const e of usable) {
    const area = e.repoPath.split("/")[0];
    if (!byArea.has(area)) byArea.set(area, e);
    if (NEEDS_ESCAPING.test(e.repoPath)) picked.set(e.repoPath, e);
  }
  for (const e of byArea.values()) picked.set(e.repoPath, e);
  return [...picked.values()].sort((a, b) => (a.repoPath < b.repoPath ? -1 : 1));
}

if (chosen.includes("shareurl")) {
  describe("shareurl", () => {
    const sample = ENV === "cpo" ? shareUrlSample() : [];
    if (ENV !== "cpo") {
      test("#shareurl links load the starter file", { skip: "#shareurl is a code.pyret.org /editor feature; " +
        "embedded hosts install contents over their own reset protocol" }, () => {});
    }
    for (const e of sample) {
      test(e.repoPath, { timeout: TEST_TIMEOUT }, async () => {
        const base = process.env.BASE_URL || "http://localhost:4999";
        const url = P.shareUrlFor(base, e.repoPath, e.pinned ? MANIFEST.starterRef : e.linkedRef);
        // A fresh tab in the same browser. Via the Browser rather than the
        // BrowserContext because the env adapters use browser.newPage(), which
        // means the context is Playwright's implicit default one -- and
        // newPage() on that is refused.
        const browser = session.hostPage.context().browser();
        const page = await browser.newPage();
        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
          const { findEditorFrame } = require("../../shared/find-frame");
          const frame = await findEditorFrame(page);
          const adapter = makePlaywrightPage(frame);
          await A.inject(adapter);
          await adapter.waitFor("window.PA.editorReady()", 120000);
          const sticky = await adapter.eval("window.PA.stickyErrors()");
          assert.deepStrictEqual(sticky, [],
            "the editor reported a load failure for " + url);
          const got = await adapter.eval("window.PA.cmValue()");
          assert.strictEqual(got, e.code,
            "#shareurl should install the starter file verbatim, but CodeMirror holds " +
            (got === "" ? "an EMPTY editor" : JSON.stringify(String(got).slice(0, 200) + "...")) +
            "\nurl: " + url);
        } finally {
          await page.close();
        }
      });
    }
  });
}

/* -------------------------------------------------------------- libraries */

// Group the entry points by their verbatim import header, so each distinct
// header is exercised once instead of ~135 times for the common one.
function preludeGroups() {
  const groups = new Map();
  for (const e of usable) {
    const prelude = PR.importPrelude(e.code);
    if (prelude === "") continue; // a file with no imports has no library to check
    if (!groups.has(prelude)) groups.set(prelude, []);
    groups.get(prelude).push(e.repoPath);
  }
  return [...groups.entries()]
    .map(([prelude, files]) => ({ prelude, files: files.sort() }))
    .sort((a, b) => (a.files[0] < b.files[0] ? -1 : 1));
}

if (chosen.includes("libraries")) {
  describe("libraries", () => {
    for (const g of preludeGroups()) {
      const label = g.files[0] + (g.files.length > 1 ? " (+" + (g.files.length - 1) + " more)" : "");
      // Two Bootstrap libraries END with a call that opens an animation
      // (ninja-cat-library.arr's `game.interact()`, package-delivery-library's
      // `animation(next-position)`), so merely importing them takes over the
      // screen. That is by design, and it means those headers can only be
      // checked as far as "loaded, ran, and painted" -- CPO installs a
      // program's namespace only when the run completes, so there is no
      // interactions window to probe afterwards. Which headers those are is
      // recorded rather than inferred, so a header that STARTS animating (or
      // stops) fails here.
      const expectedPrelude = EXPECT.forPrelude(g.files[0]);
      test(label, { timeout: TEST_TIMEOUT }, async () => {
        const probes = PR.libraryProbes(g.prelude);
        assert.ok(probes.length > 0,
          "no library probes for this import header, so nothing would be checked:\n" + g.prelude +
          "\nAdd the library to curriculum/probes.js LIBRARY_PROBES.");
        const st = await A.runFile(session.page, g.prelude, {
          what: "the import header of " + g.files[0],
          timeout: RUN_TIMEOUT,
        });
        assert.strictEqual(st.errorCount, 0,
          "the import header of " + g.files[0] + " did not load: " + A.describeState(st) +
          "\n--- header ---\n" + g.prelude);
        if (expectedPrelude.outcome === "interactive") {
          assert.ok(st.animating && st.drewFrame,
            "importing this library is expected to open an animation and paint (the library " +
              "itself calls interact()), but it did not: " + A.describeState(st) +
              "\n--- header ---\n" + g.prelude);
          return; // no namespace to probe; see the comment above
        }
        assert.ok(st.done && !st.animating,
          "the import header of " + g.files[0] + " should just load and finish: " +
            A.describeState(st) + "\n--- header ---\n" + g.prelude);
        await A.runProbes(session.page, probes, g.files[0] + " library");
      });
    }
  });
}

/* ----------------------------------------------------------- entry points */

if (chosen.includes("entry-points")) {
  describe("entry-points", () => {
    for (const e of usable) {
      // Resolved lazily inside the test: `session` does not exist yet at
      // registration time, and the expectation depends on how it booted.
      const expectedFor = () => EXPECT.forEntry(e.repoPath, { publicSheets: session.publicSheets });
      test(e.repoPath, { timeout: TEST_TIMEOUT }, async () => {
        const expected = expectedFor();
        assert.ok(expected,
          "no expectation recorded for " + e.repoPath + ".\nThis is a new student entry " +
          "point; add it to curriculum/expectations.js (see README.md for how to baseline).");
        const st = await A.runFile(session.page, e.code, {
          what: e.repoPath,
          timeout: RUN_TIMEOUT,
        });
        A.assertOutcome(st, expected, e.repoPath);

        // Only a run that COMPLETED leaves the program's namespace in the
        // interactions window, so only then can we ask the file about its own
        // definitions. The other outcomes get their library coverage from the
        // "libraries" group above.
        if (expected.outcome === "runs") {
          const probes = PR.definitionProbes(e.code);
          if (probes.length > 0) {
            await A.runProbes(session.page, probes, e.repoPath);
          }
          // When the sheet was actually readable, say so with the data rather
          // than with the absence of an error: each loaded table must render
          // its declared columns, and row-n(t, 0) must render a first row.
          // Without this, a sheet that came back EMPTY would still "run".
          if (expected.readsSheet && session.publicSheets) {
            const tableProbes = PR.sheetTableProbes(e.code);
            if (tableProbes.length > 0) {
              await A.runProbes(session.page, tableProbes, e.repoPath + " (sheet data)");
            }
          }
        }
      });
    }
  });
}
