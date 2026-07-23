#!/usr/bin/env node
/*
 * run.js -- friendly CLI over the node:test suite.
 *
 *   node run.js --env=cpo|embed|vscode [--grep=<regex>] [--suites=all|a,b] [--reporter=spec|tap|dot]
 *
 * Examples:
 *   node run.js --env=embed --grep tables        # one feature, in the embed instance
 *   node run.js --env=cpo   --grep 'is-not'      # regex over test names
 *   node run.js --env=vscode                     # everything, in the vscode webview
 *
 * This just shells out to `node --test` with the right flags + PYRET_ENV, so you
 * get node:test's native reporters and exit code. `--grep` maps to
 * --test-name-pattern (matches suite names and individual test names).
 *
 * It needs no build of its own; cpo/embed need the CPO server running, vscode
 * does not (its assets come from the built extension).
 */
const path = require("path");
const { spawn } = require("child_process");

function arg(name) {
  // supports "--name=value" and "--name value"
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--" + name) return argv[i + 1];
    if (argv[i].startsWith("--" + name + "=")) return argv[i].slice(name.length + 3);
  }
  return undefined;
}

const env = arg("env");
if (!env || !["cpo", "embed", "embed-static", "vscode", "vscode-ovsx"].includes(env)) {
  console.error("usage: node run.js --env=cpo|embed|embed-static|vscode|vscode-ovsx [--grep=<regex>] [--suites=all|a,b] [--reporter=spec|tap|dot]");
  process.exit(2);
}
const grep = arg("grep");
const suites = arg("suites") || "all";
const reporter = arg("reporter") || "spec";

const nodeArgs = ["--test", "--test-reporter=" + reporter];
if (grep) nodeArgs.push("--test-name-pattern=" + grep);
nodeArgs.push(path.join(__dirname, "tests", "suite.test.js"));

const child = spawn(process.execPath, nodeArgs, {
  stdio: "inherit",
  env: { ...process.env, PYRET_ENV: env, PYRET_SUITES: suites },
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code == null ? 1 : code);
});
