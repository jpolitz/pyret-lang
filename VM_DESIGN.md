# Promise VM: cont-exact execution model (design notes)

*Author: Claude (agent-written working notes for the bytecode-VM goal run.
Derived from drydock's anf-loop-compiler/runtime.js and the reference
branches; every claim about cont below was re-verified against drydock
source or compiled output during this run.)*

## Architecture

- `--backend vm` (TS compiler only): every `.arr` module compiles to
  bytecode (`src/ts-compiler/src/vm/`), running on a promise-based
  runtime `src/js/base/vm-runtime.js` (a converted copy of runtime.js)
  with the machine in `src/js/base/pyret-vm.js`. Backend-keyed caches
  (`compiled-vm/`, `tests/vm-compiled/`), `standalone-config-vm.json`
  maps `pyret-base/js/runtime.js` -> `vm-runtime.js`.
- JS<->Pyret ABI: `.app` returns a value or a thenable (maybe-promise).
  Suspension = one promise standing for the whole bytecode stack
  (`thenable.then(v => runMachine(st))`).
- One optimization: functions that cont compiles FLAT (flatness <= 5,
  a-let-bound lambdas only) compile to synchronous JS called directly
  from the machine. Flat functions never suspend, never charge fuel,
  never appear on stacks — on either backend — so this is
  correspondence-safe by construction.

## The cont fuel/stack semantics being replicated

From drydock codegen (anf-loop-compiler.ts:678-969, 1341-1390) and
runtime.js iter (3661-3815):

1. Non-flat entry (fresh AND resumed): `if(--GAS <= 0 || --RUNGAS <= 0)`
   (short-circuit: GAS-trip skips the RUNGAS decrement) -> capture.
2. Normal return: `++GAS` (never `++RUNGAS`).
3. Self-TCO (isRecursive && isTail && allowTco && properTailCalls &&
   arity match): loop-back; `--RUNGAS <= 0` only; `$al` NOT updated;
   captured AR has step=0 with the NEW args.
   allowTco=false when any formal is referenced inside any nested
   lambda/method; also always false for toplevel and lifted cases
   branches. isRecursive only for s-id-letrec self-reference (methods
   and mutual recursion never loop back).
4. All other tail calls: ordinary call with step=retLabel; at capture
   the frame is NOT attached (properTailCalls guard) — lazy TCO at
   capture; while live, the frame exists (JS stack) and shows in
   JS-parsed error stacks with its call-site loc.
5. Capture: EXN_STACKHEIGHT=0 at Cont birth; each unwinding frame
   appends AR (innermost = stack[0]); iter refills GAS AND RUNGAS via
   nextInitialGas()/nextInitialRunGas() (the --pause-schedule getters),
   then macrotask (util.suspend) unless sync.
6. Resume: iter pops one AR at a time. Before each pop: if !sync &&
   RUNGAS<=1 -> refill RUNGAS + macrotask; if GAS<=1 -> refill GAS; if
   sync && RUNGAS<=1 -> refill. Then the popped frame re-runs its entry
   check (decrementing again — floors guarantee it cannot trip for
   schedules >= 2).
7. pyretStack rendering = parse(JS Error stack via source maps) ++
   e.pyretStack (captured ARs), innermost-first; printPyretStack
   non-verbose keeps only 7-element srcloc frames.
8. $al (AR.from) updates at: split app, split prim app, method app,
   cases dispatch, ann checks, dot; NOT at flat calls or self-TCO.

## VM equivalents

Machine frames: `{fdef, code, pc, locals, upvals, mod, dest, locK,
atRet, captured}`.

- CALL/METHCALL to bytecode: build callee frame, then cont entry check
  (`--GAS <= 0 || --RUNGAS <= 0` short-circuit) -> on trip, capture
  event with the callee frame included (cont captures the callee AR at
  step 0). OP_RET does `++GAS`.
- SELFTAIL (emitter gates on cont's exact predicate #3): frame+slot
  reuse, `--RUNGAS` only, locK left stale.
- Other tail calls (incl. method tail calls): push/cross normally but
  mark the caller frame `atRet`.
- Capture event (fuel trip anywhere, or pauseStack): bump CAPTURE_EPOCH;
  walk the runtime-level chain of live machine states (VM_STATE_CHAIN,
  maintained across parks) marking frames `captured` and ELIDING atRet
  frames in place (fold dest through — cont drops them from the Cont,
  losing their ++GAS refunds, permanently); EXN_STACKHEIGHT=0; refill
  both via the schedule getters; macrotask yield unless sync. This is
  also where the pause-trace hook records the stack.
- Delivery into a frame with `captured` set (machine re-entry, RET into
  it, or thenable delivery): clear flag; apply iter pop floors (#6);
  re-run the entry decrement pair. Non-captured delivery is the fast
  path: nothing.
- Runtime helpers (safeCall, eachLoop, raw_array_*, toRepr, equality):
  ported keeping every --GAS/--RUNGAS/++GAS in cont's positions;
  "return makeCont()" becomes "capture event; .then(re-enter loop fn)"
  where the loop re-entry replays cont's AR-resume fuel ops; each
  `.then` on a user-callback thenable snapshots CAPTURE_EPOCH and, if
  stale at resume, applies pop floors first.
- Errors: machine catch pushes frameLoc per live machine frame onto
  e.pyretStack (atRet frames included while live — matches cont's
  JS-parsed live tail frames) and rethrows/rejects.
- Two attribution fields per frame eventually (locK for precise errors,
  locKS mirroring cont's stale $al for the pause-trace oracle) — the
  hybrid branch's dual-field lesson.

## Oracle plan

Same `--pause-schedule` file on both backends => same fuel-event
sequence by construction (no event clock, no defineProperty
interception). Trace = at every capture/pause event, dump the
user-visible stack (7-srcloc frames only: cont = would-be-captured ARs
+ live generated frames; vm = machine frames minus atRet-elided, via
the state chain). Compare exactly: same pause count, same stacks at
every pause, zero divergence. The five hybrid divergence classes are
engineered away: (A) shared post-ANF tree fixes function granularity;
(B) SELFTAIL uses cont's predicate; (C) atRet covers method tails; (D)
flat = cont flat on both sides; (E) helpers keep cont's frame/fuel
structure and helper frames are non-7-srcloc on both sides.

Cont-side tracing needs a small runtime.js hook at the existing capture
sites (no codegen change): record pause index + theOneTrueStack
snapshot when a schedule is active and PYRET_PAUSE_TRACE is set.

## Known deliberate deviations (documented, not silent)

- The machine stays in pyret-vm.js (paired with vm-runtime.js) rather
  than inlined into it: reviewability; the module stub's nativeRequire
  protocol already delivers it.
- sync-mode runs still yield microtasks (promises); fuel-event order is
  preserved, wall-clock interleaving with JS timers may differ.
- vm-runtime.js does NOT take the monorepo's perf-only changes
  (dictProto, equal3 fast paths, tail tokens, driveGen): they would
  perturb cont correspondence; revisit post-oracle if benchmarks say so.
