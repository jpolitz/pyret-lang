#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const LANG = path.resolve(__dirname, "../..");
const BENCH = __dirname;
const OUT = path.join(LANG, "build/codegen-bench");
const PROGRAMS_DIR = path.join(BENCH, "programs");
const STACK_KB = 1000000;
const PRISTINE_REV = "f552e0084";

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
  if (v.jsnums === "bigint") {
    base["raw-js"]["pyret-base/js/js-numbers"] = require("./make-bigint-jsnums.js").generate(path.join(variantDir(v), "js-numbers-bigint.js"));
  }
  if (v.runtime === "pristine") {
    const file = path.join(variantDir(v), "runtime-pristine.js");
    const r = spawnSync("git", ["show", PRISTINE_REV + ":lang/src/js/base/runtime.js"], { cwd: LANG, encoding: "utf8", maxBuffer: 1 << 28 });
    if (r.status !== 0) { throw new Error("git show failed: " + r.stderr); }
    fs.mkdirSync(variantDir(v), { recursive: true });
    fs.writeFileSync(file, r.stdout);
    base["raw-js"]["pyret-base/js/runtime.js"] = file;
  }
  const file = path.join(variantDir(v), "config.json");
  fs.writeFileSync(file, JSON.stringify(base, null, 2));
  return file;
}

const EXTRA_SOURCES = {};

function srcPath(prog) {
  if (EXTRA_SOURCES[prog]) { return EXTRA_SOURCES[prog]; }
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
  args.push(...(v.compileFlags || []));
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

function sizes(jarr, prog, doParse) {
  const p = extractProgram(jarr);
  const res = { prog: { raw: 0, gz: 0 }, stdlib: { raw: 0, gz: 0 }, jarrBytes: fs.statSync(jarr).size, compileLazyMs: null, compileEagerMs: null };
  for (const uri of p.toLoad) {
    const src = moduleSource(p.staticModules[uri]);
    if (src === null) { continue; }
    const bucket = uri.startsWith("file://") && uri.endsWith("/" + prog + ".arr") ? res.prog : res.stdlib;
    bucket.raw += Buffer.byteLength(src);
    bucket.gz += zlib.gzipSync(src, { level: 9 }).length;
  }
  if (doParse) {
    const handalone = path.join(LANG, "src/js/base/handalone.js");
    const script = path.join(BENCH, "measure-parse.js");
    const measure = (flags) => {
      const r = spawnSync(process.execPath, flags.concat([script, jarr, prog, handalone]), { encoding: "utf8", maxBuffer: 1 << 28 });
      if (r.status !== 0) { throw new Error("measure-parse failed: " + r.stderr); }
      return JSON.parse(r.stdout);
    };
    res.compileLazyMs = measure([]);
    res.compileEagerMs = measure(["--no-lazy"]);
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
  const programs = (opts.programs || listPrograms()).map((p) => {
    if (!p.endsWith(".arr")) { return p; }
    const name = path.basename(p, ".arr");
    EXTRA_SOURCES[name] = path.resolve(p);
    return name;
  }).concat(["empty"]).filter((p, i, a) => a.indexOf(p) === i);
  fs.mkdirSync(OUT, { recursive: true });

  const results = { runs: opts.runs, node: process.version, variants: {}, mismatches: [] };
  const jobs = [];
  for (const v of variants) {
    results.variants[v.name] = { description: v.description, codegen: v.codegen, programs: {} };
    if (!opts.skipCompile) { fs.rmSync(path.join(variantDir(v), "compiled"), { recursive: true, force: true }); }
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
      const entry = { compileS: (Date.now() - t0) / 1000, sizes: sizes(jarr, prog, opts.parse), times: [] };
      results.variants[v.name].programs[prog] = entry;
      jobs.push({ v, prog, jarr, entry });
      process.stderr.write("compiled " + v.name + "/" + prog + " in " + entry.compileS.toFixed(1) + "s\n");
    }
  }

  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let round = 0; round < opts.runs; round++) {
    const order = jobs.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const k = Math.floor(rand() * (i + 1));
      [order[i], order[k]] = [order[k], order[i]];
    }
    for (const job of order) {
      const r = runOnce(job.v, job.jarr);
      const e = job.entry;
      if (e.stdout === undefined) {
        e.stdout = r.stdout; e.status = r.status; e.stderrTail = r.stderr.slice(-2000);
      } else if (r.stdout !== e.stdout) {
        results.mismatches.push({ variant: job.v.name, program: job.prog, kind: "nondeterministic" });
      }
      e.times.push(r.ms);
      e.medianMs = median(e.times);
    }
    process.stderr.write("round " + (round + 1) + "/" + opts.runs + " done\n");
    fs.writeFileSync(opts.out, JSON.stringify(results, null, 1));
  }

  for (const job of jobs) {
    const e = job.entry;
    const base = results.variants.baseline.programs[job.prog];
    if (job.v.name !== "baseline" && base && base.stdout !== e.stdout) {
      results.mismatches.push({ variant: job.v.name, program: job.prog, kind: "differs-from-baseline" });
    }
    if (e.status !== 0 && job.prog !== "checks") {
      results.mismatches.push({ variant: job.v.name, program: job.prog, kind: "exit-" + e.status });
    }
    process.stderr.write(job.v.name + "/" + job.prog + ": " + (e.medianMs || 0).toFixed(0) + "ms " +
      JSON.stringify((e.stdout || "").slice(0, 60)) + (e.status ? " EXIT " + e.status + " " + e.stderrTail.slice(-300) : "") + "\n");
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
