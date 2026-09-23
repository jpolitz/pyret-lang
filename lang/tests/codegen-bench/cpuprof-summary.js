"use strict";

const fs = require("fs");

const [file, topArg] = process.argv.slice(2);
const top = Number(topArg || 25);
const prof = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = prof.timeDeltas;
for (let i = 0; i < prof.samples.length; i++) {
  self.set(prof.samples[i], (self.get(prof.samples[i]) || 0) + (dt[i] || 0));
}
const total = [...self.values()].reduce((a, b) => a + b, 0);

function category(cf) {
  const name = cf.functionName;
  const url = cf.url;
  if (name === "(garbage collector)") { return "gc"; }
  if (name === "(program)" || name === "(idle)" || name === "(root)") { return name; }
  if (/^_[0-9a-f]{64}__\d+$/.test(name)) { return "compiled-pyret"; }
  if (url.endsWith(".jarr")) {
    if (/js-numbers|bnp?[A-Z]|BigInteger|Rational|Roughnum/.test(name)) { return "jarr:js-numbers?"; }
    return "jarr:runtime/js";
  }
  if (url.startsWith("node:") || url === "") { return "node/native"; }
  return "other";
}

const byFn = new Map();
const byCat = new Map();
for (const [id, t] of self) {
  const n = byId.get(id);
  const cf = n.callFrame;
  const key = cf.functionName + " " + (cf.url ? cf.url.split("/").pop() : "") + ":" + cf.lineNumber;
  byFn.set(key, (byFn.get(key) || 0) + t);
  const c = category(cf);
  byCat.set(c, (byCat.get(c) || 0) + t);
}
const pct = (t) => (100 * t / total).toFixed(1) + "%";
console.log("total sampled ms:", (total / 1000).toFixed(0));
console.log("-- by category (self time)");
for (const [c, t] of [...byCat].sort((a, b) => b[1] - a[1])) { console.log(pct(t).padStart(7), c); }
console.log("-- top functions (self time)");
for (const [k, t] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, top)) { console.log(pct(t).padStart(7), k); }
