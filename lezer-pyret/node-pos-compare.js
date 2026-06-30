// Diagnostic: strict field-by-field comparison of toRnglr(lezerTree) vs oracle.tree
// (name, terminal value, pos all 6 fields, kids recursively). This is STRICTER than
// AST equivalence: it also checks the positions of EMPTY (nullary) nonterminals,
// which RNGLR positions via unpredictable SPPF sibling/next-token rules that the
// adapter does not replicate. Those positions are never read by translate(), so they
// do NOT affect AST equivalence (see ast-equiv.js = 553/553). Use this tool to see
// exactly which empty-node positions diverge.
// Run: GRAMMAR_FILE=pyret.named.grammar node node-pos-compare.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const oracle = require("./oracle");
const lez = require("./lezer-run");
const { toRnglr } = require("./to-rnglr");

const REPO = path.join(__dirname, "..");
function listArr() {
  return execSync(`find "${REPO}" -name '*.arr' -not -path '*/node_modules/*'`,
    { encoding: "utf8", maxBuffer: 1 << 26 }).trim().split("\n").filter(Boolean);
}
const P = ["startRow","startCol","startChar","endRow","endCol","endChar"];
function diff(a, b, where) {
  if (a.name !== b.name) return `name @${where}: rnglr=${a.name} lez=${b.name}`;
  const av = a.value, bv = b.value;
  if ((av === undefined) !== (bv === undefined) || (av !== undefined && av !== bv))
    return `value @${where}/${a.name}: rnglr=${JSON.stringify(av)} lez=${JSON.stringify(bv)}`;
  for (const k of P) if ((a.pos[k]|0) !== (b.pos[k]|0))
    return `pos.${k} @${where}/${a.name}: rnglr=${a.pos[k]} lez=${b.pos[k]}`;
  const ak = a.kids||[], bk = b.kids||[];
  if (ak.length !== bk.length) return `arity @${where}/${a.name}: rnglr=${ak.length} lez=${bk.length}`;
  for (let i=0;i<ak.length;i++){ const d = diff(ak[i], bk[i], where+"/"+a.name+"["+i+"]"); if (d) return d; }
  return null;
}

async function main(){
  await lez.init(); await oracle.load();
  const files = listArr();
  let considered=0, ok=0; const fails=[];
  for (const f of files){
    const text = fs.readFileSync(f,"utf8");
    const o = await oracle.parse(text);
    if (!o.accepts) continue;
    considered++;
    let d;
    try { d = diff(o.tree, toRnglr(lez.lezerTree(text), text), ""); }
    catch(e){ d = "EXC: "+e.message; }
    if (!d) ok++; else fails.push({f:path.relative(REPO,f), d});
  }
  console.log(`deep node-tree equality: ${ok}/${considered}`);
  const hist={};
  for (const x of fails){ const sig=x.d.split(":")[0].replace(/@.*/,"").trim(); hist[sig]=(hist[sig]||0)+1; }
  for (const [k,v] of Object.entries(hist).sort((a,b)=>b[1]-a[1])) console.log(`  ${v}  ${k}`);
  for (const x of fails.slice(0,12)) console.log(`  ${x.f}: ${x.d}`);
}
main();
