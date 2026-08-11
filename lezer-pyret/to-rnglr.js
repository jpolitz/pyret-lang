// P5 adapter: reshape a Lezer named-grammar tree (from lezer-run.lezerTree, which
// now carries per-node `from`/`to`) into nodes shaped EXACTLY like RNGLR's
// constructUniqueParse tree, so the canonical `translate()` in parse-pyret.js can
// consume it unchanged.
//
// RNGLR node shape (see oracle.parse(...).tree):
//   nonterminal: { name, kids:[...], pos:{startRow,startCol,startChar,endRow,endCol,endChar} }
//   terminal:    { name, value:"<src slice>", pos:{...}, kids:[] }
// rows are 1-based; cols and chars are 0-based; a token's pos excludes surrounding
// whitespace; empty (nullary) nonterminals are zero-width.
//
// Transformations:
//  - name: namemap (Lezer `Binop_expr` -> `binop-expr`), `Program` -> `program`,
//    terminals (not in namemap) -> name.replace(/_/g,'-') (e.g. LOAD_TABLE->LOAD-TABLE).
//  - DROP `Space` nodes.
//  - terminals: value = src.slice(from,to); pos from from/to.
//  - non-empty nonterminals: pos = combine(firstKid, lastKid) (== RNGLR's
//    defaultAction, which combines the first and last child SrcLocs and therefore
//    excludes boundary whitespace).
//  - empty (nullary) nonterminals: zero-width pos at the END of the previous token
//    in document order. RNGLR positions an epsilon reduction at the start of the
//    whitespace gap before the lookahead token (= end of the last shifted token);
//    we replicate that by threading the running "last terminal end" through a
//    left-to-right (document-order) traversal. (A handful of RNGLR empties take a
//    sibling/next-token offset instead, but those nodes' positions are not read by
//    translate(), so the produced AST is unaffected — verified by ast-equiv.js.)
//  - RECONSTRUCT the 2 inlined EBNF wrappers `comma-binops` / `comma-ann-field`:
//    the Lezer named grammar inlines `item (COMMA item)* (COMMA)?` directly into
//    `trailing-opt-comma-binops` / `trailing-opt-comma-ann-field`, but translate()'s
//    handlers do `tr(kids[0])` expecting a single `comma-binops`/`comma-ann-field`
//    child. So wrap all kids EXCEPT a trailing COMMA into a synthetic wrapper node.

const namemap = require("./namemap.json");

function mapName(n) {
  if (n === "Program") return "program";
  return namemap[n] || n.replace(/_/g, "-");
}
const isNonterminal = (n) => n === "Program" || Object.prototype.hasOwnProperty.call(namemap, n);

// line-start offsets so we can turn a char offset into 1-based row + 0-based col,
// matching jglr's tokenizer (curLine starts at 1, curCol at 0, '\n' -> next line col 0).
function lineStarts(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
}
function rowColAt(starts, off) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= off) lo = mid; else hi = mid - 1;
  }
  return { row: lo + 1, col: off - starts[lo] };
}
function mkPos(starts, from, to) {
  const a = rowColAt(starts, from), b = rowColAt(starts, to);
  const p = { startRow: a.row, startCol: a.col, startChar: from,
              endRow: b.row, endCol: b.col, endChar: to };
  // SrcLoc-compatible methods (some translators call node.kids[i].pos.combine(...))
  p.posAtStart = () => mkPos(starts, from, from);
  p.posAtEnd = () => mkPos(starts, to, to);
  p.combine = function (that) { // mirrors jglr SrcLoc.prototype.combine
    if (this.startChar < that.startChar) {
      return this.endChar < that.endChar
        ? mkPos(starts, this.startChar, that.endChar)
        : mkPos(starts, this.startChar, this.endChar);
    } else {
      return this.endChar < that.endChar
        ? mkPos(starts, that.startChar, that.endChar)
        : mkPos(starts, that.startChar, this.endChar);
    }
  };
  return p;
}

const WRAP = { "trailing-opt-comma-binops": "comma-binops",
               "trailing-opt-comma-ann-field": "comma-ann-field" };

// leftmost terminal's start offset, so leading empty nonterminals (e.g. an empty
// prelude before leading comments) get RNGLR's "start of first token" position
// rather than 0.
function firstTerminalFrom(n) {
  if (!isNonterminal(n.name) && n.name !== "Space") return n.from;
  for (const c of (n.children || [])) { const r = firstTerminalFrom(c); if (r != null) return r; }
  return null;
}

function toRnglr(lezNode, src) {
  const starts = lineStarts(src);
  const len = src.length;
  // Zero-width pos for an empty (nullary) nonterminal. RNGLR positions an epsilon
  // reduction at the start of the whitespace gap before the lookahead token (= end
  // of the last shifted token). When the lookahead is EOF with no trailing
  // whitespace (the last token ends exactly at EOF, or the whole file is
  // empty/comment-only), RNGLR uses the EOF token position = {len+1} with col+1,
  // which mkPos(len+1) reproduces exactly.
  const emptyPos = (off) => off >= len ? mkPos(starts, len + 1, len + 1) : mkPos(starts, off, off);
  // end offset of the most recently emitted terminal (document order); before any
  // terminal, treat it as the first terminal's start (or EOF if there are none).
  let lastEnd = firstTerminalFrom(lezNode);
  if (lastEnd == null) lastEnd = len;

  function conv(n) {
    if (n.name === "Space") return null; // dropped, and does NOT advance lastEnd
    const name = mapName(n.name);

    if (!isNonterminal(n.name)) {
      // terminal leaf — value comes from the Pyret tokenizer (lezerTree attaches it),
      // which unescapes STRING contents etc.; fall back to a raw slice.
      const pos = mkPos(starts, n.from, n.to);
      lastEnd = n.to;
      const value = n.value !== undefined ? n.value : src.slice(n.from, n.to);
      return { name, value, pos, kids: [] };
    }

    // empty (nullary) nonterminal: zero-width at the previous token's end.
    if (!n.children || n.children.length === 0) {
      return { name, kids: [], pos: emptyPos(lastEnd) };
    }

    // nonterminal: convert + drop Space children (in document order)
    let kids = [];
    for (const c of n.children) { const k = conv(c); if (k) kids.push(k); }

    if (kids.length === 0) {
      // all children were Space (degenerate) -> zero-width at previous token end
      return { name, kids: [], pos: emptyPos(lastEnd) };
    }

    // reconstruct the inlined comma-list wrapper, if applicable
    const wrapName = WRAP[name];
    if (wrapName) {
      let trailingComma = null;
      if (kids[kids.length - 1].name === "COMMA") trailingComma = kids.pop();
      const wrapped = { name: wrapName, kids, pos: spanPos(starts, kids) };
      kids = trailingComma ? [wrapped, trailingComma] : [wrapped];
    }

    return { name, kids, pos: spanPos(starts, kids) };
  }

  return conv(lezNode);
}

// pos spanning kids[0]..kids[last] (mirrors RNGLR combine(firstKid, lastKid)).
function spanPos(starts, kids) {
  return mkPos(starts, kids[0].pos.startChar, kids[kids.length - 1].pos.endChar);
}

module.exports = { toRnglr, mapName };
