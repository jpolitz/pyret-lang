# TS-port review — non-mechanical differences

Comparison of `lang/src/arr/compiler/*.arr` (+ the ported trove/js sources) against
`lang/src/ts-compiler/src/*.ts`, working-tree state of branch `ts-port`, 2026-07-03.
Every file pair was read in full by an independent reviewer; findings below are the
places the port is *not* a straight application of the mechanical translation rules.
Line numbers are working-tree; `ts:` = the TS file, `arr:` = the Pyret/JS original.

Severity tiers: **[!!]** likely-observable behavior/output divergence, **[!]** latent
hazard or changed failure mode, **[~]** deliberate + documented, worth confirming,
**[i]** informational (error-string drift, dropped dead code/tests).

---

## Top cross-cutting findings

1. **[!!] Map insertion order silently replaces StringDict hash order** — pervasive.
   Pyret `StringDict.keys-list()`/`fold-keys` iterate in a *content-deterministic*
   hash-trie order; JS `Map` iterates in *insertion* order. Everywhere a
   `keys-list()` loop mints gensyms/existentials, renders a message, or serializes,
   order can differ from the Pyret compiler:
   - `type-structs.ts:469` `TRecord.key()` — **structurally-equal record types built in
     different field orders get different identity keys**; `key()` feeds `TypeSet` and
     typechecker caches. (Also `toString` at ts:661-664, free-var numbering ts:705-709.)
   - `js-of-pyret.ts:21-30` `clMapSd` — field order of the emitted `({...})` module
     object, i.e. the top-level shape of every compiled file; byte-parity waived by a
     local comment.
   - `compile-structs.ts:805-808, 857-860` `typeFromRaw`/`datatypeFromRaw` — type-param
     list order in deserialized provides.
   - `type-check.ts:314, 2085, 2342, 2375` and `type-check-structs.ts:509, 1050, 1080,
     1121, 1232` — which key is solved first / which existential id a field gets.
   - `well-formed.ts:938` — order of options in the user-facing reactor
     "Valid options" message.
   - `cmdline.ts:246-249, 311-324` — usage-line order, alias-conflict detection order.
   By contrast the porter *did* sort where Pyret used tree-sets
   (`type-check-structs.ts:90-102`), and anf-loop-compiler neutralizes it with sorts
   added **to both compilers** (see #2).

2. **[!!] Byte-parity via co-modification** — `anf-loop-compiler.ts:18-23` (header):
   dict-iteration sorts were added to *both* the Pyret and TS sides (`clMapSd`
   equivalents, `compileFunBody` vars ts:793/arr:652, `compileModule` free-ids
   ts:2653/arr:2228). Parity depends on keeping the two files in lockstep — an
   out-of-band invariant nothing enforces.

3. **[!] Latent-Pyret-bug policy is real but inconsistently applied.** The de-facto
   rule is "fix what would crash, leave a NOTE; preserve non-crashing quirks."
   Documented fixes and preserved quirks are listed per-file below; the **silent**
   (un-NOTEd) fixes a parity auditor must know about:
   - `ast-util.ts:475-490` `DefaultEnvIterVisitor.sMethod`, `ts:443-448` `sCasesElse`
     (arity repairs), `ts:84-85` `countApps` (non-Boolean `and`).
   - `compile-errors.ts:2146` `IncorrectNumberOfBindings.renderFancyReason`
     (`fields.count()` → `.length`; that fancy path *crashed* in Pyret, now renders).
   - `js-ast.ts:1276-1278` `DefaultMapVisitor.jField` arity fix (while `jLabel`
     ts:1301-1304 *replicates* its bug).
   - `js-of-pyret.ts:136` `makeCompiledPyret` inserts the missing `addPhase` arg.
   - `cli-module-loader.ts:614` `buildRequireStandalone` supplies a `JFun` name arg the
     Pyret call omits, while its comment claims structural fidelity.

4. **[!] Silent-vs-loud failure modes.** Pyret's dynamic field access raises
   field-not-found; the port's `as`-casts/`!` assertions yield `undefined` and fail
   later (or never). Sites listed per-file; representative: `type-check.ts:157,165`
   (`(… as C.VVar).t`), `flatness.ts:717`, `desugar-check.ts:49-67` (`right!`),
   `well-formed.ts:442`, `resolve-scope.ts:2047`.

5. **[~] Stack-safety rewrites** — the largest structural divergences, all with
   parity arguments in comments, none enforced by types/tests:
   - `resolve-scope.ts:423-467` — `desugarScopeBlock` trampoline with module-global
     `dsbPending` + `undefined`-as-Expr sentinel (non-reentrant; exported `add*Bind`
     functions no longer safe to call directly).
   - `anf.ts:235-374` `anfLinear` (+ `anfNameArrRec` ts:159-196) — iterative spine with
     placeholder-body hole-patching (nodes temporarily type-invalid, mutated after).
   - `anf-loop-compiler.ts:1048-2020` — entire ANF-spine compilation on generators +
     explicit-stack `runChain` driver.
   - `js-dag-utils.ts:391-438` `computeLiveVars` — explicit work-list.
   - `flatness.ts:151-232, 314-416` — frame stacks; `pprint.ts:123-200` `format` loop.
   - Selectivity is implicit: mutual recursion via `a-if`/lam bodies, ConcatList
     methods, and `map2Strict` (`list-aux.ts:28-37`, deliberately) remain unbounded.

6. **[i] Error-message/rendering drift is systematic**: Pyret `torepr`/`tostring`
   became ~5 different local reimplementations (JSON.stringify-based `toRepr` in
   compile-structs/resolve-scope/cli-module-loader, structural `torepr` in
   compile-errors, best-effort shims in anf/flatness, `$name` substitution in
   ast-anf, `String(x)`/`toString()` elsewhere). Internal-raise text and some
   user-facing rendering will not byte-match Pyret. Added
   `default: throw new InternalCompilerError(...)` arms on nearly every `switch`
   replace Pyret's generic cases-miss error with new strings.

7. **[i] All `where:`/`check:` blocks dropped, nowhere re-created** — including
   exactly the tests that guard fold order (`concat-lists.arr:120-147`), pretty-printer
   bytes (`js-ast.arr:642-668`), and `to-string` (`type-structs.arr:583-598`).

---

## Per-file findings

### ast.ts / ast-visitors.ts (↔ arr/trove/ast.arr)
Coverage verified: all 177 variants / 48 datatypes present; ~373 method bodies diffed;
visitor method sets match ast.arr exactly (the gaps — `sAppEnriched` in iter+dummy,
`sCheckExpr` in dummy — pre-exist in ast.arr). `MakeName`/`globalNames` serial
numbering verified identical.
- [~] `ast-visitors.ts:1528` `DummyLocVisitor.sRef` ↔ arr:3343 — fixes `s-ref(self, …)` arity bug (NOTE).
- [~] `ast-visitors.ts:1707-1709` `DummyLocVisitor.sUndefined`, `ast-visitors.ts:437-439` `DefaultMapVisitor.sUndefined` ↔ arr:3515, 2281 — both fix `s-undefined(self)`; the two fixes intentionally differ (dummyLoc vs node.l).
- [!] `ast.ts:311-312, 2469-2470` etc. — missing `label()`/`tosource()` now `raise('No label on …')`; missing *visitor* method now a bare `TypeError` (Pyret: `"No visitor field for " + label()`).
- [~] Carried bugs (NOTEd): `PModule.tosource` reads nonexistent `.ann` (ts:573-575 ↔ arr:346); `DefaultIterVisitor.sMethodField` visits `args` twice, never `params` (ast-visitors.ts:1145-1151 ↔ arr:2997); `SHintExp.tosource` reads `.e` (ts:1194); `SCheckExpr.tosource` wraps a doc in `PP.str` (ts:1527); label typos (`SProvideTypes`→'a-provide-type' ts:854, plus intentional aliases ts:456, 1153, 1299, 1710); DummyLocVisitor quirks (ts:1457-1463, 1616-1622).
- [i] `ast.ts:182` `NameBase.toString()` added (returns `key()`); `h-use-loc`/`SSrcloc` tosource use `toreprLoc` (ts:931, 1796) — parity rests on `toreprStr`/`toreprLoc` matching runtime `torepr`.
- [i] `ast.ts:2473, 2481` — `ASCENDING`/`DESCENDING` are the only nullary variants with **no singleton consts** (callers `new A.ASCENDING()`); identity comparison against a shared value would break.
- [i] `ast-visitors.ts` `DefaultMapVisitor.aBlank` returns `node` instead of constructing (sound only because a-blank is a singleton in Pyret).

### parse-pyret.ts (↔ js/trove/parse-pyret.js)
Verified: all number literals via `makeNumberFromString`→`jsnums.fromString` (no
parseFloat anywhere); string escaping shared via the common tokenizer; argument order
of every spot-checked node construction matches.
- [~] ts:1230 `'tuple-get'` — index coerced `jsnums.toFixnum` (AST field is `number`); representation change vs JS original.
- [~] ts:1090-1098, 1202-1206 — dead grammar productions (`sql-expr`, `do-expr`, `for-then`, `else`) replaced by explanatory throws (verified absent from pyret-grammar.bnf) — plain `Error`, not `TODOError`.
- [!] ⏭️ ts:71-182 — new `PyretParseError` hierarchy with **invented message strings**; `makeNumberFromString` failure is now a ParseError kind, changing the error taxonomy `parseDataRaw` (ts:1598-1604) dispatches on. Verify consumers of `maybe-surface-parse` don't dispatch on the error variant. [⏭️ latent, not reproducible. The lexer pre-validates number tokens, so `jsnums.fromString` never returns `false` for lexable input — tested directly on rationals/decimals/bignums/`1/0`, all parse — so the taxonomy change only manifests on a lexer↔jsnums mismatch that does not occur for real numerals.]
- [i] ts:819, 829, 855, 1596 — `throw "<string>"` → `throw new Error(...)` (same text); duplicate `'comma-binops'` key deduped; RUNTIME arity/type checks dropped.

### well-formed.ts
Coverage verified: all 52 + 85 visitor methods present, bodies diffed; reserved-word
list, error ordering, and load-bearing trailing spaces match.
- [~] ts:929-933 `sReactor` — Pyret's `wf-error` no-loc arity bug becomes a reported error with `undefined` loc (crash → loc-less user error; downstream loc rendering may break).
- [~] ts:1365-1369 `TopLevelVisitor.sVariantMember`, ts:466-473 `sSpecialImport` — Pyret returns `nothing` into an `and` (runtime error); port returns `false` (clean short-circuit).
- [!!] ✅ ts:938 — reactor "Valid options" message order = Map insertion order (user-visible; see cross-cutting #1). [`f28667e0a`: a missed canonicalization — sort() the option keys in *both* compilers. The byte-parity test `err-reactor-options.arr` lands in the next commit `289d52db2` (with a well-formed unit test guarding this commit): it can see quote-wrapped vs non-quote-wrapped strings in errors in a new way, which surfaces the separate srcloc divergence below, fixed there.]
- [!] ts:442 `sUse` — `(node.n as A.SName).l` silently `undefined` for non-SName (Pyret: field-not-found).
- [i] ts:312-315 `rejectStandaloneExprs` — empty-list edge no longer errors (unreachable); ts:122-133 `ensureUniqueCases` — two identical arms collapsed, no default-throw (inconsistent with file's own convention); ts:65-67/1414-1418 — push+slice replaces prepend+reverse (verified order-equivalent).

### resolve-scope.ts
Verified clean: env threading via copy-on-write `mapSet` throughout; curried-constructor
effect hoisting preserves atom-serial order (ts:884, 945, 1689…); Name/Loc equality via
`.equals`/`.key()`; many original quirks bit-for-bit (typo "a a provided module", double
ann visit ts:1996, `sLam` shadows=false ts:1810…).
- [~] ts:423-467 — the `desugarScopeBlock` trampoline (cross-cutting #5): exported `addLetBind(s)`/`addLetrecBind(s)`/`addTypeLetBind`/`addContracts` (ts:307-421) can now return the `undefined` sentinel and stash into module-global `dsbPending`; non-reentrant; API change vs directly-callable originals.
- [!] ts:288-294 `bindWrap` — `bg as LetBinds|LetrecBinds` on a `TypeLetBinds` → raw TypeError (Pyret: field-not-found). ts:2047 `NamesVisitor.aDot` — `(obj as A.SUnderscore).l` silently undefined for atom/global.
- [i] ts:19 `mtd` — exported *mutable* Map where arr:20 had an immutable empty dict (unused; latent aliasing hazard). ts:24-31 `toRepr` (JSON) used at 11 raise sites ↔ arr `torepr`. ts:105 `export let errors` — module-level mutable exported binding. `where:` tests arr:410-500, 1868-1874 dropped. Added "no cases matched" throws at ~20 sites.
- [~] ts:53-81 `desugarToplevelTypes` — forward accumulation replaces reverse-then-reverse (verified output+gensym-order equivalent, commented).

### desugar.ts / desugar-check.ts / desugar-post-tc.ts
Verified: **no gensym/make-atom reordering anywhere** (every mk-id site traced,
including the s-table-extend var/let interleave and NoChecksVisitor's right-to-left
foldr); rationals exact via jsnums.
- [!] `desugar.ts:148`, `desugar-post-tc.ts:70-71` — dropped `else => raise("Attempt to desugar non-program …")` guards.
- [!] `desugar-check.ts:49-67` `sCheckTest` — `right!` replaces `right.value`: malformed input now builds an AST with `undefined` body instead of raising.
- [i] `desugar.ts:127-128` `desugarAnn` — added `default:` raise with invented message (other no-else cases trust TS exhaustiveness — inconsistent). Error strings via `$name`/`String(l)` instead of `torepr` at desugar.ts:224, 306, 968; desugar-check.ts:137.
- [~] `desugar.ts:68-77` `checkHasColumn` — Pyret's loc-as-string bug kept bit-for-bit via `as any` ("sic" comment; dead code). `desugar.ts:531` s-ref latent bug preserved, crash shape differs.
- [i] `desugar.ts:575` s-reactor — `sort()` is UTF-16 code-unit order vs Pyret string `<` (identical for current ASCII keys). `where:` blocks dropped (arr:278-318, 956-1007).

### type-structs.ts / type-defaults.ts
Verified: all 705 type-defaults table keys identical and in order; constructor token
streams diffed — no arity/type drift; Name equality via `.key()` is exactly Pyret's.
- [!!] ✅ `type-structs.ts:469` `TRecord.key()` — insertion-order identity keys (cross-cutting #1; the sharpest single hazard in the port). [`573bf3ab7`: sorted the field keys so key() agrees with equals(); added unit tests for key()/listToTypeSet, but were unable to write a Pyret-level test that mis-typechecks. We added a good/ type-check test that exercises the path, and it passes on both compilers. In our probing the hazard looked latent: across all 94 good/ programs multi-field record key() was reached only incidentally, and all comparisons we could find use order-independent equals/get — but we did not prove it unreachable.]
- [!] ⏭️ `type-structs.ts:552-634` `equals` — `E.EqualityResult` (with reason strings) collapsed to `boolean`; diagnostic reasons unrecoverable. [⏭️ This has nothing to do with roughnums or comparing functions; equality result would be irrelevant, this is just for type comparison in the type checker.]
- [!] `type-defaults.ts:814-830` — `defaultModules` is a shared **mutable** module-level Map returned by reference from `makeDefaultModules()` (Pyret froze it); any caller mutation corrupts all later `emptyContext()`s. Same pattern `makeDefaultTypes` ts:119-170.
- [i] `type-structs.ts:146` `TSingletonVariant.fields` — getter allocates per access (`v.fields === v.fields` false). ts:44-49, 88-94 — invented display renderings. Export-surface narrowing (constructor shims private; `dependency`/`tArrayName`/`sAtom` dropped). `check:` block arr:583-598 dropped.

### type-check-structs.ts
Verified clean: all Context/ConstraintSystem mutators copy (`mapSet`, `typeSetAdd`…);
only deliberate `MutableStringDict` mirror mutates in place; `==` on compounds always
`.equals()`/`.key()`.
- [~] Bug-preserving stubs, each NOTEd, each changing the failure to `InternalCompilerError`: ts:1267-1271 `removeRefinementsAndForalls` t-ref; ts:1560-1568 `instantiateObjectType` t-app-onto-t-app (outer recursion still performed first for effect order); ts:1628-1632 `introduceOnto` t-app.
- [~] ts:1569-1573 — `TypingError as unknown as AnyFoldResult<Type>` double cast preserves the original's wrong-typed return (callers switching on `$name` fall through differently than a FoldErrors would — same hazard as Pyret, kept on purpose).
- [!!] ⏭️ Solve-loop iteration order (ts:509, 1050, 1080, 1121, 1232) — cross-cutting #1. [`754fbb916`: This is just documentation-as-script. I don't think we should fix this, it's just about what order certain gensyms happen in, visible only in error messages. Getting this “right” is actually a separate user-facing question about if we care what order things are presented in, and the original Pyret was using sets which anyway are unspecified order, so we never claimed to care. Doesn't affect codegen, not worth more churn. — Probe `tests/divergence/existential-ordering.js`; the ?-N label order follows `free-variables()` iteration (Pyret list-set vs TS Map), feeds only toString; verified message-only (both compilers pass all 211 type-check tests, nothing type-checks differently).]
- [i] ts:222-224 `toString` renders "N binds" instead of full contents; ts:240 `torepr`→`toString`; ts:131 `RecordPath.toString` = JSON.stringify **and is used as a Structure dict key** (ts:158-160); ts:707 `as ConstraintSystem` (TypeError vs field-not-found); `typeSetUnion` duplicated (ts:74-80 vs type-structs.ts:258).

### type-check.ts
Verified: `newExistential` call order preserved at every checked site; foldr direction
preserved via reverse-index loops; type-logger shim byte-equivalent.
- [~] ts:362-374 `_checking` s-module — ~50 lines of dead-but-present Pyret (arity-broken `foldr-fold-result` call) replaced by a documented throw.
- [~] ts:1636-1647 `trackBranches` — Set-of-variants → array with name-based removal; `remaining-branches` **order** feeds the `non-exhaustive-pattern` error (ts:1537), so variant order in that message can differ.
- [i] `cant-typecheck` messages render anns via JSON-ish `toRepr` instead of Pyret `tostring` at ts:2512, 2521, 2534, 2562, 2592 (+ internal raises ts:197, 206, 299; ts:136 uses `toString` where arr used `to-repr`).
- [!] ts:157, 165, 178, 223, 226 — `(… as C.VVar).t` silent-undefined casts.
- [~] ts:2110-2111, 2130-2131 `synthesisUpdate` — **faithfully preserves** the original's accumulator bug (spreads `fields` not `_newFields`, arr:1950/1971); don't fix one side only.
- [i] ts:2464 — DataType stored via `as unknown as Type`; ts:2633-2635 reifies Pyret's implicit `stmts.last()` error with the exact message; ts:2144 carries the *wrong* TODO(MATT) comment (belongs to synthesis-instantiation, arr:2048; the real check-fun TODO arr:1986 was dropped).

### ast-util.ts
Verified: `wrapExtraImports` reversed-pair order preserved; letrec-visitor copy
discipline via `new Map`/`mapSet`; `collectSharedFields` uses real `.equals`;
iter-vs-map `sBind` asymmetry preserved (ts:294 vs 340).
- [~] Documented fixes (NOTEd): ts:638 `badAssignments` rebuilds the stale 3-arg `bad-assignment` call as `new CS.BadAssignment(new A.SAssign(...), b.loc)`; ts:349 `DefaultEnvMapVisitor.sMethod` 8-args-for-10-fields arity fix; ts:375 `sProgram` `self.option.visit` fix; ts:162 `bindExp` s-dot key fix; ts:1282 `memberToTMember` missing loc supplied; ts:1745 `getTypedProvides` Name-as-dict-key fix (keeps the name/asName asymmetry — double-check intent).
- [!] ⏭️ **Silent** fixes: ts:475-490 `DefaultEnvIterVisitor.sMethod`, ts:443-448 `sCasesElse` (latent arity), ts:84-85 `countApps` (non-Boolean `and`). [⏭️ latent, not reproducible. Visitor methods return booleans by contract, so the non-Boolean `&&` / arity paths are only reachable via a misdefined visitor or a malformed AST — not from user input.]
- [~] ts:1660-1664 `getTypedProvides(typed: any)` — TCS dependency accessed structurally with casts (NOTEd).
- [i] ts:501-515 `bindingHandlers.sHeader` — `as any` casts to long-gone s-import-complete fields (legacy dead code kept). ts:187, 1133 — `String(e)` ⇒ `[object Object]` where Pyret printed a structural repr. ts:1245-1259, 1329-1336 — in-place mutation of *fresh* Maps (verified safe, but breaks the file's copy-on-write pattern).

### anf.ts / ast-anf.ts
Verified: continuation closures direct (no trampoline); gensym order preserved
(header pledge + single-shot continuation invariant checked); freevars accumulator
mutation mirrors Pyret's set-now exactly.
- [~] `anf.ts:235-374` `anfLinear`, `anf.ts:159-196` `anfNameArrRec` — hole-patching rewrites (cross-cutting #5); `anf.ts:101-127` `quickAnfValue` duplicates `anf()`'s pure-value cases (sync hazard; deliberately omits safe `s-id-letrec`, so "maximal prefix" isn't maximal); `anfNameArr` (ts:154-157) now dead but exported.
- [i] `anf.ts:214` — synthetic `SBlock` fabricated (loc unused downstream); `anf.ts:24-35` torepr shim; vestigial no-op cases dropped (arr:117-121).
- [~] `ast-anf.ts` documented fixes: ts:976-981 `stripLocLettable` a-module arity; ts:1001-1007 `_`-as-loc → dummyLoc; ts:344-347 `member_type` field-name fix.
- [i] ts:529, 547 — `tosource` prints `key()` (`atom#x#5`) instead of `tostring(id)`; ts:1514, 1554 — freevars errors report `$name` instead of `torepr` (inconsistent with anf.ts's shim); a-method-app freevars-ann branch dropped **without** NOTE (verified dead) while a-array drop got one (ts:1382-1383).
- [!] ts:25-26 — `FrozenNameDict` = `NameDict` = mutable Map; freeze = copy, immutability convention-only. ts:1522-1526 — scrutinee widened by cast to keep Pyret's extra cases (faithful, type-unsound).
- [i] `where:` doctest arr:781-789 dropped.

### flatness.ts / concat-lists.ts / list-aux.ts / gensym.ts
Verified: ConcatList traversal orders element-identical; gensym.ts fully mechanical;
flatness dict threading safe; double-Option `.has()` sites correct (ts:361-363, 481,
703-712); `getDefinedValues` kept for effect parity (ts:685).
- [~] `flatness.ts:314-416, 151-232` — frame-stack rewrites (order verified); ts:284-285, 530-531 — dead `a-id-safe-letrec` branches deleted (verified dead) while the equally-dead `isAIdSafeLetrec` *tests* are kept with casts (ts:177, 355).
- [!] `flatness.ts:717` `getFlatProvides` — `(existingVal as any).t` silently undefined (Pyret: field-not-found).
- [i] `concat-lists.ts:28-33` — `_plus` renamed `append`; ts:58-59 explicit getFirst/getLast throws on empty; ts:70-71 etc. — `[x, ...rest]` makes toList O(n²) (semantics fine); ts:253-269 `clist` variadic replaces make0-5 object; ts:183-193, 329-333 — added aliases break uniform naming. `where:` fold-order tests (arr:120-147) dropped.
- [i] `list-aux.ts` — nothing functional dropped (shrink = where-blocks); module unimported on both sides; `map2Strict` deliberately kept recursive (stack-unsafe) to preserve last-pair-first effect order while siblings went iterative.

### js-ast.ts / js-dag-utils.ts / js-of-pyret.ts
Verified: `torepr` string escaping byte-identical to runtime.js escapeString; pprint
number path matches; Name equality via key() exactly Pyret's; ConcatList orders match.
- [!!] ✅ `js-of-pyret.ts:21-30` `clMapSd` — emitted module-object field order (cross-cutting #1/#2). [`e5c5d3452`: not a divergence — verified byte-parity, no behavioral change. This `clMapSd` only ever receives the top-level module object: 5 fixed keys (requires, provides, nativeRequires, theModule, theMap), set in the same order by both compilers (anf-loop-compiler.arr:2374-2381 ≡ ts:2829-2838). A StringDict of ≤8 keys is an insertion-ordered `ArrayMapNode` (hash order only past `MAX_ARRAY_MAP_SIZE=8`), so `cl-map-sd` and this `Map` emit identical field order — structurally, since the key set is fixed and can never reach the threshold. Confirmed by compiling a sample program with both compilers: all 30 emitted modules (static + module) byte-identical. Commit only rewrites the misleading "not semantically significant" comment to state that parity holds and why. The *separate* `anf-loop-compiler.ts:62` `clMapSd` copy — the one that takes large user/provides dicts (the #2 concern) — is neutralized by co-sorts, incidentally confirmed here since `lists`' 9+-value provides also matched byte-for-byte.]
- [~] `js-of-pyret.ts:136` — silent splitting-compiler arity fix (missing addPhase → no-op). ts:94-103 — `pyretToJsPretty` dropped from CCPFile; ts:107-109 — no `isCCP`; base class omits `abstract $name`.
- [i] `js-of-pyret.ts:52-102` — printers no longer stream (single `toUglySource()` string; sourcemap start/end flags dropped via stringPrinter).
- [~] `js-dag-utils.ts:391-438` `computeLiveVars` work-list rewrite (memoized; results equal). ts:48-49, 672-723 — `freeze()` elided, "frozen" results alias mutable Maps; `Results.discardableVars` escapes to anf-loop-compiler as a mutable Map typed Frozen.
- [i] ts:486-493 `findStepsTo` — added `isJVar` guard (skip vs crash on assumption violation); ts:511 — error value `{err, expr}` → ICE string; ts:680-686 — `labels` fold kept for memoization side effects only (`void labels`), array built in reverse (unused).
- [~] `js-ast.ts:22-149` — sourcemap layer reimplemented on npm `source-map`; `toUglySourcemap` returns `{code, map}`. Needs independent map-level verification.
- [!] `js-ast.ts:1103-1114` `JNum` — `String(this.n)` correct **iff** `n` is a js-numbers value; a raw JS float would emit `(1.5)` where Pyret emits `_makeNumberFromString("3/2")`. Invariant unenforced (only construction site gates on `typeof === 'number'` mirroring num-is-fixnum).
- [~] ts:794-817 `JUnop` — `j-postdeccr` typo behavior (postfix renders prefix `--x`) deliberately replicated by *deleting* the branch; "fixing" TS alone would break parity. ts:1276-1278 vs 1301-1304 — jField fixed / jLabel replicated (opposite policies, both commented). ts:184-190 — missing-visitor error path differs for the three label-less variants.
- [i] `where:` pretty-printer byte tests (arr:642-668) dropped.

### anf-loop-compiler.ts
Verified: no `===`-on-compound violations; dead bindings `void`ed for counter parity
(doloop, brandName, dpSpecs…); `sortBy` replicates lists.sort-by quirks including
reverse-encounter-order of equal elements.
- [~] ts:1048-2020 — generator + `runChain` rewrite of the whole spine (cross-cutting #5); yield points verified at former recursion sites.
- [~] ts:695-744 `compileFunBody` arg-used-in-lambda detector — LIFO queue + early exit + doesn't visit binds (pure query; observationally equivalent, genuine rewrite).
- [!] ⏭️ ts:50-53, 806, 865 — `shouldProfile` loosened to truthiness (Pyret raises on non-Boolean; documented). [⏭️ latent, not reproducible. `shouldProfile` derives from the `-profile` flag (a Boolean); a non-Boolean only arises from malformed `options`, not reachable from user programs.]
- [~] ts:846-852 — dead show-stack-trace branch keeps Pyret's expression-in-statement-list bug via cast (NOTEd). ts:1206 `getAssignments` — per-element `is-j-assign` refinement dropped (head-only check).
- [i] ts:2519, 801, 825 — `String(typ)`/`String(l)` for `tostring` (byte-parity rests on toString fidelity); ts:1378 — options extended by spread while everything else uses prototype-preserving `ext()` (ts:408-412); ts:1453 — `instanceof CL.ConcatEmpty` for structural `== cl-empty` (safe here, not equivalence-preserving in general); ts:37 unused jsnums import; `timeNow` phase-log formatting may differ.

### compile-structs.ts / compile-errors.ts
Verified: runtime-provides values (197 entries), aliases, standardImports,
reactorOptionalFields all key-for-key and order-identical; ED helpers match
error-display exactly; persistent-dict discipline respected.
- [!] ✅ `compile-errors.ts:2146` — **silent** `fields.count()` → `.length` fix (Pyret crashed on that fancy-reason path; TS renders). [`61e32fe3f`: This was a genuine bug in the .arr implementation that was fixed in the port. Adding a regression test and fixing the .arr. Repro'd via `browser-test/` (fails on `--compiler=pyret`, passes on `--compiler=ts`).]
- [!] `compile-structs.ts:475-481, 491-497, 559-565, 575-581` — `.and-then(_.value)` Option-flattening → plain undefined propagation: when origin exists but lookup misses, Pyret raised, TS returns undefined.
- [~] ts:749-760 `valueExportFromRaw` — NOTE claims mirroring, but the Pyret arity errors (`v-fun` 3-for-4, `v-just-type` 1-for-2) are *constructed as malformed objects* instead of throwing. Also silently corrects the tyvarEnv type annotation.
- [~] ts:1294-1298 — `identical3`/`runtimeProvides` store the `T.TTop` class / Types cast to ValueExport maps, mirroring the .arr's unchecked dicts (different failure mode on misuse).
- [!!] ⏭️ ts:805-808, 857-860 — typeFromRaw/datatypeFromRaw param order (cross-cutting #1).
  Probe refinement (`tests/divergence/serialization-order.js`): the wire encoding is a
  positional array (`{tag:"forall", args:[...]}`, type-util.js:9-19), so raw JSON key
  order is NOT the lever; the divergence is one level in — both compilers read params
  back out of the intermediate `newEnv` name-dict (Pyret `SD.map-keys` hash order vs
  TS `Map.keys()` insertion order), observable with 2+ params or an inherited outer
  tyvar env (demonstrated: inherited `{z}` + args `["a"]` → `["z","a"]` in TS). Note
  `tvariantFromRaw` foldr order *was* carefully preserved (ts:822-828).
  [`9970d15bc`: The serialized encoding is positional, to be clear (`{tag: "forall", args:[...]}`),
  and is always right. The divergence ends up only being in when they get read in, and we are
  gensym-ing unique names for them. So, if there is a very long parameter list, I can imagine
  the type parameter names getting reported confusingly, but there's no actual semantic issue
  I could easily write a test for.]
- [i] Two different repr helpers (compile-structs.ts:27-34 JSON vs compile-errors.ts:51-68 structural); ts:940-942 added isProvides guard + new error; `CompileOptions` reconciles the .arr's two disagreeing definitions and adds `pipeline`/`compileModule` fields (ts:993-1029); ts:1055-1067 default log via process.stdout — verify newline behavior against runtime `print`; `compile-errors.ts:1320` ShadowId loc `==` → `key()` comparison.
- [~] Bug-for-bug renderReason mirrors, all NOTEd: compile-errors.ts:163-173, 475-481, 969-992, 1075-1080, 1766-1776, 2610-2672 (the load-table trio passes JS arrays where Pyret passed Lists to `text` — rendering may differ *between* the mirrors if executed).

### compile-lib.ts / cli-module-loader.ts / repl.ts / pyret.ts / server.ts / make-standalone.ts
Verified parity: on-disk module format `({theMap, theModule?, nativeRequires,
provides, requires})` and `.jarr` `{staticModules, depMap, toLoad, uris,
runtimeOptions}` byte-shape unchanged; cache naming `<name>-<sha256(uri)>` unchanged;
worklist/dirty-checking ordering and strings byte-identical; deps awaited
sequentially to keep topological order.
- **[!!] ⏭️ `server.ts:206-212` — live bug (test-confirmed)**: `stop` re-implemented as `runQueue.length = 0` on a stale "compiles run synchronously" rationale; the handler chain is now async (ts:183-196), so `stop` arriving mid-compile does nothing — the running job is uninterruptible (original: `restarter.break()` aborts it). Refinement from the probe (`tests/divergence/server-stop-race.js`): the "drops queued jobs" half is latent, not observable — `tryQueue()` pops eagerly on every message with no busy-lock (ts:177-197, 219-221), so `runQueue` is empty between messages on both the original and the port; the queue (and the `length = 0` clear) is vestigial.
  [⏭️ skip for now – divergence is real, choosing not to fix it! There are various granularities of "stoppable async" we could try to shove into the TS compiler, but (a) we made the server because the .arr compiler is slow to start up, that's not true anymore (b) we had stoppability-of-compilation because it was possible to provide; no one demanded it. A next step (not part of this port, a benefit *after*) could be to flip the npm mode to just run one compile process per compile and Ctrl-C just gets forwarded from the wrapper – the TS startup time is like .2 seconds compared to the 1.5s of pyret.jarr. Can also leave the server and do something more complicated if we care later (or forward the Ctrl-C to the server!) Not a design Q we need to solve now]
- [!] `compile-lib.ts:352-384` `structurallyEqual`/`unique` — hand-rolled deep-equality with a `key()` short-circuit (same constructor + equal `key()` ⇒ equal regardless of other fields) + first-occurrence ordering, replacing runtime structural sets; error dedup/order can differ.
- [~] TODO stubs (documented): `compile-lib.ts:565-585` `runProgram`/`compileAndRunLocator`; `cli-module-loader.ts:422-429` `propagateExit`.
- [~] `cli-module-loader.ts:431-465` `run` — in-process realm execution → build-standalone + `spawnSync`; deltas: argv[0] is temp .jarr path not source path; `result.message` always `""`; propagate-exit unused; synthetic requirejs config invented (ts:452-457).
- [~] `pyret.ts:252-269` — new: re-exec with `--stack-size=8192` (+ `PYRET_TS_NO_RESPAWN`), SIGINT swallow for -serve; ts:199-207, 271-283 — `startedServer` keeps process alive; rejection handler fabricates the runtime's "The run ended in error:" text (no Pyret stack).
- [i] server.ts:214-217 shutdown drops `breakAll`; SIGINT exits instead of resuming Pyret stack; failure logging shape differs (ts:190); `renderReasonOf` (ts:115-134) is an approximation of Pyret exception unwrapping; wire format deliberately mixed (Pyret-style serialize vs JSON.stringify).
- [~] `make-standalone.ts:20-24` — HTML_TEMPLATE hoisted (fixes a ReferenceError in the JS original, NOTEd); runtime checks/safeCall dropped.
- [i] `repl.ts:88-92` added left-check; arr's dead `dep` binding dropped; `update-compile-context` locator method unported (ts:179-197); `runtime` field dropped from makeRepl record. `Locator` interface: `_equals` dropped everywhere, `getUncached?`/`realPath?` added — locator identity is now uri-string keying (undocumented rule).
- [i] `cli-module-loader.ts:343-345` — added unreachable "Unknown url-file-mode" raise; ts:47-56 + pyret.ts:162 — purpose-built repr formatters replace torepr.

### locators/*.ts, cmdline.ts, builtin-modules.ts, sha256.ts, browser.ts
Verified: all locator methods present (only `_equals` dropped); builtin search paths,
precedence, and error strings identical; cmdline Param/ParamRepeat variants, errors,
usage strings verbatim (incl. the `curIndex + 1` quirk, NOTEd at cmdline.ts:463);
sha256 inputs unchanged ⇒ cache keys/mangled names identical.
- [~] `builtin.ts:168-178` — `module-as-string` 3-for-4 arity bug fixed by inserting `CM.computedNone` (NOTEd).
- **[!] `cmdline.ts:65-77` `ReadNumber.parse` — `jsnums.toFixnum` collapses exact rationals/bignums to JS doubles** (`--foo=1/3` → 0.333…); documented, but knowingly violates the port's own number rule.
- [!] mtime representation is threefold: `builtin.ts:66,112` + `jsfile.ts:24` fractional `mtimeMs`; `file.ts:95` integer `Number(stats.mtime)`; original floors to integer ms — matters at the `needsCompile` boundary comparisons (builtin.ts:150, 166).
- [~] `url.ts:20-58` — fetch via synchronous child `node -e` process (global fetch, 20s timeout, 256MB stdout cap); new failure modes mapped to the "system-level error" message.
- [i] `file.ts:92-96` — `statSync` replaces open-file + `lstatSync` (symlink mtime + missing-file error text differ); `npm.ts:17-19` — `require.resolve` replaces browserify resolve, bare `Error`, drops a stray console.log; `cmdline.ts:21-24` — argv read at module load (node coupling); usage/alias iteration order (cross-cutting #1); `left`/`right` not re-exported; cmdline `check:` block (~35 tests, arr:381-514) dropped.
- [i] `builtin-modules.ts:65-173` `builtinRawLocatorFromModule` — new API; ts:40-44 pass-through runtime ⇒ `getRawDependencies` returns the mutated input record itself (shared mutation) where the original wrapped; `vm.runInNewContext` replaces secure-loader. `sha256.ts` — from-scratch FIPS-180-4 (not vendored js-sha256); WTF-8 vs U+FFFD divergence only for ill-formed strings. `browser.ts` — new aggregation entry, no original.

### srcloc.ts / error-display.ts / render-error-display.ts / pprint.ts
Verified: all srcloc methods ported incl. before/contains quirks; edNth preserves the
`3 → 'ⁿᵈ'` quirk; pprint stack-loop `format` traced case-by-case equivalent;
`joinStrLast` matches lists.arr.
- [!] ⏭️ `render-error-display.ts:19-22` `exnUnwrap` — duck-typed (`'exn' in val`) vs `isPyretException`; ts:37-51 — embed catch swallows *all* JS errors (Pyret run-task caught only Pyret raises) — genuine renderReason bugs now masked as embeds. [⏭️ Currently on an untouched error-while-erroring path. Would only matter if we threw a bare kind of `{ method render-reason(self, ...): ... end }`, which is sort of weird to do because that was a Pyret-level idea, and the TS compiler has its own notion of compile errors (and how to package them up at the interface to CPO). Verified inert: instrumented the embed catch across the type-check (211) + parity (17) suites — no embedded compiler value ever had a `render-reason` (they're types/numbers/uris/branches), so both compilers hit the same embed-display fallback.]
- [i] ✅ `srcloc.ts:12-14` `stringRepr` = JSON.stringify — caused the trailing `cmcode(loc)` in error messages to be `srcloc("file:///..")` instead of `srcloc(file:///..)`. I deeply don't care which we print (I have a faint preference for the former) but this fix [`289d52db2`] makes them align with Pyret-of-today, which is the right visible behavior to keep having. added `equals`/`toString`/`dummyLoc` support members. `error-display.ts:138-145` — `[sequence: ...]` construction objects → variadic functions (array-taking `make` form gone). `pprint.ts:214` `number()` widened, relies on boxed toString (verified for the tower).

---

## Verified-parity checklist (checked, clean — no action)

- Gensym / make-atom / newExistential call order: desugar family, resolve-scope,
  anf, type-check (all traced site-by-site).
- type-defaults tables (705 keys), compile-structs runtime-provides/globals tables,
  builtin locator search paths, cmdline options/strings.
- On-disk compiled-module format, .jarr standalone format, cache-file naming,
  worklist ordering + dirty-checking, sha256 hash inputs.
- j-str escaping (byte-identical to runtime.js), pprint algorithm, edNth,
  ConcatList fold orders, sortBy quirk-fidelity.
- Persistent-dict copy discipline in resolve-scope, type-check-structs, ast-util,
  compile-structs (no aliasing bugs found anywhere).
- No structural-`==`-as-`===` violations found in any file.
