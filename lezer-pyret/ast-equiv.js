// P5 PRIMARY DELIVERABLE: AST equivalence over the corpus.
// For every oracle-accepted .arr file, drive the canonical translate() (reused
// UNCHANGED via the additive translateTree export) on BOTH:
//   - the RNGLR tree  (oracle.parse(text).tree), and
//   - the Lezer tree reshaped to RNGLR-node form (toRnglr(lezerTree(text), text)),
// and compare the resulting Pyret ASTs via a canonical serialization (mock-runtime).
// Identical strings <=> identical ASTs.
//
// Run: GRAMMAR_FILE=pyret.named.grammar node ast-equiv.js [optional/rel/path.arr]
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const oracle = require("./oracle");
const lez = require("./lezer-run");
const { toRnglr } = require("./to-rnglr");
const { makeTranslateTree, ser } = require("./mock-runtime");

const REPO = path.join(__dirname, "..");
function listArr() {
  return execSync(`find "${REPO}" -name '*.arr' -not -path '*/node_modules/*'`,
    { encoding: "utf8", maxBuffer: 1 << 26 }).trim().split("\n").filter(Boolean);
}
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { at: i, a: a.slice(Math.max(0, i - 40), i + 40), b: b.slice(Math.max(0, i - 40), i + 40) };
}

async function main() {
  await lez.init();
  await oracle.load();
  const translateTree = makeTranslateTree();
  const which = process.argv[2];
  const files = which ? [path.join(REPO, which)] : listArr();

  let considered = 0, match = 0;
  const diffs = [], errs = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const o = await oracle.parse(text);
    if (!o.accepts) continue;
    considered++;
    const rel = path.relative(REPO, f);
    let rs, ls;
    try { rs = ser(translateTree(o.tree, rel)); }
    catch (e) { errs.push({ f: rel, side: "rnglr", e: e.message }); continue; }
    try { ls = ser(translateTree(toRnglr(lez.lezerTree(text), text), rel)); }
    catch (e) { errs.push({ f: rel, side: "lezer", e: e.message }); continue; }
    if (rs === ls) match++;
    else diffs.push({ f: rel, d: firstDiff(rs, ls), rlen: rs.length, llen: ls.length });
  }

  console.log(`=== P5 AST equivalence (Lezer-driven translate vs RNGLR-driven translate) ===`);
  console.log(`compared (oracle-accepted): ${considered}`);
  console.log(`IDENTICAL ASTs: ${match}/${considered} = ${(100 * match / Math.max(1, considered)).toFixed(1)}%`);
  console.log(`AST mismatches: ${diffs.length}   translate errors: ${errs.length}`);
  for (const e of errs.slice(0, 20)) console.log(`  ERR ${e.side} ${e.f}: ${e.e}`);
  for (const d of diffs.slice(0, 20)) {
    console.log(`\n  ${d.f}  (rnglr ${d.rlen} chars, lezer ${d.llen})`);
    console.log(`    @${d.d.at} rnglr: ...${d.d.a}...`);
    console.log(`    @${d.d.at} lezer: ...${d.d.b}...`);
  }
  if (diffs.length > 20) console.log(`  ... +${diffs.length - 20} more mismatches`);
}
main();
