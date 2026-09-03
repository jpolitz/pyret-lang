// Autograder shape: N submissions compiled+run concurrently against one warm
// compile server, each in its own directory. Half are correct (they print a
// marker unique to that submission), half have a compile error naming a
// unique unbound identifier. Checks that every invocation gets ITS OWN
// output, its own error, and a sane exit code.
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };
const PYRET = opt('pyret');
const ROOT = opt('root');
const SOCK = opt('port');
const BACKEND = opt('backend', 'pyret');
const N = Number(opt('n', '8'));
const PAR = Number(opt('par', String(N)));   // how many at once

fs.rmSync(ROOT, { recursive: true, force: true });
const subs = [];
for (let i = 0; i < N; i++) {
  const dir = path.join(ROOT, 'sub' + i);
  fs.mkdirSync(dir, { recursive: true });
  const broken = i % 2 === 1;
  const src = broken
    ? `print("MARKER-${i}\\n")\nunbound-in-sub-${i} + 1\n`
    : `print("MARKER-${i}\\n")\ncheck: ${i} + 1 is ${i + 1} end\n`;
  fs.writeFileSync(path.join(dir, 'sub.arr'), src);
  subs.push({ i, dir, broken });
}

function run(s) {
  return new Promise((resolve) => {
    const a = ['--backend', BACKEND, '--port', SOCK, 'sub.arr'];
    const p = cp.spawn('node', [PYRET, ...a], { cwd: s.dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (c) => { out += String(c); });
    p.stderr.on('data', (c) => { err += String(c); });
    p.on('exit', (code, sig) => resolve({ ...s, code, sig, out, err }));
  });
}

(async function () {
  const results = [];
  for (let i = 0; i < subs.length; i += PAR) {
    results.push(...await Promise.all(subs.slice(i, i + PAR).map(run)));
  }

  const problems = [];
  for (const r of results) {
    const all = r.out + r.err;
    const foreign = results
      .filter((o) => o.i !== r.i)
      .filter((o) => all.includes('MARKER-' + o.i) || all.includes('unbound-in-sub-' + o.i))
      .map((o) => o.i);
    if (foreign.length) {
      problems.push(`sub${r.i} saw output belonging to sub${foreign.join(',sub')}`);
    }
    if (r.broken) {
      if (!all.includes('unbound-in-sub-' + r.i)) {
        problems.push(`sub${r.i} (broken) never reported its own unbound name; exit=${r.code} sig=${r.sig}`);
      }
      if (r.code === 0) { problems.push(`sub${r.i} (broken) exited 0`); }
    } else {
      if (!all.includes('MARKER-' + r.i)) {
        problems.push(`sub${r.i} (ok) never printed its own marker; exit=${r.code} sig=${r.sig}`);
      }
      if (r.code !== 0) { problems.push(`sub${r.i} (ok) exited ${r.code} sig=${r.sig}`); }
    }
  }
  console.log(JSON.stringify({
    backend: BACKEND, n: N, parallelism: PAR,
    ok: problems.length === 0,
    problems,
    exitCodes: results.map((r) => ({ i: r.i, broken: r.broken, code: r.code, sig: r.sig })),
  }, null, 1));
})();
