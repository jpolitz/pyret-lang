"use strict";

const fs = require("fs");
const vm = require("vm");

const [jarr, prog, handalonePath] = process.argv.slice(2);

function extractProgram() {
  const s = fs.readFileSync(jarr, "utf8");
  const start = s.indexOf('define("program", ');
  const marker = "function() {\nreturn ";
  const j = s.indexOf(marker, start) + marker.length;
  const handalone = fs.readFileSync(handalonePath, "utf8");
  const k = s.lastIndexOf("\n});\n" + handalone.slice(0, 64));
  return (0, eval)("(" + s.slice(j, k) + ")");
}

function timeCompile(src, n) {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t0 = process.hrtime.bigint();
    new vm.Script("(" + src + ")\n//" + n + "_" + i, { filename: "m" + n + "_" + i + ".js" });
    best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return best;
}

const p = extractProgram();
const out = { prog: 0, stdlib: 0 };
let n = 0;
for (const uri of p.toLoad) {
  const m = p.staticModules[uri];
  if (typeof m.theModule !== "string") { continue; }
  const isProg = uri.startsWith("file://") && uri.endsWith("/" + prog + ".arr");
  out[isProg ? "prog" : "stdlib"] += timeCompile(m.theModule, n++);
}
process.stdout.write(JSON.stringify(out));
