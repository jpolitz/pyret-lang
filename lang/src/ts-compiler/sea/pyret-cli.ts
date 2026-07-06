/*
  Friendly single-command Pyret CLI — the `pyret ahoy-world.arr` experience.

  Lifts the user-facing options from npm/pyret.js (the published `pyret`
  command) but drops the compile-server machinery: there is no Parley server,
  socket, or `.pyret` symlink dance. Because this binary *is* the compiler and
  starts in ~80ms, it just compiles in-process and runs the result — the whole
  reason the server existed (amortizing node + compiler startup) is gone.

    pyret ahoy-world.arr        # compile to ahoy-world.jarr and run it
    pyret -c foo.arr            # compile only, don't run
    pyret -y -q foo.arr         # type-check, no progress output
    pyret -o out.jarr foo.arr   # choose the output file

  Options (compatible subset of the npm CLI):
    -p, --program <file.arr>  program to compile (default positional arg)
    -o, --outfile <file.jarr> output file (default: <program>.jarr)
    -c, --norun               compile only; do not run
    -q, --quiet               suppress the "N/M modules compiled" progress
    -y, --type-check          turn on the type checker
    -k, --no-check-mode       omit check blocks entirely
    -e, --checks <spec>       which checks to run (all|none|main|only:<pat>)
        --perilous            elide user annotation checks for speed
    -h, --help                show help
    -v, --version             print version

  Asset locations default to the repo checkout ($PYRET_ROOT, else cwd), so it
  works out of the box when run from lang/. Compiled modules are cached in
  ./.pyret/compiled for fast re-compiles; the runnable standalone is run with
  node (the .jarr is a node program that require()s runtime npm deps, exactly
  as the npm CLI's output does), with NODE_PATH pointed at <root>/node_modules.
*/

import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
import pkg from '../package.json' with { type: 'json' };
import { registerEmbeddedAssets } from './embedded-assets';

const VERSION: string = (pkg as any).version ?? '0.0.0';

const root = process.env.PYRET_ROOT
  ? path.resolve(process.env.PYRET_ROOT)
  : process.cwd();
const tsHome = path.join(root, 'build', 'ts-compiler');

// ---- friendly-option parsing -------------------------------------------------
interface Parsed {
  program?: string;
  outfile?: string;
  norun: boolean;
  quiet: boolean;
  typeCheck: boolean;
  noCheckMode: boolean;
  perilous: boolean;
  checks?: string;
  help: boolean;
  version: boolean;
}

const HELP = `Pyret Command-line Interface v${VERSION}

  The pyret command compiles and runs a Pyret program.

Usage:
  pyret [options] <file.arr>

Options:
  -p, --program <file.arr>   Program to compile (default positional argument).
  -o, --outfile <file.jarr>  Output file (default: <program> with .arr -> .jarr).
  -c, --norun                Compile only; do not run the result.
  -q, --quiet                Don't print the "N/M modules compiled" progress.
  -y, --type-check           Turn on the type checker.
  -k, --no-check-mode        Omit check blocks during compilation.
  -e, --checks <spec>        Which checks to run: all | none | main | only:<pat>.
      --perilous             Elide user annotation checks for speed.
  -h, --help                 Show this help message.
  -v, --version              Print version information.

Examples:
  $ pyret ahoy-world.arr
  1/1 modules compiled
  Looks shipshape, your test passed, mate!
`;

function parseArgs(argv: string[]): Parsed {
  const p: Parsed = {
    norun: false, quiet: false, typeCheck: false,
    noCheckMode: false, perilous: false, help: false, version: false,
  };
  const needsValue = (name: string): never => {
    process.stderr.write(`pyret: option ${name} needs a value\n`);
    process.exit(1);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': p.help = true; break;
      case '-v': case '--version': p.version = true; break;
      case '-c': case '--norun': p.norun = true; break;
      case '-q': case '--quiet': p.quiet = true; break;
      case '-y': case '--type-check': p.typeCheck = true; break;
      case '-k': case '--no-check-mode': p.noCheckMode = true; break;
      case '--perilous': p.perilous = true; break;
      case '-o': case '--outfile': p.outfile = argv[++i] ?? needsValue(a); break;
      case '-e': case '--checks': p.checks = argv[++i] ?? needsValue(a); break;
      case '-p': case '--program': p.program = argv[++i] ?? needsValue(a); break;
      default:
        if (a.startsWith('-')) {
          process.stderr.write(`pyret: unknown option ${a}\n\n${HELP}`);
          process.exit(1);
        }
        if (p.program === undefined) { p.program = a; }
        else {
          process.stderr.write(`pyret: unexpected extra argument ${a}\n`);
          process.exit(1);
        }
    }
  }
  return p;
}

// ---- translate to the underlying pyret.ts (build-runnable) invocation --------
function compilerArgs(p: Parsed, outfile: string): string[] {
  const args = [
    '--build-runnable', p.program!,
    '--outfile', outfile,
    '--builtin-js-dir', path.join(root, 'src', 'js', 'trove') + path.sep,
    '--builtin-arr-dir', path.join(root, 'src', 'arr', 'trove') + path.sep,
    '--require-config', path.join(root, 'src', 'scripts', 'standalone-configA.json'),
    // Runtime deps bundle, so the produced standalone actually runs.
    '--deps-file', path.join(tsHome, 'bundled-node-deps.js'),
    '--compiled-dir', path.join(process.cwd(), '.pyret', 'compiled'),
  ];
  if (p.quiet) { args.push('-no-display-progress'); }
  if (p.typeCheck) { args.push('-type-check'); }
  if (p.noCheckMode) { args.push('-no-check-mode'); }
  if (p.perilous) { args.push('-no-user-annotations'); } // server.ts: perilous => user-annotations:false
  if (p.checks !== undefined) { args.push('--checks', p.checks); }
  return args;
}

async function run(): Promise<number> {
  const p = parseArgs(process.argv.slice(2));
  if (p.help) { process.stdout.write(HELP); return 0; }
  if (p.version) { process.stdout.write(`Pyret Command-line Interface v${VERSION}\n`); return 0; }
  if (!p.program) { process.stderr.write(HELP); return 1; }
  if (!fs.existsSync(p.program)) {
    process.stderr.write(`pyret: no such file: ${p.program}\n`); return 1;
  }

  const outfile = p.outfile ?? (
    p.program.endsWith('.arr') ? p.program.slice(0, -4) + '.jarr' : p.program + '.jarr'
  );

  // Ensure the module cache dir exists (the compiler mkdir()s only one level).
  fs.mkdirSync(path.join(process.cwd(), '.pyret', 'compiled'), { recursive: true });

  // Set up to import the compiler as a library (guarded by PYRET_TS_LIBRARY so
  // importing pyret.ts does not auto-run or respawn); repoint argv[1] at the
  // real asset dir so implicit-default paths resolve, then register the
  // embedded AMD assets. Done here (not at module load) so the hidden --__exec
  // path stays lightweight.
  process.env.PYRET_TS_LIBRARY = '1';
  process.env.PYRET_TS_NO_RESPAWN = '1';
  process.argv[1] = path.join(tsHome, 'pyret.js');
  registerEmbeddedAssets();

  const pyret = await import('../src/pyret');
  let exitCode: number;
  try {
    exitCode = await pyret.main(compilerArgs(p, outfile));
  } catch (e: any) {
    // build-runnable throws on compile errors; mirror pyret.ts's message.
    process.stderr.write('The run ended in error:\n\n' +
      (e && e.message !== undefined ? e.message : String(e)) + '\n');
    return 1;
  }
  if (exitCode !== 0) { return exitCode; }
  if (p.norun) { return 0; }

  // Run the standalone. The .jarr require()s runtime npm deps (safe-buffer,
  // resolve, vega, ...); point NODE_PATH at the checkout's node_modules so they
  // resolve wherever outfile lives. Default runner is `node`: it matches the
  // reference run byte-for-byte and handles vega's ESM-only package the way the
  // rest of the toolchain expects. PYRET_RUN_WITH overrides it — `self` runs
  // the standalone inside this binary's embedded runtime (no external node
  // needed; ~50ms faster, but bun mis-resolves vega so avoid it for programs
  // that use charts/reactors), or any command name (e.g. `bun`).
  const runner = process.env.PYRET_RUN_WITH ?? 'node';
  const env = {
    ...process.env,
    NODE_PATH: path.join(root, 'node_modules'),
    // Cache V8 bytecode for the standalone's stable bulk (runtime + bundled
    // deps, ~8 MB), so repeated runs skip re-compiling it. Safe: keyed by
    // file content, so a changed program still recompiles its own module.
    NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE
      ?? path.join(process.cwd(), '.pyret', 'node-compile-cache'),
  };
  const res = runner === 'self'
    ? spawnSync(process.execPath, ['--__exec', outfile], { stdio: 'inherit', env })
    : spawnSync(runner, [outfile], { stdio: 'inherit', env });
  return res.status === null ? 1 : res.status;
}

// Dispatch. The hidden --__exec mode runs a compiled standalone inside this
// binary (used by the run step above) so the tool needs no external runtime.
if (process.argv[2] === '--__exec') {
  const target = path.resolve(process.argv[3]);
  process.argv = [process.argv[0], target, ...process.argv.slice(4)];
  require(target);
} else {
  run().then((code) => process.exit(code), (e) => {
    process.stderr.write('pyret: internal error: ' + (e?.stack ?? String(e)) + '\n');
    process.exit(1);
  });
}
