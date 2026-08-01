#!/usr/bin/env node
/*
 * run.js -- friendly CLI over the curriculum suite. A thin flag mapper: the
 * manifest and specs are static files, so there is nothing to resolve first;
 * this just spawns `node --test` with the right environment.
 *
 *   node curriculum/run.js [--compiler=pyret|ts] [--sheets=public|none]
 *                          [--grep=<regex>] [--parts=all|pin,shareurl,files]
 *                          [--reporter=spec|tap|dot|junit]
 *
 * Examples:
 *   node curriculum/run.js                          # everything
 *   node curriculum/run.js --grep 'Rocket Height'   # one starter file
 *   node curriculum/run.js --grep '^data-science/'  # one area
 *   node curriculum/run.js --compiler=ts            # the TS-compiler flavor
 *   node curriculum/run.js --sheets=none            # no Google dependency
 *
 * Needs the code.pyret.org server at BASE_URL (default localhost:4999).
 * --sheets=public (the default) additionally needs it to be a DEVELOPMENT
 * server, which is what carries the test-only public-sheets proxy; against
 * any other server, pass --sheets=none.
 *
 * cpo only: the sheets knob and the #shareurl= hash are /editor features;
 * embedded hosts deliver contents over their own protocols.
 */
const path = require("path");
const { spawn } = require("child_process");

const KNOWN_FLAGS = ["compiler", "sheets", "grep", "parts", "reporter"];
const USAGE =
  "usage: node curriculum/run.js [--compiler=pyret|ts] [--sheets=public|none] " +
  "[--grep=<regex>] [--parts=all|pin,shareurl,files] [--reporter=spec|tap|dot|junit]";

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

// Reject anything unrecognized: a misspelled filter that silently runs all
// 158 files reads as "my filter matched everything".
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

const compiler = arg("compiler") || process.env.PYRET_COMPILER || "pyret";
if (!["pyret", "ts"].includes(compiler)) die("--compiler must be pyret or ts");
const sheets = arg("sheets") || process.env.PYRET_SHEETS || "public";
if (!["public", "none"].includes(sheets)) die("--sheets must be public or none");
const reporter = arg("reporter") || "spec";
const parts = arg("parts");
const grep = arg("grep");

const env = Object.assign({}, process.env, {
  PYRET_COMPILER: compiler,
  PYRET_SHEETS: sheets,
});
if (parts !== undefined) env.CURRICULUM_PARTS = parts;
if (grep !== undefined) env.CURRICULUM_GREP = grep;

const nodeArgs = ["--test", "--test-reporter=" + reporter];
nodeArgs.push(path.join(__dirname, "tests", "curriculum.test.js"));

const child = spawn(process.execPath, nodeArgs, { env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code === null ? 1 : code);
});
