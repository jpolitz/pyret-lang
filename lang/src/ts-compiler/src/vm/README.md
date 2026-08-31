# The interpreter back end (pvm)

A second back end for the compiler in `src/ts-compiler`: instead of
generating JavaScript, it emits bytecode for a small register machine that
executes Pyret directly. It is chosen with a flag and changes nothing else
about the system —

```
node build/ts-compiler/pyret.js --backend vm --build-runnable foo.arr ...
pyret --backend vm foo.arr                    # the npm CLI
https://code.pyret.org/editor?compiler=vm     # the editor
```

— because it produces the same thing the JavaScript back end produces: a
module in the same on-disk format, with the same `provides`, running on the
same `src/js/base/runtime.js`, in the same standalone. A program can mix
interpreted and compiled modules freely. That is what makes it a drop-in:
`code.pyret.org` in interpreter mode still loads the precompiled builtins
that ship in its page bundle, and only the user's modules are interpreted.

Where it stands: `tests/all.arr` passes in full — all 13,464 tests, the same
count the JavaScript back end reports, and the two runs' output is identical
apart from the suite's own timestamps. So does the browser suite, in every
environment that can select a flavor (cpo, embed, vscode, vscode-ovsx). On
the benchmarks long enough to measure, it runs at ×1.07 of the compiled back
end, and starts up faster. See Testing and Speed below.

## Where it sits

```
   parse-pyret → well-formed → resolve-scope → desugar → type-check → anf
                                                                       │
                                    ┌──────────────────────────────────┴───────┐
                                    │                                          │
                              anf-loop-compiler                        vm/vm-compile
                              (JavaScript source)                      (bytecode)
                                    │                                          │
                                    └──────────────► compile-lib ◄─────────────┘
                                                     (same Loadable,
                                                      same cache format)
```

Everything to the left of ANF is shared, unchanged and untouched. The choice
is made at one line in `compile-lib.ts`, on `CompileOptions.backend`.

| file | role |
|---|---|
| `opcodes.ts` | the instruction set, operand encodings, and program format |
| `vm-compile.ts` | ANF → bytecode |
| `vm-of-pyret.ts` | wraps the bytecode in the standard module record (`js-of-pyret`'s counterpart) |
| `disasm.ts` | disassembler and bytecode verifier |
| `../../../js/base/pyret-vm.js` | the machine |

## The machine

A **register machine over a heap-allocated frame stack**. Each frame is

```
{ fdef, code, pc, locals, upvals, mod, dest, locK }
```

`locals` is a flat slot array the compiler sized; `upvals` are the closure's
captures; `dest` is the caller slot the result belongs in; `locK` indexes
the call site currently being evaluated, for stack traces. A call between
interpreted functions pushes a frame and jumps — it does not grow the JS
stack.

ANF is what makes this shape fall out. It has already named every
intermediate value and made every operand atomic, so a lettable is exactly
one instruction, its binding is the destination register, and its operands
are register reads. There is no expression stack, and no evaluation-order
decision is left to the machine: the order of effects is fixed by the same
pass that fixes it for the JavaScript back end.

Operands use a tagged encoding, so one integer names a local, an upvalue, a
program constant, or a module-level global with no extra load instruction:

```
vs & 3 == 0 → locals[vs >> 2]     vs & 3 == 2 → consts[vs >> 2]
vs & 3 == 1 → upvals[vs >> 2]     vs & 3 == 3 → globals[vs >> 2]
```

Every ANF binding is assigned exactly once — Pyret's mutable bindings are
`{"$var": v}` cells that are themselves bound once, exactly as in the
JavaScript back end. So closures capture their free variables **by value**
when they are built. That single fact is what makes two otherwise fiddly
things easy: there are no upvalue cells, and a tail call can reuse its
frame outright.

Reading a program is a normal thing to want to do, so
`disasm.disassemble` prints one:

```
; g8 = builtin://global.values._lessequal
; g9 = builtin://global.values._minus
; g10 = builtin://global.values._plus

function 0: sum arity=2 slots=8 upvals=[4]
      0  CALL       r4, g8(_lessequal@builtin://global)(r0, k1([1,0]))
      7  IF         r4 else -> 12
     10  RET        r1
     12  CALL       r5, g9(_minus@builtin://global)(r0, k2([1,1]))
     19  CALL       r6, g10(_plus@builtin://global)(r1, r0)
     26  UNBOX      r7, u0
     29  TAILCALL   r7(r5, r6)
     35  RET        r2
```

(That is `fun sum(n, sofar): if n <= 0: sofar else: sum(n - 1, sofar + n) end
end`. The three operators resolved to globals at instantiation; `u0` is the
letrec cell `sum` was captured from, and the tail call reuses the frame.)

### Annotations are built late

One case forces a two-step treatment. A `data` member's refinement may name
a function defined *later* in the same letrec group:

```pyret
data FillMode: mode-solid | mode-fade(n :: Number%(is-transparency)) end
fun is-transparency(n): (n >= 0) and (n <= 1) end
```

The JS back end handles this by thunking its compiled annotations
("references to rec ids that should be resolved later") and forcing the
thunk when a constructor is first called. The machine must defer the same
dereference — but by the time such a thunk runs, the frame the annotation's
operands came from is gone (frames are pooled, slot arrays reused). So
`captureAnn` resolves every value source against the frame *now*, which for
a letrec id yields the `{"$var": v}` cell rather than its contents, and
`forceAnn` reads through those cells later. Immediate uses do both at once.

Getting this wrong is invisible to almost every program — it needs a data
declaration ordered before its own refinement — so `readsBeforeAssignment`
in `disasm.ts` checks for the shape statically across the whole compiled
trove, and `late-annotations.arr` pins the behavior.

## Stack capture

The JavaScript back end compiles each Pyret function into a `switch` state
machine over numbered "steps", because the runtime's trampoline has to be
able to rebuild a suspended activation out of an `ActivationRecord`: the
generated code saves its step, its live variables and its call site into
one, and restores them on the way back in.

The machine needs none of that. Its continuation is *already* a heap
object. When the trampoline wants the program to yield — to give the event
loop a turn, or because a builtin called `pauseStack` for I/O — the machine
puts its whole state into a single `ActivationRecord` and returns the
`Cont`; resuming re-enters `runMachine` with that state. One record stands
for the entire interpreted stack, however deep.

Frames living on the heap also means interpreted recursion is bounded by
memory rather than by the JS stack, and that proper tail calls are real: a
tail call to interpreted code reuses the frame, and its slot array too, so
a loop allocates nothing per iteration.

## Crossing into JS-land

Calling a builtin, or a module the JavaScript back end compiled, is an
ordinary `.app(...)`. If it comes back a `Cont`, the machine appends its own
`ActivationRecord` and returns it, exactly as generated code does — so from
the trampoline's point of view an interpreted activation is just one more
frame, and the two kinds of code interleave to any depth.

In the other direction, interpreted closures are built on the runtime's own
`PFunction`/`PMethod` prototypes, so `isFunction`, `isMethod`, `.app`,
`.full_meth` and branding all behave as they always have. They carry one
extra field naming their code, which is how a call site recognizes "this
callee is bytecode, push a frame" instead of crossing. Functions and methods
deliberately use *different* field names for it, so that `f(x)` on a method
value fails the way generated code's `typeof f.app !== "function"` fails.

## Testing

| target | what it covers |
|---|---|
| `make vm-unit-test` | the opcode table and program format are stated once for the emitter and once for the machine; this asserts they agree, walks every function of the compiled trove with the verifier, and checks no module reads a letrec cell before its straight-line assignment |
| `make vm-parity-test` | every program in `tests/programs/` and `tests/vm-programs/` built **both ways with the same front end**, requiring identical stdout/stderr and exit codes. Since parsing, scope resolution, desugaring, ANF and the type checker are shared, any difference is a back-end difference. A program that fails to compile never reaches a back end, so only the `err-*.arr` programs (which exist to pin error rendering) are allowed to take that path — anything else that stops at a compile error is reported as a failure rather than as matching error text |
| `make vm-pyret-test` | `tests/pyret/main2.arr` — the language/runtime suite, interpreted |
| `make all-vm-pyret-test` | `tests/all.arr`, the counterpart of `all-pyret-test` / `all-ts-pyret-test` |
| `make vm-repl-test` | `repl.ts` against a real in-process load-lib runtime, with the interactions compiled to bytecode — the chaining across interactions is the point, since each one instantiates a fresh module into a shared realm |
| `make vm-io-test` | the io tests: stdin, exit codes, network imports — i.e. the `pauseStack` path, which on the machine means suspending and resuming an interpreted stack |
| `make vm-serve-test` | the npm CLI's `pyret --backend vm` compile server, including running the standalone it produces |
| `make vm-test` | all of the above |

## Speed

`src/ts-compiler/tests/vm-bench.js` builds each `pitometer/programs`
benchmark with both back ends and times the two standalones alternately, so
a noisy stretch of the machine hits both sides equally. On the benchmarks
that run long enough for the measurement to mean anything (process startup
and module loading otherwise dominate, and are not even the same on both
sides — bytecode loads *faster* than generated JavaScript, so the empty
program starts ~25% quicker under the interpreter):

| benchmark | js | vm | |
|---|---:|---:|---:|
| propcheck | 17.5s | 18.5s | ×1.06 |
| recursion-triangle-annotated-2000000 | 1.29s | 1.37s | ×1.06 |
| edits | 1.02s | 1.11s | ×1.09 |
| tree-set-grow-10000 | 0.48s | 0.52s | ×1.09 |
| list-set-const-1000000 | 1.23s | 1.36s | ×1.10 |
| recursion-triangle-2000000 | 1.04s | 1.17s | ×1.13 |
| boids-loop | 0.77s | 0.88s | ×1.14 |
|  | | | **×1.07 aggregate** |

Four things account for most of the distance closed to get there, and they
are worth naming because they are what an interpreter has that a code
generator does not:

- **Cross-module reads are resolved at instantiation.** `a-id-modref` on a
  module-level import is loop-invariant, so it becomes a `globals` entry
  rather than an instruction — which removed what was statically the second
  most common opcode outright.
- **Copies are aliases.** `x = <atomic>` binds a name to a value source
  rather than emitting a move; ANF's single-assignment rule is what makes
  that sound, including across closure capture.
- **Named annotations skip the descriptor walk.** `n :: Number` checks
  against a value that is already to hand (`ANNCHECKV`), not one rebuilt
  per check.
- **Nothing on the hot path allocates that need not.** Frames are pooled
  per machine state, a tail call reuses its frame *and* its slot array, and
  slot arrays are built by pushing rather than `new Array(n)` — the latter
  is HOLEY in V8, and every operand read would pay for it.

Things measured and found not to matter, so not done: declaring the
callee-kind field on the runtime's `PFunction` to make that read
monomorphic (no measurable effect).

## Two things that differ, and why

1. **A separate compiled-module cache** (`compiled-vm/`,
   `tests/vm-compiled/`). A cached module records which back end
   produced it only by which directory it lives in, so the two must not
   share one. Every emitted program also carries the bytecode format
   version, and the machine refuses one it does not recognize, so a stale
   cache fails loudly instead of being misread.
2. **A separate requirejs config** (`standalone-config-vm.json`,
   and `node_modules-config-vm.json` for the npm package). It is the
   ordinary one plus a single raw-js entry: the machine. Interpreted modules
   name it as their one `nativeRequire`, which is the long-standing way a
   compiled module asks for a JS dependency — and keeping it there rather
   than inside `runtime.js` is what lets interpreted and compiled modules
   sit side by side in one program.

## An open thread: a bytecode trove for the browser

code.pyret.org currently ships builtins precompiled by the stock compiler
and interprets only the user's program. Compiling the *trove* to bytecode as
well is a separate axis, and worth revisiting: the resulting page bundle is
**9.1 MB against 19.2 MB raw, 1.28 MB against 2.77 MB gzipped** — less than
half of what a student downloads.

It is not finished. Building it is what surfaced the annotation-timing bug
above; with that fixed the page boots (editor ready in ~5s), but *running* a
program hangs — `getModuleResultResult` comes back without stats, so
repl-ui's result handler takes its error branch on a value that isn't a
module result and never resumes. That is the next thing to chase. Note the
trade even if it works: library code is the hottest code in a student
program, so interpreting it costs the ~7% everywhere rather than only in
user code.

## Next step

`NEXT-inline-caches.md` in this directory is a written brief for the largest
remaining performance item: per-call-site inline caches, which is the thing
an interpreter can do that a code generator cannot. It carries the profile
evidence, a design proposal with the shape-token question already settled,
the verification protocol, and the traps.
