'use strict';
// node one.js <libPath> <workload name> -> JSON {msPerIter samples, digest}
const { loadLibrary } = require('/home/exedev/work/jsnums-bigint/lang/tests/jsnums-test/load.js');
const W = require('./workloads');
const [libPath, name] = process.argv.slice(2);
const { lib: L } = loadLibrary(libPath);
const w = W[name];
const state = w.setup ? w.setup(L) : undefined;
const now = () => Number(process.hrtime.bigint()) / 1e6;
let result;
// warm-up: at least 300 ms or 3 runs
let t0 = now(), n = 0;
while (n < 3 || now() - t0 < 300) { result = w.run(L, state); n++; if (now() - t0 > 20000) break; }
const samples = [];
for (let s = 0; s < 7; s++) {
  const a = now(); let k = 0;
  do { result = w.run(L, state); k++; } while (now() - a < 150);
  samples.push((now() - a) / k);
}
samples.sort((a, b) => a - b);
const str = String(result);
const crypto = require('crypto');
console.log(JSON.stringify({ median: samples[3], min: samples[0], max: samples[6], digest: crypto.createHash('sha1').update(str).digest('hex').slice(0, 12), len: str.length }));
