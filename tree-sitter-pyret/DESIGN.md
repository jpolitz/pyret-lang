# tree-sitter-pyret: design & fidelity notes

Goal: a TypeScript-driven tree-sitter frontend for Pyret that produces `ast.arr`
`Program` structures **byte-identical** (including every srcloc field) to the
existing RNGLR parser (`lang/src/js/trove/parse-pyret.js`), selectable via a
compiler flag, validated by a differential harness over every `.arr` file in the
repo.

## Architecture

```
source text
  └─ tree-sitter parser (grammar.js + src/scanner.c)   → CST
       └─ TS lowering (src-ts/lower.ts)                → Pyret AST (ast.arr Program)
            └─ compared by harness against parse-pyret.js output
```

### Why the scanner is a full tokenizer port (not tree-sitter's lexer)

Pyret's tokenization is pervasively whitespace-sensitive and context-sensitive in
ways tree-sitter's stateless internal lexer cannot express:

- `(` lexes as **PARENSPACE** (ws before), **PARENNOSPACE** (no ws, after an
  expression-ending token → function application), or **PARENAFTERBRACE** (after `{`).
  Driven by `priorWhitespace` + previous token's `parenIsForExp` flag.
- Binary operators (`+ - * / < > <= >= == =~ <> <=> ^`) require whitespace *before*
  (`mustFollow`) and *after* (`needsWs`). `<`/`>` without that whitespace lex as
  `LANGLE`/`RANGLE` (generics). `a-b` is one NAME; `a - b` is subtraction.
- Keywords (`and`, `is`, …) only match when not followed by an identifier char
  (`noFollow`), else they are part of a NAME.
- Nested block comments `#| ... |#` need a depth counter.

So: **all terminals are external tokens**, emitted by `src/scanner.c`, a faithful
port of `lang/src/js/base/pyret-tokenizer.js`. tree-sitter's lexer is bypassed.

### Srclocs

Pyret srclocs are 7-tuples `(source, start-line, start-col, start-char, end-line,
end-col, end-char)`. Columns/chars are counted in **UTF-16 code units** (JS string
indices), lines are 1-based-ish per the tokenizer's `curLine`/`curCol` init.

The TS lowering computes all srcloc fields itself from each CST node's **byte
range + the source string**, reproducing the tokenizer's exact counting. We do NOT
rely on tree-sitter's (byte-based) row/column. This also handles non-ASCII correctly.

Nonterminal node spans are built by the lowering using the same combination logic
as `parse-pyret.js` (`pos`, `pos2`/`combinePyretPos`, `.upto`, `.upto-end`,
first-kid..last-kid spans, operator-gets-precise-pos, where-clause WHERE-token pos,
etc.).

### Naming conventions

- CST rule names mirror BNF nonterminals with `-`→`_` (e.g. `binop-expr` → `binop_expr`),
  so the lowering can dispatch by rule name like `parse-pyret.js`'s `translators`.
- External token names mirror tokenizer token names (e.g. `PARENSPACE`, `NAME`).

### Parse-time errors to reproduce (from parse-pyret.js)

- bad unary app `f (x)` (app-expr with >2 kids) → `throwParseErrorBadApp`
- bad fun header `fun f (x):` (PARENSPACE in args = `bad-args`) → `throwParseErrorBadFunHeader`
- operator-whitespace on adjacent signed number stmt → `throwParseErrorBadOper`
- parse failure dispatch (EOF, unterminated string, bad number, bad oper, `::`, etc.)

## Status
- [x] scaffold + tree-sitter-cli 0.22.6 installed
- [ ] grammar.js (full BNF translation, external tokens)
- [ ] src/scanner.c (tokenizer port)
- [ ] TS lowering CST→Program
- [ ] differential harness (dump existing parser AST + diff)
- [ ] compiler flag at P.surface-parse seam
