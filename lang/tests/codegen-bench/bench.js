#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const vm = require("vm");
const { spawnSync } = require("child_process");

const LANG = path.resolve(__dirname, "../..");
const BENCH = __dirname;
const OUT = path.join(LANG, "build/codegen-bench");
const PROGRAMS_DIR = path.join(BENCH, "programs");
const STACK_KB = 1000000;

const VARIANTS = require("./variants.js");

function parseArgs(argv) {
  const opts = { runs: 5, variants: null, programs: null, out: path.join(OUT, "results.json"), skipCompile: false, parse: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") { opts.runs = Number(argv[++i]); }
    else if (a === "--variants") { opts.variants = argv[++i].split(","); }
    else if (a === "--programs") { opts.programs = argv[++i].split(","); }
    else if (a === "--out") { opts.out = path.resolve(argv[++i]); }
    else if (a === "--skip-compile") { opts.skipCompile = true; }
    else if (a === "--no-parse") { opts.parse = false; }
    else { throw new Error("unknown argument " + a); }
  }
  return opts;
}

function listPrograms() {
  return fs.readdirSync(PROGRAMS_DIR).filter((f) => f.endsWith(".arr")).map((f) => f.slice(0, -4)).sort();
}

function variantDir(v) { return path.join(OUT, v.name); }

function requireConfig(v) {
  const base = JSON.parse(fs.readFileSync(path.join(LANG, "src/scripts/standalone-configA.json"), "utf8"));
  for (const k of ["pyret-base/js/runtime.js", "pyret-base/js/js-numbers"]) {
    base["raw-js"][k] = base["raw-js"][k].replace(/^build\/phaseA\/js\//, "src/js/base/");
  }
  Object.assign(base["raw-js"], v.rawJs || {});
  const file = path.join(variantDir(v), "config.json");
  fs.writeFileSync(file, JSON.stringify(base, null, 2));
  return file;
}

function srcPath(prog) {
  return prog === "empty" ? path.join(BENCH, "empty.arr") : path.join(PROGRAMS_DIR, prog + ".arr");
}

function compile(v, prog) {
  const dir = variantDir(v);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, prog + ".jarr");
  const args = [
    "--stack-size=8192",
    path.join(LANG, "build/ts-compiler/pyret.js"),
    "--build-runnable", srcPath(prog),
    "--outfile", out,
    "--builtin-js-dir", "src/js/trove/",
    "--builtin-arr-dir", "src/arr/trove/",
    "--compiled-dir", path.join(dir, "compiled"),
    "--require-config", requireConfig(v),
  ];
  if (v.pauseSchedule) { args.push("--pause-schedule", path.join(BENCH, v.pauseSchedule)); }
  const env = Object.assign({}, process.env, { PYRET_TS_NO_RESPAWN: "1", PYRET_CODEGEN: v.codegen || "" });
  const r = spawnSync(process.execPath, args, { cwd: LANG, env, encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    throw new Error("compile failed for " + v.name + "/" + prog + ":\n" + r.stdout.slice(-3000) + r.stderr.slice(-3000));
  }
  return out;
}

function runOnce(v, jarr) {
  const nodeArgs = ["--stack-size=" + STACK_KB].concat(v.nodeFlags || []);
  const cmd = "ulimit -s unlimited && exec " + JSON.stringify(process.execPath) + " " +
    nodeArgs.map((a) => JSON.stringify(a)).join(" ") + " " + JSON.stringify(jarr);
  const env = Object.assign({}, process.env, { NODE_PATH: path.join(LANG, "node_modules") });
  const t0 = process.hrtime.bigint();
  const r = spawnSync("bash", ["-c", cmd], { cwd: LANG, env, encoding: "utf8", maxBuffer: 1 << 28 });
  const t1 = process.hrtime.bigint();
  return { ms: Number(t1 - t0) / 1e6, stdout: r.stdout, stderr: r.stderr, status: r.status };
}

function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function extractProgram(jarr) {
  const s = fs.readFileSync(jarr, "utf8");
  const start = s.indexOf('define("program", ');
  const marker = "function() {\nreturn ";
  const j = s.indexOf(marker, start) + marker.length;
  const handalone = fs.readFileSync(path.join(LANG, "src/js/base/handalone.js"), "utf8");
  const k = s.lastIndexOf("\n});\n" + handalone.slice(0, 64));
  return (0, eval)("(" + s.slice(j, k) + ")");
}

function moduleSource(m) {
  return typeof m.theModule === "string" ? m.theModule : null;
}

function parseMs(src, eager) {
  const wrapped = "(" + src + ")";
  const reps = 3;
  const times = [];
  for (let i = 0; i < reps; i++) {
    const t0 = process.hrtime.bigint();
    new vm.Script(wrapped, { filename: "m" + Math.random() + ".js" });
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return median(times);
}

function sizes(jarr, prog, doParse) {
  const p = extractProgram(jarr);
  const res = { prog: { raw: 0, gz: 0 }, stdlib: { raw: 0, gz: 0 }, jarrBytes: fs.statSync(jarr).size, parseMs: null, stdlibParseMs: null };
  const progSrcs = [];
  const libSrcs = [];
  for (const uri of p.toLoad) {
    const src = moduleSource(p.staticModules[uri]);
    if (src === null) { continue; }
    const bucket = uri.startsWith("file://") && uri.endsWith("/" + prog + ".arr") ? res.prog : res.stdlib;
    bucket.raw += Buffer.byteLength(src);
    bucket.gz += zlib.gzipSync(src, { level: 9 }).length;
    (bucket === res.prog ? progSrcs : libSrcs).push(src);
  }
  if (doParse) {
    res.parseMs = progSrcs.reduce((a, s) => a + parseMs(s), 0);
    res.stdlibParseMs = libSrcs.reduce((a, s) => a + parseMs(s), 0);
  }
  return res;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const variants = opts.variants ? opts.variants.map((n) => {
    const v = VARIANTS.find((x) => x.name === n);
    if (!v) { throw new Error("unknown variant " + n); }
    return v;
  }) : VARIANTS;
  if (!variants.some((v) => v.name === "baseline")) { variants.unshift(VARIANTS.find((x) => x.name === "baseline")); }
  const programs = (opts.programs || listPrograms()).concat(["empty"]).filter((p, i, a) => a.indexOf(p) === i);
  fs.mkdirSync(OUT, { recursive: true });

  const results = { runs: opts.runs, node: process.version, variants: {}, mismatches: [] };
  const baselineOut = {};
  for (const v of variants) {
    results.variants[v.name] = { description: v.description, programs: {} };
    for (const prog of programs) {
      const t0 = Date.now();
      let jarr;
      try {
        jarr = opts.skipCompile ? path.join(variantDir(v), prog + ".jarr") : compile(v, prog);
      } catch (e) {
        process.stderr.write(String(e.message).slice(-1500) + "\n");
        results.mismatches.push({ variant: v.name, program: prog, kind: "compile-error" });
        continue;
      }
      const compileS = (Date.now() - t0) / 1000;
      const times = [];
      let first = null;
      for (let i = 0; i < opts.runs; i++) {
        const r = runOnce(v, jarr);
        if (first === null) { first = r; }
        if (r.stdout !== first.stdout) {
          results.mismatches.push({ variant: v.name, program: prog, kind: "nondeterministic" });
        }
        times.push(r.ms);
      }
      const entry = {
        medianMs: median(times), times, status: first.status,
        stdout: first.stdout, stderrTail: first.stderr.slice(-2000), compileS,
        sizes: sizes(jarr, prog, opts.parse),
      };
      if (v.name === "baseline") { baselineOut[prog] = first.stdout; }
      else if (baselineOut[prog] !== undefined && baselineOut[prog] !== first.stdout) {
        results.mismatches.push({ variant: v.name, program: prog, kind: "differs-from-baseline" });
      }
      if (first.status !== 0 && prog !== "checks") {
        results.mismatches.push({ variant: v.name, program: prog, kind: "exit-" + first.status });
      }
      results.variants[v.name].programs[prog] = entry;
      process.stderr.write(v.name + "/" + prog + ": " + entry.medianMs.toFixed(0) + "ms (compile " + compileS.toFixed(1) + "s) " +
        JSON.stringify(first.stdout.slice(0, 80)) + (first.status ? " EXIT " + first.status + " " + first.stderr.slice(-300) : "") + "\n");
    }
  }
  fs.writeFileSync(opts.out, JSON.stringify(results, null, 1));
  if (results.mismatches.length > 0) {
    process.stderr.write("MISMATCHES:\n" + JSON.stringify(results.mismatches, null, 1) + "\n");
    process.exitCode = 1;
  } else {
    process.stderr.write("all variant outputs match baseline\n");
  }
}

main();
