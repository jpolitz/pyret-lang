// End-to-end test for the CLI REPL (`pyret --repl`).
//
// Spawns the real `pyret.js --repl`, feeds a session of interactions on stdin,
// and asserts on the rendered output. This exercises the full stack: the
// repl-client TUI, the WebSocket protocol, and the server-side REPL session
// (server.arr / load-lib). It guards the integration bugs that unit tests
// can't see — value rendering, stdout routing, check results, and the
// "no tests defined" noise-suppression.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NPM_DIR = path.join(__dirname, '..');
const PYRET_JS = path.join(NPM_DIR, 'pyret.js');
// Unique socket per run so a lingering server from another run can't collide.
const SOCK = path.join(os.tmpdir(), 'pyret-repl-test-' + process.pid + '.sock');
// First run compiles the standard library, so allow generous startup time.
const TIMEOUT = 180000;

// Run a REPL session: `input` is the text typed at the prompt (stdin), and we
// return the combined stdout+stderr the user would have seen.
function runRepl(input) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pyret-repl-'));
  try {
    const proc = cp.spawnSync(
      'node',
      [PYRET_JS, '--repl', '--port', SOCK],
      { input, cwd, encoding: 'utf8', timeout: TIMEOUT });
    return (proc.stdout || '') + (proc.stderr || '');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe('pyret --repl', () => {
  let out;

  beforeAll(() => {
    out = runRepl([
      '1 + 1',
      'x = 10',
      'x + 5',
      '[list: 1, 2, 3]',
      'print("io-marker\\n")',
      'check: 2 + 2 is 4 end',
      'check: 1 is 2 end',
      'nonexistent-var',
      '"the-end"',
      '',
    ].join('\n'));
  }, TIMEOUT + 20000);

  // Shut the background compile server down so it doesn't linger after tests.
  afterAll(() => {
    try {
      cp.spawnSync('node', [PYRET_JS, '--shutdown', '--port', SOCK],
        { timeout: 15000, encoding: 'utf8' });
    } catch (e) { /* best effort */ }
    try { fs.unlinkSync(SOCK); } catch (e) { /* ignore */ }
  });

  test('renders the value of an expression', () => {
    expect(out).toMatch(/\b2\b/);
    expect(out).toContain('15');
  });

  test('renders a structured value with torepr', () => {
    expect(out).toContain('[list: 1, 2, 3]');
  });

  test('routes print() output to stdout, and shows the returned value', () => {
    expect(out).toContain('io-marker');
  });

  test('shows passing check results', () => {
    expect(out.toLowerCase()).toContain('shipshape');
  });

  test('shows failing check results', () => {
    expect(out).toMatch(/Values not equal|Failed: 1/);
  });

  test('reports unbound names as a clean compile error', () => {
    expect(out).toContain('unbound');
  });

  test('does NOT print the "no tests" message after plain expressions', () => {
    // Regression: render-check-results used to print this after every line.
    expect(out).not.toContain("didn't define any tests");
  });

  test('the session runs to completion (no internal errors)', () => {
    expect(out).toContain('the-end');
    expect(out).not.toContain('internal error');
  });
});
