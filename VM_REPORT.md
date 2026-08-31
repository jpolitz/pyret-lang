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
  and CPO_COMPILER="vm" (verified over HTTP against a running server).
  Full in-browser editor run via the playwright suite: in flight.

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
