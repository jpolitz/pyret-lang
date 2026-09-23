// Drives `pyret --repl` (either back end) line by line and times each step.
// Startup = spawn -> first ">>> " prompt. Per-expression = write a line ->
// next ">>> " prompt. Emits one JSON object on stdout.
const cp = require('child_process');

const args = process.argv.slice(2);
function opt(name, dflt) {
  const i = args.indexOf('--' + name);
  return i === -1 ? dflt : args[i + 1];
}
const PYRET = opt('pyret');
const CWD = opt('cwd');
const MODE = opt('mode');            // 'server' | 'local'
const PORT = opt('port', null);
const EXPRS = JSON.parse(opt('exprs'));

const spawnArgs = ['--repl'];
if (MODE === 'local') { spawnArgs.push('--no-server'); }
if (PORT) { spawnArgs.push('--port', PORT); }

const t0 = process.hrtime.bigint();
const proc = cp.spawn('node', [PYRET, ...spawnArgs], { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
let waiter = null;
let exited = false;
let rejecter = null;
const out = [];
proc.on('exit', () => {
  exited = true;
  if (rejecter) { rejecter(new Error('repl exited early:\n' + out.join(''))); }
});

function onData(chunk) {
  const s = String(chunk);
  out.push(s);
  buf += s;
  if (waiter && buf.includes('>>> ')) {
    buf = buf.slice(buf.lastIndexOf('>>> ') + 4);
    const w = waiter; waiter = null; rejecter = null; w();
  }
}
proc.stdout.on('data', onData);
proc.stderr.on('data', (c) => out.push(String(c)));

function waitPrompt() {
  return new Promise((resolve, reject) => {
    if (buf.includes('>>> ')) {
      buf = buf.slice(buf.lastIndexOf('>>> ') + 4);
      return resolve();
    }
    if (exited) { return reject(new Error('repl exited early:\n' + out.join(''))); }
    waiter = resolve;
    rejecter = reject;
  });
}

const ms = (a, b) => Number(b - a) / 1e6;

(async function () {
  const result = { mode: MODE, startupMs: null, exprs: [] };
  await waitPrompt();
  result.startupMs = ms(t0, process.hrtime.bigint());
  for (const e of EXPRS) {
    const s = process.hrtime.bigint();
    proc.stdin.write(e + '\n');
    await waitPrompt();
    result.exprs.push({ expr: e, ms: ms(s, process.hrtime.bigint()) });
  }
  proc.stdin.end();
  await new Promise((r) => proc.on('exit', r));
  result.totalMs = ms(t0, process.hrtime.bigint());
  console.log(JSON.stringify(result));
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
