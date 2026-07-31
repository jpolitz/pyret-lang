#!/usr/bin/env node
/*
 * run.js -- friendly CLI over the curriculum suite.
 *
 *   node curriculum/run.js --env=cpo|embed|embed-static|vscode|vscode-ovsx
 *                          [--compiler=pyret|ts] [--grep=<regex>]
 *                          [--parts=all|links,shareurl,libraries,entry-points]
 *                          [--reporter=spec|tap|dot|junit]
 *
 * Examples:
 *   node curriculum/run.js --env=cpo                          # everything
 *   node curriculum/run.js --env=cpo --parts=libraries        # just the libraries
 *   node curriculum/run.js --env=cpo --grep 'Rocket Height'   # one starter file
 *   node curriculum/run.js --env=cpo --grep '^data-science/'  # one area
 *   node curriculum/run.js --env=cpo --compiler=ts            # on the TS compiler
 *   node curriculum/run.js --env=cpo --sheets=none            # no sheet reads
 *
 * Like browser-test/run.js this is a thin wrapper over `node --test`, so you get
 * node:test's reporters and exit code. What it adds on top is resolving the
 * MANIFEST first: the suite registers one test per student entry point, and
 * node:test needs that list at module load, which is too early to await a
 * network fetch. So the entry point list and every .arr's contents are fetched
 * here (cached under curriculum/.cache/), written to a JSON file, and handed to
 * the child through CURRICULUM_MANIFEST.
 *
 * cpo/embed need the code.pyret.org server running at BASE_URL; vscode and
 * embed-static do not. See ../README.md for the prerequisites.
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");

const KNOWN_FLAGS = ["env", "grep", "parts", "reporter", "compiler", "ref", "sheets"];
const USAGE =
  "usage: node curriculum/run.js --env=cpo|embed|embed-static|vscode|vscode-ovsx " +
  "[--compiler=pyret|ts] [--grep=<regex>] [--parts=all|links,shareurl,libraries,entry-points] " +
  "[--reporter=spec|tap|dot|junit] [--ref=<starter-files ref>] [--sheets=public|none]";

function die(msg) {
  console.error(msg);
  console.error(USAGE);
  process.exit(2);
}

function arg(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--" + name) return argv[i + 1];
    if (argv[i].startsWith("--" + name + "=")) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

// Reject anything unrecognized rather than ignoring it -- a misspelled filter
// that silently runs everything reads like "my filter matched all 158 files".
(function rejectUnknownArgs() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) die("unexpected argument: " + tok);
    const name = tok.slice(2).split("=")[0];
    if (!KNOWN_FLAGS.includes(name)) die("unknown flag: " + tok);
    if (!tok.includes("=")) i++;
  }
})();

const env = arg("env");
if (!env || !["cpo", "embed", "embed-static", "vscode", "vscode-ovsx"].includes(env)) {
  die("--env must be one of cpo | embed | embed-static | vscode | vscode-ovsx (got " + JSON.stringify(env) + ")");
}
const grep = arg("grep");
// Only an ABSENT --parts means "run everything"; `--parts=` is an empty
// selection, which the suite rejects rather than quietly widening.
const partsArg = arg("parts");
const parts = partsArg === undefined ? "all" : partsArg;
const reporter = arg("reporter") || "spec";
const compiler = arg("compiler") || process.env.PYRET_COMPILER || "pyret";
if (!["pyret", "ts"].includes(compiler)) die("--compiler must be pyret or ts");
const ref = arg("ref") || process.env.CURRICULUM_STARTER_REF;
// Google Sheets. `public` (the default for this suite) boots the editor on the
// dev server's test-only public-sheets path, so the ~76 sheet-backed starter
// files can read their real data instead of stopping at the Google call.
// `none` is the plain editor, where those files are expected to stop there --
// expectations.js records both, so either way is checked rather than skipped.
const sheets = arg("sheets") || process.env.PYRET_SHEETS || "public";
if (!["public", "none"].includes(sheets)) die("--sheets must be public or none");

const nodeArgs = ["--test", "--test-reporter=" + reporter];
if (grep) nodeArgs.push("--test-name-pattern=" + grep);
nodeArgs.push(path.join(__dirname, "tests", "starter-files.test.js"));

(async () => {
  const manifest = require("./manifest");
  const P = require("./pins");
  const useRef = ref || P.STARTER_FILES_REF;

  process.stderr.write(
    "resolving the curriculum manifest (starter-files@" + useRef +
    ", curriculum@" + P.CURRICULUM_COMMIT.slice(0, 12) + ")... ");
  let resolved;
  try {
    resolved = await manifest.build({ ref: useRef });
  } catch (e) {
    process.stderr.write("failed\n");
    console.error(
      "could not build the manifest: " + e.message + "\n" +
      "It is fetched from raw.githubusercontent.com and cached under " +
      path.relative(process.cwd(), manifest.CACHE) + "; check network access.");
    process.exit(2);
  }
  const ok = resolved.entries.filter((e) => e.code != null).length;
  process.stderr.write(ok + "/" + resolved.entries.length + " entry points\n");

  const file = manifest.writeResolved(
    resolved,
    path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pyret-curriculum-")), "manifest.json"));

  const child = spawn(process.execPath, nodeArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      PYRET_ENV: env,
      PYRET_COMPILER: compiler,
      CURRICULUM_PARTS: parts,
      CURRICULUM_MANIFEST: file,
      CURRICULUM_STARTER_REF: useRef,
      PYRET_SHEETS: sheets === "public" ? "public" : "",
    },
  });
  child.on("exit", (code, signal) => {
    try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch (e) { /* best effort */ }
    if (signal) process.kill(process.pid, signal);
    else process.exit(code == null ? 1 : code);
  });
})();
