# Promise-based Bytecode VM: run report

*Author: Claude (agent-written report for the ASYNC_INTERP_GOAL.md run.
Numbers and statuses below are filled in as the run progresses; a
section marked PENDING has not been measured/finished yet.*

## What was built

- `--backend vm` on the TypeScript compiler: every `.arr` module
  compiles to bytecode (`src/ts-compiler/src/vm/`), executed by
  `src/js/base/pyret-vm.js` on `src/js/base/vm-runtime.js` — a copy of
  runtime.js with the cont/ActivationRecord protocol converted to
  promise/maybe-thenable suspension. Design + derivations:
  VM_DESIGN.md.
- Fuel model replicates the cont backend event-for-event (same
  GAS/RUNGAS decrement/refund/refill points, same `--pause-schedule`
  getters), which makes the correspondence oracle possible.
- Tail calls are wart-for-wart cont: SELFTAIL loop-back only under
  cont's exact predicate (including the allowTco closed-over-formal
  scan and its firing at structurally non-tail annotated sites);
  all other tail calls hold their frame and are elided at capture
  events, as cont's step==retLabel guard does.
- Cases branches lift into separate functions exactly where the JS
  backend lifts them (its own switch-case count metric, computed with
  the real compiler).
- FLATCALL: functions the cont backend compiles flat get a synchronous
  fast form compiled by the *real* `compileFunBody(isFlat=true)` —
  byte-identical flat JS to cont, carried through the same source-map
  pipeline (identical error frames) — instantiated per closure and
  called directly by the machine.
- CPO: `?compiler=vm` serves its own page jarr (bytecode builtins on
  vm-runtime) sharing the ts compiler bundle; `make web-vm`.

## Correctness status

- `vm-parity-test`: 34/34 programs byte-identical stdout/stderr/exit
  vs the js backend.
- `main2.arr -check-all`: 12,504/12,504 tests pass on the vm (same
  count and output as the js backend on the same tree).
- `vm-repl-test` 6/6, `vm-io-test` 13/13, `vm-serve-test` pass.
- Pause-schedule correspondence oracle (`make vm-pause-oracle`):
  PYRET_PAUSE_TRACE makes both runtimes append one line per
  capture/pause event (user-visible stack, innermost first,
  run-length compressed); the comparator is `diff`. 20/20 programs x 6
  schedule profiles: byte-identical traces (deep-recursion alone:
  19,143 pauses on one profile).
- main2 under the oracle, cold builds both sides, fast forms ON:
  byte-identical outputs AND traces on all three profiles --
  rand-small 645,565 pauses, alternate 1,354,509 pauses, const-small
  447,394 pauses. ~2.45M pauses with identical stacks at every one.
- FLATCALL validation: unit 5/5, parity 34/34, pause oracle 20/20 x 6
  schedules, main2 12,522/12,522, and the main2 oracle above -- all
  with fast forms enabled.
- `vm-bootstrap-converge`: PASS. phaseB-vm (the .arr compiler compiled
  to bytecode by --backend vm, 13.7MB standalone) self-builds the full
  compiler on the promise runtime; its output is byte-identical to
  phaseC-ts (both chains built cold -- the comparison requires equal
  cache states, since worklist order and gensym numbering are
  cache-warmth-dependent in both compilers).
- CPO: `make web-vm` builds the vm page bundle; the server serves
  /editor?compiler=vm with window.PYRET pointed at cpo-main-vm.jarr
  and CPO_COMPILER="vm". The full in-browser playwright suite
  (browser-test, --env=cpo --compiler=vm): 261/261 pass, including
  the stop-button and rapid-rerun tests. Getting there surfaced two
  real bugs, fixed below: a server routing gap (cpo-main-vm.jarr.gz.js
  had no Content-Encoding route, so express.static served raw gzip
  bytes to a script tag) and a genuine runtime bug in the vm's
  breakAll handling (see "Browser-suite-found bug").

## Oracle-found bugs (all fixed; see VM_DESIGN.md for detail)

1. st.fp staleness on frame pops (capture walked dead pool frames).
2. Per-module nativeRequire cost a pauseStack per module load that cont
   doesn't perform (machine moved into vm-runtime's dependencies).
3. pauseStack consumed one schedule refill pair; cont consumes two.
4. Helper resume treatments gated on a post-capture epoch snapshot
   (never fired); the correct rule is unconditional.
5. locKS attribution: statically-flat call sites, maybeMethodCall
   receivers, and flat prims do not update cont's $al.
6. Cases-branch lifting parity (checker's 79 lifted branches).
7. raw-array-build-opt's RUNGAS trip falls through (no break) and still
   calls the callback once, whose entry check performs the capture --
   the callback's frame is therefore on the captured stack. Replicated;
   the cont version's sync-callback-after-trip path (which corrupts its
   return value by attaching a frame to it) pauses cleanly on the vm
   instead -- a latent cont bug worth an upstream look.

## Browser-suite-found bug (fixed): breakAll vs the promise backend

The playwright stop-button test failed in a distinctive way: the run
ended silently with no "stopped by user", and every later run on the
page died with "Internal: run called while already running". The chain:

1. CPO's stop calls runtime.breakAll() while the user program runs
   inside load-lib's run-task (a nested run: the outer run is parked in
   pauseStack). breakAll finished the outer run and marked BREAK_FLAG.
2. The rendering runThunk started next and, per the cont run()'s
   contract, cleared BREAK_FLAG -- so the broken program's parked chain
   (the "zombie") woke and kept running forever.
3. The zombie eventually finished its nested run; execThunk's
   completion called the outer pauseStack restarter, which set
   RUN_ACTIVE = true -- but the outer run had already finished, so its
   finished-guard returned early and RUN_ACTIVE stayed true for good.

The cont backend avoids all three by thread death: breakAll marks every
active thread dead, iter() goes quiet on a dead thread at its next
bounce, and resuming a dead thread's pause does nothing. The vm now
mirrors that exactly: each run's thread token carries `dead`; every
machine State is stamped with its owning token at creation (stamping at
park time is wrong -- execThunk starts the nested run synchronously
before the caller's state parks, so CURRENT_THREAD is the callee's
token at that moment, which caused a first-cut regression in two io
tests); a parked chain that wakes to a dead token dies with userBreak
(same granularity as cont's per-bounce check), unwinding through
failMachine so its states leave the capture chain; and a pauseStack
restarter reaching a dead run goes quiet instead of resurrecting
RUN_ACTIVE. Node-level repro (scratchpad breakrepro3): break during an
infinite loop with a racing runThunk now behaves identically on both
backends -- userBreak rejection, racing run succeeds, fresh definitions
run returns 42, zero leaked chain states, no CPU churn.

All gates rerun after the fix: parity 34/34, pause oracle 20/20 x 6,
repl 6/6, io 13/13, serve pass, unit 5/5, main2 all-pass (12,531 on
this cache state; the count is cache-warmth-dependent as noted below),
browser suite 261/261.

One more test-tool fix from this pass: disasm's extractProgram sliced
the bytecode JSON out of the module text with lastIndexOf("))"), which
truncates modules whose constant pool contains "))" (test-parse,
test-s-exp, test-output in main2) -- replaced with an escape-aware
string-literal match. Tool-only; no compiler or runtime behavior.

Also learned: main2's executed-test COUNT and module load order depend
on compile-cache warmth (both backends equally); oracle comparisons must
build both sides cold. The pause-trace equality itself is robust to the
trigger kind (GAS vs RUNGAS trip) because every capture consumes one
refill pair from each schedule stream -- which is exactly why the stack
contents, not just counts, are the oracle.

## Performance

All numbers measured on this box (2-CPU VM, node 24), vm vs the js
backend on the same tree, same front end.

### Execution: async-opt suite (interleaved, N=5, LOOP-seconds medians)

| benchmark | js med | vm med | vm/js |
|---|---:|---:|---:|
| bench-spell | 3.044 | 4.197 | 1.379 |
| bench-car-compute | 2.650 | 3.109 | 1.173 |
| bench-car-render | 2.517 | 2.546 | 1.012 |
| bench-lander | 1.750 | 1.734 | 0.991 |
| bench-orbital-compute | 2.263 | 2.938 | 1.298 |
| bench-orbital-ems | 1.536 | 1.560 | 1.016 |
| bench-orbital-render | 2.762 | 3.081 | 1.115 |
| bench-boids-compute | 2.655 | 3.631 | 1.368 |
| bench-boids-compute-data | 2.789 | 3.666 | 1.314 |
| bench-boids-raster | 2.575 | 2.985 | 1.159 |
| bench-vec-methods | 2.545 | 2.869 | 1.127 |
| bench-matrix | 3.255 | 4.033 | 1.239 |
| bench-dtree | 0.753 | 0.950 | 1.262 |
| bench-kmeans | 0.497 | 0.692 | 1.392 |
| bench-plagiarism | 1.254 | 1.658 | 1.322 |
| bench-seam | 0.320 | 0.469 | 1.466 |

**geomean vm/js = 1.219** over 16 benches; output parity OK on all.
The render/ems-shaped benches sit near 1.0 (flat fast forms and
runtime helpers dominate); tight numeric/data-structure loops pay the
dispatch cost (up to ~1.47x).

### Size (main2's 140 modules; raw / gzip -9 bytes)

| artifact | js | vm | ratio |
|---|---|---|---|
| all compiled modules | 24,924,042 / 3,558,679 | 11,902,386 / 1,608,188 | 2.1x / 2.2x |
| builtin (trove) modules only | 13,435,690 / 2,101,923 | 4,641,287 / 820,026 | **2.9x / 2.6x** |
| main2 standalone jarr | 28,586,370 / 4,120,094 | 14,859,082 / 2,043,087 | 1.9x / 2.0x |

(The vm numbers include the flat fast-form factories.)

Two more size datapoints: the COMPILER itself as a standalone --
13,751,536 bytes as bytecode (phaseB-vm) vs 32,287,770 as generated JS
(phaseB-ts), 2.3x smaller; and the CPO page bundle --
cpo-main-vm.jarr.gz.js is 1,389,767 bytes vs cpo-main-ts.jarr.gz.js at
2,903,792, 2.1x smaller (what a student downloads).

### Compile time (cold main2 build, single sample)

| backend | wall | peak RSS |
|---|---|---|
| js | 14.15 s | 1.36 GB |
| vm | 10.12 s | 1.28 GB |

The vm backend compiles ~29% faster despite computing the js
backend's lift metric per cases branch and compiling flat functions
twice (bytecode + fast form).

## Deviations / notes for review

- The machine lives in pyret-vm.js (paired with vm-runtime.js) rather
  than inside vm-runtime.js as the goal doc suggested; the module
  record protocol keeps them cleanly separable and reviewable.
- runtime.js (cont) gained two env-gated blocks: the pause-trace
  recorder (PYRET_PAUSE_TRACE) and the fuel-debug accessors
  (PYRET_FUEL_DEBUG). Both inert by default; both exist so the oracle
  can compare against an unmodified-behavior cont.
- anf-loop-compiler.ts gained three vm-backend hooks, inert for
  ordinary compiles: vmNestedLamHook (2 call sites),
  casesBranchBodyCaseCount, compileVmFlatFactory. The .arr compiler is
  untouched (the vm backend is TS-only per the goal).
- string-dict.js eqHelp has a thenable branch beside its Cont branch
  (shared file, both runtimes).
- known manualPause trace asymmetry (CPO stop button; unreachable in
  node oracle runs) — see VM_DESIGN.md.
- code.pyret.org/src/server.js gained the cpo-main-vm.jarr.gz.js route
  (mirrors the cpo-main-ts route: gz-at-rest asset served with
  Content-Encoding: gzip). Do NOT run this server with
  PYRET_GZIPPED=true: beforePyret's fetch+DecompressionStream path
  would double-decode assets these routes already label gzip (that
  combination produced a misleading "Failed to fetch" blamed on the
  jarr when ts-compiler.gz.js was the stream that aborted).
- vm-unit-test's two bytecode-scanning tests read the shared
  tests/vm-compiled cache and expect the parity/main2 population; a
  fresh vm-io-test run leaves only io modules there and the scan
  checks 0 functions (or trips on a mid-write file). Pre-existing
  ordering wart, not new: run it after a main2/parity build, as its
  own skip-note says.
