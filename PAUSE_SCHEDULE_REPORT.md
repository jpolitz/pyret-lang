# Pause Schedules: Implementation Report

*Author: Claude (agent-written report). Implements PAUSE_SCHEDULE_GOAL.md; all
prose here is mine, written for review.*

## Summary

`--pause-schedule <file.js>` is a new compiler option (both the Pyret-hosted
and TS compilers) that bakes a JS module computing `initialGas` /
`initialRunGas` getters into a standalone; the runtime consults the getters at
every gas-refill point. Six deterministic schedule profiles live in
`lang/tests/pause-schedules/`, and `make pause-schedule-test` runs the full
main2 suite under each, requiring output byte-equal to the unscheduled
baseline, plus a byte-identity check of an .arr-compiled vs TS-compiled
scheduled build.

Stress-running under schedules found and fixed **three latent stack-capture
bugs in the stock runtime** (all reachable today without schedules, at low
probability) and one pre-existing output-nondeterminism (natives ordering).
After the fixes, all 12,411 main2 checks pass under every profile with
byte-identical output, and every other suite passes (details below).

## What was built

### Runtime (`src/js/base/runtime.js`, shared by both compilers)

- `run()` now derives per-refill values from `nextInitialGas()` /
  `nextInitialRunGas()`, which consult `thisRuntime.pauseSchedule` when
  installed and otherwise return exactly the historical defaults
  (`options.initialGas || INITIAL_GAS`, `options.initialRunGas ||
  initialGas * 10`). Refill points, one consult each:
  1. run start;
  2. the async RUNGAS timer refill in `iter`;
  3. every stack-capture bounce (GAS + RUNGAS; the thrown-continuation catch
     path refills GAS only, preserving the historical asymmetry);
  4. pause-resume (`handlers.resume`) — new, see bug 1;
  5. the new pop-time floors — see bug 2.
- `setPauseSchedule(schedule)` is exported on the runtime, and `makeRuntime`
  accepts `theOutsideWorld.pauseSchedule`. This is the browser-facing path: the
  script that instantiates a runtime configures it directly in JS; nothing
  reads environment variables.
- Schedule contract: `{ initialGas: () -> Number, initialRunGas: () -> Number }`,
  either field optional (missing = default for that counter). **Values must be
  >= 2**: a constant 1 livelocks (verified; pre-existing property, see
  finding 4). State (seeded RNGs, alternation, ramps) lives in the schedule's
  closures.

`src/js/base/handalone.js` installs `program.runtimeOptions.pauseSchedule`
via `setPauseSchedule` before anything runs.

### Compiler wiring (kept textually in lockstep across .arr and .ts)

`--pause-schedule <file.js>` on the build-runnable path reads the file at
compile time and embeds its **contents** in the standalone's `runtimeOptions`:

```
"pauseSchedule": (function(module) { var exports = module.exports;
<file contents>
return module.exports; })({ exports: {} })
```

So the schedule file is a CommonJS-style module (`module.exports = {...}`)
that is baked in (no runtime file dependency; the .jarr stays relocatable) and
is also directly `require()`-able from Node for manual/browser use. Unset flag
embeds `"pauseSchedule": false`.

Files: `pyret.arr`/`pyret.ts` (flag + file read),
`compile-structs.arr`/`.ts` (`pause-schedule: none` / `pauseSchedule?` in
default options), `compile-lib.arr`/`.ts` (emission in `make-standalone`).

### Schedule profiles (`lang/tests/pause-schedules/`)

All deterministic (seeded mulberry32 where random):

| profile | initialGas | initialRunGas | probes |
|---|---|---|---|
| const-small | 40 | 400 | constant heavy capture pressure |
| const-medium | 100 | 1000 | constant moderate pressure |
| rand-small | 2–64 seeded | 8–512 seeded | jittered boundaries, always starved |
| rand-wide | 2–2001 seeded | 10–20009 seeded | boundaries sweep the whole range |
| alternate | 5 / 100000 alternating | opposite phase (100000 / 60) | which counter trips first flips per refill |
| sawtooth | 1024 halving to 2, wraps | gas × 8 | capture budget ramps down repeatedly |

### Tests / infrastructure

- `tests/pyret/tests/test-pause-schedule.arr` (imported by main2; 27 checks):
  deep non-tail recursion, mutual-TCO loops (100k+ tail calls), method-chain
  recursion (Peano), custom `_equals` with recursive `eq` callbacks, custom
  `_output`/torepr callbacks, structural equality over large structures,
  nested `run-task`, exceptions through deep stacks, runtime loop primitives
  (each/fold/map/filter, string-repeat, raw-array-fold). Under
  `initialGas = 15` this file alone performs ~23,400 schedule consults
  (~23k captures) in ~0.5 s, so even aggressive profiles are cheap on it.
- `src/ts-compiler/tests/programs/pause-schedule.arr` + `.options`: parity
  program compiled by both compilers **with** the flag.
- `parity-test.sh` now also requires byte-identical standalones for **every**
  parity program (all 29 pass).
- `make pause-schedule-test`: builds main2 under each profile
  (`tests/pyret/main2-ps-<p>.jarr`), runs each, and diffs stdout against the
  unscheduled baseline run (byte-equal required — main2 output was verified
  deterministic run-to-run first); additionally builds main2 with
  `--pause-schedule rand-small` using the **TS** compiler and `cmp`s it
  against the .arr build. `make pause-schedule-clean` removes the jarrs.
  Full matrix (8 linked builds + 7 main2 runs) took ~25 minutes wall on this
  2-CPU VM with a warm compile cache; it is self-contained and CI-runnable.

## Bugs found and fixed (all pre-existing, surfaced by schedules)

### 1. Pause-resume never refilled gas; entry re-capture drops the answer

Under rand-small, three main2 `raises` checks (test-images:62,
test-string-dict:245, test-tables:506) errored with
`Non Pyret value: { 'uninitialized answer': true }`. Minimized to a 3-line
program failing at constant `initialGas = 2`.

Two composable defects:

- *The drop:* when a function is re-entered as an activation record carrying a
  delivered answer (`$ar.ans`) and its entry gas check fires, it re-captures
  by pushing a **fresh** activation record — and `makeActivationRecord`
  hardcodes `ans: UNINITIALIZED_ANSWER`. The delivered answer is gone; the
  frame is the innermost of the new continuation, so nothing refills its ans,
  and the sentinel flows into the step that consumes `$ans`.
- *The trigger:* `handlers.resume` (the pauseStack resume path) re-entered
  `iter` without refilling GAS/RUNGAS — unlike every bounce path. `run-task`
  (`execThunk`) pauses the outer stack and runs a nested `run()` that clobbers
  and drains the shared counters; whatever is left when it finishes is the
  outer run's gas. If <= 1, popping the resumed `result = run-task(...)`
  frame trips its entry check and the answer is dropped.

**Reachable in stock Pyret**: any `run-task` whose nested run finishes with
GAS at ~1 (roughly a 1-in-initialGas alignment) silently corrupts the resumed
frame's answer. Fix: `handlers.resume` refills both counters (consulting the
schedule) before re-entering `iter`.

### 2. Any frame popped with GAS <= 1 drops its delivered answer

With fix 1 in, sawtooth still errored one main2 block (test-statistics
"multiple regression" via `builtin://matrix-util:357`). Instrumented tracing
(logging innermost-frame resumes and sentinel receipt) showed
`raw_array_build` resumed at step 1 with its element in `$ar.ans`, then its
entry GAS check / loop-top RUNGAS check ran `$ans = makeCont()` before step 1
could `arr.push($ans)` — the same drop, in a runtime helper, no pause
involved. The same window exists in `safeCall` and every compiled function's
entry check.

General fix (runtime-only, no codegen change): `iter` now enforces pop-time
floors — if `GAS <= 1` it refills from the schedule before popping a frame,
mirroring the existing `RUNGAS <= 1` timer guard (and the RUNGAS floor now
also applies in sync mode, where the async guard is skipped). With both
counters >= 2 at every pop, no entry check can fire on a frame carrying a
delivered answer. Verified by instrumentation (zero suspicious innermost
resumes afterward) and by the suite matrix.

The underlying codegen-level hazard — the capture epilogue discarding a
restored-but-unconsumed `$ans` — still exists latently; making the emitted
epilogue (and `safeCall`/`raw_array_build`) preserve the restored answer would
close it structurally, but requires lockstep codegen changes in both
compilers. Left as follow-up; the pop floors make it unreachable as long as
every refill is >= 2.

### 3. `raw-array-and-mapi` / `raw-array-or-mapi` drop the interrupted element

At constant gas=2, QR decomposition returned an empty matrix:
`gram-schmidt-start` saw `find-first-nonzero-vector == -1` on a nonzero
matrix. Root cause: `raw_array_bool_mapper.foldFun` is the one helper in the
raw-array/list family that never consumes `$ar.ans` on resume. When the
predicate (`close-enough` inside `VU.is-zero`) captures mid-array, the
interrupted element's boolean is discarded and iteration continues at the
next index — a decisive `false` is lost and `and-mapi` answers `true`.
Reachable in stock Pyret whenever the RUNGAS timer interrupts such a
predicate. Fixed by consuming the delivered answer on resume (early return if
it equals the deciding value), matching the sibling helpers. Audited the whole
family: fold/map/mapi/map1/filter/join-str consume correctly;
`raw_array_each` ignores results by design.

### 4. Constant gas of 1 livelocks (documented, not fixed)

A schedule (or `options.initialGas`) pinning either counter at 1 livelocks:
every re-entry decrements to 0 and re-captures without progress. Verified
before and after the fixes (constant 1 times out; constant 2 completes).
The effective floor for schedules is 2; the shipped profiles respect it.
Random schedules may return low values transiently — the next consult
unblocks.

### 5. Standalone bytes depended on compile-cache state (fixed: natives order)

The new byte-identity check caught warm-cache .arr builds differing from
cold-cache TS builds in exactly one place: the **order** of native-module
names in the final `define("program",[...])` line (same multiset). Fresh
source locators and cached locators (`builtin-raw-locator` over `*-static.js`)
report `get-native-modules()` in different orders and `make-standalone`
folded them without canonicalizing. Fix: both compilers now sort the natives
list (the define callback ignores its arguments; requirejs only needs each
dep loaded, so order is semantically irrelevant).

A second cache-state dependence remains and is inherent: **cached module
code depends on the worklist that warmed the cache** (gensym numbering),
which is why the ts-parity/bootstrap checks have always used same-worklist,
clean-room builds. The `main2-ps-ts-rand-small` rule therefore points the TS
compiler at the same `tests/compiled` cache as the .arr build (caches are
documented as interchangeable), making the byte comparison test exactly the
standalone assembly + flag embedding. Module-codegen parity stays covered by
`ts-parity-test` (now byte-checked) and `bootstrap-converge`.

## Verification matrix (all on this branch, after all fixes)

- `make pause-schedule-test`: PASS — all 6 profiles' main2 stdout byte-equal
  to baseline; arr-vs-TS scheduled build byte-identical.
- `make pyret-test` (main2, .arr): PASS — 12,411 checks (includes the 27 new
  probes; count is 12,411 with a clean tree — note `test-pprint` counts every
  `.arr` file anywhere under `lang/`, so stray scratch `.arr` files inflate
  it, and `test-images` drops a `pyret-logo-copy.png` in the cwd on every
  run — pre-existing behaviors).
- `make ts-pyret-test` (main2 built by TS compiler): PASS, same count
  (12,411 on a clean tree; a run right after `ts-serve-test` counts 6 more
  because that test leaves `good.arr`/`bad.arr` under
  `build/ts-compiler/serve-test/` where `test-pprint`'s walk finds them —
  pre-existing interaction, files removed).
- `bash src/ts-compiler/tests/parity-test.sh`: 29/29 PASS including the new
  pause-schedule program and the new byte-identity assertion on every program.
- `make compiler-test`: 645 PASS. `make type-check-test`: 211 PASS.
  `make regression-test`: 245 PASS. `make jsnums-test`, `make parse-test`:
  PASS.
- `ts-wf-parity` 147/147, `ts-type-check-parity` 174/174, `ts-repl-test` 6/6,
  `ts-serve-test` all steps, `pyret-io-test` 13/13, `ts-io-test` 13/13,
  `ts-unit-test` 18/18: PASS.
- `make bootstrap-converge`: PASS — phaseB == phaseC == phaseB-ts ==
  phaseC-ts, all four standalones byte-identical (sha256 89c0ed97…), with the
  natives sort, runtime fixes, and new compile option all in.
- Boundary sweeps (env-var debug schedule, not shipped): constant gas floors
  2..64 and rungas floors 2..100 all pass on the probe programs; constant 1
  livelocks (finding 4).

## Follow-up work (not done here)

- Structural fix for the answer-dropping capture epilogue (defect behind bugs
  1–2): emit/push activation records that preserve a restored-but-unconsumed
  `$ans` (compiled epilogue, `safeCall`, `raw_array_build{,_opt}`). Needs
  lockstep .arr/.ts codegen changes; the pop floors make it unreachable today.
- The dead `RUNGAS = Infinity` assignment at sync-mode run start (it is
  unconditionally overwritten before `iter()` starts) could be removed for
  clarity; behavior preserved as-is here.
- A "same stacks at same pause points" oracle (comparing captured stack
  shapes, not just outputs, across schedules/backends) is a natural next step
  on this infrastructure; the schedule getters are the injection point.

## Flagged system prose (per review guidelines)

Agent-written text that had to go into the system, kept terse:
- `runtime.js`: one comment above `setPauseSchedule` (schedule shape), one at
  the pop-time floors, one at the resume refill (each states the invariant the
  code can't show).
- `Makefile`: section comment for the pause-schedule targets and a note on the
  shared-cache requirement of the TS byte-check rule.
- `parity-test.sh`: header updated to mention the byte-identity requirement.
- CLI help strings for `--pause-schedule` in `pyret.arr` / `pyret.ts`.
- `lang/.gitignore`: added `build/phaseB-ts` / `build/phaseC-ts` (gap from
  when bootstrap-converge was added; running it left untracked dirs).
