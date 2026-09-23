// Does Ctrl-C (SIGINT) actually interrupt a runaway interaction?
// Starts a REPL, sends a non-terminating loop, waits 3s, sends SIGINT,
// then sends a trivial expression and reports whether the REPL answers.
const cp = require('child_process');
const args = process.argv.slice(2);
const MODE = args[0];               // 'server' | 'local'
const PYRET = args[1];
const CWD = args[2];
const SOCK = args[3];

const spawnArgs = ['--repl'];
if (MODE === 'local') { spawnArgs.push('--no-server'); }
else { spawnArgs.push('--port', SOCK); }

const proc = cp.spawn('node', [PYRET, ...spawnArgs], { cwd: CWD, stdio: ['pipe','pipe','pipe'] });
let out = '';
proc.stdout.on('data', (c) => { out += String(c); });
proc.stderr.on('data', (c) => { out += String(c); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function waitFor(sub, ms) {
  const t0 = Date.now();
  return (async function loop() {
    while (Date.now() - t0 < ms) {
      if (out.includes(sub)) { return true; }
      await sleep(100);
    }
    return false;
  })();
}

(async function () {
  const ready = await waitFor('>>> ', 60000);
  if (!ready) { console.log(JSON.stringify({mode: MODE, error: 'never prompted', out})); process.exit(1); }
  out = '';
  proc.stdin.write('fun spin(n): if n < 0: 0 else: spin(n + 1) end end\n');
  await sleep(1500);
  out = '';
  proc.stdin.write('spin(0)\n');
  await sleep(3000);
  const before = out;
  proc.kill('SIGINT');
  const interrupted = await waitFor('Interrupted', 10000);
  out = '';
  proc.stdin.write('7 * 6\n');
  const recovered = await waitFor('42', 10000);
  console.log(JSON.stringify({
    mode: MODE,
    sawInterruptedBanner: interrupted,
    repliedAfterInterrupt: recovered,
    tailAfter: out.slice(-200),
  }));
  proc.kill('SIGKILL');
  process.exit(0);
})();
