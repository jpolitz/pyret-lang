// P2 runner: build the Lezer parser from pyret.grammar, feed it Pyret's own
// token stream (replayed via an external tokenizer), and report accept/reject.
const fs = require("fs");
const path = require("path");
const { buildParser } = require("@lezer/generator");
const { ExternalTokenizer } = require("@lezer/lr");
const { load } = require("./oracle");

const san = (n) => n.replace(/-/g, "_");

let parser = null, TERMS = null, Tok = null;
let CUR = new Map(); // startChar -> {e, term}

async function init() {
  const { T } = await load();
  Tok = T.Tokenizer;
  const grammarFile = process.env.GRAMMAR_FILE || "pyret.grammar";
  const grammar = fs.readFileSync(path.join(__dirname, grammarFile), "utf8");
  parser = buildParser(grammar, {
    externalTokenizer: (name, terms) => {
      TERMS = terms;
      return new ExternalTokenizer((input) => {
        const t = CUR.get(input.pos);
        if (!t || t.term == null) return; // unknown/no token -> recovery -> reject
        input.acceptTokenTo(t.term, t.e);
      });
    },
  });
  return parser;
}

function tile(str) {
  Tok.tokenizeFrom(str);
  const map = new Map();
  let pos = 0;
  const len = str.length;
  let prev = 0;
  while (Tok.hasNext()) {
    const t = Tok.next();
    if (t.name === "EOF") break;
    const s = t.pos.startChar, e = t.pos.endChar;
    if (s > prev) map.set(prev, { e: s, term: TERMS.Space });
    const term = TERMS[san(t.name)];
    // capture the tokenizer's value (e.g. STRING is unescaped, quotes kept) so the
    // adapter can use the real terminal value rather than a raw src.slice.
    map.set(s, { e, term: term === undefined ? null : term, value: t.value });
    prev = e;
  }
  if (prev < len) map.set(prev, { e: len, term: TERMS.Space });
  return map;
}

// { accepts, errors }
function accepts(str) {
  CUR = tile(str);
  const tree = parser.parse(str);
  let errs = 0;
  const c = tree.cursor();
  do { if (c.type.isError) errs++; } while (c.next());
  return { accepts: errs === 0, errors: errs };
}

function firstError(str) {
  CUR = tile(str);
  const tree = parser.parse(str);
  const c = tree.cursor();
  do { if (c.type.isError) return { from: c.from, to: c.to }; } while (c.next());
  return null;
}

function treeString(str) {
  CUR = tile(str);
  return parser.parse(str).toString();
}

// Nested {name, children} object built from the Lezer tree via cursor.
function lezerTree(str) {
  CUR = tile(str);
  const tree = parser.parse(str);
  const c = tree.cursor();
  function build() {
    const node = { name: c.name, from: c.from, to: c.to, children: [] };
    if (c.firstChild()) {
      do { node.children.push(build()); } while (c.nextSibling());
      c.parent();
    } else {
      // leaf: attach the tokenizer's value if a token exactly covers [from,to]
      const ti = CUR.get(node.from);
      if (ti && ti.e === node.to && ti.value !== undefined) node.value = ti.value;
    }
    return node;
  }
  return build();
}

// Raw parse path for timing: tile (incl. Pyret tokenize) + Lezer parse, no extras.
function rawParse(str) { CUR = tile(str); return parser.parse(str); }
function tileOnly(str) { return tile(str); }

module.exports = { init, accepts, firstError, treeString, lezerTree, rawParse, tileOnly };

if (require.main === module) {
  (async () => {
    try {
      await init();
      console.log("BUILD OK. terminals in parser:", Object.keys(TERMS).length);
      for (const s of ["fun foo<A>(): 5 end", "map<A>", "(map < A, B > (id))",
                       "let x = 10, y = 12: x + y end", "5 + 6", "spy: x end"]) {
        console.log(JSON.stringify(s), accepts(s));
      }
    } catch (e) {
      console.log("BUILD FAILED:\n" + (e.message || e));
    }
  })();
}
