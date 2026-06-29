// WASM differential: parse each corpus file via web-tree-sitter (the .wasm) → reuse the SAME
// Lowering + serializer → compare against the cached reference dumps. Proves the WASM path
// produces identical ASTs to the native path (which is already 553/0 vs the real parser).
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Lowering, NotImplemented, type TSNode } from "../src-ts/lower.ts";
import { serialize } from "../src-ts/serialize.ts";

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const REPO = path.resolve(ROOT, "..");
const CACHE = path.join(ROOT, "corpus", "ref-cache");
const key = (p: string) => crypto.createHash("sha1").update(p).digest("hex");

const { Parser, Language } = require("web-tree-sitter");

async function main() {
  await Parser.init();
  const Lang = await Language.load(path.join(ROOT, "tree-sitter-pyret.wasm"));
  const parser = new Parser();
  parser.setLanguage(Lang);

  const files = fs.readFileSync(path.join(ROOT, "corpus", "all-arr-abs.txt"), "utf8")
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const n = process.argv[2] ? parseInt(process.argv[2], 10) : files.length;

  let pass = 0, mismatch = 0;
  const gaps: Record<string, number> = {};
  const showMis: string[] = [];

  for (const f of files.slice(0, n)) {
    const src = fs.readFileSync(f, "utf8");
    const uri = "file://" + f;
    let tree: any;
    try { tree = parser.parse(src); }
    catch (e) { gaps["wasm-parse-threw"] = (gaps["wasm-parse-threw"] || 0) + 1; continue; }
    if (tree.rootNode.hasError) { gaps["wasm-cst-error"] = (gaps["wasm-cst-error"] || 0) + 1; continue; }

    let dump: string;
    try { dump = serialize(new Lowering(src, uri).lowerProgram(tree.rootNode as unknown as TSNode)); }
    catch (e) { gaps[e instanceof NotImplemented ? "lowering-todo:" + e.ruleName : "lowering-error"] = (gaps[e instanceof NotImplemented ? "lowering-todo:" + e.ruleName : "lowering-error"] || 0) + 1; continue; }

    const sexp = path.join(CACHE, key(f) + ".sexp");
    if (!fs.existsSync(sexp)) { gaps["no-ref"] = (gaps["no-ref"] || 0) + 1; continue; }
    const ref = fs.readFileSync(sexp, "utf8");
    if (dump === ref) pass++;
    else {
      mismatch++;
      if (showMis.length < 10) {
        const la = ref.split("\n"), lb = dump.split("\n");
        let d = "(?)"; for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) { d = `line ${i+1}:\n  REF: ${JSON.stringify(la[i])}\n  WASM:${JSON.stringify(lb[i])}`; break; }
        showMis.push(`MISMATCH ${path.relative(REPO, f)}\n${d}`);
      }
    }
  }

  console.log("\n=== WASM (web-tree-sitter) differential vs cached reference ===");
  console.log(`files:    ${Math.min(n, files.length)}`);
  console.log(`PASS:     ${pass}`);
  console.log(`MISMATCH: ${mismatch}`);
  console.log("gaps:");
  for (const [k, v] of Object.entries(gaps).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
  if (showMis.length && process.env.VERBOSE) console.log("\n" + showMis.join("\n\n"));
}
main().catch((e) => { console.error(e); process.exit(1); });
