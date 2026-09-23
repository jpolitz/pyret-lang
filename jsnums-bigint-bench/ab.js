const { execFileSync } = require('child_process');
const LIBS = { jsbn: '/home/exedev/work/jsnums-rebased/lang/src/js/base/js-numbers.js', bigint: '/home/exedev/work/jsnums-bigint/lang/src/js/base/js-numbers.js' };
const N = +process.argv[3] || 10;
const name = Object.keys(require('./workloads')).find(k => k.includes(process.argv[2]));
const t = { jsbn: [], bigint: [] };
for (let i = 0; i < N; i++) for (const k of (i % 2 ? ['bigint', 'jsbn'] : ['jsbn', 'bigint']))
  t[k].push(JSON.parse(execFileSync('node', [__dirname + '/one.js', LIBS[k], name]).toString()).median);
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
console.log(name.padEnd(40), 'jsbn', med(t.jsbn).toFixed(3), 'bigint', med(t.bigint).toFixed(3), 'ratio', (med(t.jsbn) / med(t.bigint)).toFixed(3), JSON.stringify({ jsbn: t.jsbn.map(x => +x.toFixed(2)), bigint: t.bigint.map(x => +x.toFixed(2)) }));
