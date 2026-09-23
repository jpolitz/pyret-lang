const { loadLibrary } = require('/home/exedev/work/jsnums-bigint/lang/tests/jsnums-test/load.js');
const L = loadLibrary('/home/exedev/work/jsnums-bigint/lang/src/js/base/js-numbers.js').lib;
const g = L._innards._integerGcd;
let seed = 12345n; const rnd = bits => { let r = 0n; for (let i = 0; i < bits; i += 31) { seed = (seed * 1103515245n + 12345n) % 2147483648n; r = (r << 31n) | seed; } return r >> BigInt(Math.max(0, Math.ceil(bits / 31) * 31 - bits)); };
const ref = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const toL = v => L.fromString(v.toString());
const fibs = [0n, 1n]; for (let i = 2; i < 6000; i++) fibs.push(fibs[i - 1] + fibs[i - 2]);
let n = 0, bad = 0;
const check = (a, b) => { n++; const got = String(g(toL(a), toL(b))), want = ref(a, b).toString(); if (got !== want) { if (bad++ < 5) console.log('MISMATCH', a, b, got, want); } };
for (let i = 0; i < 20000; i++) {
  const ba = 1 + (i * 37) % 3000, bb = 1 + (i * 91) % 3000;
  let a = rnd(ba), b = rnd(bb);
  const c = rnd(1 + (i % 500));
  if (i % 3 === 0) { a *= c; b *= c; }
  if (i % 7 === 0) b = -b;
  if (i % 11 === 0) a = -a;
  check(a, b);
}
for (let i = 50; i < 6000; i += 37) { check(fibs[i], fibs[i - 1]); check(fibs[i] * 7n, fibs[i - 1] * 7n); check(fibs[i], fibs[i - 17]); }
for (let k = 1; k < 3000; k += 13) { check(1n << BigInt(k), 1n << BigInt(k >> 1)); check((1n << BigInt(k)) - 1n, (1n << BigInt(k >> 1)) - 1n); check(rnd(k), rnd(k)); const x = rnd(k) + 1n; check(x, x); check(x, 0n); check(0n, x); check(x * 3n, x); check(x, x + 1n); check((1n << 60n) * x, (1n << 60n)); }
console.log('checked', n, 'mismatches', bad);
