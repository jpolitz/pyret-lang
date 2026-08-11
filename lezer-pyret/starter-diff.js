// Differential over an EXTERNAL corpus dir (e.g. bootstrapworld/starter-files).
// Compares RNGLR oracle vs Lezer on (1) accept/reject and (2) AST equivalence.
// Usage: GRAMMAR_FILE=pyret.named.grammar node starter-diff.js <dir>
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const oracle = require("./oracle");
const lez = require("./lezer-run");
const { toRnglr } = require("./to-rnglr");
const { makeTranslateTree, ser } = require("./mock-runtime");

const DIR = process.argv[2];
if (!DIR) { console.error("need a corpus dir"); process.exit(1); }

function listArr() {
  return execSync(`find "${DIR}" -name '*.arr' -not -path '*/.git/*'`,
    { encoding: "utf8", maxBuffer: 1 << 26 }).trim().split("\n").filter(Boolean);
}

async function main() {
  await lez.init();
  await oracle.load();
  const translateTree = makeTranslateTree();
  const files = listArr();

  let arAgree = 0, oAcc = 0, both = 0, astSame = 0, astCompared = 0;
  const arDis = [], astDis = [], errs = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const rel = path.relative(DIR, f);
    let o, l;
    try { o = (await oracle.parse(text)).accepts; } catch (e) { o = false; }
    try { l = lez.accepts(text).accepts; } catch (e) { l = false; }
    if (o) oAcc++;
    if (o === l) arAgree++; else arDis.push({ rel, o, l });
    if (o && l) {
      both++;
      // AST equivalence on agreed-accept files
      astCompared++;
      let rs, ls;
      try { rs = ser(translateTree((await oracle.parse(text)).tree, rel)); }
      catch (e) { errs.push({ rel, who: "rnglr", e: e.message }); continue; }
      try { ls = ser(translateTree(toRnglr(lez.lezerTree(text), text), rel)); }
      catch (e) { errs.push({ rel, who: "lezer", e: e.message }); continue; }
      if (rs === ls) astSame++; else astDis.push({ rel });
    }
  }
  console.log(`=== starter-files differential (${path.basename(DIR)}) ===`);
  console.log(`files: ${files.length}`);
  console.log(`accept/reject agreement: ${arAgree}/${files.length} = ${(100*arAgree/files.length).toFixed(1)}%`);
  console.log(`oracle accepts: ${oAcc}/${files.length}   both accept: ${both}`);
  console.log(`AST equivalence (on both-accept): ${astSame}/${astCompared} = ${(100*astSame/Math.max(1,astCompared)).toFixed(1)}%`);
  console.log(`translate errors: ${errs.length}`);
  if (arDis.length) {
    console.log(`\naccept/reject DISagreements (${arDis.length}):`);
    for (const d of arDis.slice(0, 30)) console.log(`  ${d.o?"oracle:ACC lez:REJ":"oracle:REJ lez:ACC"}  ${d.rel}`);
  }
  if (astDis.length) {
    console.log(`\nAST disagreements (${astDis.length}):`);
    for (const d of astDis.slice(0, 30)) console.log(`  ${d.rel}`);
  }
  for (const e of errs.slice(0, 15)) console.log(`  ERR ${e.who}: ${e.rel} :: ${e.e}`);
}
main();
