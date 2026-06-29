// Extract every AST constructor's field-name list (in order) from ast.arr.
import * as fs from "node:fs";
const src = fs.readFileSync("/home/exedev/pyret-lang/lang/src/arr/trove/ast.arr", "utf8");
const out: Record<string, string[]> = {};
// Capture "| name(" with args, AND nullary "| name" (no following "(").
const re = /\|\s*([a-z][a-z0-9-]*)\s*(\()?/g;
let m: RegExpExecArray | null;
while ((m = re.exec(src)) !== null) {
  const name = m[1];
  if (!m[2]) { // nullary constructor (no paren)
    // Avoid false positives: only accept if it looks like a constructor line.
    if (!(name in out)) out[name] = [];
    continue;
  }
  let i = re.lastIndex;
  let depthParen = 1, depthAngle = 0;
  let buf = "";
  while (i < src.length && depthParen > 0) {
    const c = src[i];
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "(") depthParen++;
    else if (c === ")") { depthParen--; if (depthParen === 0) break; }
    else if (c === "<") depthAngle++;
    else if (c === ">") { if (depthAngle > 0) depthAngle--; }
    buf += c; i++;
  }
  const fields: string[] = [];
  let dp = 0, da = 0, cur = "";
  for (const ch of buf) {
    if (ch === "(") dp++;
    else if (ch === ")") dp--;
    else if (ch === "<") da++;
    else if (ch === ">") { if (da>0) da--; }
    if (ch === "," && dp === 0 && da === 0) { fields.push(cur); cur=""; }
    else cur += ch;
  }
  if (cur.trim()) fields.push(cur);
  const names = fields.map(f => f.trim().split("::")[0].trim()).filter(Boolean);
  out[name] = names;
}
fs.writeFileSync("corpus/ast-ctors.json", JSON.stringify(out));
console.log(`extracted ${Object.keys(out).length} constructors`);
for (const k of ["s-program","s-fun","s-lam","s-check-test","s-data","s-cases-branch","a-arrow","s-op"]) {
  console.log(`  ${k}: ${JSON.stringify(out[k])}`);
}
