/*
 * vm-bench.js -- run the pitometer programs on both back ends and report
 * the ratio.
 *
 * The comparison that matters for the interpreter is against the stock
 * backend on the same machine, same runtime, same program, so this builds
 * each benchmark twice with the one compiler (--backend js vs
 * --backend vm) and times the standalones. Startup is measured
 * separately (0_empty.arr) and subtracted, because for the short benchmarks
 * it dominates and is identical in both.
 *
 * Usage, from lang/:
 *   node src/ts-compiler/tests/vm-bench.js [--runs=3] [--filter=regex] [--build]
 *
 * --build rebuilds the standalones (needed the first time and after any
 * compiler or machine change); without it, existing ones are reused.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PROGRAMS = path.join(ROOT, 'pitometer', 'programs');
const WORK = path.join(ROOT, 'build', 'ts-compiler', 'vm-bench');
const PYRET = path.join(ROOT, 'build', 'ts-compiler', 'pyret.js');

function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith('--' + name + '='));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
}
const RUNS = parseInt(arg('runs', '3'), 10);
const FILTER = new RegExp(arg('filter', '.'));
const DO_BUILD = process.argv.includes('--build');
// Programs whose measured work is under this are dominated by process
// startup and module loading rather than by the program, so their ratio says
// nothing about the back ends; they are printed but not scored. (Module load
// is not even the same on both sides: bytecode loads FASTER than generated
// JavaScript, which is why the empty-program floor differs.)
const NOISE_MS = parseFloat(arg('noise', '150'));

const BACKENDS = {
  js: {
    config: 'src/scripts/standalone-configA.json',
    compiled: path.join(WORK, 'compiled-js'),
  },
  vm: {
    config: 'src/scripts/standalone-config-vm.json',
    compiled: path.join(WORK, 'compiled-vm'),
  },
};

function build(prog, backend) {
  const base = path.basename(prog, '.arr');
  const out = path.join(WORK, base + '-' + backend + '.jarr');
  if (!DO_BUILD && fs.existsSync(out)) { return out; }
  const b = BACKENDS[backend];
  const r = cp.spawnSync('node', [
    PYRET, '--backend', backend,
    '--build-runnable', prog, '--outfile', out,
    '--builtin-js-dir', 'src/js/trove/',
    '--builtin-arr-dir', 'src/arr/trove/',
    '--compiled-dir', b.compiled,
    '--require-config', b.config,
    '-no-check-mode', '-no-display-progress',
  ], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`build failed (${backend}) for ${base}:\n${r.stderr}`);
  }
  return out;
}

function once(jarr) {
  const t0 = process.hrtime.bigint();
  const r = cp.spawnSync('node', [jarr], { cwd: ROOT, encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r.status !== 0) {
    throw new Error(`run failed for ${jarr}:\n${r.stderr}`);
  }
  return ms;
}

// The two builds are timed ALTERNATELY rather than in two blocks, so that a
// noisy stretch of the machine hits both sides equally; the reported number
// for each is the minimum over the reps.
function timePair(jsJarr, vmJarr) {
  let bestJs = Infinity, bestIn = Infinity;
  for (let i = 0; i < RUNS; i++) {
    const j = once(jsJarr);
    const n = once(vmJarr);
    if (j < bestJs) { bestJs = j; }
    if (n < bestIn) { bestIn = n; }
  }
  return [bestJs, bestIn];
}

function timeRun(jarr) {
  let best = Infinity;
  for (let i = 0; i < RUNS; i++) {
    const ms = once(jarr);
    if (ms < best) { best = ms; }
  }
  return best;
}

fs.mkdirSync(WORK, { recursive: true });

const all = fs.readdirSync(PROGRAMS).filter((f) => f.endsWith('.arr')).sort();
const programs = all.filter((f) => FILTER.test(f));

// Startup floor: an empty program, measured on both back ends.
const floor = {};
for (const backend of ['js', 'vm']) {
  floor[backend] = timeRun(build(path.join(PROGRAMS, '0_empty.arr'), backend));
}
console.log(`startup floor: js ${floor.js.toFixed(0)}ms, vm ${floor.vm.toFixed(0)}ms\n`);

const rows = [];
for (const f of programs) {
  if (f === '0_empty.arr') { continue; }
  const prog = path.join(PROGRAMS, f);
  let jsJarr, vmJarr;
  try {
    jsJarr = build(prog, 'js');
    vmJarr = build(prog, 'vm');
  } catch (e) {
    console.log(`${f.padEnd(42)} SKIP (${String(e.message).split('\n')[0]})`);
    continue;
  }
  const [jsRaw, inRaw] = timePair(jsJarr, vmJarr);
  const jsMs = jsRaw - floor.js;
  const inMs = inRaw - floor.vm;
  // Below the noise floor the ratio is meaningless (both numbers are
  // startup jitter), so such programs are reported but not scored.
  const scored = jsMs >= NOISE_MS && inMs >= NOISE_MS;
  const ratio = inMs / jsMs;
  if (scored) { rows.push({ name: f, js: jsMs, vm: inMs, ratio }); }
  console.log(`${f.padEnd(42)} js ${jsMs.toFixed(0).padStart(7)}ms  ` +
    `vm ${inMs.toFixed(0).padStart(7)}ms  ` +
    (scored ? `x${ratio.toFixed(2)}` : `(under ${NOISE_MS}ms; not scored)`));
}

if (rows.length > 0) {
  const totalJs = rows.reduce((a, r) => a + r.js, 0);
  const totalIn = rows.reduce((a, r) => a + r.vm, 0);
  const ratios = rows.map((r) => r.ratio).sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  console.log('');
  console.log(`total: js ${totalJs.toFixed(0)}ms, vm ${totalIn.toFixed(0)}ms ` +
    `(x${(totalIn / totalJs).toFixed(2)} aggregate, x${median.toFixed(2)} median)`);
  const worst = rows.slice().sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  console.log('slowest relative: ' +
    worst.map((r) => `${r.name} x${r.ratio.toFixed(2)}`).join(', '));
}
