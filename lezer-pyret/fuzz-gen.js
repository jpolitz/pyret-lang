// fuzz-gen.js — adapted from tree-sitter-pyret/harness/fuzz-gen.js.
// Generate mutants from corpus seeds, weighted to whitespace edits (the risky
// class for a whitespace-sensitive tokenizer). Deterministic (seeded PRNG by idx).
//   node fuzz-gen.js <outDir> <numMutants> <seedsListFile>
var fs = require("fs"), path = require("path");
var OUT = process.argv[2], N = parseInt(process.argv[3] || "3000", 10);
var SEEDS_FILE = process.argv[4];
fs.mkdirSync(OUT, { recursive: true });

var seeds = fs.readFileSync(SEEDS_FILE, "utf8")
  .split("\n").map(function (s) { return s.trim(); }).filter(Boolean)
  .map(function (f) { try { return { f: f, s: fs.readFileSync(f, "utf8") }; } catch (e) { return null; } })
  .filter(Boolean)
  .filter(function (x) { return x.s.length > 0 && x.s.length < 8000; });

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

var OPCHARS = "+-*/<>=:,()[]{}^.!;|";
function isOp(c) { return OPCHARS.indexOf(c) >= 0; }

function mutate(src, rnd) {
  var roll = rnd();
  if (roll < 0.55) { // ws-remove next to an op/delimiter (high-risk)
    var idxs = [];
    for (var i = 1; i < src.length; i++)
      if (src[i] === " " && (isOp(src[i - 1]) || (i + 1 < src.length && isOp(src[i + 1])))) idxs.push(i);
    if (idxs.length) { var p = idxs[(rnd() * idxs.length) | 0]; return { s: src.slice(0, p) + src.slice(p + 1), op: "ws-remove@" + p }; }
    return null;
  }
  if (roll < 0.75) { // ws-insert between two non-space, non-newline chars
    for (var tries = 0; tries < 20; tries++) {
      var q = 1 + ((rnd() * (src.length - 2)) | 0);
      if (src[q] !== " " && src[q] !== "\n" && src[q - 1] !== " " && src[q - 1] !== "\n") return { s: src.slice(0, q) + " " + src.slice(q), op: "ws-insert@" + q };
    }
    return null;
  }
  if (roll < 0.85) { // duplicate a line
    var lines = src.split("\n"); if (lines.length < 2) return null;
    var li = (rnd() * lines.length) | 0; lines.splice(li, 0, lines[li]); return { s: lines.join("\n"), op: "line-dup@" + li };
  }
  if (roll < 0.95) { // delete a short run (1-3 chars)
    var d = 1 + ((rnd() * 3) | 0); var r = (rnd() * (src.length - d)) | 0; return { s: src.slice(0, r) + src.slice(r + d), op: "del" + d + "@" + r };
  }
  var w = 1 + ((rnd() * (src.length - 2)) | 0); // swap two adjacent chars
  return { s: src.slice(0, w - 1) + src[w] + src[w - 1] + src.slice(w + 1), op: "swap@" + w };
}

var manifest = [], meta = [];
for (var k = 0; k < N; k++) {
  var rnd = mulberry32(0x9E3779B9 ^ k);
  var seed = seeds[(rnd() * seeds.length) | 0];
  var m = mutate(seed.s, rnd);
  if (!m || m.s === seed.s) continue;
  var file = path.join(OUT, "m" + k + ".arr");
  fs.writeFileSync(file, m.s);
  manifest.push(file);
  meta.push(JSON.stringify({ idx: k, seed: seed.f, op: m.op }));
}
fs.writeFileSync(path.join(OUT, "manifest.txt"), manifest.join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "meta.jsonl"), meta.join("\n") + "\n");
console.log("generated " + manifest.length + " mutants from " + seeds.length + " seeds into " + OUT);
