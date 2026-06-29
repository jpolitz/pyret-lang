// Read-only analysis: for every corpus file whose tree-sitter CST contains ERROR/MISSING
// nodes (or fails to parse), locate the first such node and bucket by (parent rule, snippet)
// to prioritize grammar/scanner fixes. Does not modify the grammar.
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const REPO = path.resolve(ROOT, "..");

const Parser = require("tree-sitter");
const Pyret = require(ROOT);
const parser = new Parser();
parser.setLanguage(Pyret);

const files = fs
  .readFileSync(path.join(ROOT, "corpus", "all-arr-abs.txt"), "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

function firstErrorNode(n: any): any | null {
  // DFS for the first node that is ERROR or MISSING, or has an error child.
  if (n.type === "ERROR" || n.isMissing) return n;
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i);
    if (c && (c.hasError || c.isMissing || c.type === "ERROR")) {
      const deeper = firstErrorNode(c);
      if (deeper) return deeper;
    }
  }
  return n.type === "ERROR" ? n : null;
}

import * as crypto from "node:crypto";
const CACHE = path.join(ROOT, "corpus", "ref-cache");
const refErrors = (f: string) =>
  fs.existsSync(path.join(CACHE, crypto.createHash("sha1").update(f).digest("hex") + ".err"));

const buckets: Record<string, { count: number; examples: string[] }> = {};
let errFiles = 0;
let realBugs = 0; // reference parses OK but tree-sitter errors

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let tree: any;
  try {
    tree = parser.parse(src, null, { bufferSize: Math.max(32 * 1024, src.length * 2 + 1024) });
  } catch (e) {
    const k = "PARSE-THREW";
    (buckets[k] ??= { count: 0, examples: [] }).count++;
    if (buckets[k].examples.length < 3) buckets[k].examples.push(path.relative(REPO, f));
    errFiles++;
    continue;
  }
  if (!tree.rootNode.hasError) continue;
  errFiles++;
  if (!refErrors(f)) realBugs++; // reference parses fine -> real grammar bug
  const err = firstErrorNode(tree.rootNode) || tree.rootNode;
  const parent = err.parent ? err.parent.type : "(root)";
  const snippet = src.slice(err.startIndex, Math.min(err.endIndex, err.startIndex + 40)).replace(/\n/g, "\\n");
  const key = `${err.isMissing ? "MISSING " : ""}${err.type} in ${parent}`;
  const b = (buckets[key] ??= { count: 0, examples: [] });
  b.count++;
  if (b.examples.length < 3) b.examples.push(`${path.relative(REPO, f)}  «${snippet}»`);
}

console.log(`files with CST errors / parse failures: ${errFiles}\n`);
const sorted = Object.entries(buckets).sort((a, b) => b[1].count - a[1].count);
for (const [k, v] of sorted) {
  console.log(`${String(v.count).padStart(4)}  ${k}`);
  for (const ex of v.examples) console.log(`        ${ex}`);
}
