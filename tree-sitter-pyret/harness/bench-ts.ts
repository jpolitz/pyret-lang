import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Lowering, type TSNode } from "../src-ts/lower.ts";
const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const Parser = require("tree-sitter");
const Pyret = require(ROOT);
const parser = new Parser(); parser.setLanguage(Pyret);

const files = fs.readFileSync(ROOT + "/corpus/all-arr-abs.txt","utf8").split("\n").map(s=>s.trim()).filter(Boolean);
const srcs: {f:string,s:string}[] = [];
let bytes = 0;
for (const f of files) { const s = fs.readFileSync(f,"utf8"); srcs.push({f,s}); bytes += Buffer.byteLength(s); }
const bufOf = (s:string)=>({bufferSize: Math.max(32768, s.length*2+1024)});

// warmup
for (const {s} of srcs) { try { const t=parser.parse(s,null,bufOf(s)); if(!t.rootNode.hasError){ new Lowering(s,"x").lowerProgram(t.rootNode as unknown as TSNode);} } catch{} }

function time(fn:()=>void, reps:number){ const t0=process.hrtime.bigint(); for(let i=0;i<reps;i++) fn(); const t1=process.hrtime.bigint(); return Number(t1-t0)/1e6/reps; }

const REPS = 3;
let parseMs = time(()=>{ for(const {s} of srcs){ try{ parser.parse(s,null,bufOf(s)); }catch{} } }, REPS);
let plMs = time(()=>{ for(const {s} of srcs){ try{ const t=parser.parse(s,null,bufOf(s)); if(!t.rootNode.hasError) new Lowering(s,"x").lowerProgram(t.rootNode as unknown as TSNode);}catch{} } }, REPS);

console.log(`corpus: ${files.length} files, ${(bytes/1024/1024).toFixed(2)} MB`);
console.log(`tree-sitter PARSE only:    ${parseMs.toFixed(1)} ms total  =>  ${(bytes/1024/parseMs).toFixed(1)} KB/ms  (${(bytes/1024/1024/(parseMs/1000)).toFixed(1)} MB/s)`);
console.log(`tree-sitter PARSE+LOWER:   ${plMs.toFixed(1)} ms total  =>  ${(bytes/1024/plMs).toFixed(1)} KB/ms  (${(bytes/1024/1024/(plMs/1000)).toFixed(1)} MB/s)`);
