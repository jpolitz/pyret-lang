import * as fs from "node:fs"; import * as path from "node:path";
import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const { Parser, Language } = require("web-tree-sitter");
async function main(){
  await Parser.init();
  const Lang = await Language.load(path.join(ROOT,"tree-sitter-pyret.wasm"));
  const p = new Parser(); p.setLanguage(Lang);
  const files = fs.readFileSync(path.join(ROOT,"corpus/all-arr-abs.txt"),"utf8").split("\n").map(s=>s.trim()).filter(Boolean);
  const srcs:string[]=[]; let bytes=0;
  for(const f of files){const s=fs.readFileSync(f,"utf8"); srcs.push(s); bytes+=Buffer.byteLength(s);}
  for(const s of srcs){ try{p.parse(s);}catch{} }            // warm
  const REPS=3, t0=process.hrtime.bigint();
  for(let r=0;r<REPS;r++) for(const s of srcs){ try{p.parse(s);}catch{} }
  const ms=Number(process.hrtime.bigint()-t0)/1e6/REPS;
  console.log(`WASM parse: ${ms.toFixed(0)} ms total for ${(bytes/1024/1024).toFixed(2)} MB => ${(bytes/1024/1024/(ms/1000)).toFixed(2)} MB/s`);
}
main();
