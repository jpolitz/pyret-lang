// Differential harness: compare the tree-sitter frontend against the reference RNGLR
// parser over the corpus, diffing canonical AST dumps. Drives divergence toward zero.
//
// Usage:
//   node harness/diff.ts <file.arr> [...]        compare specific files
//   node harness/diff.ts --corpus [N]            first N corpus files (default all)
//   node harness/diff.ts --all                   all corpus files
//   node harness/diff.ts --list                  just list corpus
//
// Candidate side: tree-sitter parse -> Lowering -> serialize.
// Reference side: harness/dump-existing.js (subprocess) -> canonical dump.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { Lowering, NotImplemented, type TSNode } from "../src-ts/lower.ts";
import { serialize } from "../src-ts/serialize.ts";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const REPO = path.resolve(ROOT, "..");

// ---- tree-sitter grammar loading (lazy; grammar may not be built yet) ----
let parser: any = null;
function getParser(): any {
  if (parser) return parser;
  const Parser = require("tree-sitter");
  // The built grammar module — produced by `tree-sitter generate` + node-gyp build.
  // Try common locations.
  let Pyret: any = null;
  const candidates = [ROOT, path.join(ROOT, "bindings", "node")];
  let lastErr: unknown = null;
  for (const c of candidates) {
    try {
      Pyret = require(c);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!Pyret) {
    throw new Error(
      `Could not load built tree-sitter-pyret grammar. Build it first ` +
        `(tree-sitter generate && node-gyp build). Last error: ${(lastErr as Error)?.message}`,
    );
  }
  parser = new Parser();
  parser.setLanguage(Pyret);
  return parser;
}

function candidateDump(source: string, uri: string): { ok: true; dump: string } | { ok: false; reason: string } {
  let tree: any;
  try {
    // node-tree-sitter reads strings in 32768-code-unit chunks by default; an external
    // scanner skipping a long whitespace/comment run across that boundary triggers an
    // "Invalid argument" crash (the CLI / pure-JS reference are unaffected). Size the
    // buffer to the whole input so it's read in one chunk.
    const bufferSize = Math.max(32 * 1024, source.length * 2 + 1024);
    tree = getParser().parse(source, null, { bufferSize });
  } catch (e) {
    return { ok: false, reason: `ts-parse-error: ${(e as Error).message}` };
  }
  const root = tree.rootNode as TSNode & { hasError: boolean };
  if (root.hasError) {
    return { ok: false, reason: "ts-cst-has-error-nodes" };
  }
  try {
    const low = new Lowering(source, uri);
    const program = low.lowerProgram(root as unknown as TSNode);
    return { ok: true, dump: serialize(program) };
  } catch (e) {
    if (e instanceof NotImplemented) return { ok: false, reason: `lowering-todo: ${e.ruleName}` };
    return { ok: false, reason: `lowering-error: ${(e as Error).message}` };
  }
}

const CACHE_DIR = path.join(ROOT, "corpus", "ref-cache");
function cacheKey(abspath: string): string {
  return crypto.createHash("sha1").update(abspath).digest("hex");
}

function referenceDump(file: string): { ok: true; dump: string } | { ok: false; reason: string } {
  // Prefer the cached batch dump (fast). file is an absolute path; the batch dumper
  // keyed by sha1 of the same absolute path.
  const key = cacheKey(file);
  const sexp = path.join(CACHE_DIR, key + ".sexp");
  const err = path.join(CACHE_DIR, key + ".err");
  if (fs.existsSync(sexp)) return { ok: true, dump: fs.readFileSync(sexp, "utf8") };
  if (fs.existsSync(err)) return { ok: false, reason: "reference-parse-error" };
  // Fallback: live single-file dumper (slow) if not cached.
  const script = path.join(HERE, "dump-existing.js");
  if (!fs.existsSync(script)) return { ok: false, reason: "reference-uncached" };
  try {
    const out = execFileSync("node", [script, file], { encoding: "utf8", maxBuffer: 1 << 28 });
    return { ok: true, dump: out };
  } catch (e: any) {
    const stderr = (e.stderr || "").toString();
    const stdout = (e.stdout || "").toString();
    return { ok: false, reason: `reference-error: ${(stderr || stdout).split("\n")[0]}` };
  }
}

function firstDiff(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}:\n  REF: ${JSON.stringify(la[i])}\n  TS : ${JSON.stringify(lb[i])}`;
    }
  }
  return "(identical?)";
}

function corpusFiles(): string[] {
  const manifest = path.join(ROOT, "corpus", "all-arr-files.txt");
  return fs
    .readFileSync(manifest, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((rel) => path.resolve(REPO, rel));
}

function main() {
  const argv = process.argv.slice(2);
  let files: string[] = [];
  if (argv[0] === "--list") {
    console.log(corpusFiles().join("\n"));
    return;
  } else if (argv[0] === "--all" || argv[0] === "--corpus") {
    const all = corpusFiles();
    const n = argv[1] ? parseInt(argv[1], 10) : all.length;
    files = all.slice(0, n);
  } else {
    files = argv.map((a) => path.resolve(a));
  }

  let pass = 0;
  let mismatch = 0;
  const gaps: Record<string, number> = {};
  const mismatches: string[] = [];

  for (const f of files) {
    const source = fs.readFileSync(f, "utf8");
    // Must match dump-existing.js, which uses URI = "file://" + path.resolve(file),
    // since the URI appears as `source` in every srcloc.
    const uri = "file://" + f;
    const cand = candidateDump(source, uri);
    const ref = referenceDump(f);

    if (!cand.ok) {
      // Bucket lowering-todo by the specific rule name to prioritize implementation.
      const key = cand.reason.startsWith("lowering-todo")
        ? "lowering-todo:" + cand.reason.split(":")[1].trim()
        : cand.reason.split(":")[0];
      gaps[key] = (gaps[key] || 0) + 1;
      if (process.env.VERBOSE) console.log(`SKIP ${path.relative(REPO, f)} — ${cand.reason}`);
      continue;
    }
    if (!ref.ok) {
      gaps["reference-" + ref.reason.split(":")[0]] = (gaps["reference-" + ref.reason.split(":")[0]] || 0) + 1;
      continue;
    }
    if (cand.dump === ref.dump) {
      pass++;
    } else {
      mismatch++;
      mismatches.push(`MISMATCH ${path.relative(REPO, f)}\n${firstDiff(ref.dump, cand.dump)}`);
    }
  }

  console.log("\n=== differential harness summary ===");
  console.log(`files:     ${files.length}`);
  console.log(`PASS:      ${pass}`);
  console.log(`MISMATCH:  ${mismatch}`);
  console.log(`skipped/gaps:`);
  for (const [k, v] of Object.entries(gaps).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(5)}  ${k}`);
  }
  if (mismatches.length && process.env.VERBOSE) {
    console.log("\n=== mismatches (first diff each) ===");
    console.log(mismatches.slice(0, 20).join("\n\n"));
  }
}

main();
