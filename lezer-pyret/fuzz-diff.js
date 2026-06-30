// fuzz-diff.js — run a generated mutant set through RNGLR oracle vs Lezer and
// report any parity break. Usage: GRAMMAR_FILE=pyret.named.grammar node fuzz-diff.js <mutantDir>
const fs = require("fs");
const path = require("path");
const oracle = require("./oracle");
const lez = require("./lezer-run");
const { toRnglr } = require("./to-rnglr");
const { makeTranslateTree, ser } = require("./mock-runtime");

const DIR = process.argv[2];
if (!DIR) { console.error("need mutant dir"); process.exit(1); }

async function main() {
  await lez.init();
  await oracle.load();
  const translateTree = makeTranslateTree();

  const manifest = fs.readFileSync(path.join(DIR, "manifest.txt"), "utf8").split("\n").filter(Boolean);
  const meta = {};
  for (const line of fs.readFileSync(path.join(DIR, "meta.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const m = JSON.parse(line); meta["m" + m.idx + ".arr"] = m;
  }

  let n = 0, agree = 0;
  let overAccept = 0, underAccept = 0, astDiff = 0, ambig = 0, bothAcc = 0;
  const breaks = [];
  for (const f of manifest) {
    n++;
    const text = fs.readFileSync(f, "utf8");
    let o, l, count = 1;
    try { const r = await oracle.parse(text); o = r.accepts; count = r.count; } catch (e) { o = false; }
    try { l = lez.accepts(text).accepts; } catch (e) { l = false; }
    if (count > 1) ambig++;                       // RNGLR saw an ambiguous (non-unique) parse
    if (o === l) {
      agree++;
      if (o && l) {                               // AST check on agreed-accept
        bothAcc++;
        // translate() may itself throw a well-formedness error (e.g. bad operator
        // whitespace). Capture the error IDENTITY canonically so the SAME throw on
        // both sides counts as agreement (not a side-specific sentinel).
        const run = (tree) => {
          try { return "OK:" + ser(translateTree(tree, f)); }
          catch (e) { return "THROW:" + (e.pyretThrow || e.message); }
        };
        const rs = run((await oracle.parse(text)).tree);
        const ls = run(toRnglr(lez.lezerTree(text), text));
        if (rs !== ls) { astDiff++; breaks.push({ f, kind: "AST", o, l, count }); }
      }
    } else {
      if (!o && l) { overAccept++; breaks.push({ f, kind: count > 1 ? "OVER(ambig)" : "OVER", o, l, count }); }
      else { underAccept++; breaks.push({ f, kind: "UNDER", o, l, count }); }
    }
  }
  console.log(`=== fuzz differential (${path.basename(DIR)}) ===`);
  console.log(`mutants: ${n}`);
  console.log(`accept/reject agreement: ${agree}/${n} = ${(100*agree/n).toFixed(2)}%`);
  console.log(`  over-acceptance (oracle REJ, lez ACC): ${overAccept}`);
  console.log(`  under-acceptance (oracle ACC, lez REJ): ${underAccept}`);
  console.log(`AST divergence on agreed-accept: ${astDiff}/${bothAcc}`);
  console.log(`(RNGLR saw an ambiguous/non-unique parse on ${ambig} mutants)`);
  console.log(`\nPARITY BREAKS: ${breaks.length}`);
  for (const b of breaks.slice(0, 40)) {
    const m = meta[path.basename(b.f)] || {};
    console.log(`  [${b.kind}] ${path.basename(b.f)}  seed=${m.seed ? path.basename(m.seed) : "?"} op=${m.op || "?"} count=${b.count}`);
  }
  if (breaks.length > 40) console.log(`  ... +${breaks.length - 40} more`);
  // dump first few breaking sources for quick inspection
  console.log(`\n--- first breaks (source) ---`);
  for (const b of breaks.slice(0, 5)) {
    console.log(`\n### ${path.basename(b.f)} [${b.kind}] ###`);
    console.log(fs.readFileSync(b.f, "utf8").slice(0, 400));
  }
}
main();
