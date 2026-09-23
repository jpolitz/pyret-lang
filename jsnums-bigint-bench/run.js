'use strict';
const { execFileSync } = require('child_process');
const W = require('./workloads');
const LIBS = {
  jsbn: '/home/exedev/work/jsnums-rebased/lang/src/js/base/js-numbers.js',
  bigint: '/home/exedev/work/jsnums-bigint/lang/src/js/base/js-numbers.js',
};
const only = process.argv[2];
const rows = [];
for (const name of Object.keys(W)) {
  if (only && !name.includes(only)) continue;
  const r = {};
  for (const [k, p] of Object.entries(LIBS)) {
    try { r[k] = JSON.parse(execFileSync('node', [__dirname + '/one.js', p, name], { timeout: 180000, maxBuffer: 1e7 }).toString()); }
    catch (e) { r[k] = { error: String(e.message).slice(0, 200) }; }
  }
  const same = r.jsbn.digest && r.jsbn.digest === r.bigint.digest;
  const speedup = r.jsbn.median / r.bigint.median;
  rows.push({ name, jsbn: r.jsbn.median, bigint: r.bigint.median, speedup, same, jsbnSpread: [r.jsbn.min, r.jsbn.max], bigintSpread: [r.bigint.min, r.bigint.max], err: r.jsbn.error || r.bigint.error });
  const f = x => x === undefined ? 'ERR' : x < 1 ? x.toFixed(4) : x.toFixed(2);
  console.log([name.padEnd(48), f(r.jsbn.median).padStart(10), f(r.bigint.median).padStart(10), (speedup.toFixed(2) + 'x').padStart(9), same ? 'same' : 'DIFF ' + JSON.stringify([r.jsbn, r.bigint])].join(' '));
}
require('fs').writeFileSync(__dirname + '/results-' + (only || 'all') + '.json', JSON.stringify(rows, null, 1));
