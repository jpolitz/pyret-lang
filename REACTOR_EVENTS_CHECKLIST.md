# Checklist: extending Pyret's compilers and runtime

Agent-written report (Claude Fable 5.1, 2026-10-28). Not written by Joe Politz.
Derived from the two commits on `reactor-custom-events` (`3dc8b27b3`, `2aacad878`).
Every path below was touched in one of those commits; grep the diffs for worked examples.
Additions marked "(2026-11-13)" are by Claude Fable 5.2 from commit `0de67cf37`, also agent prose.
Treat the file lists as a starting point and re-verify against the tree, since they will go stale.

## A. Adding a reactor option (e.g. `on-event`)

Four tables describe options, each with a different job. All four must agree on the name.

| Site | Role | Both compilers? |
|---|---|---|
| `lang/src/arr/compiler/compile-structs.arr` `reactor-optional-fields` | well-formedness: allowed names + a `builtin://global` annotation (only global types; `List` is not one, use `a-any`) | yes: `src/ts-compiler/src/compile-structs.ts` `reactorOptionalFields` |
| `lang/src/arr/compiler/type-defaults.arr` `makeReactor` record | static type of the option under `-type-check` | yes: `type-defaults.ts` |
| `lang/src/js/trove/reactors.js` `makeReactor` | runtime validation and `react` dispatch | n/a |
| `code.pyret.org/src/web/js/trove/world.js` `bigBangFromDict` | interactive behaviour in the editor | n/a |

Also:
- `lang/src/ts-compiler/tests/run-unit-tests.js` asserts the sorted option list. Update it, it fails otherwise.
- Pretty-print round trip: add a case in `lang/tests/pyret/tests/test-reactor.arr`.
- Well-formedness tests: `lang/tests/pyret/tests/test-well-formed.arr`.
- Type-check corpus: drop files in `lang/tests/type-check/good/` and `bad/`; the runner reads the directories, no registration needed. A `bad/` file must fail for the intended reason; check the message by hand once.
- Note from this task: a handler wrapped in `s-check-expr` is not compared against the expected type in checking position (`type-check.arr` lines ~521 and ~790, marked `XXX`). Inside the options record the field type still constrains the handler; as a bare array element it does not.

## B. Adding an AST node (e.g. `s-event-field`, a `Member` variant)

| Step | Pyret-in-Pyret | TypeScript |
|---|---|---|
| Grammar | `lang/src/js/base/pyret-grammar.bnf` | shared |
| Parser | `lang/src/js/trove/parse-pyret.js` (one handler per new nonterminal; extending an existing rule only changes its handler) | `src/ts-compiler/src/parse-pyret.ts` |
| Data definition + `tosource` | `lang/src/arr/trove/ast.arr` | `src/ts-compiler/src/ast.ts` (class, union type, `isX` predicate) |
| Visitors | `ast.arr`: `default-map-visitor`, `default-iter-visitor`, `dummy-loc-visitor` | `src/ts-compiler/src/ast-visitors.ts`: same three |
| Other visitors over the variant's parent type | `lang/src/arr/compiler/ast-util.arr` (e.g. method-name collector) | `src/ts-compiler/src/ast-util.ts` |
| Well-formedness | `lang/src/arr/compiler/well-formed.arr` (node method, plus any parent node that filters its children, plus the wrapper visitor) | `src/ts-compiler/src/well-formed.ts` |
| Desugar (if removed before type checking) | `lang/src/arr/compiler/desugar.arr` | `src/ts-compiler/src/desugar.ts` |

Notes:
- A node desugared away before type checking needs nothing in `type-check`, `resolve-scope`, or `anf`, provided those passes reach it only through the default visitors.
- Missing visitor methods in the `.arr` compiler fail at runtime when the node is first visited; in TS they fail at compile time. Build TS first and use its errors as the list for the `.arr` side.
- Parse any plausible spelling and reject in well-formedness when a targeted message is better than a parse error (here: `foo(x):` parses, then errors with the expected name).
- CodeMirror (`codemirror-mode/mode/pyret.js`) and the VS Code grammar did not need changes for a field-shaped construct. Check with `codemirror/addon/runmode/runmode.node.js` from `code.pyret.org/node_modules`.
- (2026-11-13) Changing a variant's fields (here `source` -> `args`) touches the same list as adding one; the TS build finds every use, then mirror them in `.arr`.
- (2026-11-13) A new reactor form that reuses `s-event-field` needs no option-table entry: only the name/arity check in well-formedness, a prim, and its type.
- Pretty-print: `tests/pyret/tests/test-pprint.arr` round-trips every `.arr` under `lang/` at three widths, so a new `tosource` is exercised by any test file that uses the syntax.

## C. Adding a runtime primitive (an `s-prim-app` target, e.g. `makeEventHandler`)

1. Implement and export it from `lang/src/js/base/runtime.js`. If the implementation lives in a trove module, export a stub that calls `getParam(name)` and set the param in `lang/src/js/base/post-load-hooks.js` after that module loads (pattern: `makeReactor`).
2. Add its type to the prim table in both `type-defaults.arr` and `type-defaults.ts`.
3. Emit it from both desugarers with `s-prim-app(l, "name", args, flat-prim-app)`.

## D. Adding a value or type to a raw JS trove module (e.g. `reactors.js`)

- `provides.values`: the type encoding is hand-written strings/arrays. Nothing validates names, so a typo (the pre-existing `["local", "Event"]`) only fails when a typed program uses the value. Add a `tests/type-check/good/` program that uses every new value.
- `provides.aliases` / `provides.datatypes` for new types; `shorthands` for repeated type expressions.
- Export under `internal` anything JS libraries should call (`makeEventSource`, `getSourceInfo`).
- (2026-11-13) `Any` is not a supertype in the type checker: a value meant to accept every type needs `["forall", ["m"], ...]`, as `spy-on` does.
- (2026-11-13) To exercise `interact` from node tests, a JS test module can install a fake handler with `internal.setInteract(fn)` and reset it to `null` afterwards (see `fake-run` in `test-event-source.js`). Other tests assert that `interact` raises with no handler set.
- Test from Pyret via `import js-file("./sibling")` next to a `tests/pyret/tests/*.arr`, register in `tests/pyret/main2.arr`.

## E. Adding a browser-side world handler (`code.pyret.org`)

- `world-lib.js`: handler is `function(thisWorldIndex) -> {onRegister(top), onUnregister(top)}`; update state only via `change_world(updater, k)`; ignore events when `thisWorldIndex !== worldIndex`; `shutdown({errorShutdown})` for errors.
- `world.js`: a `WorldConfigOption` subclass with `toRawHandler(toplevelNode)`, pushed from `bigBangFromDict`.
- Browser tests: `browser-test/tests/<suite>.js`, registered in `browser-test/tests/suite.test.js`.
- Dispatch for the same event kind also exists in `reactors.js` `react` (programmatic path); keep the two in agreement.
- (2026-11-13) A handler that needs setup and teardown around an existing raw handler can wrap its creator and add to `onRegister`/`onUnregister` (`withSink` in `world.js`); `on_world_change` in `world-lib.js` gives a per-transition listener without new `world-lib.js` code.
- (2026-11-13) Code outside a Pyret run (a world listener, a sink's `send`) that needs Pyret rendering must start its own `runtime.run` and hold the world until it completes.
- (2026-11-13) Programs in the code.pyret.org editor cannot import a JS module, so browser tests can only use built-in sources and sinks (`R.every`, `R.spy-on`).
- (2026-11-13) The `--compiler=ts` browser flavor needs `cpo-main-ts.jarr`, which `make web-local` did not build here.

## F. Validation commands used

```
cd lang
make phaseA                      # any compiler change, ~4 min
make pyret-test                  # delete tests/scratch-build first; stale tests/compiled can flip module order
                                 # (2026-11-13) seen again: 2 failures in test-import-variable.arr; fixed by rm -rf tests/compiled tests/pyret/main2.jarr
node build/phaseA/pyret.jarr ... --build-runnable tests/type-check/main.arr   # type-check corpus
make ts-unit-test
make ts-type-check-parity
make ts-wf-parity
cd ../code.pyret.org && set -a; . ./.env; set +a; make -j3 web-local && node src/run.js   # :4999
cd browser-test && BASE_URL=http://localhost:4999 node run.js --env=cpo --suites=<name>
```
