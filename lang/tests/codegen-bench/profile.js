#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const LANG = path.resolve(__dirname, "../..");
const OUT = path.join(LANG, "build/codegen-bench");
const VARIANTS = require("./variants.js");

const ANN = /^(_checkAnn|checkArgsInternal\d*|checkArgsInternalInline|hasBrand|checkOrFail|checkTupleBind|checkArityC|_checkAnnArgs|checkConstructorArgs\d*)$|Ann\./;
const STACK = /^(iter|safeCall|makeActivationRecord|isActivationRecord|makeCont|isContinuation|isCont|Cont|ActivationRecord|run|restart|eachLoop|pauseStack|safeThen|execThunk|runThunk|suspend)$/;

function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) { if (text.charCodeAt(i) === 10) { starts.push(i + 1); } }
  return starts;
}

function lineOf(starts, offset) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) { lo = mid; } else { hi = mid - 1; }
  }
  return lo;
}

function jarrRegions(jarr, configFile) {
  const text = fs.readFileSync(jarr, "utf8");
  const starts = lineStarts(text);
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const regions = [];
  for (const [name, file] of Object.entries(config["raw-js"])) {
    const abs = path.isAbsolute(file) ? file : path.join(LANG, file);
    const content = fs.readFileSync(abs, "utf8");
    const off = text.indexOf(content);
    if (off < 0) { continue; }
    regions.push({ name: path.basename(name), from: lineOf(starts, off), to: lineOf(starts, off + content.length) });
  }
  const evalAt = text.indexOf("var indirectEval = eval;");
  regions.evalThunkLine = evalAt < 0 ? -1 : lineOf(starts, evalAt) - 1;
  const progStart = text.indexOf('define("program", ');
  regions.push({ name: "trove-js", from: lineOf(starts, progStart), to: starts.length });
  return regions;
}

function moduleHashes(jarr, prog) {
  const s = fs.readFileSync(jarr, "utf8");
  const uris = [...new Set([...s.matchAll(/"((?:builtin|file|jsfile):\/\/[^"]+)"/g)].map((m) => m[1]))];
  const map = new Map();
  for (const u of uris) {
    const h = crypto.createHash("sha256").update(u).digest("hex");
    map.set(h, u.endsWith("/" + prog + ".arr") ? "compiled:program" : "compiled:stdlib");
  }
  return map;
}

function classify(cf, regions, hashes) {
  const name = cf.functionName;
  if (name === "(garbage collector)") { return "gc"; }
  if (name === "(program)" || name === "(idle)" || name === "(root)") { return "vm-other"; }
  const m = /^_([0-9a-f]{64})__\d+$/.exec(name);
  if (m) { return hashes.get(m[1]) || "compiled:?"; }
  if (cf.url === "") { return "compiled:anon"; }
  if (cf.url.endsWith(".jarr") && cf.lineNumber === regions.evalThunkLine) { return "startup/module-eval"; }
  if (cf.url.endsWith(".jarr")) {
    const r = regions.find((x) => cf.lineNumber >= x.from && cf.lineNumber <= x.to && x.name !== "trove-js") ||
      regions.find((x) => x.name === "trove-js" && cf.lineNumber >= x.from);
    const file = r ? r.name : "jarr-other";
    if (file === "runtime.js") {
      if (ANN.test(name)) { return "runtime:annotations"; }
      if (STACK.test(name)) { return "runtime:stack/run-loop"; }
      return "runtime:other";
    }
    if (file === "js-numbers" || file === "js-numbers-bigint.js") { return "js-numbers"; }
    if (file === "trove-js") { return "trove-js"; }
    return "startup/loader";
  }
  return "startup/loader";
}

function summarize(profFile, jarr, configFile, prog) {
  const prof = JSON.parse(fs.readFileSync(profFile, "utf8"));
  const regions = jarrRegions(jarr, configFile);
  const hashes = moduleHashes(jarr, prog);
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < prof.samples.length; i++) {
    self.set(prof.samples[i], (self.get(prof.samples[i]) || 0) + (prof.timeDeltas[i] || 0));
  }
  const cats = {};
  const fns = {};
  let total = 0;
  for (const [id, t] of self) {
    const cf = byId.get(id).callFrame;
    const c = classify(cf, regions, hashes);
    cats[c] = (cats[c] || 0) + t / 1000;
    const k = c + " " + (cf.functionName || "(anon)") + ":" + cf.lineNumber;
    fns[k] = (fns[k] || 0) + t / 1000;
    total += t / 1000;
  }
  return { totalMs: total, categories: cats, topFunctions: Object.entries(fns).sort((a, b) => b[1] - a[1]).slice(0, 30) };
}

function profileOne(variantName, prog, extraFlags) {
  const v = VARIANTS.find((x) => x.name === variantName);
  const dir = path.join(OUT, v.name);
  const jarr = path.join(dir, prog + ".jarr");
  const profDir = path.join(OUT, "prof");
  fs.mkdirSync(profDir, { recursive: true });
  const name = v.name + "-" + prog + ".cpuprofile";
  const flags = ["--stack-size=1000000", "--cpu-prof", "--cpu-prof-interval", "250", "--cpu-prof-dir", profDir, "--cpu-prof-name", name].concat(extraFlags || []);
  const cmd = "ulimit -s unlimited && exec " + JSON.stringify(process.execPath) + " " + flags.map((f) => JSON.stringify(f)).join(" ") + " " + JSON.stringify(jarr);
  const r = spawnSync("bash", ["-c", cmd], { cwd: LANG, env: Object.assign({}, process.env, { NODE_PATH: path.join(LANG, "node_modules") }), encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0 && prog !== "checks") { throw new Error("run failed: " + r.stderr.slice(-2000)); }
  return summarize(path.join(profDir, name), jarr, path.join(dir, "config.json"), prog);
}

function main() {
  const args = process.argv.slice(2);
  const variants = args[0].split(",");
  const programs = args[1].split(",");
  const out = args[2] || path.join(OUT, "profiles.json");
  const results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  for (const v of variants) {
    results[v] = results[v] || {};
    for (const p of programs) {
      results[v][p] = profileOne(v, p);
      const c = results[v][p].categories;
      process.stderr.write(v + "/" + p + " " + results[v][p].totalMs.toFixed(0) + "ms " +
        Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, t]) => k + "=" + t.toFixed(0)).join(" ") + "\n");
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
}

main();
