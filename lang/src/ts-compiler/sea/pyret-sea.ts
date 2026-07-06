/*
  Single-executable entry point for the TS Pyret compiler — a drop-in for
  `node build/ts-compiler/pyret.js` with byte-exact output. Compiled with
  `bun build --compile` (see build-sea.sh).

  Handled before the real CLI (pyret.ts) runs:

  1. The AMD support modules (tokenizer, generated parser, js-numbers,
     type-util, jglr/rnglr/cyclicJSON) and amd_loader.js are embedded and
     registered (see embedded-assets.ts), so nothing is read from a
     nonexistent on-disk directory relative to the executable.

  2. pyret.ts re-execs node with `--stack-size=8192` for deep compiles. That
     is a V8 flag (bun uses JSC) and would re-exec the binary against a virtual
     `/$bunfs/root/...` path, so we suppress it with PYRET_TS_NO_RESPAWN. The
     compiler's per-statement recursion is already iterative (README "Browser
     bundling"), so the default stack suffices even for a cold main2 compile.

  Everything else — the input .arr, the builtin trove dirs, and the
  require-config / deps-file / standalone-file named on the command line —
  is read from disk exactly as in the node build. This is the *compiler* in
  one file, not a bundle of the standard library.
*/

import * as path from 'path';
import { registerEmbeddedAssets } from './embedded-assets';

// Suppress the stack-size re-exec before pyret.ts's top-level code runs.
if (!process.env.PYRET_TS_NO_RESPAWN) {
  process.env.PYRET_TS_NO_RESPAWN = '1';
}

// Make this binary a drop-in for `node build/ts-compiler/pyret.js`. cmdline.ts
// snapshots process.argv[1] as the compiler's own path; pyret.ts derives
// `thisPyretDir` from its dirname, which is where implicit-default assets live
// (config.json, bundled-node-deps.js — used when --require-config / --deps-file
// are omitted) and what appears in usage/error text. In a bun binary argv[1] is
// a virtual `/$bunfs/root/...` path, so we repoint it at the real asset dir:
// $PYRET_TS_HOME if set, else <cwd>/build/ts-compiler (the layout the node CLI
// and Makefile assume when run from lang/). Set before pyret/cmdline evaluate.
const tsHome = process.env.PYRET_TS_HOME
  ? path.resolve(process.env.PYRET_TS_HOME)
  : path.resolve(process.cwd(), 'build', 'ts-compiler');
process.argv[1] = path.join(tsHome, 'pyret.js');

registerEmbeddedAssets();

// Hand off to the real CLI. Dynamic import so the env + registrations above
// are in place before pyret.ts (and cmdline.ts, which snapshots process.argv)
// evaluate. The bun-compiled process.argv layout is ["bun", "<script>",
// ...userArgs] — identical to node's — so cmdline.ts needs no adjustment.
import('../src/pyret');
