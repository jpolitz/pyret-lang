# Pyret CodeMirror 6 + Lezer demo

A standalone CodeMirror 6 editor for Pyret, backed by the Lezer grammar in
`../pyret.named.grammar`. **Plain editor only** — syntax highlighting,
indentation, and code folding. Nothing is compiled or run.

## Launch

```sh
cd lezer-pyret/cm6-demo
npm install            # first time only
npm run build          # bundles index.js -> bundle.js
python3 -m http.server 8099
# then open http://localhost:8099
```

`npm run build` is just:

```sh
esbuild index.js --bundle --format=iife \
  --loader:.arr=text --loader:.amdtext=text --loader:.grammar=text \
  --outfile=bundle.js
```

## What to look for

- **Syntax highlighting**: keywords (`fun`, `data`, `cases`, `if`, `provide`,
  `method`, …), strings, numbers, booleans, operators, identifiers, brackets.
- **Indentation**: press Enter inside a `...: ... end` block (or `{ ... }`) and
  the new line indents one unit; lines starting `end`/`}` dedent.
- **Folding**: the fold gutter (left) shows triangles on block headers
  (`fun`/`data`/`cases`/`check`/`if`/`method`/lambda/object/…); click to collapse
  to the closing `end`/`}`.
- **Self-check**: the header shows `SELF-CHECK OK (nodes=…, errors=0,
  highlightSpans=…)`, logged to the console too — it parses the sample with the
  Lezer parser and confirms zero error nodes plus many highlight spans.

## How it works

The grammar uses an **external tokenizer that replays Pyret's own token stream**
(see `../PLAN.md`, `../lezer-run.js`). Pyret's tokenizer is an AMD module pair
(`pyret-tokenizer` → `jglr` → `rnglr` → `cyclicJSON`); `pyret-tokenizer.js` loads
those four source files (copied into `vendor/*.amdtext`) as text and `eval`s them
under a tiny captured `define` shim, exposing the same `Tokenizer` singleton the
Node oracle uses.

`pyret-language.js` builds the Lezer parser with `buildParser`, attaches
`styleTags` / `indentNodeProp` / `foldNodeProp`, and wraps it as an
`LRLanguage` + `LanguageSupport`. The parser's `createParse` is overridden to
tokenize the whole document with Pyret first, tile whitespace/comment gaps as a
`Space` token (keyed by absolute char position), then delegate to the inner LR
parser (full reparse — the replay tokenizer is not incremental in this demo).

### Comment-highlighting caveat

Pyret's tokenizer **skips comments** (they're in its `ignore` set), so comments
never reach the Lezer tree and cannot be highlighted by the grammar. As a
lightweight stand-in, `pyret-comments.js` decorates `#|…|#` (nested) and `#…`
comments with a regex overlay that skips string literals. A `#` inside an exotic
string could still be mis-highlighted; the real editor path will want a native
tokenizer that surfaces comments.

## Files

- `index.html` / `index.js` — page + editor wiring and the in-page self-check.
- `pyret-language.js` — Lezer parser build, token replay, highlight/indent/fold,
  `LanguageSupport`.
- `pyret-tokenizer.js` — browser loader for Pyret's AMD tokenizer (define shim).
- `pyret-comments.js` — regex comment overlay (see caveat).
- `sample.arr` — the program loaded into the editor.
- `vendor/*.amdtext` — copies of Pyret's tokenizer/jglr sources (text-loaded).
- `verify.js` / `verify-bundle.cjs` — headless Node check of the parse+highlight
  path (`node verify-bundle.cjs`).
- `test-tokenizer.js` — Node smoke test of the tokenizer shim (`node test-tokenizer.js`).
