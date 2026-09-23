const { execFileSync } = require('child_process');
const P = __dirname, N = 5;
const progs = ['empty', 'fixloop', 'rough', 'decimals', 'mid', 'fact', 'fib', 'bigpow', 'harmonic', 'compound'];
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
for (const p of progs) {
  const t = { rebased: [], bigint: [] }, out = {};
  for (let i = 0; i < N; i++) for (const lib of (i % 2 ? ['bigint', 'rebased'] : ['rebased', 'bigint'])) {
    const a = process.hrtime.bigint();
    out[lib] = execFileSync('node', [`${P}/${lib}/${p}.jarr`], { env: process.env, timeout: 600000 }).toString().trim().split('\n').pop();
    t[lib].push(Number(process.hrtime.bigint() - a) / 1e6);
  }
  console.log(p.padEnd(10), 'jsbn', (med(t.rebased) / 1000).toFixed(2).padStart(7), 's  bigint', (med(t.bigint) / 1000).toFixed(2).padStart(7), 's  ratio', (med(t.rebased) / med(t.bigint)).toFixed(2), out.rebased === out.bigint ? 'same' : 'DIFF ' + out.rebased + ' / ' + out.bigint, JSON.stringify({ j: t.rebased.map(x => Math.round(x)), b: t.bigint.map(x => Math.round(x)) }));
}
