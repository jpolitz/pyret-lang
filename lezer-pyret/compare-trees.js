// P4: structural-equivalence measurement. Compares the Lezer tree (named nodes,
// from pyret.named.grammar) against RNGLR's constructUniqueParse tree, after
// normalization: map Lezer node names back to BNF names, and drop Lezer's `Space`
// (skip) leaves that RNGLR omits. Reports exact-match rate + diff characterization.
// Run with:  GRAMMAR_FILE=pyret.named.grammar node compare-trees.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const oracle = require("./oracle");
const lez = require("./lezer-run");
const namemap = require("./namemap.json");

const REPO = path.join(__dirname, "..");
const mapName = (n) => n === "Program" ? "program" : (namemap[n] || n.replace(/_/g, "-"));

// Nodes that carry no semantic content — pure EBNF grouping the two parsers
// expand differently. A CST->AST translation ignores them, so we splice them out
// (replace with their children) on BOTH sides before comparing.
const TRANSPARENT = new Set(["comma-binops", "comma-ann-field"]);

// Returns a list of s-expr strings (so a transparent/space node can splice in
// zero-or-more siblings).
function lezSx(n) {
  if (n.name === "Space") return [];
  const kids = n.children.flatMap(lezSx);
  const nm = mapName(n.name);
  if (TRANSPARENT.has(nm)) return kids;
  return [kids.length ? nm + "(" + kids.join(",") + ")" : nm];
}
function rnglrSx(n) {
  const kids = (n.kids || []).flatMap(rnglrSx);
  if (TRANSPARENT.has(n.name)) return kids;
  return [kids.length ? n.name + "(" + kids.join(",") + ")" : n.name];
}

// first differing position between two s-exprs (for diagnostics)
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { at: i, a: a.slice(Math.max(0, i - 30), i + 30), b: b.slice(Math.max(0, i - 30), i + 30) };
}

function listArr() {
  return execSync(`find "${REPO}" -name '*.arr' -not -path '*/node_modules/*'`,
    { encoding: "utf8", maxBuffer: 1 << 26 }).trim().split("\n").filter(Boolean);
}

async function main() {
  await lez.init();
  await oracle.load();
  const which = process.argv[2];
  const files = which ? [path.join(REPO, which)] : listArr();

  let considered = 0, match = 0;
  const diffs = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const o = await oracle.parse(text);
    if (!o.accepts) continue;                  // only compare where oracle gives a unique tree
    considered++;
    const rs = rnglrSx(o.tree)[0];
    let ls;
    try { ls = lezSx(lez.lezerTree(text))[0]; } catch (e) { ls = "<lezer-error:" + e.message + ">"; }
    if (rs === ls) { match++; }
    else diffs.push({ f: path.relative(REPO, f), d: firstDiff(rs, ls), rlen: rs.length, llen: ls.length });
  }
  console.log(`=== P4 structural equivalence (Lezer vs RNGLR constructUniqueParse) ===`);
  console.log(`compared (oracle-accepted): ${considered}`);
  console.log(`exact normalized-tree match: ${match}/${considered} = ${(100*match/Math.max(1,considered)).toFixed(1)}%`);
  console.log(`mismatches: ${diffs.length}`);
  // Bucket mismatches by the diverging node name (first word at the diff point).
  const hist = {};
  for (const d of diffs) {
    const tail = (d.d.a.slice(30) || "").match(/[a-zA-Z][\w-]*/);
    const sig = tail ? tail[0] : "?";
    hist[sig] = (hist[sig] || 0) + 1;
  }
  console.log("mismatch signatures (RNGLR node at first divergence):");
  for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1]))
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  for (const d of diffs.slice(0, 4)) {
    console.log(`\n  ${d.f}  (rnglr ${d.rlen} chars, lezer ${d.llen})`);
    console.log(`    @${d.d.at} rnglr: ...${d.d.a}...`);
    console.log(`    @${d.d.at} lezer: ...${d.d.b}...`);
  }
  if (diffs.length > 20) console.log(`  ... +${diffs.length - 20} more`);
}
main();
