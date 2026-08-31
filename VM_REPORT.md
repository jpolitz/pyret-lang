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
- main2 under the oracle (3 profiles, ~645k pauses per profile):
  outputs identical; traces PENDING (last divergence fixed was the
  flat-prim $al rule; rerun in flight).
- FLATCALL validation: PENDING.
- `vm-bootstrap-converge` (the compiler as bytecode self-builds,
  byte-equal to the cont chain): PENDING.
- CPO in-browser: PENDING.

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

## Performance

PENDING: async-opt bench table (vm vs cont, paired/interleaved,
LOOP-MS medians + ratios), trove size comparison (bytecode vs
generated JS; raw and gzipped), compile-time comparison.

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
