# Goal: a Lezer parser for Pyret

## Why
Learn the GLR / parser-for-editors / one-canonical-implementation design space by
building a real thing: a Lezer grammar for Pyret that (a) is correct enough to
back the *actual compiler* on the whole test corpus, and (b) drives a CM6 editor
so we can feel it as a mode. Lezer and our existing `tree-sitter-pyret/` occupy
the same niche (incremental, error-recovering, editor-first GLR producing a
concrete tree); doing it in Lezer specifically gives us a CM6-native path.

## Definition of done
1. **Compiler-grade**: a Lezer-based parse front-end that accepts/rejects exactly
   what `lang/`'s RNGLR parser does across:
   - every assertion in `lang/tests/parse/parse.js` (accept/reject oracle), and
   - all ~514 `.arr` files in the repo (accept, and structurally-equivalent tree).
   "Plug it in for the real compiler" = swap it behind the same boundary as
   `parse-pyret.js` (`surface-parse` / `maybe-surface-parse`) and pass `make test-all`.
2. **Editor feel**: a standalone CM6 test page loading the Lezer grammar as a
   language, with highlighting + indentation + folding, opened on a few real
   Pyret programs, to judge it as a replacement for `codemirror-mode/`.

## What's hard (and where to spend effort)
The context-free grammar (`lang/src/js/base/pyret-grammar.bnf`, 301 lines) is the
easy part. The crux is Pyret's **context-sensitive lexing**, which the canonical
tokenizer encodes as distinct token *names*:
- `PARENSPACE` / `PARENNOSPACE` / `PARENAFTERBRACE` — leading-space decides
  grouping-paren vs application-paren (and `{...}`-adjacent).
- `LANGLE` / `LT` and `RANGLE` / `GT` — no-space angle brackets are type
  instantiation; spaced ones are comparison ops.
- English ops (`and or is satisfies raises`) must never lex as identifiers.
- `::` / `=>` require trailing whitespace; `#|...|#` nests; ``` ``` ``` strings.
These all live in `parse.js` as explicit accept/reject pairs — that file IS the
spec for the tokenizer. In Lezer this maps to external tokenizers + `@specialize`
+ `@precedence`, NOT to the `@tokens` DFA alone.

The grammar is deliberately written to be *unambiguous* via these token tricks
(`countParses === 1`, else it throws "Non-unique parse"; see the app-expr rules
"carefully rigged to not parse unary `f (x)`"). That's good for Lezer, which
wants determinism — but each spot the BNF leans on GLR will surface as an LR
conflict needing an explicit precedence/specialization in the `.grammar`.

## Oracles / harness
- Accept/reject: run `parse.js` assertions against the Lezer parser.
- Structural: for each `.arr`, compare RNGLR `constructUniqueParse` tree vs the
  Lezer tree (define a normalization — node-name map, drop skip nodes).
- Differential fuzzing later: feed mutations, diff the two verdicts.

## Prior art in-repo
- `tree-sitter-pyret/src/grammar.json` — same rules already mapped to editor-GLR.
- `tree-sitter-pyret/corpus/` — 571 corpus files.

## Phases
- **P0 toolchain**: install `@lezer/generator`, `@lezer/lr`; build a trivial
  grammar end-to-end in this dir to prove the loop (grammar -> parser -> tree).
- **P1 harness**: wrap RNGLR (`parse-pyret`/`parse.js`) as the oracle; a runner
  that takes a string and reports {accepts?, tree} for both parsers.
- **P2 grammar core**: translate the BNF to `.grammar`, plain tokens first
  (ignore the context-sensitive distinctions), get a large fraction of `.arr`
  files parsing. Measure accept-rate vs oracle.
- **P3 the hard tokenizer**: external tokenizers for paren/space, angle brackets,
  English ops, `::`/`=>` trailing-ws, nested block comments, triple-strings.
  Drive to 100% on `parse.js`.
- **P4 structural equivalence**: align tree shapes; get all `.arr` structurally
  matching (or a documented, principled diff list).
- **P5 compiler swap**: adapter behind `surface-parse`; run `make test-all`.
- **P6 CM6 page**: `@codemirror/language` + the Lezer grammar; highlight/indent/
  fold; open real programs. **DONE — see "### P6 RESULT" below.**

## Differential fuzzing (DONE — no parity break found)
Ported the tree-sitter branch fuzzer (`tree-sitter:tree-sitter-pyret/harness/fuzz-gen.js`)
to `lezer-pyret/fuzz-gen.js` (mutation-based, deterministic, 55% weighted to
whitespace-around-operator edits — the risky class) + `fuzz-diff.js` (oracle vs Lezer:
accept/reject + AST-on-agreed-accept + flags RNGLR-ambiguous count>1 / over-acceptance).
Seeds = repo + starter-files corpora (672 usable). Mutants written to scratch (outside
repo find path).
- 1958-mutant run: accept/reject 1958/1958, AST 0 divergences, over/under-acceptance 0,
  0 ambiguous. (Initial "12 AST diffs" were a HARNESS bug: translate() throws
  `throwParseErrorBadOper` for bad operator-whitespace like `2 +2` — well-formedness in
  translate, not parse — and the differ recorded side-specific sentinels; fixed to compare
  error IDENTITY. Lesson: surface-parse acceptance != grammar acceptance; translate() also
  enforces operator-whitespace well-formedness.)
- 8k-mutant run (7814): accept/reject 7814/7814, over/under-acceptance 0, 0 ambiguous.
  2 "AST" breaks — but both are STRUCTURALLY IDENTICAL trees; the only diff is the
  SrcLoc the P5 ADAPTER synthesizes for an EMPTY block (`fun f(): end`, `lam(x): end`):
  RNGLR anchors the empty s-block at the FOLLOWING token (`end`), to-rnglr.js anchors
  at the PREVIOUS token's end. Pure pos-synthesis nicety (empty bodies, rare in real
  code; absent from the clean corpus → P4/P5 saw 100%). NOT a grammar/acceptance issue.
  TOTAL: ~9772 mutants, ZERO parser-parity breaks. The replay-tokenizer architecture is
  immune to the whitespace-fuzz class that broke tree-sitter's from-scratch scanner.
  OPEN (minor): align to-rnglr.js empty-node SrcLoc with RNGLR's next-token anchor.

## Timing (DONE) — Lezer is much faster
`timing.js` over 553-file/3.16MB corpus (warm, 3 reps): END-TO-END (src->tree, both incl.
Pyret tokenize) RNGLR 14.3s vs Lezer 2.6s = **5.4x**; PARSER-ONLY (minus shared tokenize)
RNGLR 12.8s vs Lezer 1.1s = **11.5x**. RNGLR cost is its GLR machinery (SPPF +
countAllParses + constructUniqueParse even for unique parses). Because we replay Pyret's
tokenizer, tokenize is now 58% of the Lezer path — the lexer, not the parser, is the
bottleneck. Big real files (ast.arr 132KB): 836ms vs 133ms (6.3x).

## CLI flag wiring (DONE) — `--use-lezer` selects the Lezer frontend, live in phaseA
The flag is fully wired and verified end-to-end in the running compiler (phaseA rebuilt
twice, both EXIT=0). Architecture is SIMPLER than tree-sitter's: NO separate builtin —
the Lezer path lives INSIDE parse-pyret.js and reuses its in-closure `translate()` +
tokenizer. Invoke as a SINGLE-dash flag: `pyret.jarr --run f.arr -use-lezer` (C.flag
options take one dash; `--use-lezer` is rejected by cmdline.arr).

### The self-contained bundle (lezer-pyret/lezer-bundle.js, 315KB)
`bundle-entry.js` factors tile()+ExternalTokenizer out of lezer-run.js into
`lezerParseToRnglr(pyretTokens, src)`: takes the Pyret token ARRAY
({name,value,startChar,endChar}) handed in by parse-pyret's tokenizer, tiles whitespace
as Space, replays through `buildParser(pyret.named.grammar)` (built once at load via
@lezer/generator), then reshapes via to-rnglr.js into an RNGLR-shaped tree. On a Lezer
error node it throws `Error{lezerParseError:{from,to}}`. esbuild bundles entry +
@lezer/generator + @lezer/lr + to-rnglr.js + namemap.json + the named grammar (text
loader) into ONE CJS file with ZERO external requires (verified by isolated load in a
dir with no node_modules). Rebuild: `node_modules/.bin/esbuild bundle-entry.js --bundle
--platform=node --format=cjs --loader:.grammar=text --outfile=lezer-bundle.js`.
- STANDALONE de-risk (`verify-bundle.js`): loads ONLY the bundle + mock-runtime, parses
  real .arr files via Pyret's tokenizer, AST == RNGLR oracle. 3/3 identical.

### Seam edits (all in the MAIN tree)
- `parse-pyret.js`: bundle added to nativeRequires as `"lezer-pyret-frontend"`; new 9th
  theModule param `lezerFrontend`; new `parseDataRawLezer()` tokenizes with the SAME
  tokenizer, calls `lezerFrontend.lezerParseToRnglr(tokens, data)`, then the SAME
  in-closure `translate()`; on a Lezer error DEFERS to `parseDataRaw` (RNGLR) for the
  byte-identical canonical parse error (the two have 100% accept/reject parity).
  Provides `surface-parse-lezer` + `maybe-surface-parse-lezer`. surface-parse unchanged.
- `require-node-compile-dependencies.js`: `nodeRequire(absolute bundle path)` +
  `define("lezer-pyret-frontend", ...)` (nodeRequire escapes browserify; absolute path
  is machine-specific, make configurable for a real integration).
- `compile-structs.arr`: CompileOptions `use-lezer :: Boolean` + default `use-lezer:false`.
- `pyret.arr`: `"use-lezer", C.flag(C.once, ...)`; `use-lezer = r.has-key("use-lezer")`;
  threaded into the --run / --build-runnable / --build options records.
- `compile-lib.arr`: pyret-string seam now `if options.use-lezer: P.surface-parse-lezer
  else: P.surface-parse`. (Correct for STRING locators / REPL.)
- **THE REAL FILE-PATH SEAM** (the gotcha): file-based runs do NOT hit the compile-lib
  pyret-string case — `locators/file.arr`'s `get-module` pre-parses with
  `PP.surface-parse` and returns `pyret-ast`. So the file locator itself had to branch.
  Threaded `use-lezer` through `CLIContext` (new field) -> get-file-locator ->
  `FL.file-locator(path, globals, use-lezer)`; get-module now picks
  surface-parse-lezer vs surface-parse. Updated all file-locator call sites
  (cli-module-loader file + file-no-cache, npm.arr=false, the two module-finder context
  records, default-start/test-context, and test-file-locators.arr).

### Verification (live, phaseA)
- Trace marker (`LEZER_TRACE=1`) proves the frontend runs ONLY with -use-lezer: main
  file parsed via Lezer (marker = file byte length); multi-file import => both files
  parsed via Lezer.  Content-addressed compiled cache hides markers on re-runs — use
  fresh unique content to observe.
- Output equivalence: hello/data/rich programs produce IDENTICAL output with vs without
  the flag.  Parse error: byte-identical message + location + error class; the only diff
  is one internal compiler-STACK line (file.arr:41 lezer-branch vs :43 rnglr-branch) — the
  if/else call-site line, inconsequential.
- Default path unchanged: `lang/tests/parse/parse.js` 60 specs, 0 failures.

### Files (lezer-pyret/): bundle-entry.js (bundle source), lezer-bundle.js (artifact,
esbuild output — loaded by parse-pyret at runtime), verify-bundle.js (standalone test).

## CPO (code.pyret.org) web integration (DONE) — `?parser=lezer` opt-in, fallback to built-in
The Lezer frontend is wired into the CPO web app, mirroring the lang `-use-lezer` seam.
Built end-to-end: the full standalone `build/web/js/cpo-main.jarr` (~38MB) builds EXIT=0
and contains `surface-parse-lezer`, `lezerParseToRnglr`, the `lezer-pyret-frontend`
define, and the `?parser=lezer` toggle code. Default behavior (built-in RNGLR parser) is
UNCHANGED; Lezer is strictly opt-in with an automatic fallback.

### Why this is simpler than the lang path AND than tree-sitter's CPO branch
- The same `lang/src/js/trove/parse-pyret.js` (with the additive `surface-parse-lezer` /
  `maybe-surface-parse-lezer` + `parseDataRawLezer`) is REUSED — CPO compiles its
  `parse-pyret` builtin straight from `pyret/src/js/trove/` (the `pyret -> ../lang`
  symlink), so the lang trove edits flow into CPO automatically. No CPO-specific
  parse-pyret. (tree-sitter needed an async `window.__PYRET_TS__` global; ours is a
  synchronous native require.)
- parse-pyret's `nativeRequires: [..., "lezer-pyret-frontend"]` is resolved for the
  browser by a single `cpo-config.json` `raw-js` entry → `src/web/js/trove/lezer-bundle.js`.

### The seam (mirrors the lang file-locator finding)
CPO programs compile via a locator's `get-module`, which pre-parses and returns a
`pyret-ast` (same architecture as `locators/file.arr` in lang — the pyret-string/compile-lib
seam is NOT hit for file/drive runs). So the branch lives in the two CPO locators:
- `src/web/js/file-locator.js` and `src/web/js/gdrive-locators.js`: a `cpoSurfaceParse()`
  helper replaces the direct `surface-parse` call in `get-module`. When the toggle is on
  AND the (rebuilt) parse-pyret module exposes `surface-parse-lezer`, it parses via Lezer
  inside a try/catch that FALLS BACK to `surface-parse` on any throw; logs once which
  parser is used. `runtime.hasField` guard means an OLD compiled parse-pyret (no lezer
  export) silently stays on the built-in parser — safe.
- Other parse call sites (`ide.js` helper, `output-ui.js` error-srcloc→AST) are auxiliary
  (not the program-compile path) and intentionally left on the canonical `surface-parse`.

### Toggle: `?parser=lezer` URL query param
Append `?parser=lezer` to the CPO editor URL (read via `window.location.search` in both
locators). Any other / absent value keeps the built-in parser. Chosen over a checkbox
because it needs no editor.html / UI-state plumbing and is trivially scriptable for A/B
verification. The two locators each `console.log` once when the Lezer path is taken
(`[lezer] parsing via Lezer frontend (?parser=lezer): <uri>`).

### Build & verify
- BUILD: `make web-local` (or directly the `$(CPOMAIN)` recipe — `pyret.jarr
  --build-runnable src/web/arr/cpo-main.arr ... --deps-file build/web/js/bundled-npm-deps.js`).
  NOT webpack: webpack.config.js only bundles dashboard/beforePyret/beforeBlocks; the
  locators + bundle are loaded by Pyret's AMD raw-js loader during the jarr build.
  Result: EXIT=0; all 26 modules compiled (parse-pyret included); standalone emitted.
- VERIFY (headless): `cpo-bundle smoke` — loaded `src/web/js/trove/lezer-bundle.js` under a
  `define()` shim, confirmed it exports `lezerParseToRnglr`, parsed real `.arr` via Pyret's
  tokenizer → AST byte-identical to the RNGLR oracle (3/3, reusing lezer-pyret oracle +
  mock-runtime). And grepped the built jarr for the wired symbols (above). NOT verified:
  a live browser run / clicking Run in a served CPO (no server/Drive creds headlessly).
- BUNDLE PATH PORTABILITY: cpo-config.json uses a RELATIVE path
  (`src/web/js/trove/lezer-bundle.js`, vs lang's machine-absolute nodeRequire) → portable.
  Rebuild the browser bundle with: `cd lezer-pyret && ./node_modules/.bin/esbuild
  bundle-entry.js --bundle --platform=browser --format=cjs --loader:.grammar=text
  --define:process.env.LEZER_TRACE=false` then re-wrap in the `define("lezer-pyret-frontend",
  [], function(){ ... })` banner/footer (see the top-of-file comment in lezer-bundle.js).

### CPO changed files
- `code.pyret.org/cpo-config.json` — raw-js: `lezer-pyret-frontend` → the browser bundle.
- `code.pyret.org/src/web/js/file-locator.js` — `cpoSurfaceParse` seam + toggle + fallback.
- `code.pyret.org/src/web/js/gdrive-locators.js` — same seam in the shared-gdrive locator.
- `code.pyret.org/src/web/js/trove/lezer-bundle.js` (NEW) — AMD-wrapped browser bundle.

### P6 RESULT (reached) — standalone CM6 editor with highlight/indent/fold
`cm6-demo/` is a self-contained CodeMirror 6 page (plain editor; nothing
compiles/runs) backed by the SAME `pyret.named.grammar` + replay tokenizer.
- **Tokenizer in the browser**: Pyret's tokenizer is an AMD pair
  (`pyret-tokenizer`→`jglr`→`rnglr`→`cyclicJSON`). `cm6-demo/pyret-tokenizer.js`
  inlines those 4 sources as text (`vendor/*.amdtext`, esbuild `--loader:.amdtext=text`)
  and `eval`s them under a tiny captured `define` shim, exposing the same
  `Tokenizer` singleton the Node oracle uses. Verified standalone in Node first
  (`test-tokenizer.js`).
- **CM6 language**: `pyret-language.js` builds the parser with `buildParser`
  (same module-global `CUR` token-tiling + `ExternalTokenizer` as lezer-run.js),
  attaches `styleTags`/`indentNodeProp`/`foldNodeProp`, wraps as `LRLanguage` +
  `LanguageSupport`. Per-doc wiring: OVERRIDE the configured parser instance's
  `createParse` to read the full input, tokenize with Pyret, set `CUR`, then
  delegate with `fragments=[]` (full reparse; replay tokenizer isn't incremental
  here). `LRLanguage.define` calls `parser.configure(...)` which COPIES the
  parser, so the createParse monkeypatch must be applied to `lang.parser` AFTER
  define (base `Parser.startParse` calls `this.createParse`, so the patch takes).
- **Highlight/indent/fold**: terminals→tags (keywords split into definition/
  module/control/operator-keyword; literals; operators; punctuation/brackets);
  `delimitedIndent({closing:"end"})` for END-blocks and `{closing:"}"}` for
  object/record braces; `foldNodeProp` folds header-line→closing token for all
  block-bearing nodes.
- **Comment caveat**: tokenizer SKIPS comments (in its `ignore` set) → absent
  from the tree. Comments are highlighted by a regex OVERLAY (`pyret-comments.js`,
  nested `#|…|#` + `#…`, skips string literals); noted on the page.
- **Verified**: `npm run verify` (headless Node) parses `sample.arr` → 847 nodes,
  0 error nodes, 257 highlight spans. Real headless-Chrome `--dump-dom` load:
  `SELF-CHECK OK`, `.cm-editor` rendered, 6 fold-gutter markers, highlight token
  spans + `.cm-pyret-comment` overlay present, no page errors. Launch:
  `cd lezer-pyret/cm6-demo && npm install && npm run build && python3 -m http.server 8099`
  then open http://localhost:8099 (see `cm6-demo/README.md`).

## Backlog
- **Add bootstrapworld/starter-files as a differential corpus.** 182 .arr files,
  many authors, whitespace/escaping/escaping gotchas that broke the tree-sitter dev.
  Run the accept/reject + AST differential (oracle vs Lezer) over them.
  NOTE: clone OUTSIDE the repo tree (measure.js/ast-equiv.js do `find $REPO -name '*.arr'`
  and would sweep them); currently at scratchpad `.../scratchpad/starter-files`.
  PREDICTION: high agreement on the COMPILER path (we replay Pyret's tokenizer, so
  Lezer & RNGLR share lexing and can't disagree on escaping/whitespace — the exact
  bug class that broke tree-sitter's from-scratch scanner). These files become the
  key stress test for the eventual NATIVE Lezer tokenizer (editor path), where those
  gotchas WOULD bite.

## Status
- **P0 toolchain — DONE.** `@lezer/generator` + `@lezer/lr` installed. Proved the
  loop, and proved the key architectural bet: an external tokenizer that *replays
  Pyret's own token stream* into Lezer works, with `@skip { Space }` over a
  tiling of the whitespace/comment gaps. Zero error nodes on clean input.
- **P1 oracle — DONE.** `oracle.js` wraps RNGLR (`pyret-tokenizer`+`pyret-parser`
  from build/phaseA) as a reusable accept/reject + tree API. Sanity 7/7.
- **Key finding:** Pyret's tokenizer *already* emits the context-sensitive
  terminals (PARENSPACE/PARENNOSPACE/PARENAFTERBRACE, LANGLE/LT, RANGLE/GT) and
  skips WS/comments. Replaying it means the Lezer grammar inherits Pyret's
  token-level disambiguation for free — so the hard lexer (P3) is deferred and
  P2 measures *grammar* fidelity in isolation.
### P5 RESULT (reached) — 100% AST equivalence; Lezer tree drives the REAL translate()
**553/553 = 100%** of oracle-accepted .arr produce an IDENTICAL Pyret AST whether
`translate()` is driven by RNGLR's tree or by the Lezer tree reshaped to RNGLR-node
form (adapter `to-rnglr.js`), with `translate()` REUSED UNCHANGED via an additive
`translateTree` export. Proof via a recording mock runtime (sound relational compare).
Adapter handles: name map, drop Space, tokenizer-sourced terminal values (string
unescaping), RNGLR SrcLoc pos incl. empty-node + EOF rules, and reconstruction of the
2 inlined comma-list wrappers. `lang/tests/parse/parse.js`: 0 failures. A live
in-compiler swap needs a full build rebuild (out of scope); equivalence already proven
at the translate() boundary. See NOTES.md "P5 RESULT" for detail.

### P5 DESIGN (done) — reuse translate(), prove AST equivalence
parse-pyret.js `translate(node, fileName)` is a dispatch table on `node.name`,
reading `node.kids[i]`, `node.value` (terminals), `node.pos` (RNGLR SrcLoc).
Plan: adapter turns the Lezer tree into RNGLR-node shape and we REUSE translate()
unchanged. Adapter must: map names (namemap + Program->program + terminal `_`->`-`);
drop Space; set terminal `.value = src.slice(from,to)`; build `.pos` as RNGLR SrcLoc
(startRow/Col,startChar..) computed from offsets; and RECONSTRUCT the 2 inlined
wrappers — `trailing-opt-comma-binops`/`-ann-field` handlers do `tr(kids[0])` and
REQUIRE a `comma-binops`/`comma-ann-field` child, so wrap their non-trailing-COMMA
kids into a synthetic wrapper node. Primary proof: AST equivalence (Lezer-driven
translate vs RNGLR-driven translate) over the 553-file corpus. Then best-effort
real swap behind surface-parse + tests.

### P4 RESULT (reached) — 100% structural-tree equivalence with RNGLR
`compare-trees.js` (named grammar `pyret.named.grammar` + `capitalize-grammar.js`):
**553/553 = 100%** of oracle-accepted files produce a Lezer tree IDENTICAL to RNGLR's
`constructUniqueParse` tree, under three principled normalizations:
1. name map (Lezer `Binop_expr` <-> BNF `binop-expr`; case + `_`/`-`),
2. drop Lezer `Space` skip-token leaves (RNGLR omits whitespace),
3. splice 2 semantically-vacuous EBNF grouping wrappers (`comma-binops`,
   `comma-ann-field`) — a CST->AST walk ignores them.
Means a CST->ast.arr translator (P5) is a near-mechanical 1:1 walk: the Lezer tree
has the SAME named-node structure the existing `translate()` consumes.

INSIGHT (reinforces the GLR theme): trying to make the `comma-binops` wrapper appear
WITHOUT inlining (via `!listsep` precedence) lifted raw structural match to 98.7% but
BROKE 2 trailing-comma accept cases (`{List :: List,}`) — a static "separator always
shifts" can't tell separator-comma from trailing-comma without lookahead. That's the
SAME GLR-needs-lookahead shape as the paren gap. So Pyret leans on GLR in (at least)
three spots: space-paren application, bracket-vs-construct, and list-trailing-comma.
We chose to keep the faithful 100%-accept/reject grammar and treat the wrapper as
transparent, rather than degrade acceptance to chase a vacuous node.

P4 files: `capitalize-grammar.js` (-> pyret.named.grammar, namemap.json),
`compare-trees.js`. lezer-run.js takes GRAMMAR_FILE env to pick the grammar.

### P3 RESULT (reached) — 100% accept/reject parity with RNGLR
`node measure.js` (independently re-verified): parse.js literals **330/330 = 100%**;
.arr corpus **571/571 = 100%** full agreement (all 553 oracle-accepted accepted,
all 18 oracle-rejected rejected). **Both directions zero divergence.** Discrimination
spot-checks pass (rejects bad input, accepts `arr[3]`, `f (x)`, `x=1\n(x)`).
Fix: one root cause (expr-then-`(`/`[` that is really a statement boundary) resolved
with paired `~spaceapp` markers + dropping the over-committing `!postfix` on the
space-paren/bracket forms; kept `!postfix` on PARENNOSPACE `app_args`. Safe because
Pyret has no single-arg space-app and no bare `[..]`/`[..:..]` value, so exactly one
GLR arm survives. Rule set still identical to generated; all edits in pyret.grammar.

CAVEATS (still open): this is ACCEPT/REJECT parity, not P4 structural-tree
equivalence; and it reuses Pyret's JS tokenizer (P3-native-lexer not done — but the
JS tokenizer is reusable in CM6 too). The 330 literals exclude parse.js's
loop-generated tokenizer combinatorics (covered by construction via token replay).

### P2 MILESTONE RESULT (reached)
Parser builds after 18 precedence/`~`-marker additions (rule set unchanged — 152
rules, nothing deleted; verified). `node measure.js`:
- **parse.js literals: 328/330 = 99.4%** agreement (235 accept / 95 reject cases).
- **.arr corpus: 503/553 = 91.0%** of oracle-accepted files also accepted by Lezer
  (521/571 = 91.2% full agreement).
- **Strictly conservative: zero lez-ACC / oracle-REJ.** Lezer never accepts what
  RNGLR rejects — all 50+2 divergences are under-acceptance.

Root cause of the divergences (both parse.js failures + the dominant corpus share):
Pyret's BNF deliberately makes single-arg `f (x)` (space before paren) NOT an
application — the `app-expr: expr PARENSPACE ...` productions require >=2 args, so
GLR explores "end statement, start a new paren-expr". Lezer's static `@precedence`
commits to the postfix-application shift and dies at the `)`. Deciding it needs
COMMA-before-RPAREN lookahead that precedence can't express. (firstError anchors at
`:`/`)` are error-RECOVERY artifacts, not roots — isolated constructs all parse.)
Minimal repro: `x = 1\n(x)` (oracle ACC, lez REJ).

Fix options for P3: (a) contextual/external tokenizer that resolves the paren case
with lookahead, Pyret-style; (b) Lezer `~ambig` so runtime GLR explores both arms;
(c) restructure/drop the parse-only error productions. Decisions logged in NOTES.md.

- **P2 grammar — DONE (first measurement).** `gen-grammar.js` mechanically translates the BNF
  to `pyret.grammar` (153 rules, 125 terminals; merges same-named alternatives,
  EBNF `[]`->`?`, drops dangling `bad-expr`). `lezer-run.js` builds via
  `buildParser` + token replay. `measure.js` compares vs oracle on parse.js
  literals + the .arr corpus. The translated grammar has the expected LR
  conflicts (lambda-`{(`-vs-paren, `expr[...]`, NAME binding-vs-expr, left-rec
  expr chains); a worker is resolving them with `@precedence`/`!`/`~` to get a
  building parser + first measurement.

## Files (in lezer-pyret/)
- `oracle.js` — RNGLR oracle.   `gen-grammar.js` — BNF->Lezer translator.
- `pyret.grammar` — working grammar (editable). `pyret.grammar.generated` — pristine.
- `lezer-run.js` — build + token-replay runner.  `measure.js` — divergence harness.
