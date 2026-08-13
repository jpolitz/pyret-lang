# Direct mode design

Goal: `-direct` codegen mode in the Pyret-in-Pyret compiler. Output is plain
synchronous JS: no stack segmentation (no GAS/Cont/ActivationRecords), no
splitting, plain-data value reps. Acceptance: self-compile the compiler with
TS-port-class wins; the direct-built compiler still emits stock-format output
byte-identical to phaseA's.

## Architecture

**Everything about packaging stays stock.** Same 5-key module dict
(requires/provides/nativeRequires/theModule/theMap), same
theModule(RUNTIME, NAMESPACE, uri, ...imports, ...natives) signature, same
program object {staticModules, depMap, toLoad, uris, runtimeOptions}, same
make-standalone.js assembly, same on-disk cache (-static.js/-module.js).
Differences: the require-config maps "pyret-base/js/runtime" (or a new name)
to runtime-direct.js; --standalone-file points at handalone-direct.js; module
bodies are direct-style JS.

**The direct runtime implements the stock runtime API surface over thin
representations.** This lets all builtin JS trove modules (parse-pyret,
string-dict, cmdline, filelib, pathlib, sha, source-map-lib, make-standalone,
builtin-modules, global, ffi, ...) run UNCHANGED — critical because:
- string-dict.js's hash-trie iteration order is load-bearing for byte-identical
  compiler output (TS port deviated here; we won't).
- parse-pyret.js builds AST values via runtime.getField(ast, "s-...").app(...);
  we support `.app` on plain functions via a Function.prototype getter
  (`app` => this), non-enumerable, or per-value; TBD at implementation.
- pauseStack shim: run the pause body synchronously; if restarter.resume was
  called synchronously, continue with that value; otherwise THROW a direct-mode
  "stack capture required" error. This is exactly the required semantics
  (stack-capturing programs must end in an error).

## Value representations

- Number: js-numbers values (JS doubles + boxed big/rational), ops via jsnums.
  Same exactness and printing as stock. (Needed for data fidelity: the
  self-compiled compiler must serialize user literals like 1/3 exactly.)
- String/Boolean: JS primitives. nothing: runtime singleton (matches shim).
- Function: plain JS function; arity check via arguments.length in prelude;
  `.app` resolves to the function itself (prototype getter). $name for errors.
- Method: JS function using `this` as self, marked $isMethod; ANF a-method
  (self, x, ...) compiles to function(x, ...) { const self = this; ... }.
  a-method-app o.m(a) emits `t.m(a)` (t an ANF temp; this-binding gives self;
  plain-function fields ignore `this` — both semantics correct).
  Extraction (a-dot on method) returns bound wrapper via runtime get().
- Object: plain JS object created with __proto__:null (null-proto kills
  Object.prototype collisions: missing-field method-app throws TypeError
  instead of silently calling toString etc.). Fields = properties.
- Data: per-variant class (prototype rooted to null), members as properties;
  proto carries $name (variant name), $fields (member name array), $brands
  (data + variant brand keys), with/shared members on proto. cases() compiles
  to switch on $name with member binding via $fields index lookup.
- Tuple: JS array subclass or marked array ($tuple); a-tuple-get -> t[i].
- RawArray: JS array. Ref: {$ref box}. Vars: plain JS let (closure capture).
- Brands: $brands own/proto property {brandKey: true}; namedBrander shim
  compatible; data preds test $brands.
- Annotations: SKIPPED at runtime (ann failures are error cases; error-free
  runs are unaffected). Shim provides inert ann objects for js modules.
- Srcloc: real srcloc.arr data values built via modules["builtin://srcloc"]
  (it is an .arr trove, direct-compiled). Locations interned per module in L
  array; R.loc(L, i) constructs+caches.
- Runtime errors: JS exceptions; later, construct real error.arr data values
  for `raises`-parity in check blocks (not needed for self-compile milestone).

## Codegen (src/arr/compiler/direct-codegen.arr)

From ANF (reuse anf.arr), via js-ast.arr, producing ccp-dict. Structure:
compile-expr(AExpr, dest) -> JStmt list, dest ::= return | var | discard.
Lettables inline into expressions where possible; a-if/a-cases become
statements with assignment into dest temp. letrec = JS let + assignment
(a-id-letrec unsafe reads check for undefined). Module body: preamble
(bind globals via R.getModuleField), L array, body, return module object
{answer, namespace, locations, defined-*, provide-plus-types:{values, types,
modules}, checks} as PLAIN objects (getExported/getModuleField in direct
runtime handles both).

Options plumbing: new CompileOptions field `direct-codegen :: Boolean`
(default false); branch in js-of-pyret.arr trace-make-compiled-pyret; CLI flag
`-direct` in pyret.arr; when set, default compiled-dir to "compiled-direct"
(never share cache with stock mode) and default standalone-file to
handalone-direct.js.

## Files

- src/arr/compiler/direct-codegen.arr  (new codegen)
- src/js/base/runtime-direct.js        (direct runtime + stock-API shim)
- src/js/base/handalone-direct.js      (boot: sync link loop, run main,
                                        render check results, exit codes)
- src/scripts/standalone-configDirect.json (raw-js: runtime-direct, js-numbers,
  namespace-free; parser/tokenizer/jglr/source-map as in configA)
- compile-structs.arr, js-of-pyret.arr, pyret.arr, cli-module-loader.arr edits

## Deep stacks / async

- CLI: node --stack-size=8192 (same respawn trick as TS port) when needed.
- Browser: later — iterative rewrites of per-statement recursions in the .arr
  sources themselves (semantics-preserving on both backends).
- pauseStack: sync-resume supported; async => error (required semantics).

## Bootstrap & validation loop

1. make phaseA (stock) with direct-codegen.arr included → phaseA knows -direct.
2. phaseA -direct compiles hello/test programs → run on runtime-direct →
   diff stdout/exit vs stock-compiled (oracle = same phaseA without -direct).
3. phaseA -direct compiles pyret.arr → direct compiler standalone (phaseB-direct).
4. phaseB-direct (stock mode) compiles programs → byte-diff against phaseA
   outputs (fresh caches both sides, same worklist).
5. Benchmarks: compile time + bundle sizes vs phaseA and vs stock jarr.

## Baseline numbers (this machine)

- phaseA compile of hello.arr: ~15.5s wall; hello.jarr 9.2MB; pyret.jarr 29.5MB.
- TS compiler: ~1.2-1.5MB node output (no bundle); browser bundle ~3MB raw.
