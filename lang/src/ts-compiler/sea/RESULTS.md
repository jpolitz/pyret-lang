# Single-executable Pyret compiler — assessment results

A standalone, per-platform executable built from the `ts-compiler` sources
that is a **drop-in for `node build/ts-compiler/pyret.js`** with **byte-exact
output**, and starts / runs faster.

## What was built

- `build/ts-compiler/pyret-sea` — one self-contained executable (~97 MB;
  bundles the bun runtime) produced by `bun build --compile`.
- Entry: `src/ts-compiler/sea/pyret-sea.ts`. It reuses the exact compiler
  sources; the only new code is a thin shim that:
  1. **Embeds the AMD support modules** the compiler reads at runtime
     (`pyret-tokenizer`, the generated `pyret-parser`, `js-numbers`,
     `type-util`, `jglr`/`rnglr`/`cyclicJSON`) plus `amd_loader.js`, via bun
     `type: "text"` imports, and registers them through the compiler's
     existing `registerModuleSource` / `setAmdLoaderSource` hooks — so no
     on-disk lookup of those files is needed inside the binary.
  2. **Disables the `--stack-size` re-exec.** `pyret.ts` normally re-execs
     node once with an 8 MB V8 stack; that is a V8 flag (bun uses JSC) and
     would fork the binary against a virtual path. The pipeline's
     per-statement recursion is already iterative (see the port's README
     "Browser bundling"), so a **cold `main2` compile survives the default
     JSC stack** — confirmed below.
  3. **Repoints `argv[1]`** at `build/ts-compiler` (or `$PYRET_TS_HOME`) so
     every implicit-default asset path (`config.json`, `bundled-node-deps.js`)
     and the `fileName` shown in usage/error text resolve exactly like the
     node CLI.

The one supporting-source change is additive and inert on the node path:
`make-standalone.ts` gained `setAmdLoaderSource()` (an in-memory override for
`amd_loader.js`, mirroring `registerModuleSource`); unused → reads from disk
as before.

Build / test / bench targets (require `bun` on PATH):

```
make ts-compiler-sea      # build the executable
make ts-sea-parity-test   # byte-for-byte parity vs the node build
make ts-sea-bench         # startup + compile benchmarks
```

## Building on another platform (e.g. macOS)

`bun build --compile` targets the host by default, so on a Mac the same steps
produce a native (Mach-O) binary — nothing Linux-specific is baked in (the
embedded assets are platform-independent JS/text, and the runtime files are
read from the checkout):

```
# on the Mac, in a fresh clone of the cli-binary branch, from lang/
make ts-compiler        # generate parser, install local tsc, tsc -> build/ts-compiler
make ts-compiler-sea    # bun --compile -> build/ts-compiler/{pyret-sea, pyret}
build/ts-compiler/pyret ahoy-world.arr
```

Prereqs: `bun`, `node` (≥ 22.12), and `make`. Running a compiled `.jarr` uses
`node` + the checkout's `node_modules` (as the npm CLI does), so `npm install`
in `lang/` must have run (the normal build does this).

### Cross-compiling and copying to another machine

`bun build --compile --target=...` cross-compiles. From this Linux box:

```
PYRET_SEA_TARGET=bun-darwin-arm64 bash src/ts-compiler/sea/build-sea.sh \
  build/ts-compiler/pyret-sea-darwin-arm64 build/ts-compiler/pyret-darwin-arm64
```

produces valid Mach-O arm64 binaries (~66 MB each; verified with `file`).

**But you can't copy just the binary.** It embeds the *compiler*, yet at
runtime reads from the checkout: the builtin trove *sources* it compiles
(`src/js/trove`, `src/arr/trove`), `src/js/base`, `standalone-configA.json`,
`build/ts-compiler/{bundled-node-deps.js,config.json}`, the runtime files the
config concatenates (`build/phaseA/js/*`), `lib/jglr/*`, and `node_modules` to
*run* the produced `.jarr`. A minimal tree of those (binary + assets ≈ 99 MB,
plus `node_modules` ≈ 134 MB) runs the friendly CLI end-to-end with
`PYRET_ROOT` pointed at it — verified in an isolated dir.

Two snags make "copy the folder to the Mac" the wrong move:
- `node_modules` contains **native** binaries (`canvas.node` is a Linux ELF;
  vega/charts pull it in), which won't run on macOS. Simple programs don't load
  canvas so they'd work, but anything using charts/images would break.
- The rest of the checkout is needed anyway.

So the clean path on the M1 Mac is to **clone the branch and
`make ts-compiler`** there — that runs `npm install` (Mac-native
`node_modules`) and builds all the on-disk assets. Then either build a native
binary with `make ts-compiler-sea` (needs `bun`), **or** drop in the
cross-built `pyret-darwin-arm64` from this box (no `bun` needed on the Mac —
that's the cross-compile's real payoff). Both are identical binaries running
against the identical assets.

The `sea-parity.sh` and `bench.sh` scripts are POSIX/bash-3.2-safe (no
`date +%N`, no GNU `time -v`), so they run on macOS as-is.

## Byte-exact parity (vs `node build/ts-compiler/pyret.js`)

| Test | Result |
|---|---|
| Parity program set (16 programs: basics, data, objects, exceptions, type-check, and 4 compile-error cases) | **16/16** compiled `.jarr` **byte-identical**; compile stdout/stderr identical; run stdout/exit identical |
| `tests/pyret/main2.arr` — full suite, `-check-all` (~13,000 tests) | compiled `.jarr` **byte-identical** (50,499,665 bytes, both); the SEA-built suite **runs green: "all 13000 tests passed"** |
| Usage / unknown-option error text | **byte-identical** |

Parity is deterministic: the compiler's output depends only on source + flags
(+ cache-iteration order, which is shared), so node and bun — running the same
code — agree exactly. Verified independently: bun executing the *unmodified*
`pyret.js` also matched node byte-for-byte.

## Performance (same box, warm CPU; N=12 for latency rows)

### Startup latency — trivial invocation (no compile work)
| Runtime | mean | min |
|---|---|---|
| `node build/ts-compiler/pyret.js` (as shipped, respawns) | 0.213 s | 0.201 s |
| same, `PYRET_TS_NO_RESPAWN=1` | 0.106 s | 0.092 s |
| `pyret-sea` (single executable) | **0.084 s** | **0.079 s** |

→ **2.5× faster startup** than the shipped node CLI (213 → 84 ms). About half
the win is eliminating the re-exec; the rest is bun's faster cold start (no
loading/parsing ~40 `.js` modules from disk).

### Warm-cache compile of a small program
| Runtime | mean |
|---|---|
| node (shipped) | 0.414 s |
| node (no respawn) | 0.299 s |
| `pyret-sea` | **0.245 s** |

→ **1.69× faster** end-to-end (output byte-identical).

### Batch: compile 16 files, fresh process per file, warm cache
| Runtime | wall |
|---|---|
| node (shipped) | 6.41 s |
| `pyret-sea` | **3.90 s** |

→ **1.64× faster** — the realistic "compile a suite of files" / CI shape,
where per-invocation startup dominates.

### One large cold compile — `main2.arr` (~13,000 tests, whole stdlib)
| Runtime | wall | peak RSS |
|---|---|---|
| node (shipped) | 28.12 s | 1.77 GB |
| `pyret-sea` | 27.44 s | 1.82 GB |

→ ~even. A single monolithic compile is CPU-bound in the compiler itself, so
startup savings are a rounding error here — as expected. The executable's
advantage is **latency and per-invocation overhead**, not raw throughput on
one huge job.

## Friendly single-command CLI (`pyret ahoy-world.arr`)

A second binary, `build/ts-compiler/pyret`, lifts the user-facing options from
the published npm CLI (`npm/pyret.js`) but **drops the compile-server
machinery entirely** — no Parley server, socket, or `.pyret` symlink dance.
The server existed only to amortize node + compiler startup across compiles;
this binary *is* the compiler and starts in ~80 ms, so it just compiles
in-process (`pyret.main()`, guarded by `PYRET_TS_LIBRARY` so importing it
doesn't auto-run) and runs the result.

```
$ pyret ahoy-world.arr
1/1 modules compiled
Looks shipshape, your test passed, mate!
```

Options (compatible subset; server directives omitted): `-o/--outfile`,
`-c/--norun`, `-q/--quiet`, `-y/--type-check`, `-k/--no-check-mode`,
`-e/--checks`, `--perilous` (→ `-no-user-annotations`), `-h/--help`,
`-v/--version`. Asset paths default to the checkout (`$PYRET_ROOT`, else cwd);
compiled modules cache in `./.pyret/compiled`. The produced `.jarr` is
**byte-identical** to what `pyret-sea` emits with the equivalent flags — the
frontend only wraps the invocation. npm's sample programs
(`test-basic-print`, `test-check-pass`, `test-unbound-error`) all behave as
expected (correct output / exit codes).

### Performance (warm cache)

| Phase | time |
|---|---|
| compile + generate standalone (`-c`) | **0.24 s** |
| run the standalone (`node`, V8 compile-cache warm) | **0.26 s** |
| **full `pyret foo.arr` (compile + run)** | **~0.52 s** |

Each phase individually beats the 300 ms target; the round-trip is ~0.5 s.
The floor is architectural, not startup: `--build-runnable` writes a ~9 MB
standalone (the whole runtime + stdlib) and then a *separate* `node` process
parses/executes it — two ~0.25 s phases. Hitting ~300 ms for compile **and**
run together would require executing the compiled modules in-process
(the runtime's `load-lib` path), which this port explicitly does not implement
(documented deviation: `cli-module-loader.ts` `run()` builds a standalone and
subprocesses `node` instead). Even so, the single-command, no-server
experience is already faster than the npm server round-trip, and re-running an
unchanged program (run-only) is ~0.26 s.

Speedups applied that are safe and correct: `NODE_COMPILE_CACHE` (caches V8
bytecode for the standalone's stable 8 MB bulk; content-keyed, so a changed
program still recompiles its own module). A `PYRET_RUN_WITH=self` mode can run
the standalone inside this binary's embedded runtime (no external node, ~50 ms
faster) but bun mis-resolves vega's ESM-only package, so `node` is the default
runner for correctness.

## Honest scope / caveats

- "Single executable" = the **compiler** in one file. `--build-runnable` still
  reads runtime assets from disk (the `builtin-*-dir` trove sources, and the
  `raw-js` runtime files the `require-config` points at, e.g.
  `build/phaseA/js/*`) — exactly as `node build/ts-compiler/pyret.js` does.
  Fully embedding the standard library/runtime was out of scope for byte-exact
  parity and would require rewriting the standalone-config path resolution.
- Runs assume `cwd = lang/` (or `$PYRET_TS_HOME` set) so relative asset paths
  resolve — the same assumption the node CLI and Makefile already make.
- Binary is ~97 MB because bun statically embeds its runtime; this is the
  per-platform artifact you would ship. `bun build --compile --target=...`
  cross-compiles the same entry for other OS/arch.
