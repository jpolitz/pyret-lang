# Bytecode-VM Goal: Prep Survey & Setup Report

*Author: Claude (agent-written report). Survey of the three reference branches
plus setup recommendations for the fresh promise-API bytecode-VM run. Nothing
in this file is intended for the goal doc verbatim — it is the human prep
sheet; lift what you want into BYTECODE_VM.md.*

## Reference checkouts (durable, under ~/work)

| Path | What |
|---|---|
| `~/work/pyret-interp-backend` | worktree of `origin/interp-backend` (this repo) — AR-based bytecode VM |
| `~/work/pyret-mono` | partial clone (blob-lazy) of jpolitz/pyret monorepo |
| `~/work/pyret-mono-promise-rederive` | worktree of its `promise-rederive` — optimized promise backend |
| `~/work/pyret-mono-hybrid-vm` | worktree of its `hybrid-vm` — VM + promise + correspondence oracle (strict superset of promise-rederive, 21 commits ahead) |
| `~/work/BYTE_ORACLE_GOAL.md` | your prior goal doc for the correspondence oracle (reusable text) |
| `~/work/pyret-async-pause-schedules.tgz` | snapshot of the monorepo tree from that oracle run |

Repo state: local `drydock` = brownplt drydock (has `--pause-schedule` infra)
plus the merge commit; **the jpolitz/pyret-lang fork's `drydock` is 3 commits
behind local** (missing pause schedules). Push blocked: no GitHub auth on this
VM (`gh auth login` needed; then `git push origin drydock:drydock` is a
fast-forward). Current drydock has **zero** interp/promise/async code — clean
slate confirmed (`git grep -c` on the Makefile: 0 hits).

## Branch digests (what the surveys found)

### interp-backend (this repo; 1 commit `81bb95db7`, ~7.9k lines)

Bytecode VM targeting the stock cont runtime. TS-compiler-only backend
(`--backend interp`); `.arr` compiler untouched; divergence from the JS backend
is one ternary in `compile-lib.ts:542`.

- Instruction set: `lang/src/ts-compiler/src/interp/opcodes.ts` (36 opcodes,
  2-bit-tagged value sources, FORMAT_VERSION 3). Protocol-free, declarative.
- Emitter: `interp/vm-compile.ts` (1031 lines, ANF→bytecode; runtime coupling
  ≈ one `properTailCalls` flag + PRIMAPP helper names).
- Disassembler/verifier: `interp/disasm.ts` (`checkFunc`,
  `readsBeforeAssignment` static checks).
- Machine: `lang/src/js/base/pyret-vm.js` (1206 lines). **AR coupling is ~60
  lines total** (`suspend`/`bounce`/`resumeMachine`/`enter`/`runModule`) + 3
  gas checks; the dispatch loop itself is protocol-agnostic. The deep coupling
  is to the *value model* (PFunction/PMethod prototypes, `{"$var":v}` boxes,
  variant constructors, ann descriptors), which any backend needs.
- Oracle: `lang/src/ts-compiler/tests/interp-parity.sh` — every program in
  `tests/programs/` + `tests/interp-programs/` built with `--backend js` and
  `--backend interp`, byte-identical stdout/stderr/exit required; programs may
  NOT "pass" by matching compile errors (only `err-*.arr` may).
- Docs: `interp/README.md` (269 lines, the design doc),
  `interp/NEXT-inline-caches.md` (unexecuted handoff brief).
- Results claimed: ×1.07 steady-state vs JS backend; compile 35% faster; cache
  3.4× smaller; standalones 43% smaller.
- Hard-won details recorded in the README: late-annotation captureAnn/forceAnn,
  push-don't-preallocate slot arrays (V8 HOLEY), read-all-args-before-write on
  tail-call frame reuse, bounce-check-before-mutation.

### promise-rederive (monorepo; the optimized promise backend)

- Compiled shape: async functions + `await f.app(...)`; fuel =
  `if (needsPause()) await checkPause()`; safe-for-space cross-function tail
  calls via bounce tokens + `drive()` (runtime-async.js:836–950). Four-tier
  emission (flat / tail-flat / few-suspend / gen) decided on ANF (`tier.ts`).
- Runtime: `lang/src/js/base/runtime-async.js` (single-file fork of
  runtime.js), linked via `standalone-configA-async.json` require-config
  remap. Embedder API kept contract-compatible: `run`/`runThunk`/`onDone`
  unchanged; `pauseStack` now returns a real Promise and releases/restores
  `RUN_ACTIVE` (this is what keeps CPO's nested-run REPL idiom working);
  `breakAll` → `checkPause` throws; `execThunk` inlines run-task;
  `stackBackend: 'promise'` self-identification.
- Flag-in is small: `--stack-backend promise|cont|auto`, ~100 lines of `.arr`
  changes total (`pyret.arr`, `compile-structs.arr`, `cli-module-loader.arr`,
  `js-of-pyret.arr`, `runtime-lib.js`); backend-keyed cache dirs are
  **mandatory**.
- All 21 optimizations live only in the TS compiler
  (`anf-loop-compiler-async.ts`, 4255 lines; `tier.ts`, `type-flow.ts`,
  `flatness.ts`, `optimize-anf.ts`). The `.arr` promise codegen
  (`anf-loop-compiler-async.arr`) is a frozen unoptimized reference.
- Bench infra (the extractable prize): `lang/tests/async-opt/` — 16 curated
  Bootstrap/CPO-shaped benches (spell, car, lander, orbital, boids, dtree,
  kmeans, plagiarism, seam, matrix, …) + micro probes (mutual/tco/nontail/…);
  each prints a deterministic parity line + `LOOP-MS` (in-process loop timing,
  excludes jarr-load floor); `run-bench-table.sh N` → medians + p/c ratios +
  parity column. Self-locating scripts; portable as-is. Also: 3-way
  differential suites (`tc/`, `tier/`, `mf/` with the `# runcap:` OOM-as-oracle
  trick), `tests-promise/stack-depth.arr`, and the **main2-exec /
  main2-compile suite split** (fast execution-only A/B oracle — useful for any
  runtime work).
- Headline: geomean p/c 0.807, whole-suite 0.78 (from 1.134/1.19 baseline).
- Promise-forced host fixes that must travel with any promise runtime:
  `image-lib.js` colorEquals, `string-dict.js`, `exn-stack-parser.js`, and
  CPO's `output-ui.js` (sync-boolean uses of `equal_always` get a truthy
  Promise).
- Docs: `lang/src/ts-compiler/PROMISE-PORT-GOAL.md`,
  `lang/tests/async-opt/BENCH-RESULTS.md` (563-line campaign log). The original
  promise-backend REPORT.md / DESIGN-safe-for-space-tco.md live on the
  monorepo's `promise-backend` branch, repo root.

### hybrid-vm (monorepo; VM on the promise runtime — closest to the new goal)

- VM v2: `lang/src/ts-compiler/src/vm/{opcodes,vm-compile,disasm}.ts` (34
  opcodes; adds THUNK — object literals/data decls/annotations/nested JS
  lambdas delegate to the existing JS emitter via a `VMHost` callback, keeping
  the machine small) + machine inside `runtime-async.js` (~6412–7840).
- **Promise API only — no ActivationRecords anywhere in the VM.** Suspension
  is `vmSuspendOn`: one `thenable.then(v => { st.resumeVal = v; return
  runMachine(st) })` — **one promise stands for the entire bytecode stack**.
  Host API unchanged; a hybrid module is an ordinary JS module carrying
  `var $BC = R.$vm.load(...)`. Mixes freely with non-VM modules. Step hook
  (`R.$vm.setHook`) = per-instruction observation/pause for ~1 null test.
- The heavy novel piece: **two forms from one ANF** — every gen-tier function
  also compiled to a sync "fast form"; JS calls run the fast form; suspension
  bails out via `VM_BAIL` sentinel + one global cell, rematerializing a
  bytecode frame from a compiler-recorded site table (real liveness solve;
  "InternalCompilerError, never a fallback"). Bottom-frame TAILCALL hands back
  to native. Machine interpretation ended up ~1% of executed work.
- Numbers: hybrid/promise geomean 0.951; vs cont 0.769; deep recursion 2×
  faster / half the memory of cont; `hybrid-bootstrap-check` byte-identical
  self-host; 13,628 tests pass.
- **Pause-schedule correspondence oracle** (answers BYTE_ORACLE_GOAL.md):
  `lang/tests/async-opt/vm/{PAUSE-SCHEDULES.md,pause-compare.js,run-pause-tests.sh}`.
  Mechanism: `PYRET_PAUSE_SCHEDULE=fixed:N|list:…|lcg:…` replaces GAS/RUNGAS
  with a monotone fuel-event counter; on the cont side the emitted inline
  `--R.GAS` checks are intercepted with `Object.defineProperty` accessors — no
  codegen change, byte-parity preserved. `PYRET_PAUSE_TRACE` writes
  cycle-compressed stack lines; `pause-compare.js` compares in O(runs).
  Results: 6.23M pauses compared cont↔VM; 1.5B fuel events across main2-exec
  with identical pause indices; and **2,173 real stack divergences**, which the
  oracle surfaced and pinned to five concrete causes (check-block lifting; TCO
  exclusion; no tail METHCALL; fast forms on JS stack; different equality
  engines). That branch characterized them and stopped; under this goal's
  standard each one is simply a bug (in the VM or in cont) — the oracle
  *finding* them at that granularity is precisely what it's for. Found a real 3-bug never-executed
  suspension path in cont's `string-dict.js` (fixed there as `7f420320` —
  check whether drydock's copy has the same latent bugs).
  The non-obvious modeling: the pending-call-site shadow (`locKS`) and
  synthesized callee frames at call-site pauses; "same optimizations" required
  pinning `-no-optimize -no-licm -no-direct-fields -no-method-flatness
  -no-op-weakening --inline-case-body-limit …` (ann elision stays on).
- Known functional gap recorded: no tail METHCALL in the machine
  (method-tail-recursion accumulates frames). Dead-code knob:
  `VM_FAST_CALL_DEPTH` (measured worse, default 0).
- Docs: `lang/src/ts-compiler/src/vm/README.md` (read first),
  `lang/tests/async-opt/vm/HYBRID-RESULTS.md`, `PAUSE-SCHEDULES.md`.

## CPO: the exact flagged-in surface (user question)

On promise-rederive, CPO changes are 8 files across 3 commits, and the
promise-specific part is tiny:

- `code.pyret.org/cpo-config-promise.json` — clone of cpo-config.json with one
  line changed: `"pyret-base/js/runtime.js"` mapped to `runtime-async.js`.
- `code.pyret.org/src/web/js/cpo-main-ts.js:209,222` — 3 lines:
  `usePromiseBackend = window.CPO_COMPILER === "ts-promise"` and
  `o.stackBackend = T.compileStructs.promise`.
- `code.pyret.org/src/web/js/output-ui.js` — the one genuinely promise-forced
  fix (sync `equal_always` booleans → flat char-offset comparison).
- `code.pyret.org/src/server.js` + `src/web/editor.html` — `?compiler=` flavor
  selector (TS-flavor plumbing, not promise-specific; interp-backend's
  `?compiler=interp` piggybacked the same way).
- `code.pyret.org/Makefile` — `web-ts-promise` target (`--stack-backend
  promise --require-config cpo-config-promise.json --compiled-dir
  ./compiled-promise`).

This repo *is* the same monorepo shape (code.pyret.org/, browser-test/, embed/
at root), so these pointers land directly. Recommendation: keep CPO out of the
goal-run main line; list it as a stretch with exactly these pointers.

## Recommendations for the goal setup

### The architecture take (the one decision to pin in BYTECODE_VM.md)

The baseline should be **all-bytecode on a ported promise runtime**, i.e. the
interp-backend *shape* (every .arr module → bytecode module record; no JS
codegen for user code) on the runtime-async *substrate* (promise suspension à
la `vmSuspendOn`; embedder API = `run`/`runThunk`/promise `pauseStack`).
Rationale:

- The promise API requirement makes runtime.js/cont unusable as the substrate
  (the trove and driver are Cont-shaped); hybrid-vm already proved VM-on-
  promise-runtime works and is *simpler* than VM-on-cont (suspension is 15
  lines, not an AR protocol).
- All-bytecode means the entire four-tier async *codegen* (the biggest, most
  optimization-entangled artifact) stays out of the baseline. No tier
  analysis, no fast forms, no gen residue.
- "Dash of flat call-out" then means: CALLFLAT/PRIMAPP direct sync calls to
  runtime builtins and flat JS trove functions — NOT the two-forms fast-form
  machinery (explicitly out of scope / stretch; it's the complexity you're
  unwinding).

Milestone 1 of the goal (not silent prep — it needs its own oracle gate) is
porting the promise runtime delta to drydock: monorepo
`diff runtime.js runtime-async.js` re-derived against drydock's runtime.js
(which has moved: pause schedules, gas floors, natives sort), plus
`standalone-configA-async.json`, the ~100-line `.arr` flag-in, and the
image-lib/string-dict/exn-stack-parser fixes. Backend-keyed caches from day 1.

### What to put on a prep branch now (mechanical, done before the run)

1. `lang/tests/async-opt/` bench programs + `run-bench-table.sh` +
   hybrid-vm's generalized `run-hybrid-table.sh` (pairs any two jarr patterns)
   — ported paths, wired to drydock Makefile rules for the cont builds.
2. The main2-exec / main2-compile suite split (valuable independent of
   backend; makes the A/B and pause-oracle runs much cheaper).
3. Cont baseline numbers measured on this box, checked in as a report table,
   so the goal run races against a fixed local baseline (do NOT reuse the
   monorepo lineage numbers as the comparison — different tree; keep them as
   context only).
4. Optionally: port `pause-compare.js` + the trace-format spec as inert
   reference files (the VM-side trace hooks must be written fresh anyway).

### What the goal doc should say about reuse (context-pollution control)

- **May lift nearly as-is** (protocol-free, measured, declarative): hybrid's
  `vm/opcodes.ts` (34-op, THUNK-style) or interp's `interp/opcodes.ts`
  (36-op, everything-in-bytecode — likely the better match for the
  all-bytecode baseline), `disasm.ts` (verifier + liveness), the emitter
  structure of `vm-compile.ts`, `interp-of-pyret.ts`, `interp-parity.sh`
  methodology, the `.arr` flag-in pattern.
- **Must be written fresh**: the machine's suspension/driver (promise-based),
  module loading, the pause-trace hooks, all runtime glue.
- **Explicitly out of scope**: fast forms / bailout ABI, tier analysis, the
  21-optimization stack, gen residue, CPO (stretch), inline caches
  (NEXT-inline-caches.md stays a pointer).
- Reference paths only, with "consult, don't port" framing.
- Correspondence target (decided): **cont-exact, zero mismatches, no comparer
  normalizations.** "Authorized divergence" is not a category, and neither is
  "small residual rate" — this is compiler correctness, so a divergence found
  is a bug found, full stop, and finding one is the oracle succeeding, not
  failing. Low-rate incorrectness compounds; the old run's 2,173 mismatches
  are its backlog, not its noise floor. Exactness is also what keeps the
  oracle describable and maintainable (same principle that made the ts-port's
  bootstrap-converge rule work). A stack mismatch has exactly two
  dispositions: a VM bug (fix the VM) or a cont bug (fix cont). Disposal of the old classes
  under this rule: tail METHCALL (99% of old mismatches) is a required VM
  feature from day one; the fast-forms class cannot occur (out of scope);
  cont-side warts — e.g. the closed-over-lambda TCO "correctness hack" where
  cont retains frames a proper tail call would drop — get fixed *in cont* if
  they surface, not papered over in the comparer.
- Sequencing for cont-side fixes: they change cont codegen, so they land as
  their own changes against drydock (both compilers in lockstep, gated by the
  existing parity / pause-schedule / bootstrap-converge suites), and the VM
  oracle then re-runs against the updated cont — the reference stays a real,
  independently-validated tree, never a fork private to the goal run.
- (Answers were and must remain byte-identical everywhere — divergence only
  ever concerned stack shapes at pauses.)

### Oracles for the goal run, ranked

1. Parity: interp-parity.sh-style byte-identical stdout/stderr/exit, js vs vm
   backend, over tests/programs + new vm-programs (with the no-pass-on-
   compile-error guard).
2. Full suites: main2-exec (fast gate) then main2/all.arr on the VM.
3. Pause-schedule correspondence (BYTE_ORACLE_GOAL.md): shared fuel-event
   clock, cont via defineProperty interception (drydock codegen untouched),
   "same answers under all schedules; same stacks at same pause points"
   cont↔VM. The drydock `--pause-schedule` infra provides deterministic
   schedule injection on the cont side already; the event-clock model comes
   from the hybrid-vm reference.
4. Benchmarks: async-opt suite + pitometer, VM vs cont, paired/interleaved,
   in-process LOOP-MS. Goal is measurement + parity column, not winning.
5. Stretch: bytecode self-host (compiler-as-bytecode compiling itself,
   byte-stable fixpoint), mirroring hybrid-bootstrap-check.

## Loose ends

- Fork push (`git push origin drydock:drydock`) blocked on GitHub auth.
- `lang/pyret-logo-copy.png` untracked residue is from test-images runs
  (pre-existing behavior, safe to delete).
- Checked: drydock's `lang/src/js/trove/string-dict.js` eqHelp suspension path
  is already correct (no `sekf`/`thisRuntime` bugs; real state saved) — the
  monorepo oracle finding does not apply here.
- The rederivation spec cited by promise-rederive
  (`~/promise-backend-rederivation-spec.md` and friends) was not found in any
  repo here; if it exists elsewhere you may want it in `~/work`.
