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
if (mode === "sizes") {
  const kb = (b) => (b / 1024).toFixed(0);
  console.log("| variant | program JS KB (raw / gz), summed over corpus | stdlib compiled-Pyret KB (raw / gz) | standalone KB | stdlib V8 compile ms lazy / eager | program V8 compile ms lazy / eager, summed |");
  console.log("|---|---|---|---|---|---|");
  for (const v of variants) {
    const ps = programs.map((p) => r.variants[v].programs[p]).filter((e) => e && e.sizes);
    const sum = (f) => ps.reduce((a, e) => a + f(e.sizes), 0);
    const one = r.variants[v].programs.empty.sizes;
    const ms = (x) => (x === null || x === undefined) ? "-" : x.toFixed(1);
    console.log("| " + [v,
      kb(sum((s) => s.prog.raw)) + " / " + kb(sum((s) => s.prog.gz)),
      kb(one.stdlib.raw) + " / " + kb(one.stdlib.gz),
      kb(one.jarrBytes),
      one.compileLazyMs ? ms(one.compileLazyMs.stdlib) + " / " + ms(one.compileEagerMs.stdlib) : "-",
      one.compileLazyMs ? ms(sum((s) => s.compileLazyMs.prog)) + " / " + ms(sum((s) => s.compileEagerMs.prog)) : "-",
    ].join(" | ") + " |");
  }
  process.exit(0);
}
if (mode === "progsizes") {
  console.log("| program | " + variants.join(" | ") + " |");
  console.log("|---|" + variants.map(() => "---").join("|") + "|");
  for (const p of programs) {
    console.log("| " + p + " | " + variants.map((v) => {
      const e = r.variants[v].programs[p];
      return e && e.sizes ? (e.sizes.prog.raw / 1024).toFixed(1) + " / " + (e.sizes.prog.gz / 1024).toFixed(1) : "-";
    }).join(" | ") + " |");
  }
  process.exit(0);
}
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
