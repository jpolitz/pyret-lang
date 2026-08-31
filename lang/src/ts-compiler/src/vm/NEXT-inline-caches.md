# Brief: inline caches for the Pyret VM

A handoff note for whoever picks this up next. It assumes no memory of the
work that built the interpreter — start here, then read
`src/ts-compiler/src/vm/README.md`.

## What exists

An interpreter back end for the Pyret compiler, selected with a flag and
otherwise a drop-in for the JavaScript code generator:

```
node build/ts-compiler/pyret.js --backend vm --build-runnable foo.arr ...
```

| file | role |
|---|---|
| `src/ts-compiler/src/vm/opcodes.ts` | instruction set, operand encoding, program format, `FORMAT_VERSION` |
| `src/ts-compiler/src/vm/vm-compile.ts` | ANF → bytecode |
| `src/ts-compiler/src/vm/vm-of-pyret.ts` | wraps bytecode in the standard module record |
| `src/ts-compiler/src/vm/disasm.ts` | disassembler + bytecode verifier |
| `src/js/base/pyret-vm.js` | the machine (`runMachine` is the dispatch loop) |

It is green: `tests/all.arr` passes in full (13,467 tests, same count as the
JS backend, output identical apart from timestamps), and the browser suite
passes in every environment that can select a flavor.

## The task

Add **per-call-site inline caches** to the machine. This is the largest
remaining performance item, and it is something an interpreter can do that
the code generator structurally cannot: there is a natural place to put
mutable state attached to a *site*.

### Why — the evidence

Steady-state speed is ×1.07 of the JS backend on benchmarks long enough to
measure. Profiling `list-set-const-1000000.arr` (`node --prof`, then
`node --prof-process`), as a share of non-library ticks:

| | interpreter | JS backend |
|---|---:|---:|
| `runMachine` / generated functions | 19.8% | ~16% |
| `Builtin: LoadIC` | 11.6% | 18.6% |
| `Builtin: KeyedLoadIC_Megamorphic` | 7.9% | 8.9% |

That megamorphic keyed load is `val.dict[field]` — object dicts have many
shapes, so every field access and method lookup pays for it. Both back ends
pay it; only the interpreter can memoize per site.

Static opcode mix over the compiled trove (`tests/vm-compiled`, 6,935
functions, 101,341 instructions):

```
CALL 20.0%   UNBOX 9.7%   RET 9.2%   DOT 8.6%   METHCALL 7.2%
PRIMAPP 5.2%  TAILCALL 4.2%  ANNCHECKV 4.1%  CLOSURE 4.1%  ...
```

To regenerate that histogram, walk `DIS.instructions(fn)` over every
`-module.js` in a compiled cache (`DIS.extractProgram` recovers the program
from a compiled module; see `disasm.ts`).

## Design proposal

### Where the cache lives

Have **the compiler allocate cache slots** and emit the index as an operand,
rather than keying on `pc` at run time. Add a `ncaches` field to the program
and one integer operand to each cached opcode:

```
METHCALL  d, o, nameK, locK, icIdx, n, args...
CASES     v, dispatchIdx, locK, icIdx, elseTarget
CASESBIND v, n, icIdx, (d, isRef) * n
DOT       d, o, nameK, locK, icIdx
```

At load, `Mod` allocates `new Array(prog.ncaches)`. **Caches must live on
`Mod`, not on the program**: a program can be instantiated into more than
one realm/runtime, and a cached value from one must never be visible to
another. (`Mod` is constructed per `runModule` call, so this falls out.)

Bump `FORMAT_VERSION` (currently 3) — the operand layout changes. Update
`LAYOUTS` in `disasm.ts` in the same edit, or the verifier will misdecode
every stream.

### The shape token — this part is verified, use it

A data value's constructor sets, on its prototype (`makeDataTypeConstructor`,
`runtime.js:1274`):

```js
C.prototype.$name = $name;          // per-variant string
C.prototype.$constructor = base;    // per-variant object, shared by all instances
```

`$constructor` is a sound shape token:

- **All instances of a variant share it**, so anything derived only from the
  variant is cacheable against it.
- **It cannot be spoofed by extension.** `obj.{...}` goes through
  `extendWith` → `updateDict`, and `PObject.prototype.updateDict`
  (`runtime.js:1217`) returns a *plain* `PObject`. An extended data value
  therefore has no `$constructor` at all and simply misses the cache.
- Plain object literals have no `$constructor` either — miss, slow path.

**But the token alone is not enough for field lookups.** A data value's dict
is `thisRuntime.create(base)`: the variant's *fields* are own properties
(per-instance values, not cacheable), while `sharing:`/`with:` members come
from `base` through the prototype chain (shared, cacheable). So a `METHCALL`
or `DOT` cache may only fill when the resolved member came from the
prototype:

```js
if (!Object.prototype.hasOwnProperty.call(val.dict, name)) { /* cacheable */ }
```

Check that once, at fill time; a hit afterwards is a single identity compare.

### What to cache, in order of expected value

1. **`METHCALL`** — the clear win. Today every method call runs
   `R.getColonFieldLoc(obj, name, loc)`: a megamorphic `val.dict[field]`
   plus `isRef`/`isMethod` branches. Cache `{shape, member}` keyed on
   `obj.$constructor`; on a hit, skip the lookup entirely and go straight to
   the existing `$pvmm`/`$pvm`/JS-land dispatch. 7.2% of instructions, and
   the hottest shape in list-heavy code.
2. **`CASES`** — `table[v.$name]` is a megamorphic keyed load on a
   many-keyed object. Cache the last `{$name, target}` pair; hit is a string
   identity compare. Cheap to add, and `cases` is everywhere in the trove.
3. **`CASESBIND`** — reads `v.$constructor.$fieldNames` and
   `v.$mut_fields_mask` on every branch entry. Both are per-variant; cache
   them against `$constructor`.
4. **`DOT`** — smaller. The field *value* is per-instance so it cannot be
   cached, but the *decision path* can: a cache saying "for this shape,
   `name` is a plain non-ref non-method member" lets the machine do a bare
   `val.dict[name]` and skip `getFieldLoc`'s branches. Measure before
   committing; it may not pay.

Do them one at a time and measure each. Resist a polymorphic (N-entry)
cache until a monomorphic one is shown to thrash.

### Hazards

- **Mutable fields.** `ref` fields go through `derefField`; make sure a
  cached path never skips that. The `hasOwnProperty` guard already excludes
  per-instance fields, which is where refs live — but check.
- **Suspension.** A cache entry is a pure memo, so it needs no interaction
  with `Cont`/`ActivationRecord`. Do not put anything in a cache that a
  resumed activation would need to be correct.
- **Re-entrancy.** The machine is re-entered JS→VM→JS→VM. All of this is
  single-threaded, so a cache write can't tear — but a cache slot is shared
  by all activations of that site, which is exactly the intent.
- **`brand`.** `PObject.prototype.brand` returns `makeObject(this.dict)` — a
  plain PObject — so branding also drops `$constructor`. Fine (miss), but
  worth confirming nothing branded is on a hot path.

## Verifying

Run these, in this order. Everything below is expected to pass before and
after; a change that reddens any of them is not done.

```
make vm-unit-test        # opcode table agreement + bytecode verifier
make vm-parity-test      # 33 programs built BOTH ways, output must match
make vm-pyret-test       # main2.arr, interpreted
make all-vm-pyret-test   # tests/all.arr — 13,467 tests
make vm-io-test          # stdin / exit codes / network: the pauseStack path
make vm-repl-test
make vm-serve-test
```

`vm-parity-test` is the load-bearing one: it builds each program with
`--backend js` and `--backend vm` through the *same* front end and
requires identical output, so any difference is a back-end difference.

### Benchmarking

```
node src/ts-compiler/tests/vm-bench.js --build --runs=3 \
  --filter='0_empty|propcheck|tree-set-grow-10000|list-set-const-1000000|boids-loop|recursion-triangle-2000000|edits'
```

That filter is the subset that runs long enough to mean anything; shorter
programs are dominated by process startup and module load, which differ
between the back ends (bytecode loads *faster*), so their ratios are noise.
The harness times the two builds alternately so a noisy stretch hits both
sides equally. **Baseline to beat: ×1.07 aggregate, ×1.09 median.**

### Things that will waste your time if you don't know them

- **Delete the compiled caches after any bytecode change.** A cached module
  records which back end and format produced it only by which directory it
  is in. `rm -rf compiled-vm tests/vm-compiled build/ts-compiler/vm-bench/compiled-vm build/ts-compiler/vm-parity`.
  The `FORMAT_VERSION` check will fail loudly rather than misinterpret, but
  only after you have wasted a build.
- **After editing `src/js/base/pyret-vm.js` by hand, copy it to
  `build/phaseA/js/` and `build/ts-compiler/js/`.** Standalones bundle it
  from `build/phaseA`. The make targets do this for you; ad-hoc `node
  build/ts-compiler/pyret.js` invocations do not.
- **This box has 2 CPUs. Do not run the browser harness while a test suite
  is running.** It produces 60–180s timeouts that look exactly like real
  failures. Two separate false alarms in the session that built this.
- **A parity program that fails to compile proves nothing** — it compares
  two error messages and never reaches a back end. The harness now rejects
  that for anything not named `err-*.arr`, after three programs sat there
  silently doing it.

### Browser

Only needed if you touch anything outside the machine, but for reference:
`code.pyret.org` must be built (`npm run build && make web-ts`, with a
`pyret` symlink to `lang/`), a server started on 4999, then from
`browser-test/`: `BASE_URL=http://localhost:4999 node run.js --env=cpo
--compiler=vm`. Note that in the browser the builtins are precompiled
JavaScript and only the user's program is interpreted — the mixed case.

## Reading bytecode

```js
const DIS = require('build/ts-compiler/vm/disasm.js');
const prog = DIS.extractProgram(fs.readFileSync('<compiled>/foo-<sha>-module.js', 'utf8'));
console.log(DIS.disassemble(prog));
```

`DIS.checkFunc` verifies an instruction stream; `DIS.readsBeforeAssignment`
catches letrec cells read before they are assigned (the shape of a real bug
that got past every runtime test). Both run in `make vm-unit-test` over
the whole compiled trove — extend them rather than adding one-off scripts.

## If you want more after this

Ranked below inline caches, from the README's list: superinstructions
(cheap, and the opcode histogram tells you which pairs — `UNBOX`+`CALL` is
the obvious one), register windows (removes the last per-call allocation),
closure/threaded compilation (biggest, and starts turning the interpreter
back into a compiler). And the non-performance prize: the machine has an
explicit pc, explicit frames and a srcloc per frame, which is most of a
stepping debugger.
