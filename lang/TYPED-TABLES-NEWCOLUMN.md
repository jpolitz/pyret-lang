# Static type checking for tables in Pyret

This is the design report for table types added to the **TypeScript** Pyret
compiler (`/app/pyret-lang/lang/src/ts-compiler/`).

Everything here is checked by

```
/app/typecheck-example FILE.arr      # exit 0 = no type error, non-zero = type error
```

and exercised by `make ts-table-type-test` (part of `make ts-test`), which runs
every program in `src/ts-compiler/tests/table-types/{good,bad}` **and** every
program in `/app/typed-examples`.

## 0. Test status

| suite | before | after |
| --- | --- | --- |
| `make all-pyret-test` | 13428 passed, 4 failed | 13530 passed, 4 failed |
| `make ts-test` (`ts-pyret-test` leg) | 13014 passed, 4 failed | 13113 passed, 4 failed |
| `make ts-unit-test` / `ts-parity-test` / `ts-repl-test` / `ts-type-check-test` / `ts-regression-test` / `ts-io-test` | pass | pass |
| `make ts-table-type-test` (new) | — | 43 passed, 0 failed |

The four failures are identical before and after, and are environment-dependent
rather than compiler-related: `tests/pyret/tests/test-file.arr` compares a
file's modification time against a value that this filesystem reports
differently, and `tests/pyret/tests/test-images.arr` checks text-rendering
metrics that depend on the installed fonts. Both `make all-pyret-test` and
`make ts-test` therefore exit non-zero here, exactly as they did before any of
this work. The extra passing tests come from `test-pprint.arr`, which
round-trips every `.arr` file under `lang/` and so picks up the new table-type
test programs.

---

## 1. What the types look like

### 1.1 Grammar

Nothing in Pyret's *grammar* changed. The new types are written with existing
annotation syntax — type application, record annotations, tuple annotations —
so the parser, the AST, and the Pyret-hosted compiler needed no change for the
type system. (One unrelated bug fix does touch `ast.arr`; see bug 5 in §4.)

```
Ann  ::= ...                                   -- everything Pyret had
       | Table                                 -- a table, columns unknown
       | Row                                   -- a row, columns unknown
       | Table< Sch >                          -- a table with schema Sch
       | Row< Sch >                            -- a row with schema Sch
       | Column< Sch , Sort >                  -- a column name of Sch, of sort Sort
       | Column< Sch , Name , Sort >           -- ... and the name is Name
       | NewColumn< Sch >                      -- a name that is *not* a column of Sch
       | NewColumn< Sch , Name >               -- ... and the name is Name

Sch  ::= SchPart, ...                          -- one or more, in column order
SchPart
     ::= { c1 :: Sort, ..., cn :: Sort }       -- columns with literal names
       | { Name ; Sort }                       -- one column whose name is a type
       | S                                     -- only as the *first* part:
                                               -- an unknown prefix (schema variable)
Name ::= a type variable, or a name determined by inference
Sort ::= any Pyret type (including Table<...>, Option<...>, ...)
```

Reading rules:

* `Table<{name :: String, age :: Number}>` — a table with exactly two columns,
  in that order, with those sorts. **Columns are ordered** (b2t2 §3.1), so
  order is part of the type.
* `Table<S>` — a table whose columns are the (unknown) columns of `S`.
* `Table<S, {gender :: String}>` — `S` with a `gender :: String` column
  appended. Every Pyret operation that adds a column appends on the right, so
  the variable part of a schema is always a *prefix*.
* `Table<S, {C; Number}>` — `S` with one more numeric column whose *name* is
  the type variable `C`. This is what lets a function say "a table with one
  more column, named by my second argument".
* `Column<S, Number>` — "a column name of the table with schema `S`, whose
  sort is `Number`". This is b2t2's `c is in header(t)` **and**
  `schema(t)[c] is a number`, written as a type.
* `Column<S, C, Number>` also *binds* the name to `C`, so the result type can
  mention it.
* `NewColumn<S, C>` — b2t2's `addColumn` requirement `c is not in header(t1)`.
* Bare `Table` / `Row` are the completely unknown schema; every table type is
  a subtype of `Table`. Existing code annotated `t :: Table` keeps working.

A named schema is written as a table type and reused:

```pyret
type Students = Table<{name :: String, age :: Number, favorite-color :: String}>

students :: Students = table: name :: String, age :: Number, favorite-color :: String
  row: "Bob", 12, "blue"
end

fun oldest(t :: Students) -> String: t.order-by("age", false).row-n(0)["name"] end
fun label(r :: Row<Students>) -> String: r["name"] end
```

(A plain record alias — `type S = {a :: Number}` — is *rejected* in schema
position, with a message telling you to write `Table<{...}>` instead: record
types have no column order, and schemas do.)

### 1.2 Internal type grammar

`src/ts-compiler/src/type-structs.ts` gains five `Type` constructors:

```
t-col-name(s)                          the singleton type of the column name "s"
t-schema(base, [(name, sort), ...])    base's columns followed by these
t-table(schema)
t-row(schema)
t-column(schema, name, sort, present)  the type of a *column name* of schema
```

`base` is `undefined` (closed schema), `t-top` (opaque: the bare `Table`), or a
`t-var` / `t-existential` (a schema variable). `present` distinguishes
`Column` from `NewColumn`. `name` may be `t-top`, meaning "we do not name this
column" (the two-argument `Column<S, Sort>` form).

Substitution splices: substituting a schema for a schema variable flattens, so
the representation is always "one optional prefix, then a list of columns".

---

## 2. Type rules

### 2.1 Subtyping

Written `<:`; all of it is decomposed into ordinary constraints by
`solveHelperConstraints` in `type-check-structs.ts`.

```
                      Sch1 <: Sch2
  (TABLE)  ------------------------------      (ROW) likewise for t-row
            Table<Sch1> <: Table<Sch2>

  (SCH-OPAQUE)   Sch <: (opaque, [])                        -- bare `Table`

                 |cs1| = |cs2|   ci.name = di.name   ci.sort <: di.sort
  (SCH-CLOSED)  ------------------------------------------------------
                            (b, cs1) <: (b, cs2)

                 |cs1| >= |cs2|   k = |cs1|-|cs2|
                 (b1, cs1[0..k]) solves ?B      cs1[k..] pairwise <: cs2
  (SCH-OPEN-R)  --------------------------------------------------------
                            (b1, cs1) <: (?B, cs2)

  (SCH-OPEN-L)  symmetric, solving ?B on the left
```

Sorts are **covariant** (`Table<{a :: Number}> <: Table<{a :: Any}>`): cells
are immutable, and every operation that produces a new table gives it the
widened type too, so nothing can smuggle a `String` into something still
believed to be `Table<{a :: Number}>`. Names and column *order* are invariant.

Column names:

```
  (NAME)      "c" <: "c"          "c" <: String        Column<...> <: String

                       lookup(S, "c") = sort
  (NAME-IN)   ----------------------------------------------
              "c" <: Column<S, N, T>   with "c" <: N, sort <: T

                       lookup(S, "c") = absent
  (NAME-IN-X) ----------------------------------------------  type error
              "c" <: Column<S, N, T>

                       lookup(S, "c") = absent
  (NAME-NEW)  ------------------------------------  and dually: `found` is
              "c" <: NewColumn<S, N>                 a type error

  (NAME-STR)  String <: Column<S, N, T>   with N := Any, T := Any
```

`lookup` is deliberately partial. If the schema has an unknown prefix (or a
column whose name is still being inferred), `lookup` answers *unknown*, and
then:

* if the unknown part is an unsolved existential, the constraint is **deferred**
  to the enclosing constraint level, where the schema will have been solved;
* otherwise (an opaque or rigid-variable prefix) the sort is `Any`, and no
  "column missing" error is reported.

Nothing is ever guessed. `(NAME-STR)` is why `core.arr`-style code annotated
`col :: String` still type checks: an arbitrary string may be used as a column
name, and then the column's sort is `Any`.

`Column <: Column` has two rules, because a column name may be re-used against
a *different* table:

```
  (COL-SAME)  same schema on both sides: names and sorts line up directly
  (COL-OTHER) different schemas: the name must be a column of the *target*
              schema, and the sort recorded there is what counts
```

Choosing between them needs both schemas settled, so this constraint is also
deferred while either side still has an unsolved prefix.

### 2.2 Term rules — methods

`synthesisField` gives each table/row method a type *computed from the
receiver's schema* `S`. Writing `S ⊕ (C :: T)` for "S with one more column":

```
  length            : ( -> Number)                    column-names : ( -> List<String>)
  row-n             : (Number -> Row<S>)              all-rows     : ( -> List<Row<S>>)
  empty             : ( -> Table<S>)                  filter       : ((Row<S> -> Boolean) -> Table<S>)
  stack             : (Table<S> -> Table<S>)          add-row      : (Row<S> -> Table<S>)
  column, get-column: ∀C,T. (Column<S,C,T> -> List<T>)
  filter-by         : ∀C,T. (Column<S,C,T>, (T -> Boolean) -> Table<S>)
  order-by          : ∀C,T. (Column<S,C,T>, Boolean -> Table<S>)
  increasing-by / decreasing-by : ∀C,T. (Column<S,C,T> -> Table<S>)
  order-by-columns  : (List<{String; Boolean}> -> Table<S>)
  add-column        : ∀C,T. (NewColumn<S,C>, List<T> -> Table<S ⊕ (C::T)>)
  build-column      : ∀C,T. (NewColumn<S,C>, (Row<S> -> T) -> Table<S ⊕ (C::T)>)
  transform-column  : ∀C,T. (Column<S,C,T>, (T -> T) -> Table<S>)
  reduce            : ∀C,T. (Column<S,C,T>, Any -> Any)
  all-columns       : ( -> List<List<U>>)   column-n : (Number -> List<U>)
                        where U is the common sort if S is known and
                        homogeneous, and Any otherwise
  drop              : ∀C,T. (Column<S,C,T> -> Table)          (refined below)
  rename-column     : ∀C,T. (Column<S,C,T>, String -> Table)  (refined below)
  select-columns    : (List<String> -> Table)                 (refined below)

  row methods:
  get-value  : ∀C,T. (Column<S,C,T> -> T)
  get        : ∀C,T. (Column<S,C,T> -> Option<T>)
  get-column-names : ( -> List<String>)
```

`r["c"]` desugars to `getBracket(loc, r, "c")`; when the object is a `Row` this
is typed exactly as `r.get-value("c")`.

The homogeneous `all-columns` rule is what makes b2t2's `pHackingHomogeneous`
typable without naming any column: for `jellyAnon`, `all-columns()` really is
`List<List<Boolean>>`.

### 2.3 Term rules — literal column names

A string literal in a position that wants a column name gets its **singleton**
type:

```
  (STR-COL)   Γ ⊢ "c" ⇐ Column<...> / ColName    ==>   "c" : "c"
```

Everywhere else, string literals keep their ordinary `String` type — making
literals singleton-typed globally would break `"a" is "b"`, `[list: "a", "b"]`,
and much else.

### 2.4 Term rules — the table syntax forms

```
  table: c1 :: T1, ... row: e11, ... end
      each cell is checked against its declared sort; a column with no
      annotation gets the meet of its cells' types (the same "meet" used for
      the branches of an `if`), or Any if there are no rows
      ==> Table<{c1 :: T1, ...}>

  load-table: c1 :: T1, ... source: e ... end
      the schema is *declared*; an unannotated header has sort Any
      ==> Table<{c1 :: T1, ...}>

  extend t using a, b: n1: e1, n2 :: A2 : e2, n3 : red of a end
      t must be a table; a, b must be columns of it and are bound to their
      sorts; each ni must NOT already be a column; ni's sort is its
      annotation, else the type of ei; for a reducer, the reducer expression
      is checked against Reducer<?Acc, sort-of-a, ?Out> and the new column's
      sort is ?Out
      ==> Table<S ⊕ (n1::_) ⊕ (n2::_) ⊕ ...>

  transform t using a: c: e end
      c must be a column of t; the result schema is t's with c's sort
      replaced by the type of e.  If c might live in the *unknown* part of
      t's schema, the result is the opaque `Table`.

  select c1, c2 from t end       ==> Table<{c1 :: S[c1], c2 :: S[c2]}>
  extract c from t end           ==> List<S[c]>
  order t: c1 ascending, ... end ==> Table<S>, checking each sort key exists
  sieve t using a: pred end      ==> Table<S>, binding a, requiring Boolean
```

### 2.5 Application-site refinements

Three operations have result schemas that are a *function* of a column name.
When the name is available (a literal, or an already-typed variable) the exact
answer is computed; otherwise the sound-but-opaque `Table` from the method type
stands.

* `t.drop("c")` → `S` minus `c`
* `t.rename-column("c", "d")` → `S` with `c` renamed
* `t.select-columns([list: ...])` → the projected schema, including the case
  where an element is a column-name *variable* — which is what makes the
  schema-polymorphic `group-by` in `/app/typed-examples/b2t2-group-by.arr`
  expressible.

`t.build-column("c", f)` and `t.add-column("c", vs)` additionally pin the new
column's name to the literal immediately, so that a later `.drop("c")` in the
same expression can see it. That is what makes `core.arr`'s `sort` — build a
temporary column, order by it, drop it — come back to exactly the input
schema.

Dropping a column from a schema with an *unknown* prefix is exact because
column names in a schema are distinct (b2t2 §3.1, and every Pyret operation
that appends a column rejects a name that already exists), so the unknown
prefix cannot hold a second copy of a listed name.

---

## 3. Implementation strategy

### 3.1 The pipeline change: type check table syntax *before* it is desugared

Pyret's type checker runs on the **desugared** AST. Every table form was
already gone by then: `table:` had become a `makeTable` primitive over raw
arrays, `extend` had become `raw-array-map-1` over `_rows-raw-array` with
`_column-index` lookups, and so on. Nothing about columns is recoverable from
that.

So the pipeline was re-ordered rather than the desugaring rewritten:

* `desugar.ts` now **keeps** `s-table`, `s-load-table`, `s-table-extend`,
  `s-table-update`, `s-table-select`, `s-table-extract`, `s-table-order` and
  `s-table-filter`, and only desugars their subexpressions and annotations.
* The original expansion moved verbatim into one function
  (`desugar.desugarTableForm`), parameterized by the recursive desugarers.
* `desugar-post-tc.ts` — which already runs after type checking — calls it with
  the identity, since the subexpressions are desugared by then.

**Code generation is unchanged**: it is the same expansion, applied to the same
(already desugared) subterms, just later. `make ts-pyret-test` — which compiles
and runs the whole Pyret test suite, including `test-tables.arr`,
`test-csv-table.arr` and the table regression tests, through the TS compiler —
passes with exactly the pre-existing failures.

### 3.2 Where the new type names come from

`Column` and `NewColumn` have no run-time counterpart, so they are added only
to the TypeScript compiler's `runtimeProvides.aliases` (name resolution),
resolved directly in `CompileEnv.typeByUri`, given a flatness entry, and skipped
when the global type environment is copied into the type-checking context.
`type-check.ts` recognizes all four names (`Table`, `Row`, `Column`,
`NewColumn`) *structurally* in `toType`, so nothing else in the compiler has to
know about them. `src/js/trove/global.js` and the Pyret-hosted compiler are
untouched.

### 3.3 Solver integration

The new types are decomposed into the existing constraint machinery rather than
solved separately, so levels, existential substitution and generalization work
unchanged. The one addition is **deferral**: a column-membership constraint
whose schema still contains an unsolved existential is re-posted at the
enclosing level instead of being decided. At the outermost level, where nothing
more will be learned, it resolves conservatively (sort `Any`) rather than
guessing.

### 3.4 Files touched

```
src/ts-compiler/src/type-structs.ts        new Type constructors + schema algebra
src/ts-compiler/src/type-check-structs.ts  solver rules, deferral, generalization
src/ts-compiler/src/type-check.ts          toType, method types, syntax forms,
                                           application-site refinements
src/ts-compiler/src/desugar.ts             table forms kept; expansion extracted
src/ts-compiler/src/desugar-post-tc.ts     expansion runs here now
src/ts-compiler/src/compile-structs.ts     Column / NewColumn as global type names
src/ts-compiler/src/ast-util.ts            canonicalizeNames cases; annToTyp bug fix
src/ts-compiler/src/flatness.ts            type-level-only names
src/ts-compiler/src/ast.ts                 tosource bug fixes (s-table-update,
                                           s-table-extend field separator)
src/arr/trove/ast.arr                      the same two tosource bug fixes
src/ts-compiler/tests/table-type-test.js   new test driver  (make ts-table-type-test)
src/ts-compiler/tests/table-types/**       28 rejection tests, 5 acceptance tests
Makefile                                   ts-table-type-test, wired into ts-test
```

---

## 4. Bugs found

1. **Global type names had two different identities** (fixed).
   `ast-util.annToTyp` built a global `t-name` from `origin.originalName`,
   which is an `s-name`, while every other route to the same type — provides
   deserialization (`typeFromRaw`) and `getTypedProvides`' canonicalizer —
   produces an `s-type-global`. `t-name` identity is `id.key()`, and
   `name#Number` ≠ `tglobal#Number`, so a type coming from a module compiled
   *without* type checking never matched the same type written locally. The
   symptom is a "the type constraint `Number` was incompatible with the type
   constraint `Number`" error. Reproduced by
   `extend t using age: total: T.running-sum of age end`, where the `Reducer`
   alias comes from the `tables` trove. Fixed by normalizing to
   `s-type-global` in `annToTyp`.

2. **Column-bind annotations were never desugared** (fixed as a side effect).
   The `extend` / `transform` / `sieve` expansion re-used the *original*
   `s-bind` for `using a, b`, so an annotation there — e.g.
   `extend t using x :: Number%(is-pos):` — reached ANF undesugared. The new
   `desugarColumnBinds` desugars them. (These annotations are now also type
   checked against the column's sort.)

3. **Dead code in the `extend` expansion.** The reducer branch has a comment
   about producing a deliberately unbound identifier when the reduced column is
   not one of the bound columns; well-formedness rejects that program first
   (`table-reducer-bad-column`), so the branch is unreachable. Left as is.

4. **`flatness.initTypeProvides` raises on any global type name that is neither
   a datatype nor an alias of the providing module.** Reasonable while every
   global type had a run-time counterpart, but it makes a purely type-level
   global impossible; `Column`/`NewColumn` are given the same "untrusted"
   flatness as a cross-module alias.

5. <a name="tosource"></a>**`s-table-update` (the `transform` form) had no `tosource`** (fixed).
   `ast.arr` carried the comment "s-table-update not yet implemented" and the
   variant had neither a `label` nor a `tosource` method (`ast.ts` mirrored
   that). Any tool that pretty-prints an AST containing a `transform` form
   crashed with "the left side was an object that did not have a field named
   `tosource`" -- including `tests/pyret/tests/test-pprint.arr`, which parses
   and round-trips *every* `.arr` file under `lang/`, so simply adding a test
   program that uses `transform` broke that suite. Implemented in both ASTs,
   mirroring `s-table-extend`; the round trip (parse, pretty-print at widths
   40/80/160, re-parse, compare ASTs) now passes.

6. **`s-table-extend`'s `tosource` separated extension fields with a
   hard line instead of a comma** (fixed). The grammar's
   `table-extend-fields` is comma-separated, so pretty-printing any `extend`
   with more than one extension produced text that does not re-parse. Fixed in
   both ASTs; `/app/typed-examples/table-syntax-forms.arr` (which has a
   two-extension `extend`) now round-trips.

7. Not a bug I introduced but worth recording: **applying a value of type
   `Any` is a type error** ("expects the applicant to evaluate to a function
   value"). Since the `csv`, `statistics`, and `data-source` troves are
   compiled without type checking, all of their exports are `Any` and cannot be
   called from a type-checked program at all. This is unrelated to tables, and
   is why `/app/typed-examples/load-table-annotations.arr` defines its own data
   source object instead of calling `csv.csv-table`.

---

## 5. What is not reasonably typable

Each of these is *sound* — the answer is `Any`, or the opaque `Table`/`Row` —
just imprecise. None of them is silently assumed.

* **Manufactured column names.** `t.column("quiz" + num-to-string(i))` has type
  `List<Any>`: a `String` carries no information about which column it names.
  This is b2t2's `quizScoreFilter` and half of `quizScoreSelect`, and it is the
  single biggest source of imprecision. The `select` form (literal names) and
  `select-columns` with a literal list recover full precision;
  `/app/typed-examples/b2t2-quiz-scores.arr` shows both sides.
* **`t.select-columns(xs)` for a computed list `xs`** → opaque `Table`.
* **`t.drop(c)` / `t.rename-column(c, d)` for a non-literal `c`** → opaque
  `Table`. The result schema is a function of a name that is not available.
* **`transform-column` cannot change a column's sort.** Its type is
  `(Column<S,C,T>, (T -> T)) -> Table<S>`. The sort-changing version needs a
  schema *update at a column named by a variable*, which the schema algebra
  does not have (it has append, drop-by-known-name, select and rename). The
  `transform` **syntax** form does change sorts, because there the name is a
  literal.
* **`groupBySubtractive`'s group tables.** Removing the key column when its
  name is only known as a variable `C` is the same missing operation, so the
  grouped tables come out as bare `Table`. The *retentive* version is fully
  precise (see `b2t2-group-by.arr`).
* **`t.row(...)` and `t.new-row(...)`** are variadic and arity-dependent on the
  schema; they have no type at all and are reported as missing fields. Use
  `t.row-n` / `add-row`.
* **`t.reduce(c, reducer)`** returns `Any`: its result is the reducer's
  accumulator type, which is not related to the column's sort by any rule the
  method type can state.
* **`order-by-columns`** takes a `List<{String; Boolean}>`, so its sort keys are
  unchecked. The `order` syntax form checks them.
* **Un-annotated heterogeneous columns.** `table: c row: 1 row: "a" end` is
  rejected, because a column with no annotation infers the *meet* of its cells,
  and Pyret's meet is not a least upper bound (the same is true of
  `[list: 1, "a"]` and of `if` branches). Annotate `c :: Any` to allow it.
* **Table types do not cross a module boundary through the compiled-module
  cache.** `compileProvidedType` has no serialization for the new constructors,
  so a provided table-typed value read back from a cached `.js` degrades to
  `Any`. It is precise when the providing module is compiled in the same run.
  Adding two tags to `src/js/base/type-util.js` would fix it, but that file is
  shared with the Pyret-hosted compiler, and precision here is not needed for
  soundness.
* **Missing cells** are represented with `Option`, per b2t2's "the
  implementation chooses"; there is no implicit null, so a column with blanks
  has sort `Option<T>` and every use must go through `cases`.

---

## 6. Alternate designs, and what they would need from the language

1. **Literal column names in annotations.** The one real ergonomic gap is that
   a *literal* name cannot be written in a type: `Column<S, "age", Number>` is
   not expressible, so a name can only be pinned down by inference or by a type
   variable. Adding string literals to the annotation grammar (`a-str`) would
   also let a schema be written as `Table<{"favorite color" :: String}>`,
   which is currently unreachable because record-annotation field names must be
   Pyret identifiers — so a column whose name has a space (b2t2's `students`
   table!) can exist at run time but cannot be named in a type.

2. **Where-clauses instead of encoded constraints.** `Column<S, C, T>` is a
   constraint (`C ∈ header(S) ∧ schema(S)[C] = T`) smuggled into an argument's
   type, which works precisely because column names are *values* that arrive as
   arguments. A constraint that does not correspond to an argument cannot be
   stated at all. Real bounded quantification —
   `fun f<S, C>(t :: Table<S>) -> ... where C in S` — would need syntax for
   qualified types plus constraint entailment in the solver, and would then
   also give sort-changing `transform-column` and subtractive group-by.

3. **First-class schema operations in the type language.** `Drop<S, C>`,
   `Rename<S, C, D>`, `Select<S, C1, ...>` as *type-level functions* that stay
   unevaluated until their arguments are known (the way TypeScript's
   conditional types do) would replace all three application-site refinements
   with one uniform mechanism and remove the "only when the name is a literal"
   caveat. This needs a normalizing rewrite in the solver and a rule for
   rejecting a stuck application at generalization time (otherwise it is
   unsound).

4. **A CSV import form.** The task suggests `import`-time CSV loading that
   computes a schema. With `load-table:` the schema is *declared* and the
   `sanitize` clauses make it true; an import form could instead read the file
   at module-resolution time and synthesize `Table<{...}>` from the header row
   plus sampled cells. That trades a checked promise for an inference over data
   the compiler may not have at run time (the file could change), so it would
   want to emit a run-time re-check — essentially the sanitizers again. It was
   not implemented; the annotation route is what
   `/app/typed-examples/load-table-annotations.arr` shows.

5. **Row-major schemas as records.** A tempting encoding is `Table<R>` where
   `R` is an ordinary record type, reusing record subtyping. It fails on two
   counts: record types have no field *order*, and Pyret record subtyping is
   width-permissive, which would let `Table<{a :: Number}>` accept a table with
   an extra column and then mis-describe `column-names()`, `all-columns()` and
   `stack`. Hence the separate ordered `t-schema`.

6. **Making string literals singleton-typed everywhere.** That would remove the
   `(STR-COL)` special case and give first-class names for free, but it breaks
   ordinary Pyret code: `check: "a" is "b" end` would be a type error, and
   `[list: "a", "b"]` would need a least-upper-bound that Pyret's meet does not
   compute. A proper join on types (rather than the current meet-by-constraint)
   would be a prerequisite.

7. **A `Table` datatype with methods in `global.js`.** Instead of computing
   method types in `synthesisField`, the `Table` datatype could carry them —
   but the types are *functions of the schema*, and Pyret's `data` types cannot
   express that. Computing them in the checker is the concession.

---

## 7. Delivered examples

`/app/typed-examples/` (all type check under `/app/typecheck-example`):

| file | what it shows |
| --- | --- |
| `b2t2-example-tables.arr` | b2t2 §4 example tables with schemas; `Option` for empty cells; `Table`/`Row` as the unknown schema |
| `b2t2-table-api.arr` | b2t2 §5 Table API — addColumn, buildColumn, getColumn, selectColumns, dropColumns, renameColumns, tsort, selectRows, update, head, vcat, addRows, empty |
| `b2t2-dot-product.arr` | `dotProduct`: "the columns are in the table and their sorts describe numbers", as a type |
| `b2t2-group-by.arr` | `groupByRetentive` / `groupBySubtractive`, schema-polymorphic, with the key column's own name and sort in the result |
| `b2t2-p-hacking.arr` | `pHackingHomogeneous` / `pHackingHeterogeneous`, via homogeneous `all-columns()` |
| `b2t2-quiz-scores.arr` | `quizScoreSelect` / `quizScoreFilter`, both the precise and the manufactured-name versions |
| `core-summary-stats.arr` | `core.arr`'s mean/median/min/max/sum/iqr/r-value, with the dynamic column checks replaced by `Column<S, Number>` |
| `core-table-helpers.arr` | `core.arr`'s `distinct-colors`, `sort`, `build-column`, `transform-column`, `predict-col`, `find-by-id`, `check-integrity`, `stack-tables` |
| `table-syntax-forms.arr` | every table syntax form, including reducers |
| `load-table-annotations.arr` | `load-table:` with annotated headers, and what an unannotated header costs |

`src/ts-compiler/tests/table-types/bad/` holds 28 programs that must be
rejected, including b2t2's `blackAndWhite` and `swappedColumns` error entries,
the "column already exists" / "no such column" requirements of the Table API,
and soundness probes (name mismatch in a result schema, `stack` across
different schemas, using a dropped column).
