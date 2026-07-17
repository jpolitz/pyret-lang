# Type Checking for Tables in Pyret (TypeScript compiler)

This document describes the design and implementation of static type checking
for tables in the TypeScript Pyret compiler (`src/ts-compiler/`), aligned with
the philosophy of B2T2, the Brown Benchmark for Table Types ("Types for
Tables: A Language Design Benchmark", Lu, Greenman, Krishnamurthi;
arXiv:2111.10412). It covers the type grammar and rules, the implementation
strategy, bugs found along the way, features that are deliberately left
untypable, and alternate designs that would need language changes.

Everything here is implemented in the TypeScript compiler only and activates
only under `type-check: true` (`-type-check`). The Pyret-hosted compiler, the
untyped pipeline, code generation, and the runtime are unchanged.

Run the table type checker's test suite with:

```
make ts-tables-test        # tests/type-check/tables-good + tables-bad
```

---

## 1. The type grammar

No grammar (BNF) changes were needed; every new form parses today. The new
types are:

```
ann ::= ... (everything Pyret has today)
      | Table<schema>          table with statically-known column schema
      | Row<schema>            row with statically-known column schema
      | Col<schema>            a column name (a String) of the given schema
      | Col<schema, ann>       a column name whose column sort is a subtype
                               of the given ann

schema ::= { name :: ann, ... }   ORDERED record-of-columns syntax
         | TyVar                  a type parameter (schema polymorphism)
         | AliasName              a type alias for either of the above
```

Bare `Table` and `Row` remain valid and denote a table/row whose schema is
unknown ("opaque"); `Table<S> <: Table` and `Row<S> <: Row`. Bare `Col` is
just `String`, and `Col<S, T> <: String` always, so column names can be used
wherever strings can (e.g. `"column " + c`).

Examples:

```pyret
students :: Table<{name :: String, age :: Number}> = ...

fun dot-product<S>(t :: Table<S>, c1 :: Col<S, Number>, c2 :: Col<S, Number>) -> Number:
  ...
end

fun group<S, T>(tab :: Table<S>, col :: Col<S, T>) -> Table<{value :: T, subtable :: Table<S>}>:
  ...
end
```

Internally there is exactly **one new type-representation variant**,
`t-schema` (an ordered list of column-name/sort pairs), plus one
internal-only variant `t-str-singleton` (section 3). `Table<S>`, `Row<S>`,
and `Col<S, T>` are ordinary `t-app` applications of the builtin `Table`,
`Row`, and `Col` names. This is the key implementation trick: because they
are ordinary `t-app`s, the existing machinery for `forall`
instantiation, existentials, substitution, and generalization gives **schema
polymorphism for free**. `fun f<S>(t :: Table<S>, c :: Col<S, Number>)` needs
no new kind system: `S` is an ordinary type parameter that happens to be
instantiated with a `t-schema`.

## 2. Subtyping and constraint rules

Added to the constraint solver (`solveHelperConstraints`):

1. **Schemas are compared by equality**: `t-schema [c1 :: T1, ...] <:>
   t-schema [c1' :: T1', ...]` requires the same names in the same order, and
   emits mutual constraints `Ti <: Ti'` and `Ti' <: Ti` (mutual so that
   existential column sorts can be solved from either side).

   *Why no width subtyping?* Because column names reflect into types:
   `t.column-names()` has type `List<Col<S>>` and `r.get-value(c)` for
   `c :: Col<S, T>` returns `T`. If `Table<{a, b, c}> <: Table<{a, b}>` were
   allowed, a runtime `"c"` obtained from `column-names()` would inhabit
   `Col<{a, b}>`, and `get-value` at that name would produce a value of a
   type unrelated to its static type — genuine type confusion, not just a
   runtime error. Depth covariance would be sound (tables are immutable) but
   is omitted for simplicity; see section 7.

   *Why order-sensitive?* Column order is observable (`column-n`,
   `all-columns`, the positional `t.row(...)` constructor, display), so
   `Table<{a :: Number, b :: String}>` and `Table<{b :: String, a :: Number}>`
   are genuinely different shapes. `stack` (which reorders at runtime) is
   typed to require the same schema statically.

2. **Schema forgetting**: `t-app(Table, [S]) <: t-name Table` and similarly
   for `Row`. (Not the converse: an opaque table does not silently acquire a
   schema; annotate at the construction/load site instead.)

3. **Column names are strings**: `t-app(Col, [S, T]) <: t-name String`.

4. **String literals as column names**: checking a string literal `"c"`
   against `Col<S, T>` creates the internal singleton type `t-str-singleton
   "c"` and the constraint `"c" <: Col<S, T>`, resolved as:
   - `S` a concrete `t-schema`: `"c"` must be a column of `S` (with a
     column-listing error message if not) and `S[c] <: T`.
   - `S` an unsolved existential: the constraint is *deferred* to the next
     solver level (the same deferral discipline the solver already uses for
     out-of-level existentials), where `S` is usually solved by then. This
     matters because the spine checks arguments right-to-left: in
     `mean(gradebook, "age")` the literal is checked against `Col<αS, αT>`
     *before* `αS` is unified with `gradebook`'s schema.
   - `S` a rigid type variable: rejected, with a message suggesting a
     `Col<...>`-typed parameter. (Inside `fun f<S>(t :: Table<S>)` you cannot
     use `t.get-column("age")` — nothing guarantees `S` has an `age` column.)

5. Generic `t-app` congruence (already present) covers
   `Table<S1> <: Table<S2>` ⇒ `S1 <:> S2`, and `Col` likewise.

6. **Alias-application unfolding**: constraints between a record type and an
   applied type *alias* (`Reducer<Number, Number, Number>` vs. `{one :: ...,
   reduce :: ...}`) now unfold the alias one step instead of failing. (Types
   arriving from module provides are folded; annotation processing had
   already unfolded them. This was a latent gap exposed by reducers; see
   "bugs found".)

## 3. Typing rules

Notation: `S` a schema `[(c1, T1), ..., (cn, Tn)]`; `S[c]` the sort of column
`c`.

### Table syntax forms (checked directly, then lowered post-TC)

- **`table:` literal** `table: h1 [:: A1], ... row: e ... end`
  - a column with an annotation `Ai` has sort `Ai`, and every cell in that
    column is *checked* against it (the lowering also inserts the per-cell
    dynamic check, as before);
  - an unannotated column's sort is the meet (least upper bound) of its
    cells' synthesized types (mixed `1` / `"two"` columns are type errors);
  - an unannotated column of an *empty* literal gets a fresh existential,
    solved from context — so `for fold(acc from table: value, subtable end, ...)`
    infers the empty table's schema from how `acc` is used;
  - result: `Table<[(h1, sort1), ...]>`.
- **`load-table:`** — every column **must** be annotated (the data source is
  external; this is the "require annotations for unknown data" stance the
  task allows). Sanitizer clauses must name declared columns; source and
  sanitizer expressions are checked loosely (the loader protocol is dynamic).
  Result `Table<[(hi, Ai)]>`. Sanitizers remain the dynamic-enforcement
  mechanism: `sanitize age using strict-num-sanitizer` makes the static
  `age :: Number` actually true cell-by-cell at load time.
- **`extend t using c1, ...: n [:: B]: e, m: r of c end`**
  - `t ⇒ Table<S>`; each `using` column must be in `S` and is bound at
    `S[ci]` (or at its binding annotation `A`, with `S[ci] <: A` required —
    same direction as ordinary let bindings) inside the extension bodies;
  - a computed extension `n: e` gives `n` the sort of `e` (checked against
    `B` if given);
  - a reducer extension `m: r of c` requires `c` to be bound in the `using`
    clause and checks `r` against
    `{one :: (S[c] -> {A; U}), reduce :: (A, S[c] -> {A; U})}`
    (i.e. `Reducer<A, S[c], U>`) for fresh `A`, `U`; `m` gets sort `U`;
  - new names must be fresh and distinct; result `Table<S ++ new-columns>`.
- **`transform t using c1, ...: m: e end`** — `m` must be in `S`; `e` is
  synthesized with the `using` columns bound at their sorts; the updated
  column's sort *becomes* `e`'s type: `Table<S[m ↦ typeof e]>`.
- **`sieve t using c1, ...: pred end`** — `using` columns bound at their
  sorts; `pred ⇐ Boolean`; result `Table<S>`.
- **`order t: c ascending, ... end`** — columns must exist; result
  `Table<S>`. (Comparability of the column's sort remains a dynamic check,
  as it is today.)
- **`select c1, ..., cn from t end`** — all `ci` in `S`, distinct; result
  `Table<[(ci, S[ci])]>` in the *selected* order.
- **`extract c from t end`** — `c` in `S`; result `List<S[c]>`.

All these forms degrade gracefully on an *opaque* `Table` operand: column
bindings get `Any`, and the result is opaque `Table` (sound; runtime checks
are unchanged).

### Methods on `Table<S>` (via field types computed from the schema)

These work with both concrete and abstract `S`; `forall`-typed entries get
instantiated per call site by the existing machinery:

```
length         :: -> Number                         empty :: -> Table<S>
row-n          :: Number -> Row<S>                  all-rows :: -> List<Row<S>>
column-names   :: -> List<Col<S>>
column, get-column :: forall T. Col<S, T> -> List<T>
filter         :: (Row<S> -> Boolean) -> Table<S>
filter-by      :: forall T. (Col<S, T>, (T -> Boolean)) -> Table<S>
order-by       :: (Col<S>, Boolean) -> Table<S>
increasing-by, decreasing-by :: Col<S> -> Table<S>
order-by-columns :: List<{Col<S>; Boolean}> -> Table<S>
stack          :: Table<S> -> Table<S>
add-row        :: Row<S> -> Table<S>
row            :: (T1, ..., Tn) -> Row<S>           (concrete S only)
reduce         :: forall A, U, T. (Col<S, T>, Reducer<A, T, U>) -> U
column-n       :: Number -> List<Any>               all-columns :: -> List<List<Any>>
```

### Name-dependent methods (application-site rules)

For methods whose **result schema depends on the argument values**, the
application `t.m(args)` is given a precise type when `t : Table<S>` with `S`
concrete and the name arguments are string literals:

```
t.add-column("c", vs)        c ∉ S; vs ⇐ List<T>       ⇒ Table<S ++ [(c, T)]>
t.build-column("c", f)       c ∉ S; f ⇐ (Row<S> -> T)  ⇒ Table<S ++ [(c, T)]>
t.transform-column("c", f)   c ∈ S; f ⇐ (S[c] -> T)    ⇒ Table<S[c ↦ T]>
t.drop("c")                  c ∈ S                     ⇒ Table<S - c>
t.rename-column("c", "d")    c ∈ S, d ∉ S              ⇒ Table<S[c renamed d]>
t.select-columns([list: "c", ...])  all ∈ S, distinct  ⇒ Table<selected>
```

When the names are not literals (or `S` is abstract), these fall back to a
sound loose type whose result is the opaque `Table`. This is the standard
"literal types at call sites" move (cf. TypeScript), without making string
literal types pervasive.

### Rows

- `r.get-value(c)` / `r.get(c)`: `forall T. Col<S, T> -> T` / `-> Option<T>`.
- `r["c"]` (bracket access, which desugars to the `getBracket` primitive):
  typed like `get-value`; a literal key is looked up in the schema, a
  `Col<S, T>`-typed key gives `T`. On an opaque `Row` the result is `Any`.
  (Previously **any** bracket access in typed code was an unbound-id error on
  `getBracket`.)

## 4. Implementation strategy

The pipeline problem: in this compiler, desugaring runs *before* type
checking and lowered tables to `makeTable` primitives and raw-array
operations, so the checker never saw table syntax at all (and `Table` was an
alias for `Any`). The fix:

1. **`desugar.ts`** gets a `preserveTables` option (set exactly when
   `type-check: true`): the eight `s-table*` forms are preserved (children
   still desugared). Untyped compilation is byte-identical to before.
2. **`type-check.ts` / `type-check-tables.ts`** implement the rules above.
   The new file `type-check-tables.ts` holds all table logic; `type-check.ts`
   has small hook points (annotation interception in `toType`; `s-str` vs
   `Col` in checking mode; the eight syntax-form cases; the s-app
   interception for name-dependent methods; `getBracket`; a
   `synthesisField` interception for `Table<S>`/`Row<S>` receivers).
3. **`desugar-post-tc.ts`** lowers the preserved table forms *after* type
   checking, emitting exactly the code the pre-TC lowering used to emit (the
   code was moved, not rewritten — a possibility the original code
   anticipated: "this will need to be moved to post-type-check desugaring").
   It also rewrites `Col<...>` annotations to `String` so the dynamic
   contract for a column name is a string check. `Table<{...}>`/`Row<{...}>`
   annotations need no rewriting: the runtime already treats them like
   `List<Number>` — check the constructor, trust the parameters.
4. **Environment**: `Table`/`Row` were already nominal in the compiled
   `global` module's provides; their datatype entries in `global.js` gain
   (loosely typed) method signatures so *opaque* tables remain usable in
   typed code. `Col` is a new global type name (alias `String` dynamically).
   The `csv` builtin module gets hand-written types in `type-defaults.ts`
   (like `lists`, `arrays`, etc. already had) so `load-table` sources
   type-check.
5. **Solver**: `t-schema`/`t-str-singleton` cases in the structural walkers
   (`substitute`, `freeVariables`, `apply`, `generalize`, ...), the new
   subtype rules, the singleton-membership rule with deferral, the
   alias-application unfolding, and schema-aware field-constraint solving
   (so an *inferred* receiver — e.g. the accumulator of a `fold` — can have
   `.stack` and friends resolved against `Table<S>`).
6. **Provides/serialization**: `t-schema` serializes in the record form
   (field order = column order); on deserialization, record arguments of
   `Table`/`Row`/`Col` applications are re-interpreted as schemas. Typed
   table libraries therefore work across module boundaries, fresh or from
   the compile cache.

Dynamic semantics are unchanged everywhere: same lowering output, same
runtime checks (per-cell checks for annotated literal columns; sanitizers
for loaded data; flat `Table`/`Row`/`String` contract checks for the new
annotations).

### Test suite

`tests/type-check/tables-good/` (9 programs, each also *runs*) and
`tests/type-check/tables-bad/` (21 programs, each must be rejected with a
type error), driven by `src/ts-compiler/tests/tables-test.sh` (`make
ts-tables-test`, part of `make ts-test`). The good programs include typed
versions of B2T2's dotProduct, groupByRetentive, count, pHacking (concrete
schema), employeeToDepartment, brownJellybeans-corrected, and bootstrap
core.arr's `group` and `mean`; the bad programs include B2T2's error suite
(midFinal, blackAndWhite, pieCount, brownGetAcne, favoriteColor-style
non-Boolean predicates, malformed literals) plus soundness cases (literal
names against abstract schemas, stack mismatches, row-constructor arity,
annotation/schema disagreement).

Note that `tests/type-check/main.arr` (the existing suite) exercises the
*Pyret-hosted* checker compiled as a library, so the new suite drives
`build/ts-compiler/pyret.js` directly, one process per program, like
`parity-test.sh`.

### code.pyret.org and the Pyret-hosted compiler

The Pyret-hosted compiler (which serves code.pyret.org's default editor)
carries the minimal plumbing so that *source code* using the new annotations
is portable everywhere:

- `Col` is a global type there too (`compile-structs.arr`; dynamically
  `String`), and its `desugar-post-tc.arr` rewrites `Col` annotations to
  `String`, mirroring the TS pipeline. So a library type-checked with the TS
  compiler — `fun mean<S>(t :: Table<S>, col :: Col<S, Number>) ...` — parses,
  compiles, and **runs** under the Pyret-hosted compiler and in the CPO
  editor (annotations degrade to their dynamic meaning: `Table`/`String`
  checks). The Pyret-hosted *type checker* itself does not implement table
  types; type-check-and-run on schema-typed programs reports an error there.
- `browser-test/tests/typed-tables.test.js` covers this in the real editor:
  Col programs run under the normal run in both compiler flavors; under
  `?compiler=ts`, "Type-check and Run" accepts schema-typed programs and
  rejects misspelled columns with the column-listing error. (For deployments
  behind a TLS proxy, `PYRET_ORIGIN_REWRITE=<public>=<local>` lets the
  headless suite drive the live server from inside the machine.)

## 5. Representative examples that now type-check

B2T2 dotProduct (with precise column-sort enforcement):

```pyret
fun dot-product<S>(t :: Table<S>, c1 :: Col<S, Number>, c2 :: Col<S, Number>) -> Number:
  ns = t.get-column(c1)   # List<Number>
  ms = t.get-column(c2)
  sum(map2(lam(a :: Number, b :: Number): a * b end, ns, ms))
end
dot-product(gradebook, "quiz1", "quiz2")   # literals verified against gradebook's schema
dot-product(gradebook, "name", "quiz2")    # STATIC ERROR: name is a String column
dot-product(gradebook, "quiz9", "quiz2")   # STATIC ERROR: no such column
```

Bootstrap core.arr `group` — tables of tables, schema inference for the empty
accumulator, `filter-by` at an abstract schema:

```pyret
fun group<S, T>(tab :: Table<S>, col :: Col<S, T>) -> Table<{value :: T, subtable :: Table<S>}>:
  values = Sets.list-to-list-set(tab.get-column(col)).to-list()
  for fold(grouped from table: value, subtable end, v from values):
    grouped.stack(table: value, subtable
        row: v, tab.filter-by(col, lam(val): val == v end)
      end)
  end
end
```

B2T2 `count` as a user function, whose result schema
`{value :: T, count :: Number}` is *computed* by the checker through
`build-column`/`drop`/`rename-column`:

```pyret
fun count<S, T>(t :: Table<S>, c :: Col<S, T>) -> Table<{value :: T, count :: Number}>:
  g = group-by-retentive(t, c)
  g.build-column("count", lam(r): r["groups"].length() end)
    .drop("groups")
    .rename-column("key", "value")
end
```

and B2T2's pieCount bug is then caught statically:

```pyret
pie-chart(count(jelly, "get-acne"), "true", "get-acne")
# ERROR: `"true"` is not a column of {value :: Boolean, count :: Number};
#        the columns are: `value`, `count`
```

## 6. Bugs found in the existing checker (and fixed)

1. **Alias applications from module provides never unfold in constraints.**
   `resolveAlias` only unfolds `t-app` whose head is *already* a forall;
   annotation processing pre-unfolds, but types deserialized from provides
   (e.g. `running-sum :: Reducer<Number, Number, Number>`) arrive folded, so
   any constraint between such a type and its unfolding failed with a
   mismatch. Fixed by a one-step unfolding in the solver on otherwise
   mismatch-bound constraints. (Latent: nothing in the old suite constructed
   such a constraint; reducers do.)
2. **`toType` builds record types in reversed field order.** The
   right-to-left fold inserted fields into the map in reverse source order.
   Harmless for record identity (`key()` sorts, subtyping is field-wise) but
   wrong for anything order-aware and confusing in printed types; local
   aliases disagreed with the same record type arriving from another
   module's provides (which deserializes in source order). Fixed by
   reversing the accumulated map (processing order untouched — existential
   creation order matters for output parity).
3. **`getBracket` is untypable.** The primitive that `r["c"]` desugars to has
   no type anywhere, so *every* bracket access in typed code was an
   unbound-identifier error. (Now handled for rows, with a clear error for
   other receivers.)
4. Assorted latent gaps that this feature makes reachable, handled rather
   than fixed-in-place: table syntax forms reached the checker's
   `InternalCompilerError` default arms (they were desugared away before);
   `solveHelperFields` crashed on any `t-app` whose head is not a
   parameterized datatype ("expected 0 type arguments, but received 1")
   when field-constraining an inferred `Table<S>` receiver.
5. **`s-table-update` had no `tosource`** (marked "not yet implemented" in
   `ast.arr`), so pretty-printing any program containing a `transform`
   expression crashed. Found because `test-pprint.arr` round-trips every
   `.arr` file in the repository and the new table tests are the first files
   containing `transform` syntax. Implemented (in `ast.arr` and the TS
   `ast.ts`), with parse→print→parse round-trip verified at several widths.
   Relatedly, the `s-table-extend-field`/`s-table-extend-reducer` printers
   emitted `name::Ann: value` with no spaces around `::`, which does not
   re-parse (`extend` with an annotated column was likewise unexercised);
   fixed in both ASTs, and all 33 new table test files now round-trip
   through the pretty printer at widths 40/80/160.
6. Partially-annotated trove functions (e.g. `csv-table-str(csv :: String,
   opts)`) export type `Any` for the *whole function* rather than an arrow
   with an `Any` argument, making them unusable in typed code (applying an
   `Any`-typed value is rejected). Worked around by annotating the csv table
   loaders (`opts :: Any`, return `{ load :: Function }`) and giving the csv
   module proper checker-side types; the serializer behavior itself is
   unchanged (a deeper fix belongs with the provides serializer).
7. Not a checker bug, but noted: `tables.arr`'s `lam<Result, Col>` type
   parameters now shadow the global `Col` type (renamed to `ColV`), and the
   runtime's `stack` implementation `console.log`s the headers on every call
   (left alone: runtime files are out of scope for this task).

## 7. Deliberately untypable (left dynamic or rejected, for soundness)

- **Computed column names** (B2T2 quizScoreFilter/quizScoreSelect): names
  built with `string-append`/`startsWith` filtering. Typing these requires
  type-level string computation (TypeScript's template-literal types are the
  reference point). `header(r)` filtered by `startsWith` *is* still a
  `List<Col<S>>`, but `getValue` at such a name yields the join of all
  column sorts, and Pyret's checker has no union types, so the join is `Any`
  and arithmetic on it is rejected. Statically rejected unless restructured.
- **Bootstrap `count`'s dynamic rename**: core.arr renames the `value`
  column *to the value of the argument* (`.rename-column("value", col)`), so
  the result's column name is data-dependent. The B2T2-faithful `count`
  (fixed `value`/`count` columns) types precisely (section 5); the renaming
  variant falls back to opaque `Table`. Typing it exactly needs the
  column-name *variable* to appear in the result schema (see section 8).
- **Schema-quantified properties** ("all columns of S are Boolean", needed
  for a fully generic pHacking over any jellybean table): no quantification
  over a schema's columns exists. The concrete-schema version types.
- **`hcat`/join-style schema concatenation of two unknown schemas**
  (`Concat<S1, S2>`): needs symbolic schema operators (section 8).
- **Value-indexed facts** (row counts, `sampleRows`' `n ≤ nrows(t)`,
  `getRow` index bounds — B2T2 getOnlyRow): out of scope for this type
  system entirely; these stay dynamic errors.
- On an **abstract** schema, `add-column`/`build-column` freshness (`c ∉ S`)
  cannot be verified; rather than tracking "lacks" constraints, those
  applications fall back to opaque results (the runtime check is unchanged).
  Literal *membership* claims against abstract schemas are rejected
  outright, which is what soundness requires.

## 8. Alternate designs, and what language changes would buy

- **Singleton name parameters in result schemas.** The natural type for
  bootstrap's renaming `count` is
  `fun count<S, c, T>(t :: Table<S>, col :: c) -> Table<{c :: T, frequency :: Number}>`
  where `c` ranges over column-name singletons and *appears as a field name*
  in the result schema. The blocker is surface syntax: record-annotation
  field names are identifiers, so a name-variable in field position can't be
  distinguished from a literal column called `c`. A small grammar extension
  (say, `{(c) :: T, ...}` or a `Rename<S2, "value", c>` operator with string
  literals as annotations) would make this expressible; the checker
  machinery (singletons + t-app congruence) is already in place.
- **Row-polymorphic schemas with presence/absence constraints**
  (`Table<{age :: Number | ρ}>`, `ρ lacks total`) would type
  `add-column` on abstract tables and functions like "any table with at
  least column X". This is a solver-level extension (row unification);
  `t-schema` was kept closed to preserve the reflection soundness argument
  in section 2, but a row variable with *both* presence and absence
  constraints could be sound. It is the main expressiveness step beyond the
  current system, at a real complexity cost in the constraint solver.
- **Symbolic schema operators** (`Drop<S, c>`, `Concat<S1, S2>`,
  `Select<S, cs>`) kept rigid when arguments are abstract would let
  `drop`/`hcat`/`select-columns` stay precise on abstract schemas instead of
  falling back to opaque `Table`. Straightforward to add as evaluated-when-
  ground type functions; symbolic equality is where the design cost lives.
- **Union types** (or bounded joins) would let `getValue` at an
  only-partially-known column name return something better than `Any` and
  would unlock quizScoreFilter-style programs combined with name-pattern
  types (`Col<S, _, "quiz*">` à la template literals).
- **A typed CSV import form.** The task suggested a module-resolution-time
  CSV import that computes a schema from the file. The infrastructure here
  is ready for it — it would just produce a `Table<[(...)]>` type — but the
  clean version wants a module-level hook (a new import form that reads the
  header row and sample values during dependency resolution) rather than a
  type-checker change, so it was left as future work in favor of the
  annotate-and-sanitize `load-table:` design, which has the advantage that
  the annotations are *enforced* (per cell, by sanitizers) rather than
  inferred from a sample.
- **`transform ... using` and reducer scoping.** Extend/transform bind only
  the `using` columns; a design where the whole row is in scope (like
  `build-column`'s function) would remove the "reducer column must be bound
  in `using`" wart, but that is a semantics change, not a typing one.

## 9. Soundness statement

A value of type `Table<S>` at runtime is a table whose column names and
order are exactly `S`'s. Column *sorts* have the same status as other
parametric types in Pyret's checker (the `Number` in `List<Number>`):
enforced statically everywhere the checker can see, enforced dynamically at
table literals (per-cell annotation checks, when annotated) and at
`load-table` when sanitizers are used, and trusted like any other annotation
otherwise. A value of type `Col<S, T>` is a string naming a column of `S`
whose sort is a subtype of `T` — literals are only admitted at that type
after a schema-membership proof, and `column-names()` produces genuine
column names by construction. Operations on tables whose schema is abstract
can still raise runtime errors exactly where static verification is
impossible (e.g. `add-column` freshness); none of those produce a value at a
wrong type. Where the checker cannot be precise it degrades to the opaque
`Table`/`Row`/`Any`, never to a wrong schema.
