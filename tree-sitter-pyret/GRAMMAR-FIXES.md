# Grammar/scanner gaps to fix (phase 2)

Baseline differential run over 571 corpus files (after grammar v1 + core lowering):
- 82 files have tree-sitter CST errors or parse failures.
- **18 of those also error in the reference parser → ignorable** (genuinely invalid programs).
- **64 are real grammar bugs** (reference parses them, tree-sitter does not).

These fixes touch `grammar.js` / `src/scanner.c` and require `tree-sitter generate` +
`node-gyp build`, which would disrupt any process using the built `.node` (e.g. the
lowering fork's harness runs). DO THESE IN A CLEAN WINDOW (no other process loading the
grammar), then re-run `node harness/analyze-errors.ts` and `node harness/diff.ts --all`.

## Categories (from harness/analyze-errors.ts; "in <rule>" = where error-recovery landed,
## NOT necessarily the root cause — confirm with minimal repros)

1. **PARSE-THREW (24, scanner crash "Invalid argument")** — HARD CRASH, highest priority.
   - Examples: `code.pyret.org/.../chart.arr`, `bar-chart-test.arr`,
     `lang/pitometer/programs/1_empty-with-comments.arr` (comments-only file).
   - Minimal repros tried (empty, single comment, block/nested comments, triple-strings,
     provide *, import) all parse OK — trigger not yet isolated. Bisect an actual throwing
     file. Likely a scanner path that returns a zero-width/invalid token or advances past
     EOF, producing an invalid node range that node-tree-sitter rejects.

2. **`a.[b]` dot-bracket access (CONFIRMED real gap)** — `z = a.[b]` errors.
   - This is `expr DOT LBRACK binop-expr RBRACK`? Check BNF — `tuple-get` is `expr DOT LBRACE
     NUMBER RBRACE`; `.[` is a distinct access form. Verify against parse-pyret/grammar.

3. **ERROR in fun_expr (12)** — snippets involve `where:` and `obj.[name]`. Some are the
   `.[` gap (#2). Re-test `where:` blocks in isolation (they parse OK alone — context-driven).

4. **ERROR in check_expr (9) / check_test (6)** — `load-table:` as expr, `[matrix(1,2):]`
   construct with a call as the constructor, object literal after `is`, curried `(_ + _)(2)`,
   `raises-satisfies`. Likely construct-expr-with-complex-constructor and/or postfix-prec
   interactions.

5. **ERROR in bracket_expr (6)** — `[list: ...]`, `[array: 1,2,]`, `T.raw-row: {...}` —
   construct-expr vs bracket-expr; trailing commas. Re-test (simple `[list:...]` parses OK).

6. **ERROR in app_expr (6)** — `g <> 1`, `repeated == required-once`, `num-rows > 0`. These
   parse FINE in isolation; the real cause is an earlier construct in the file. Re-diagnose
   from the true first divergence, not the recovery point.

7. **import_stmt (4)** — `import "image2.arr" as image` (string-literal import source). Check
   whether reference accepts this (old syntax); several are in lang/examples/world/.

8. Singletons: lambda_expr/block/let_expr/data_with/cases_expr/data_expr/if_expr/construct_expr
   (1-3 each) — likely fallout of #2/#4/#5; re-bucket after those.

## Also noted by the grammar fork
- Several `conflicts:` flagged "unnecessary" by tree-sitter — prune to avoid spurious GLR
  splits that could allow ambiguous parses (a fidelity risk).
- Scanner edge cases not differentially verified vs the JS tokenizer: `else if`/`is==`
  extension marking, trailing-`.`/`e` number backup, `~`/sign + BAD-NUMBER, line-comment-at-EOF
  priorWhitespace. Build a token-stream differential test (scanner vs pyret-tokenizer.js).
