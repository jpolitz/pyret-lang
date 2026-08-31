# The vm back end (pvm)

*(agent-maintained; the full design derivation and run status live in
`VM_DESIGN.md` and `VM_REPORT.md` at the repository root)*

A second back end for the compiler in `src/ts-compiler`: instead of
generating JavaScript, it emits bytecode for a register machine, chosen
with a flag:

```
node build/ts-compiler/pyret.js --backend vm --build-runnable foo.arr ...
pyret --backend vm foo.arr                    # the npm CLI
https://code.pyret.org/editor?compiler=vm     # the editor
```

Unlike the earlier interp back end this directory grew out of, the vm
back end does NOT run on `runtime.js`: every `.arr` module compiles to
bytecode and runs on `src/js/base/vm-runtime.js`, a promise-based
conversion of the runtime (suspension is a thenable; one promise stands
for the whole bytecode stack), with the machine in
`src/js/base/pyret-vm.js` preloaded as `R.$vm`. Standalones link it via
`src/scripts/standalone-config-vm.json`; caches are backend-keyed
(`compiled-vm/`, `tests/vm-compiled/`).

| file | role |
|---|---|
| `opcodes.ts` | instruction set, operand encodings, program format (`FORMAT_VERSION` is the contract with the machine; bump on any change) |
| `vm-compile.ts` | ANF -> bytecode |
| `vm-of-pyret.ts` | wraps bytecode + flat fast-form factories in the standard module record |
| `disasm.ts` | disassembler and bytecode verifier |
| `../../../js/base/pyret-vm.js` | the machine |
| `../../../js/base/vm-runtime.js` | the promise runtime |

Three properties are load-bearing and tested by the oracles (`make
vm-parity-test`, `make vm-pyret-test`, `make vm-pause-oracle`):

1. **Answers**: byte-identical stdout/stderr/exit with the js back end.
2. **Fuel**: the machine replicates the cont backend's GAS/RUNGAS
   dynamics event for event (entry checks, ++GAS refunds, capture
   refills through the `--pause-schedule` getters, per-pop floors), so
   the same schedule pauses at the same points.
3. **Stacks**: at every pause both backends record the same
   user-visible stack (`PYRET_PAUSE_TRACE`; `diff` is the comparator).
   This forces cont's tail-call warts: SELFTAIL only under cont's
   loop-back predicate, at-return frames elided at capture, cases
   branches lifted exactly where the js back end lifts them, and the
   `locKS` field mirroring cont's stale `$al` update sites.

Flat functions (the ones the js back end compiles without a step
machine) additionally get a synchronous fast form compiled by the real
`compileFunBody(isFlat=true)` — byte-identical flat JS — carried in the
module's `$F` factory array and called directly by the machine.

One timing subtlety preserved from the interp work: a `data` member's
refinement may name a function defined later in its letrec group, so
annotation descriptors are captured against the frame eagerly and
forced lazily (`captureAnn`/`forceAnn` in pyret-vm.js);
`readsBeforeAssignment` in `disasm.ts` checks the shape statically and
`vm-programs/late-annotations.arr` pins it.

`NEXT-inline-caches.md` is a written brief for per-call-site inline
caches, from the interp-era work; its profile numbers predate the
promise runtime.
