// Standalone de-risk of lezer-bundle.js BEFORE touching the Pyret build.
// Loads ONLY the bundled frontend (self-contained: no @lezer/* off node_modules)
// + mock-runtime, tokenizes a handful of .arr files with Pyret's own tokenizer
// (exactly how parse-pyret.js will), feeds the token array to the bundle, and
// checks the resulting AST equals the RNGLR oracle's AST (via the recording mock).
//
// Run: node verify-bundle.js
const fs = require("fs");
const path = require("path");
const { lezerParseToRnglr } = require("./lezer-bundle.js"); // the BUNDLE only
const oracle = require("./oracle");                          // RNGLR + tokenizer
const { makeTranslateTree, ser } = require("./mock-runtime");

const REPO = path.join(__dirname, "..");
const FILES = [
  "lang/src/arr/compiler/ast.arr",
  "lang/src/arr/trove/lists.arr",
  "lang/src/arr/trove/option.arr",
  "lang/src/arr/trove/string-dict.arr",
  "lang/src/arr/compiler/compile-structs.arr",
];

// Reproduce parse-pyret.js's tokenization: tokenize, collect {name,value,start,end}.
function tokensFor(T, src) {
  const toks = T.Tokenizer;
  toks.tokenizeFrom(src);
  const out = [];
  while (toks.hasNext()) {
    const t = toks.next();
    if (t.name === "EOF") break;
    out.push({ name: t.name, value: t.value,
               startChar: t.pos.startChar, endChar: t.pos.endChar });
  }
  return out;
}

async function main() {
  const { T } = await oracle.load();
  await oracle.load();
  const translateTree = makeTranslateTree();
  let ok = 0, total = 0;
  for (const rel of FILES) {
    const f = path.join(REPO, rel);
    if (!fs.existsSync(f)) { console.log(`  SKIP (missing) ${rel}`); continue; }
    const src = fs.readFileSync(f, "utf8");
    const o = await oracle.parse(src);
    if (!o.accepts) { console.log(`  SKIP (oracle reject) ${rel}`); continue; }
    total++;
    const toks = tokensFor(T, src);
    let lezTree;
    try { lezTree = lezerParseToRnglr(toks, src); }
    catch (e) { console.log(`  FAIL bundle parse ${rel}: ${e.message}`); continue; }
    const rs = ser(translateTree(o.tree, rel));
    const ls = ser(translateTree(lezTree, rel));
    if (rs === ls) { ok++; console.log(`  OK  ${rel}  (AST ${rs.length} chars)`); }
    else {
      let i = 0; while (i < rs.length && i < ls.length && rs[i] === ls[i]) i++;
      console.log(`  DIFF ${rel} @${i}\n    rnglr ...${rs.slice(Math.max(0,i-40),i+40)}...\n    lezer ...${ls.slice(Math.max(0,i-40),i+40)}...`);
    }
  }
  console.log(`\nBUNDLE STANDALONE: ${ok}/${total} AST-identical to RNGLR oracle`);
  process.exit(ok === total && total > 0 ? 0 : 1);
}
main();
