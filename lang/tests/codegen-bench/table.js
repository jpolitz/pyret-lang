#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "../../build/codegen-bench/results.json");
const r = JSON.parse(fs.readFileSync(file, "utf8"));
const variants = Object.keys(r.variants);
const programs = Object.keys(r.variants.baseline.programs).filter((p) => p !== "empty");
const work = (v, p) => r.variants[v].programs[p].medianMs - r.variants[v].programs.empty.medianMs;
const geomean = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);

const mode = process.argv[3] || "work";
const rows = [];
rows.push(["program"].concat(variants));
for (const p of programs) {
  rows.push([p].concat(variants.map((v) => {
    const e = r.variants[v].programs[p];
    if (!e) { return "-"; }
    if (mode === "total") { return e.medianMs.toFixed(0); }
    if (mode === "speedup") { return (work("baseline", p) / work(v, p)).toFixed(2) + "x"; }
    return work(v, p).toFixed(0);
  })));
}
if (mode === "speedup") {
  rows.push(["geomean"].concat(variants.map((v) => geomean(programs.map((p) => work("baseline", p) / work(v, p))).toFixed(2) + "x")));
}
if (mode === "total") {
  rows.push(["empty"].concat(variants.map((v) => r.variants[v].programs.empty.medianMs.toFixed(0))));
}
console.log("| " + rows[0].join(" | ") + " |");
console.log("|" + rows[0].map(() => "---").join("|") + "|");
for (const row of rows.slice(1)) { console.log("| " + row.join(" | ") + " |"); }
