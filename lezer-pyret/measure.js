// P2 milestone measurement: compare the Lezer parser vs the RNGLR oracle on
// (1) the standalone string-literal assertions in lang/tests/parse/parse.js, and
// (2) the .arr corpus. Reports agreement + lezer accept-rate on oracle-accepted.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const oracle = require("./oracle");
const lez = require("./lezer-run");

const REPO = path.join(__dirname, "..");

function parseLiterals() {
  const src = fs.readFileSync(path.join(REPO, "lang/tests/parse/parse.js"), "utf8");
  // Only single-string-literal args (skip concatenations / loop-generated cases).
  const re = /expect\(\s*parse\(\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)\s*\)\s*\.\s*(not\s*\.\s*)?toBe\(\s*false\s*\)/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const expectAccept = !!m[2];
    let str;
    try { str = eval(m[1]); } catch (e) { continue; }
    out.push({ str, expectAccept });
  }
  return out;
}

function listArr() {
  const out = execSync(
    `find "${REPO}" -name '*.arr' -not -path '*/node_modules/*'`,
    { encoding: "utf8", maxBuffer: 1 << 26 });
  return out.trim().split("\n").filter(Boolean);
}

async function main() {
  await lez.init();
  await oracle.load();
  console.log("=== P2 measurement: Lezer vs RNGLR oracle ===\n");

  // 1) parse.js literals
  const lits = parseLiterals();
  let agree = 0, byOracle = { acc: 0, rej: 0 };
  const dis = [];
  for (const { str } of lits) {
    const o = (await oracle.parse(str)).accepts;
    const l = lez.accepts(str).accepts;
    if (o) byOracle.acc++; else byOracle.rej++;
    if (o === l) agree++; else dis.push({ str, o, l });
  }
  console.log(`parse.js literals: ${lits.length} cases (oracle accepts ${byOracle.acc}, rejects ${byOracle.rej})`);
  console.log(`  agreement: ${agree}/${lits.length} = ${(100*agree/lits.length).toFixed(1)}%`);
  console.log(`  disagreements: ${dis.length}`);
  for (const d of dis.slice(0, 25))
    console.log(`    ${d.o ? "oracle:ACC lez:REJ" : "oracle:REJ lez:ACC"}  ${JSON.stringify(d.str).slice(0,70)}`);
  if (dis.length > 25) console.log(`    ... +${dis.length - 25} more`);

  // 2) .arr corpus
  const files = listArr();
  let oAcc = 0, both = 0, corpAgree = 0;
  const corpDis = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    let o, l;
    try { o = (await oracle.parse(text)).accepts; } catch (e) { o = false; }
    try { l = lez.accepts(text).accepts; } catch (e) { l = false; }
    if (o) oAcc++;
    if (o && l) both++;
    if (o === l) corpAgree++; else corpDis.push({ f: path.relative(REPO, f), o, l });
  }
  console.log(`\n.arr corpus: ${files.length} files`);
  console.log(`  oracle accepts: ${oAcc}/${files.length}`);
  console.log(`  full agreement: ${corpAgree}/${files.length} = ${(100*corpAgree/files.length).toFixed(1)}%`);
  console.log(`  of oracle-accepted, lezer also accepts: ${both}/${oAcc} = ${(100*both/Math.max(1,oAcc)).toFixed(1)}%`);
  for (const d of corpDis.slice(0, 25))
    console.log(`    ${d.o ? "oracle:ACC lez:REJ" : "oracle:REJ lez:ACC"}  ${d.f}`);
  if (corpDis.length > 25) console.log(`    ... +${corpDis.length - 25} more`);
}
main();
