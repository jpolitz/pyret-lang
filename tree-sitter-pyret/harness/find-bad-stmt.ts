// Reliable bug locator: for a failing file, use the reference dump's top-level statement
// boundaries (char spans) to slice each top-level definition from source and parse it
// ALONE in tree-sitter. Reports the first definition(s) that error — the true culprit,
// regardless of where GLR error-recovery placed the ERROR node.
//
//   node harness/find-bad-stmt.ts <abs-or-rel-file>
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "..");
const Parser = require("tree-sitter");
const Pyret = require(ROOT);
const parser = new Parser();
parser.setLanguage(Pyret);

const arg = process.argv[2];
const file = path.isAbsolute(arg) ? arg : path.resolve(REPO, arg.replace(/^\.\//, ""));
const src = fs.readFileSync(file, "utf8");
const key = crypto.createHash("sha1").update(file).digest("hex");
const dumpPath = path.join(ROOT, "corpus", "ref-cache", key + ".sexp");
if (!fs.existsSync(dumpPath)) {
  console.error("no reference dump for", file);
  process.exit(1);
}
const dump = fs.readFileSync(dumpPath, "utf8").split("\n");

// Find the first `:stmts (list` line = the top-level block's stmts. Its direct children
// sit at indent+2; each child's NEXT `:l (srcloc "f" sl sc schar el ec echar)` gives the
// char span (3rd and 6th numbers).
let stmtsIdx = dump.findIndex((l) => /^\s*:stmts \(list/.test(l));
if (stmtsIdx < 0) {
  console.error("no top-level :stmts (list found");
  process.exit(1);
}
const baseIndent = dump[stmtsIdx].match(/^(\s*)/)![1].length;
const childIndent = baseIndent + 2;

const spans: { start: number; end: number; head: string }[] = [];
for (let i = stmtsIdx + 1; i < dump.length; i++) {
  const line = dump[i];
  const ind = line.match(/^(\s*)/)![1].length;
  if (ind < childIndent && line.trim() !== "") break; // left the stmts list
  if (ind === childIndent && /^\s*\(/.test(line)) {
    // next line should be the :l srcloc
    const ll = dump[i + 1] || "";
    const m = ll.match(/:l \(srcloc "[^"]*" (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)\)/);
    if (m) {
      spans.push({ start: +m[3], end: +m[6], head: line.trim().slice(0, 50) });
    }
  }
}

console.log(`top-level statements: ${spans.length}`);
let bad = 0;
for (const s of spans) {
  const slice = src.slice(s.start, s.end);
  let err = false;
  try {
    err = parser.parse(slice, null, { bufferSize: Math.max(32768, slice.length * 2 + 1024) }).rootNode.hasError;
  } catch (e) {
    err = true;
  }
  if (err) {
    bad++;
    console.log(`\n*** FAILS [${s.start}..${s.end}] ${s.head}`);
    console.log(slice.length > 400 ? slice.slice(0, 400) + "\n…" : slice);
  }
}
if (bad === 0) console.log("(no single top-level stmt fails alone — likely a cross-statement interaction)");
