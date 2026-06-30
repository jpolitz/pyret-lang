# Lezer Pyret grammar — conflict-resolution notes

## CPO web integration DONE — `?parser=lezer` opt-in in code.pyret.org
Wired the Lezer frontend into the CPO web app; full standalone `cpo-main.jarr` builds
EXIT=0 and embeds it. Key findings:
- **No CPO-specific parse-pyret.** CPO compiles its `parse-pyret` builtin from
  `pyret/src/js/trove/` and `pyret -> ../lang`, so the lang trove's additive
  `surface-parse-lezer` flows into CPO for free. The browser bundle is resolved by ONE
  `cpo-config.json` raw-js entry mapping the `nativeRequire("lezer-pyret-frontend")` to
  `src/web/js/trove/lezer-bundle.js` (a RELATIVE path → portable, unlike lang's absolute
  nodeRequire).
- **The seam is the LOCATOR `get-module`, not compile-lib** — same lesson as lang's
  file.arr. CPO file/drive runs pre-parse in the locator and return `pyret-ast`, never
  hitting compile-lib's pyret-string case. So the branch lives in `file-locator.js` +
  `gdrive-locators.js`: a `cpoSurfaceParse()` that, when `?parser=lezer` is in the URL and
  the rebuilt parse-pyret exposes `surface-parse-lezer`, parses via Lezer in a try/catch
  that FALLS BACK to `surface-parse` on any throw (and `hasField`-guards an old compiled
  module). Default = built-in, unchanged.
- **Not webpack.** webpack.config.js only builds dashboard/beforePyret/beforeBlocks; the
  locators + bundle load via Pyret's AMD raw-js loader during the `pyret.jarr
  --build-runnable` step. The build error to watch for was a wrong `--deps-file` path
  (`build/web/js/bundled-npm-deps.js`); all 26 modules incl. parse-pyret compile clean.
- **Bundle is browser-built** (`esbuild --platform=browser --format=cjs`) and re-wrapped as
  `define("lezer-pyret-frontend", [], function(){...module.exports...})`. Smoke-tested in
  Node under a `define()` shim: exports `lezerParseToRnglr`, AST == RNGLR oracle on real
  `.arr` (3/3). NOT verified: live browser Run (no headless server/Drive creds).

## P5 Step 4 (LIVE SWAP) DONE — `-use-lezer` runs the Lezer frontend in phaseA
The flag is wired and verified in the running compiler. Key findings during integration:

- **The compile-lib pyret-string seam is NOT the file-run parse point.** `compile-module`
  in compile-lib.arr branches on `locator.get-module()` returning `pyret-string` vs
  `pyret-ast`. The FILE locator (`locators/file.arr`) pre-parses in `get-module` (calls
  `PP.surface-parse` directly, returns `pyret-ast`), so it NEVER hits the pyret-string
  case. Editing only the compile-lib seam left file-based runs entirely on RNGLR (the
  trace marker stayed silent even with the flag). Fix: thread `use-lezer` through
  `CLIContext` into `FL.file-locator(path, globals, use-lezer)` and branch inside
  get-module. The compile-lib seam edit is still correct/kept for STRING locators (REPL,
  tests). LESSON: there are two parse entry points; the file path is the one that matters
  for `--run`/`--build`.
- **`C.flag` options are SINGLE-dash.** `-use-lezer`, not `--use-lezer` — cmdline.arr's
  flag branch lives under the single-dash matcher; a two-dash flag errors "does not start
  with two dashes". (Matches `-type-check`, `-no-spies`, `-improper-tail-calls`.)
- **The content-addressed compiled cache defeats naive observability.** Re-running a
  program with identical SOURCE serves from cache and never re-parses, so a trace marker
  (or even a hard throw) in the parse path won't fire. To observe/prove the path, use a
  fresh unique source string each run. Builtins (lists/option/...) are shipped
  pre-compiled and also don't re-parse — only user .arr files exercise the frontend.
- **Bundle loads at runtime via `nodeRequire(absolute path)`**, so editing
  lezer-bundle.js + re-esbuild takes effect WITHOUT a jarr rebuild (browserify leaves
  nodeRequire alone). This made path-confirmation iterations fast (no 10-min make).
- **Parse-error parity** comes for free by deferring Lezer-error cases to the existing
  `parseDataRaw` (RNGLR) — identical message/location/exn. Only an internal stack line
  number differs (which branch's surface-parse call site threw).


## P-bracket (latest) — bracket-index as a binop RIGHT operand
Fixed `1 + o[0]` / `o[0] + o[1]` / `o[0] and o[1]` being wrongly REJECTED. Root
cause + fix detailed under the `~spaceapp` note below; one-line summary: the binop
loop is now `binop_expr { expr ~spaceapp (binop expr ~spaceapp)* }` — `!binopP` was
removed (a precedence overrode the `~` ambiguity and killed the bracket arm) and the
`~spaceapp` tag is repeated after every loop operand. Edited BOTH `pyret.grammar` and
`pyret.named.grammar` (regenerated via `capitalize-grammar.js`; identical modulo case).
All harnesses re-verified green with **0 over-acceptance**:
- `measure.js` (pyret.grammar): parse.js 330/330, corpus 571/571, oracle-acc 553/553.
- `measure.js` (pyret.named.grammar): same.
- `compare-trees.js`: 553/553 structural. `ast-equiv.js`: 553/553 AST-identical.
- `starter-diff.js` (bootstrapworld starter-files): accept/reject 182/182, AST 180/180
  on both-accept (the 2 non-accepts are shared oracle rejects). The 4 previously
  failing `libraries/*` files (ai-library, core, trust-but-verify-library,
  ai-library-models) now accept.

## P5 RESULT (reached) — 100% AST equivalence; Lezer tree drives the REAL translate()
**`ast-equiv.js`: 553/553 = 100.0%** of oracle-accepted .arr files produce an
IDENTICAL Pyret AST whether `translate()` is driven by RNGLR's `constructUniqueParse`
tree or by the Lezer tree reshaped into RNGLR-node form. `translate()` is REUSED
UNCHANGED.

How:
- **Injection point.** Added an additive `translateTree(node, fileName)` to
  parse-pyret.js that just calls the existing internal `translate(node, fileName)`,
  exposed via `makeModuleReturn(values, types, internal)`'s 3rd `internal` arg, so the
  module's provided interface (`surface-parse`/`maybe-surface-parse`) is byte-for-byte
  unchanged. (Only edit outside lezer-pyret/.)
- **Adapter `to-rnglr.js`.** Lezer named-grammar tree (`lezerTree`, now carrying
  `from`/`to` per node) -> RNGLR node shape:
  - name: namemap, `Program`->`program`, terminals (not in namemap) -> `_`->`-`.
  - DROP `Space`.
  - terminal `value` from the Pyret TOKENIZER (captured during token-replay tiling),
    NOT `src.slice` — RNGLR's tokenizer UNESCAPES strings (`"a\nb"` is a real newline,
    quotes kept), so a raw slice would diverge on every escaped string.
  - `pos` = RNGLR SrcLoc {startRow/Col/Char,endRow/Col/Char} (1-based row, 0-based
    col/char), computed from offsets via precomputed line starts; pos objects carry a
    `.combine`/`posAtStart`/`posAtEnd` because some translators call `pos.combine(...)`.
    Non-empty nodes: `combine(firstKid,lastKid)`. Empty (nullary) nodes: zero-width at
    the previous token's end (document-order threading of `lastEnd`); at true EOF
    (last token ends at EOF, or empty/comment-only file) RNGLR uses the EOF token pos
    = `{len+1}` with col+1, which `mkPos(len+1)` reproduces exactly (fixed the empty
    program / off-by-one-at-EOF cases).
  - RECONSTRUCT the 2 inlined wrappers: a `trailing-opt-comma-binops` /
    `-ann-field` whose kids are `item (COMMA item)* (COMMA)?` get all kids EXCEPT a
    trailing COMMA wrapped into a synthetic `comma-binops` / `comma-ann-field`, so the
    handler's `tr(kids[0])` / `makeListComma` see the structure they expect.
- **Comparison via a recording mock (`mock-runtime.js`).** translate() touches only a
  small, pure RUNTIME subset (getField, makeString/Number/Boolean, pyretTrue/False,
  ffi.makeNone/Some/makePyretPos/combinePyretPos, link/empty). A recording mock turns
  each constructor application into a canonical string; feeding BOTH trees through the
  SAME translate()+mock makes "identical string" a sound relational proof of "identical
  AST" (every ctor/arg/pos/value is captured). No heavy runtime bootstrap needed.

Cross-check: `node-pos-compare.js` does a STRICTER field-by-field tree compare and
flags ~395 files — but ALL divergences are the positions of EMPTY nonterminals
(`construct-modifier`, `doc-string`, `data-sharing`, `ty-params`, …) that RNGLR places
via SPPF-internal sibling/next-token rules we don't replicate. translate() never reads
those positions, so AST equivalence stays 100% — the two independent methods agree.

### P5 Step 4 (real swap) — status
- `lang/tests/parse/parse.js`: **60 specs, 0 failures** — the additive translateTree
  export does not perturb the existing parser/tokenizer path.
- A LIVE in-compiler swap (Lezer parser feeding translateTree inside the running
  runtime) needs the Lezer parser + named grammar bundled into the lang build and the
  src edit recompiled into `build/phaseA` (the build ships only hash-compiled modules,
  no editable `trove/`); that is a full `make` rebuild — out of scope per the task's
  "don't block on multi-hour rebuilds". The equivalence is already proven at the exact
  `translate()` boundary the swap would cross (553/553), and `translateTree` is
  exported for that integration.

P5 files (lezer-pyret/): `to-rnglr.js` (adapter), `mock-runtime.js` (recording mock +
loads parse-pyret's theModule), `ast-equiv.js` (the 553/553 harness),
`node-pos-compare.js` (strict node diagnostic). lezer-run.js `lezerTree` extended with
`from`/`to` + tokenizer `value` on leaves. One additive edit in
`lang/src/js/trove/parse-pyret.js` (translateTree).


Goal: make the mechanically-translated `pyret.grammar` compile under Lezer's LR
table generator (it was written for a GLR/RNGLR parser) and measure agreement
with the canonical RNGLR oracle.

## Result (P3 — final)
- **BUILD OK**, and **100% agreement in both directions**:
  - parse.js literals: **330/330 = 100.0%** (oracle acc 235 / rej 95).
  - .arr corpus: **571/571 = 100.0%** full agreement; of oracle-accepted,
    lezer also accepts **553/553 = 100.0%**.
- **Over-acceptance (`lez:ACC / oracle:REJ`) = 0** and **under-acceptance
  (`oracle:ACC / lez:REJ`) = 0**, verified by a direction-counting script over the
  full literal + corpus set. The `~ambig` markers were only placed where exactly
  one parse survives later tokens, so they never accept an RNGLR-ambiguous input.

### P2 → P3 progression
- P2 (build + first measurement): literals 99.4%, corpus 91.2%, over-acc 0.
- P3 closed the single dominant divergence (an `expr` followed by a `(`/`[` that
  is really a statement boundary, not a postfix extension) — see the `~spaceapp`
  entry below. That alone took literals 99.4→100% and corpus 91.2→100%.

## Tools used

### `@precedence { seqP, postfix, inst }` (highest→lowest)
- **postfix**: the left-recursive postfix forms (`app_expr expr app_args`,
  `dot_expr`, `get_bang_expr`, `tuple_get`, `extend_expr`, `update_expr`, and the
  no-space `app_args` PARENNOSPACE application) carry `!postfix` before their
  operator token so that after an `expr` the postfix operator SHIFTS instead of
  reducing/continuing the `binop_expr` chain. The `binop_expr` loop carries NO
  precedence marker, so `!postfix` (a marked shift) beats the unmarked binop
  loop-iteration reduce. Matches Pyret semantics: `f(x)`/`.`/`!`/no-space binds
  tighter than binops and chains left-to-right.
  NOTE: `bracket_expr`'s `LBRACK` and `app_expr`'s space-paren forms do NOT use
  `!postfix` — they use `~spaceapp` instead (see below), because there `expr [`
  / `expr (` can be a statement boundary rather than a postfix extension.
  HISTORY: an earlier `!binopP` (lowest precedence) on the binop loop was REMOVED
  in P-bracket — see the `~spaceapp` note. It was force-resolving the bracket
  conflict (a precedence ALWAYS overrides a `~` ambiguity tag), which wrongly
  killed the bracket-index arm when `o[0]` is a binop's RIGHT operand.
- **inst**: `inst_expr (expr LANGLE ann …)` carries `!inst` (postfix-ish; between
  postfix and binop). Drives the `map<A>` instantiation reading.
- **seqP**: only used by `for_expr` — `… !seqP RPAREN` makes `FOR expr PARENNOSPACE
  ( … ) RPAREN` keep the trailing `RPAREN` as the for-binding parens rather than
  reducing an empty `opt_comma_binops` (i.e. treat the parens as for-binds, not as
  a zero-arg application of `expr`). Marked shift beats the unmarked empty reduce.

### `~ambig` markers (kept BOTH parses; LR-limited, not truly ambiguous)
Used only where a later token uniquely decides, so the oracle's unique-parse
requirement is still met:
- **`~idamb`** on `id_expr` NAME and `name_binding` NAME: `{x}` after PROVIDE is a
  tuple *binding* (if `= …` follows) or a tuple *expr* (otherwise). EQUALS decides.
- **`~ctr`** on `contract_stmt`/`name_binding` after `COLONCOLON`: `x :: Ann` is a
  contract statement, or the head of an annotated let-binding `x :: Ann = v`.
  EQUALS decides.
- **`~lbrace`** on `tuple_expr`/`obj_expr`/`lambda_expr` after `LBRACE`: `{(…)…}`
  is a curly-brace lambda (if `:`/`block` follows the args) or a tuple/obj
  containing a paren-expr (if `;`/`}` follows). The token after the paren decides.
  (This recovered all the `{(a): true}` curly-lambda literal cases.)
- **`~spaceapp`** (P3, the dominant fix) on `binop_expr` (right after `expr`),
  on `app_expr`'s two space-paren forms (`expr PARENSPACE ...`), and on
  `bracket_expr` (`expr LBRACK ...`). Resolves the "is this `(`/`[` a postfix
  extension of the current expr, or the start of a NEW statement?" fork:
    - `f (x)`  — single-arg space-paren: Pyret has NO single-arg space-app
      production, so the app arm dies and it parses as two statements: `f`, then
      `paren_expr (x)`. (Multi-arg `f (a, b)` and zero-arg `f ()` keep the app arm.)
    - `expr` <newline> `[list: ...]` — the `[` starts a `construct_expr`
      statement, not an index of `expr`; there is no bare `[..]` value literal and
      no `[..:..]` index, so the index arm dies on the inner `:`.
    - real index `arr[3]` / `arr [3]` keeps the `bracket_expr` arm (no inner `:`).
  In every case the token after the inner `binop_expr` (COMMA/COLON vs
  RPAREN/RBRACK) leaves exactly one viable arm, so the runtime GLR produces a
  unique tree — matching RNGLR with zero over-acceptance. This was the single
  root cause behind the 2 literal failures AND the bulk of the ~50 corpus
  failures (every file using `[list:]`/`[set:]`/`[array:]`/`[ED.error:]`/etc.
  as a statement after another statement). `!postfix` could not be used here
  because it commits to the postfix arm and dies; unbounded lookahead is needed,
  which only the GLR `~` split provides.
  - **P-bracket fix.** The `~spaceapp` tag must be repeated AFTER EACH binop loop
    operand, not just after the first `expr`. Rule is now
    `binop_expr { expr ~spaceapp (binop expr ~spaceapp)* }` (was
    `expr ~spaceapp (!binopP binop expr)*`). Two coupled bugs were fixed:
    (1) the loop carried `!binopP`, and a *precedence* on the loop-iteration reduce
    OVERRIDES the `~spaceapp` ambiguity tag — so for a bracket as the RIGHT operand
    (`1 + o[0]`, `o[0] + o[1]`, `o[0] and o[1]`) Lezer force-reduced `1 + o` into a
    statement and parsed `[0]` as a `Construct_expr`, which errors on the missing
    `:` (the valid `Bracket_expr` arm was discarded → REJECT). Removing `!binopP`
    lets the postfix `!postfix` marked shifts still win over the now-unmarked loop
    reduce, while leaving the bracket conflict to `~`.
    (2) the original `~spaceapp` only tagged the *first* `expr`; a bracket-index on a
    loop operand sits at the `(binop expr)·LBRACK` boundary, which had no matching
    tag, so without `!binopP` it was an unresolved build conflict. Adding the
    per-iteration `~spaceapp` makes that boundary ambiguity-allowed too.
    Net: `o[0]`/`arr[3]` index AND `expr` ⏎ `[list:…]` statement-split both work in
    every operand position; verified 0 over-acceptance. (Found via the
    bootstrapworld starter-files `libraries/*` corpus.)

### Behavior-preserving restructuring
- `trailing_opt_comma_ann_field` and `trailing_opt_comma_binops` were inlined from
  `subrule (COMMA)?` to `item (COMMA item)* (COMMA)?` so the trailing comma lives
  in the SAME rule as the list. Lezer auto-resolves separator-vs-trailing COMMA by
  1-token lookahead when they're in one rule; the cross-rule split prevented that
  and produced a shift/reduce conflict. Same language. (Recovered the
  `{ List :: List, }` and `x :: {foo:: A,} = 5` trailing-comma literal cases.)

## Known residual divergences
- **None.** After the `~spaceapp` fix the Lezer parser agrees with the RNGLR
  oracle on 100% of parse.js literals (330/330) and 100% of the .arr corpus
  (571/571), in both directions (over- and under-acceptance both 0).
- The 18 corpus files the oracle rejects are also rejected by Lezer (agreement on
  rejection) — they are oracle-ambiguous or otherwise invalid, not Lezer failures.

## Method note (P3 diagnosis)
First-error offsets are error-RECOVERY anchors, not roots: e.g. failing files all
pointed at a `[list: ...]`, but those constructs parse fine in isolation. Bisecting
each failing file to the first oracle-accepting line-prefix that Lezer rejected
revealed the true root was the *preceding* statement boundary (`expr` then `[`/`(`).

All edits are limited to `pyret.grammar`; each carries an inline `// CONFLICT:`
comment. `pyret.grammar.generated` is the untouched pristine translation.
