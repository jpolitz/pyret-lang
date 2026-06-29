# Compiler-flag integration plan (`--use-tree-sitter`)

Selects the tree-sitter frontend vs the RNGLR `surface-parse` at the compiler seam.
Execute AFTER the grammar-fix fork finishes (needs the final `.node` + a phaseA rebuild).

## Architecture
Reuse the lowering unchanged: tree-sitter CST → `lower.ts` (plain `Value`) → `to-runtime.ts`
(`toRuntime`) → real Pyret `ast.arr` Program. No builder refactor needed.

## Pieces

### A. JS build of the lowering (plain JS, no TS types)
The builtin loads via Pyret's module system (browserify), which won't strip TS types. Compile
`src-ts/{srcloc,ast,lower,to-runtime}.ts` → one CommonJS bundle, e.g. `dist/lowering.js`
(esbuild/tsc, target node, format cjs, bundle). Exports `{ Lowering, toRuntime }`.

### B. New builtin `lang/src/js/trove/parse-tree-sitter.js`
Auto-discovered (builtin.arr:186-225 scans `src/js/trove/`). Module-wrapper shape like
parse-pyret.js (`{ requires, nativeRequires, provides, theModule }`):
- `nativeRequires`: `["tree-sitter"]` (+ the grammar; the grammar native module is loaded by
  requiring the built `tree-sitter-pyret` package or its `.node`). Also register in
  `lang/src/js/trove/require-node-compile-dependencies.js` (~line 53) like image-lib's canvas.
- `requires`: the `ast` and `srcloc` builtins (`builtin://ast`, `builtin://srcloc`) to supply
  constructors to `toRuntime`.
- `theModule(RUNTIME, NS, uri, astLib, srclocLib, treeSitter, grammar)`: provides `surface-parse`:
  1. `parser = new treeSitter(); parser.setLanguage(grammar)`
  2. `tree = parser.parse(src, null, { bufferSize: Math.max(32*1024, src.length*2+1024) })`
     (the bufferSize is REQUIRED — node-tree-sitter's 32K-chunk reads crash the external
     scanner on long whitespace/comment runs otherwise).
  3. If `tree.rootNode.hasError`: raise a Pyret parse error (match parse-pyret's error path/shape).
  4. `val = new Lowering(src, uri).lowerProgram(tree.rootNode)`
  5. `return toRuntime(val, { RUNTIME, ast: <astLib provided>, srcloc: <srclocLib provided> })`
  Resolve how astLib/srclocLib expose constructors (parse-pyret.js does `RUNTIME.getField(ast, "s-x")`
  where `ast` is the required module's provided value — mirror that).

### C. CompileOptions — `lang/src/arr/compiler/compile-structs.arr`
- type CompileOptions (~2924-2941): add `use-tree-sitter :: Boolean`.
- default-compile-options record (~2943-2985): add `use-tree-sitter: false`.

### D. CLI — `lang/src/arr/compiler/pyret.arr`
- flag def (~80): `"use-tree-sitter", C.flag(C.once, "Use tree-sitter parser instead of default"),`
- extract (~117): `use-tree-sitter = r.has-key("use-tree-sitter")`
- thread into each options record passed to CLI.run/build (~159-221): `use-tree-sitter: use-tree-sitter`

### E. Seam — `lang/src/arr/compiler/compile-lib.arr`
- top import (~5): `import parse-tree-sitter as TS`
- `compile-module` (~362, `options` in scope via `shadow options = locator.get-options(options)`):
  ```
  | pyret-string(module-string) =>
    if options.use-tree-sitter:
      TS.surface-parse(module-string, locator.uri())
    else:
      P.surface-parse(module-string, locator.uri())
    end
  ```
- Leave `get-ast` (~180) alone (no options in scope; only used for dep extraction). If we want
  the flag to affect dep extraction too, thread options into get-ast (optional).

## Build / test
- `cd lang && make phaseA` (5-15 min) after .arr + builtin edits.
- `node lang/build/phaseA/pyret.jarr --run f.arr --use-tree-sitter` vs without the flag.
- Validate: a file compiles+runs identically with and without the flag. Use a handful of the
  489 PASS files. (The harness already proves AST identity; this proves the seam works e2e.)

## Risks
- num round-trip: `toRuntime` uses `makeNumberFromString(repr)`; verify roughnums (`~3.14`) and
  rationals round-trip. If not, carry source text in the `num` Value instead of num_tostring.
- parse-error shape: tree-sitter `hasError` must map to the same Pyret exception type the
  compiler expects (so error tests behave the same). May need to detect first ERROR node and
  raise via `RUNTIME.ffi.throwParseErrorNextToken`-style call.
- Loading the grammar `.node` from the builtin's bundling path (browserify) — may need the full
  absolute path or a require shim; mirror image-lib/canvas.
