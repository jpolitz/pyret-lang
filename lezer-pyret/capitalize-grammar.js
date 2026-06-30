// P4 prep: make every nonterminal an emitted Lezer NODE by capitalizing its
// first letter (Lezer: a rule whose name starts uppercase shows up in the tree).
// Whole-word replacement over the nonterminal set only — terminals (UPPER),
// precedence/ambig labels (after ! / ~), and @-keywords are left untouched.
// Cosmetic for the LR automaton, so accept/reject is unchanged (re-verified).
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "pyret.grammar");
let g = fs.readFileSync(SRC, "utf8");

// Nonterminals = LHS rule names: lines like `name { ... }`
const nts = new Set();
for (const m of g.matchAll(/^([a-z][A-Za-z0-9_]*)\s*\{/gm)) nts.add(m[1]);

// Capitalize first letter; keep the rest (incl. underscores) for reversible mapping.
const cap = (n) => n[0].toUpperCase() + n.slice(1);

// Replace each nonterminal as a whole word everywhere (defs + refs).
// \b respects underscores as word chars, so `expr` won't match inside `app_expr`.
for (const n of nts) {
  g = g.replace(new RegExp("\\b" + n + "\\b", "g"), cap(n));
}

fs.writeFileSync(path.join(__dirname, "pyret.named.grammar"), g);
// name map for the comparison harness: Lezer node name -> RNGLR/BNF name
const map = {};
for (const n of nts) map[cap(n)] = n.replace(/_/g, "-");
fs.writeFileSync(path.join(__dirname, "namemap.json"), JSON.stringify(map, null, 0));
console.log("nonterminals capitalized:", nts.size, "-> pyret.named.grammar, namemap.json");
