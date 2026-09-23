// Simulates the real workflow: start the REPL, use it, Ctrl-C the client,
// start it again in the same terminal -- N times against one surviving server.
// Reports the server's RSS after each cycle, how long each restart took to
// reach a prompt, and whether the REPL still works at the end.
const cp = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };
const PYRET = opt('pyret');
const CWD = opt('cwd');
const MODE = opt('mode');          // 'server' | 'local'
const SOCK = opt('port', null);
const CYCLES = Number(opt('cycles', '6'));
const SIGNAL = opt('signal', 'SIGINT');   // SIGINT = Ctrl-C, SIGKILL = hard kill

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serverRssMB() {
  try {
    const out = cp.execSync(
      "ps -eo rss,cmd --no-headers | grep 'pyret.jarr -serve' | grep -v grep",
      { encoding: 'utf8' });
    const kb = out.trim().split('\n').reduce((s, l) => s + Number(l.trim().split(/\s+/)[0]), 0);
    return +(kb / 1024).toFixed(1);
  } catch (e) { return null; }
}

function startRepl() {
  const a = ['--repl'];
  if (MODE === 'server') { a.push('--server', '--port', SOCK); }
  const proc = cp.spawn('node', [PYRET, ...a], { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (c) => { out += String(c); });
  proc.stderr.on('data', (c) => { out += String(c); });
  return {
    proc,
    get out() { return out; },
    async waitFor(sub, ms) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (out.includes(sub)) { return true; }
        await sleep(25);
      }
      return false;
    },
    reset() { out = ''; },
  };
}

(async function () {
  const rows = [];
  for (let i = 1; i <= CYCLES; i++) {
    const t0 = Date.now();
    const r = startRepl();
    const ok = await r.waitFor('>>> ', 120000);
    const startupMs = Date.now() - t0;
    if (!ok) { console.log(JSON.stringify({ error: 'no prompt on cycle ' + i, out: r.out })); process.exit(1); }
    r.reset();
    r.proc.stdin.write('x' + i + ' = ' + i + '\n[list: 1, 2, 3]\n');
    const answered = await r.waitFor('[list: 1, 2, 3]', 60000);
    // Ctrl-C the client and walk away, exactly as a person would.
    r.proc.kill(SIGNAL);
    await sleep(300);
    if (r.proc.exitCode === null && r.proc.signalCode === null) { r.proc.kill('SIGKILL'); }
    await sleep(700);
    rows.push({ cycle: i, startupMs, answered, serverRssMB: serverRssMB() });
  }

  // After all the abandoned sessions, does a fresh REPL still work?
  const r = startRepl();
  const ok = await r.waitFor('>>> ', 120000);
  r.reset();
  r.proc.stdin.write('7 * 6\n');
  const stillWorks = ok && await r.waitFor('42', 60000);
  r.proc.kill('SIGKILL');
  console.log(JSON.stringify({ mode: MODE, signal: SIGNAL, rows, stillWorks }, null, 1));
  process.exit(0);
})();
