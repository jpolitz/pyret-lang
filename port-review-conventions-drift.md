# TS-port review — drift from CONVENTIONS.md

The conventions were **re-derived independently from the code** by 16 reviewers (one
per file group) who did not read CONVENTIONS.md; this document diffs what the code
actually does against what the doc says. Companion: `port-review-nonmechanical.md`.

## A. Rules confirmed as stated (no action)

The following doc rules hold essentially everywhere they were checked:
layout (one .ts per .arr, trove-data ports, reused AMD infra); kebab→camelCase;
PascalCase variant classes with kebab `$name` getters (227/227 getter-style in
ast.ts); union type per data; `isX` instanceof guards; node-passing visitor
convention (all passes comply); `List<T>` → `T[]` treated immutably;
`Option<T>` → `T|undefined`; Either helpers in shared.ts; `Map` for both dict
flavors with `mapSet` copy-on-write where the original is live (verified —
no aliasing bugs found in any file); `Set<Name>` as key()-keyed Maps; PyretNumber
for literal values / `number` for counts (parse-pyret, ast, desugar all comply);
`.append()` for docs; loop/reduce translations preserving evaluation order
(gensym parity verified across desugar/anf/resolve-scope/type-check); switch on
`$name`; gensym/global-names counter semantics; srcloc port; output contract
(module format, .jarr format, cache naming — verified byte-shape identical);
fidelity rule 2 (one TS function per Pyret function — held everywhere).

## B. Doc says X, code does Y (doc bugs or knowing violations)

1. **"`tostring(x)` → … or `jsnums.toString` as appropriate"** — `jsnums.toString`
   **does not exist**; `interop/js-numbers.ts:46-48` explicitly documents this and
   says use `String(x)`. The doc's own table contradicts the interop layer. Fix the
   table.

2. **"byte-level parity of emitted JS is the goal wherever feasible"** — knowingly
   waived in `js-of-pyret.ts:21-30` (module-object field order = Map insertion
   order) by a local comment. Either the doc should name the sanctioned parity
   exceptions in one place, or clMapSd should sort. Related: parity now also
   depends on determinism sorts added to *both* compilers
   (`anf-loop-compiler.ts:18-23` header) — a co-modification invariant the doc
   doesn't mention.

3. **Fidelity rule 1: "do not improve algorithms, error messages, or traversal
   order. Error message strings must match exactly."** — violated as a matter of
   course for *internal* errors: every added `default: throw new
   InternalCompilerError(...)` arm is a new string; `torepr`/`tostring` in raise
   messages became ~5 divergent local reimplementations; parse-pyret invented a
   whole `PyretParseError` message vocabulary. [Merge cleanup: the parse-error
   vocabulary turned out to be user-facing — the CLI printed `e.message` for any
   unparsable program, caught by the type-check parity harness on
   `should-not/methods-contested-extension.arr`. The classes now carry ported
   `renderReason()`s mirroring error.arr and the CLI renders through them,
   byte-identical; the terse `message` strings remain as internal fallback.]
   User-facing render-reason strings
   *were* kept exact (verified in well-formed and compile-errors). The de-facto
   rule is "user-facing strings exact; internal strings best-effort" — the doc
   should say that, because the current text forbids what the port does hundreds
   of times.

4. **Fidelity rule 1 (algorithms/traversal)** — the stack-safety rewrites
   (resolve-scope trampoline, anf hole-patching, anf-loop-compiler generators,
   computeLiveVars work-list, pprint/flatness loops) are deliberate, argued-in-
   comments algorithm changes. They deserve a sanctioned carve-out in the doc:
   "linear per-statement recursion may be converted to iteration with an effect-
   order-parity comment" — plus a note on what must NOT be converted silently
   (anything that reorders gensym effects).

5. **Fidelity rule 4: "anything intentionally not ported must throw
   `TODOError`"** — only compile-lib/cli-module-loader honor this. Elsewhere:
   dead grammar productions throw plain `Error` (parse-pyret.ts:1090-1098);
   dropped methods are silently omitted (`pyretToJsPretty`, locator `_equals`,
   repl `update-compile-context`); dead branches are deleted with (or without)
   comments (flatness, ast-anf a-method-app). The doc needs a taxonomy:
   TODOError = not yet ported; explanatory throw = dead-by-construction; silent
   omission = never allowed (several exist today).

6. **Fidelity rule 3: "do not add narration comments"** — the runtime-boundary
   files (cli-module-loader, server, pyret, url, builtin-modules) carry extensive
   added headers and parity arguments, and the port's best documentation lives in
   exactly those comments. The rule as written is both violated and — for these
   files — wrong. Suggest scoping it: no narration in mechanical ports; deviation
   NOTEs and architecture headers required at the runtime boundary.

7. **"`raise(<string>)` → `throw new InternalCompilerError(msg)`"** — mostly via
   the `raise()` helper, but three other error channels exist: bare `new Error`
   (npm.ts:19, parse-pyret string-throws), re-thrown raw fs/vm errors
   (builtin-modules.ts:214), and `PyretParseError`. Also `raise` flattens the
   Pyret user-exception/internal distinction, which server.ts:115-128 then has to
   reconstruct by special-casing classes. Worth documenting the intended taxonomy.

8. **Number rule: "do NOT use JS floats for Pyret numbers"** — knowingly violated
   once: `cmdline.ts:65-77` `ReadNumber` collapses exact values via `toFixnum`
   (documented in a comment as a deliberate CLI-only choice). Either bless it in
   the doc or route CLI numbers through PyretNumber.

## C. Real, load-bearing conventions the doc doesn't state (should be added)

1. **Map iteration order stands in for StringDict hash order.** The single
   biggest undocumented semantic substitution (see companion doc, cross-cutting
   #1). Needs a stated rule: where key order feeds gensyms, identity keys
   (`TRecord.key()`), serialized output, or user-visible messages, iteration must
   be sorted or otherwise content-deterministic; insertion order is acceptable
   only for pure lookups.

2. **Name-collision policy for data-vs-variant PascalCase clashes** — four
   different solutions coexist: `X$` class + `const X = X$` (ast-anf), `AnyX`
   union rename (compile-structs `AnyDependency`, type-check-structs
   `AnyFoldResult`), `T`-suffix unions (js-ast `JExprT`), and whole-class rename
   (`TypingContext`). Pick one, document it, note the legacy exceptions.

3. **Latent-Pyret-bug policy** — de-facto: "mirror non-crashing quirks
   bit-for-bit; fix would-crash bugs; leave a `// NOTE:` either way." Should be
   written down, and the silent fixes brought into compliance
   (ast-util iter-visitor arities, countApps, compile-errors fields.count,
   js-of-pyret addPhase, buildRequireStandalone JFun arg).

4. **Exhaustiveness arms**: no-else `cases` gets
   `default: throw new InternalCompilerError('… in <fn>')`. Applied ~95% of the
   time but not stated; the exceptions (desugarAnn's bespoke raise, TS-trusted
   exhaustive switches, ensureUniqueCases) look like drift because there's no
   rule to check against.

5. **`freeze()` has no analogue** — the code's actual conventions:
   `.freeze()` → `new Map(...)` copy at the freeze point (ast-anf freevars), or
   alias-with-comment when provably never mutated again (js-dag-utils), or
   silently dropped (type-defaults `defaultModules` — a shared mutable export
   that should probably be copied per call). `FrozenNameDict = NameDict` means
   the type system enforces nothing. Document the copy-at-freeze-point rule and
   fix type-defaults.

6. **Grammar-invariant casts** — `as A.SBind` / `(x as any).l` / `right!` stand
   in for Pyret's dynamic field access, converting loud field-not-found failures
   into silent `undefined`s. This is the port's pervasive, unstated trade; it
   deserves a rule (e.g. "casts encode parser invariants; anything reachable
   from user input must fail loudly").

7. **Effect-parity idioms**: unused Pyret bindings kept and silenced (styles in
   use: `void x;`, `void (…ternary…)`, omitted destructuring slot, commented-out
   line — pick one); side-effectful curried-constructor args hoisted to consts
   before `makeAtomFor`; discarded-but-effectful computations kept
   (`getDefinedValues`, the js-dag-utils `labels` fold). All load-bearing for
   gensym parity, none in the doc.

8. **Object extension**: `obj.{f: v}` → prototype-preserving `ext()`
   (anf-loop-compiler) / `extendVisitor` (ast-util) for methodful objects,
   plain spread for plain records and locators — and therefore **locators must
   stay object literals** (spread would drop class prototypes). Unstated; the
   locator-literal constraint is silently relied on in cli-module-loader/repl.

9. **Locator identity = `uri()` string; `_equals` dropped everywhere.** Works,
   undocumented, and the Pyret Locator contract says `_equals` is load-bearing.

10. **`where:`/`check:` blocks are never ported** — the doc doesn't mention test
    blocks at all. Say where their coverage is supposed to land
    (`ts-compiler/tests/`), because today the fold-order and pretty-printer
    byte tests simply vanished.

11. **Structural-equality sub-rules** actually in use and worth writing down:
    `==` on Types → `.equals()`; Names/locs → `.key() ===`; sets keyed by
    `.key()` assume key() fully determines equality; singleton comparisons may
    use `instanceof` only for true singletons (`instanceof ConcatEmpty` in
    anf-loop-compiler is safe today, not equivalence-preserving in general).

12. **Double-Option encoding**: where Pyret distinguishes `none` from
    `some(none)` (flatness), the port uses `map.has(k)` alongside `get` — plus
    the key-present-with-undefined-value trick in resolve-scope. Works, subtle,
    undocumented.

## D. Internal inconsistencies (no rule exists on either side; unify or ignore)

- ~5 `torepr` reimplementations with different output (shared.ts should own one).
- `raise(...)` vs `throw new InternalCompilerError(...)` vs `throw raise(...)` —
  three spellings, loosely correlated with provenance.
- Factory-function exports: every variant (error-display), some (compile-structs
  `ok`/`err` only), none (srcloc); nullary-variant singletons everywhere except
  `ASCENDING`/`DESCENDING` (classes with no singleton — identity comparisons
  would break).
- mtime units: fractional `mtimeMs` (builtin.ts, jsfile.ts) vs integer
  `Number(stats.mtime)` (file.ts) vs original's floored ms.
- concat-lists exports both `map_list_n`-style originals and `mapListN` aliases;
  both `concatSingleton` and `clSing`.
- Stack-safety conversion is selective with no stated criterion (map2Strict
  deliberately left recursive; ConcatList methods unbounded).
- Helper placement: `splitAt`/`takeWhile`/`sortBy`/`toRepr` local per-file while
  siblings live in shared.ts.
- Unused-parameter silencing styles (see C.7).
