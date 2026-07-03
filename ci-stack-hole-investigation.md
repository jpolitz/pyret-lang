# CI failure: `violates-because-fail1` timeout — investigation and fix

Status: fix implemented locally (uncommitted), verification run in progress.
Branch: `ts-port`. CI: code.pyret.org-test.yml runs 28670050709 / 28673926082.

## Symptom

`should render violates-because-fail1 check blocks` (program:
`check: 3 violates is-string because 'hi' end`) times out after 20s in both CI
runs; in the second run `violates-because-fail2` also failed with empty error
text (collateral: it read the previous test's stuck DOM).

## Key reproduction facts (all verified locally)

- Reproduces on macOS with a fresh local build: full `test/errors.js` suite →
  only this test times out. **Passes in isolation (99–246ms).**
- Prefix bisection: fails only with **all 141** preceding tests; dropping *any
  single* predecessor (three tried, including unrelated early ones) makes it
  pass. Pure count/alignment sensitivity, deterministic across CI-Linux and
  local-macOS.
- The identically-shaped `satisfies-because-fail1/2` (same render code, same
  `on-cause` path, same locs) pass right before it.
- During the hang the page's main thread is idle (executeScript answers in
  3ms); the run produced **no check results at all** (`checkBlocks: 0`), and
  repl-ui logged `Time to run compiled program: undefined`.
- Instrumenting the served jarr: the program run ends with a failure result
  carrying `TypeError: Cannot set properties of undefined (setting 'ans')` —
  thrown in runtime.js's restore loop (`next.ans = val` where
  `next === undefined`, runtime.js:3677-3683): a **hole in `theOneTrueStack`**.
  repl-ui renders the bare Error as a span; the harness waits forever for
  `check-results-done-rendering`.

## Root cause (evidenced by an EXN_STACKHEIGHT write trace)

Frame attachment during continuation unwinding uses a **runtime-global**
counter: every catcher does `$ans.stack[thisRuntime.EXN_STACKHEIGHT++] = frame`
and every continuation creation resets the counter to 0. The protocol silently
assumes the counter stays in lockstep with the *one* continuation object being
propagated.

A property-setter trace on `EXN_STACKHEIGHT` (single runtime instance, rt#1)
captured the violation directly:

```
RESET 23->0
idx0 <- checker fn _87a6d29…__1219        # frame [0] of contA (the propagating cont)
RESET 1->0                                # nested cont created mid-unwind
idx0 <- _f0fda9…__385                     # frames of contB
idx1 <- _0e3cdf…__80
RESET 2->0                                # another nested cont
idx0 <- safeCall                          # frames of contC
idx1 <- safeCall
idx2 <- program toplevel _0c7f…__1        # attached to contA at index 2 (!)
idx3 <- safeCall
```

Resulting `contA.stack`: `[checker-frame, HOLE, toplevel-frame, safeCall-frame]`
— length 4 with nothing at index 1. On resume, the splice loop copies the hole
into `theOneTrueStack`, and popping it crashes.

The nested cont creations are ordinary checker machinery (`run-task` /
`each-loop` bouncing inside `check-satisfies-not-delayed-cause`'s
because-path). Nothing CPO-specific and no `safeCall` misuse: all participants
are stock runtime helpers and compiled trove code.

**Why count-dependent:** the crash needs a GAS/RUNGAS boundary to land exactly
so that the outer cont is created inside the checker and nested conts fire
before the toplevel attaches. CPO keeps one calling runtime alive for the whole
page session, so RUNGAS residue accumulates across runs; after exactly 141
runs of this suite the 142nd run's boundary lands in the window. The ts-port
determinism sorts in `anf-loop-compiler.arr` (added for TS/Pyret output
parity) shifted emitted code just enough to move the boundary onto this test —
they did not introduce the bug. Reverting them goes green locally
(193/193) but only re-hides a latent stock bug that any future codegen change
can re-expose, and would break TS/Pyret byte parity.

## The fix (implemented, pending review)

Make frame attachment per-continuation — append with `push` — and keep the
global counter merely *derived* (set to `stack.length` after each push) so
old-protocol compiled artifacts (e.g. phase0-built code during bootstrap, or
stale `tests/compiled` caches) that still write `stack[EXN_STACKHEIGHT++]`
stay index-consistent when mixed with new-protocol code in one realm:

- `lang/src/js/base/runtime.js` — 19 attach sites →
  `(x.stack.push(frame), thisRuntime.EXN_STACKHEIGHT = x.stack.length)`.
- `lang/src/js/trove/string-dict.js` — 1 attach site, same rewrite.
- `lang/src/arr/compiler/anf-loop-compiler.arr:762-768` (`after-loop`) — emit
  `push` + counter sync instead of `stack[EXN_STACKHEIGHT++] =`.
- `lang/src/ts-compiler/src/anf-loop-compiler.ts:884-890` — identical change,
  keeping TS/Pyret emitted-code parity.

The `EXN_STACKHEIGHT = 0` resets are left in place (harmless dead-ish writes;
removable in a cleanup pass once nothing old-protocol remains). Splice loops
already iterate `stack.length - 1 .. 0`, so ordering is unchanged.

Note this touches `runtime.js`, which the port's CONVENTIONS.md declares
unchangeable — this is a deliberate exception for a latent stock bug, and is
worth an upstream issue/PR against brownplt/pyret-lang independent of the
ts-port work.

## Caveats / follow-ups

- Any realm mixing **old-compiled** modules with the **new** runtime relies on
  the counter-sync shim; fully-old realms (phase0's own bundled runtime) are
  untouched. Flush `tests/compiled`-style caches after rebuilding.
- The write-trace also showed the pre-existing protocol can *overwrite* frames
  (counter reset to 0 mid-unwind while the outer cont has frames) — same bug
  family, would corrupt resumption rather than crash. The push fix removes
  that too for new code.
- Suggested broader verification before merging: `lang` unit/io tests, the
  ts-compiler parity suite, and a full CPO mocha run (not just errors.js).

## Investigation artifacts

- Temp diagnostics were removed (`test/aaa-diag.js`, instrumented
  `build/web/js/cpo-main.jarr` and `repl-ui.js` build copies are regenerated by
  the verification rebuild).
- Local CPO server for tests: `node src/run.js` with the CI env block from
  `.github/workflows/code.pyret.org-test.yml`, plus chromedriver 149 fetched to
  the session scratchpad (`CHROMEDRIVER_BINARY=...`).
