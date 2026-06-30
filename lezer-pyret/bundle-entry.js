// Self-contained Lezer-for-Pyret frontend bundle ENTRY.
//
// esbuild bundles this (+ @lezer/generator, @lezer/lr, to-rnglr.js, namemap.json,
// and the named grammar text) into ONE CommonJS file `lezer-bundle.js` that
// parse-pyret.js loads as a native require. It exposes a single function:
//
//   lezerParseToRnglr(pyretTokens, src) -> RNGLR-shaped parse tree
//
// where `pyretTokens` is the array produced by Pyret's own tokenizer for `src`
// (objects with {name, value, startChar, endChar}); we replay that token stream
// through a Lezer external tokenizer (tiling whitespace/comment gaps as `Space`),
// parse with the grammar built by `buildParser` at load time, then reshape the
// Lezer tree into the same node shape RNGLR's constructUniqueParse produces (via
// to-rnglr.js), so parse-pyret's in-closure translate() consumes it unchanged.
//
// On a Lezer parse error we throw an Error tagged `.lezerParseError = {from,to}`
// so the caller can map it onto Pyret's canonical parse-error path.
//
// This factors tile()+externalTokenizer out of lezer-run.js, but takes a token
// ARRAY (handed in by the caller's tokenizer) rather than running the tokenizer
// itself, so the bundle has no dependency on the Pyret runtime/tokenizer.

const { buildParser } = require("@lezer/generator");
const { ExternalTokenizer } = require("@lezer/lr");
const { toRnglr } = require("./to-rnglr.js");
// esbuild loads the grammar as text (loader: { '.grammar': 'text' }).
const grammarText = require("./pyret.named.grammar");

const san = (n) => n.replace(/-/g, "_");

let parser = null;
let TERMS = null;
// startChar -> { e:endChar, term, value } for the current parse; the external
// tokenizer reads this. Single-threaded Node, set fresh before each parse.
let CUR = new Map();

function build() {
  if (parser) return parser;
  parser = buildParser(grammarText, {
    externalTokenizer: (name, terms) => {
      TERMS = terms;
      return new ExternalTokenizer((input) => {
        const t = CUR.get(input.pos);
        if (!t || t.term == null) return; // unknown/no token -> recovery -> error node
        input.acceptTokenTo(t.term, t.e);
      });
    },
  });
  return parser;
}

// Build the CUR map from a Pyret token array, tiling whitespace/comment gaps as
// `Space`. Mirrors lezer-run.js tile(), but consumes a pre-tokenized array.
function tileTokens(tokens, len) {
  const map = new Map();
  let prev = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.name === "EOF") break;
    const s = t.startChar, e = t.endChar;
    if (s > prev) map.set(prev, { e: s, term: TERMS.Space });
    const term = TERMS[san(t.name)];
    // capture the tokenizer's value (STRING unescaped, quotes kept, etc.) so the
    // adapter uses the real terminal value rather than a raw src.slice.
    map.set(s, { e, term: term === undefined ? null : term, value: t.value });
    prev = e;
  }
  if (prev < len) map.set(prev, { e: len, term: TERMS.Space });
  return map;
}

// Nested {name, from, to, children, value?} object built from the Lezer tree.
function buildNested(tree) {
  const c = tree.cursor();
  function rec() {
    const node = { name: c.name, from: c.from, to: c.to, children: [] };
    if (c.firstChild()) {
      do { node.children.push(rec()); } while (c.nextSibling());
      c.parent();
    } else {
      const ti = CUR.get(node.from);
      if (ti && ti.e === node.to && ti.value !== undefined) node.value = ti.value;
    }
    return node;
  }
  return rec();
}

function firstError(tree) {
  const c = tree.cursor();
  do { if (c.type.isError) return { from: c.from, to: c.to }; } while (c.next());
  return null;
}

// pyretTokens: [{ name, value, startChar, endChar }, ...] (Pyret tokenizer output).
function lezerParseToRnglr(pyretTokens, src) {
  if (process.env.LEZER_TRACE) process.stderr.write("[LEZER-FRONTEND] parsing " + src.length + " chars\n");
  build();
  CUR = tileTokens(pyretTokens, src.length);
  const tree = parser.parse(src);
  const err = firstError(tree);
  if (err) {
    const e = new Error("LEZER_PARSE_ERROR");
    e.lezerParseError = err;
    throw e;
  }
  return toRnglr(buildNested(tree), src);
}

module.exports = { lezerParseToRnglr };
