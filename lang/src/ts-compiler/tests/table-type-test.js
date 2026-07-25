#!/usr/bin/env node
/*
  Type-checking tests for the table types added to the TypeScript compiler.

  Run from lang/:  node src/ts-compiler/tests/table-type-test.js
  (or `make ts-table-type-test`).  Requires `make ts-compiler` first.

  Every program in tests/table-types/good/ must type check; every program in
  tests/table-types/bad/ must be rejected.  A `bad` program may carry a
  `#:expect <substring>` comment on its first line, which must appear in the
  reported error.

  The programs in table-types/examples are checked here too, so the delivered
  examples cannot silently rot.

  Each program is checked in a child process (`--one FILE`): the compiler
  keeps process-wide state, and running dozens of whole-program compiles in
  one process eventually exhausts the stack.
*/

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const LANG = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(LANG, 'build', 'ts-compiler');
const CACHE = path.join(OUT, 'table-type-test-cache');


// The compiled-module cache is keyed on source mtimes, not on the compiler's,
// so drop it whenever the compiler itself is newer than the cache.
function freshCache(cacheDir, compilerFile) {
  const stamp = path.join(cacheDir, '.compiler-stamp');
  const compilerTime = fs.statSync(compilerFile).mtimeMs;
  const stale = !fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8').trim() !== String(compilerTime);
  if (stale) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(stamp, String(compilerTime));
}

function checkOne(file) {
  process.chdir(LANG);
  const load = (m) => require(path.join(OUT, m));
  const B = load('locators/builtin.js');
  B.setBuiltinJsDirs(['src/js/trove/']);
  B.setBuiltinArrDirs(['src/arr/trove/']);
  const CS = load('compile-structs.js');
  const CL = load('compile-lib.js');
  const CLI = load('cli-module-loader.js');
  const RED = load('render-error-display.js');
  const shared = load('shared.js');

  const errorText = [];
  const options = {
    ...CS.makeDefaultCompileOptions(LANG),
    typeCheck: true,
    checks: 'none',
    compiledCache: CACHE,
    compiledReadOnly: [],
    displayProgress: false,
    collectAll: false,
    baseDir: path.dirname(file),
    depsFile: path.join(LANG, 'build', 'phaseA', 'bundled-node-compile-deps.js'),
    log: () => {},
    logError: (s) => { errorText.push(s); },
  };
  return CLI.compile(file, options).then((result) => {
    const failures = result.loadables.filter(CL.isErrorCompilation);
    if (failures.length === 0) { process.exit(0); }
    for (const f of failures) {
      for (const p of f.resultPrinter.problems) {
        process.stdout.write(RED.displayToString(p.renderReason(), shared.toRepr, []) + '\n');
      }
    }
    process.exit(1);
  }).catch((e) => {
    process.stdout.write(errorText.join(''));
    process.stdout.write(String((e && e.message) || e) + '\n');
    process.exit(1);
  });
}

function typeCheckFile(file) {
  const r = spawnSync(process.execPath, [__filename, '--one', file],
    { encoding: 'utf8', cwd: LANG, maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  return { ok: r.status === 0, message: out };
}

function listArr(dir) {
  if (!fs.existsSync(dir)) { return []; }
  return fs.readdirSync(dir).filter((f) => f.endsWith('.arr')).sort()
    .map((f) => path.join(dir, f));
}

function expectation(file) {
  const first = fs.readFileSync(file, 'utf8').split('\n')[0];
  const m = /^#:expect\s+(.*)$/.exec(first.trim());
  return m === null ? undefined : m[1].trim();
}

if (process.argv[2] === '--one') {
  // child mode: checkOne exits the process itself
  checkOne(path.resolve(process.argv[3]));
} else {
  runAll();
}

function runAll() {
const HERE = path.join(LANG, 'src', 'ts-compiler', 'tests', 'table-types');
const EXAMPLES = path.join(HERE, 'examples');

let passed = 0;
const failures = [];

// Warm the shared module cache once, so the per-file children do not each
// recompile the trove.
freshCache(CACHE, path.join(OUT, 'pyret.js'));

for (const file of [...listArr(path.join(HERE, 'good')), ...listArr(EXAMPLES)]) {
  const r = typeCheckFile(file);
  if (r.ok) {
    passed++;
    console.log('ok   good/' + path.basename(file));
  } else {
    failures.push(path.basename(file));
    console.log('FAIL ' + file + ' should type check:\n' + r.message);
  }
}

for (const file of listArr(path.join(HERE, 'bad'))) {
  const r = typeCheckFile(file);
  if (r.ok) {
    failures.push(path.basename(file));
    console.log('FAIL ' + file + ' should NOT type check');
    continue;
  }
  const want = expectation(file);
  if (want !== undefined && !r.message.includes(want)) {
    failures.push(path.basename(file));
    console.log('FAIL ' + file + ' error did not mention ' + JSON.stringify(want) + ':\n' + r.message);
    continue;
  }
  passed++;
  console.log('ok   bad/' + path.basename(file));
}

console.log('');
console.log('table types: ' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length > 0) {
  console.log('failed: ' + failures.join(', '));
  process.exit(1);
}
}
