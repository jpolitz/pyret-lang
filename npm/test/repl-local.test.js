// End-to-end test for the no-server CLI REPL (`pyret --repl --no-server`).
//
// Same session and same assertions as repl.test.js, against the in-process
// back end: the TS compiler and a Pyret runtime in the CLI process, no
// compile server and no socket. Skipped unless the package was built with
// the ts-compiler (PYRET_NPM_TS=1), which is what --no-server runs on.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NPM_DIR = path.join(__dirname, '..');
const PYRET_JS = path.join(NPM_DIR, 'pyret.js');
const TS_COMPILER = path.join(NPM_DIR, 'pyret-lang', 'build', 'ts-compiler', 'pyret.js');
const TIMEOUT = 180000;

const describeIfTS = fs.existsSync(TS_COMPILER) ? describe : describe.skip;

function runRepl(input) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pyret-repl-local-'));
  try {
    const proc = cp.spawnSync(
      'node',
      [PYRET_JS, '--repl', '--no-server'],
      { input, cwd, encoding: 'utf8', timeout: TIMEOUT });
    return (proc.stdout || '') + (proc.stderr || '');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describeIfTS('pyret --repl --no-server', () => {
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
      'fun sq(n):',
      '  n * n',
      'end',
      'sq(12)',
      '"the-end"',
      '',
    ].join('\n'));
  }, TIMEOUT + 20000);

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
    expect(out).not.toContain("didn't define any tests");
  });

  test('a multi-line definition is read to its end and is callable', () => {
    expect(out).toContain('144');
  });

  test('the session runs to completion (no internal errors)', () => {
    expect(out).toContain('the-end');
    expect(out).not.toContain('internal error');
  });

  test('starts no compile server and creates no socket', () => {
    expect(out).not.toContain('Starting Parley server');
  });
});
