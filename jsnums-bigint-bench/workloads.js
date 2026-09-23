'use strict';
// Each workload: setup(L) -> state; run(L, state) -> result (stringified for cross-checking).
function fact(L, n) { let r = 1; for (let i = 2; i <= n; i++) r = L.multiply(r, i); return r; }
function fib(L, n) { let a = 0, b = 1; for (let i = 0; i < n; i++) { const t = L.add(a, b); a = b; b = t; } return a; }

module.exports = {
  // fixnum-only: the representation change must not slow these
  'fixnum add loop (1e6 adds)': { run(L) { let s = 0; for (let i = 0; i < 1e6; i++) s = L.add(s, i); return s; } },
  'fixnum mul/quotient/modulo mix (3e5)': { run(L) { let s = 1; for (let i = 1; i < 1e5; i++) { s = L.modulo(L.add(L.multiply(s, 7), i), 1000003); s = L.quotient(L.add(s, 5), 1); } return s; } },
  'small rationals: sum 1/10 x 1e5': { run(L) { let s = 0; const t = L.divide(1, 10); for (let i = 0; i < 1e5; i++) s = L.add(s, t); return s; } },
  'roughnum arithmetic (1e6)': { run(L) { let s = L.makeRoughnum(0); const x = L.makeRoughnum(1.5); for (let i = 0; i < 1e6; i++) s = L.add(s, x); return s; } },

  // just past the fixnum bound: the common "slightly big" case
  '20-digit add loop (1e5)': { setup(L) { return L.fromString('12345678901234567890'); }, run(L, x) { let s = x; for (let i = 0; i < 1e5; i++) s = L.add(s, x); return s; } },
  '20-digit multiply+quotient (1e5)': { setup(L) { return [L.fromString('12345678901234567890'), L.fromString('98765432109876543210')]; }, run(L, [x, y]) { let r; for (let i = 0; i < 1e5; i++) r = L.quotient(L.multiply(x, y), y); return r; } },
  '20-digit compare (1e5)': { setup(L) { return [L.fromString('12345678901234567890'), L.fromString('12345678901234567891')]; }, run(L, [x, y]) { let c = 0; for (let i = 0; i < 1e5; i++) if (L.lessThan(x, y)) c++; return c; } },
  'fixnum*fixnum overflow to bignum (1e5)': { run(L) { let r; for (let i = 0; i < 1e5; i++) r = L.multiply(3000000000 + i, 4000000000); return r; } },

  // bigger bignums
  'factorial 1000': { run(L) { return fact(L, 1000); } },
  'factorial 5000': { run(L) { return fact(L, 5000); } },
  'fibonacci 10000 (adds)': { run(L) { return fib(L, 10000); } },
  'expt 3^100000': { run(L) { return L.expt(3, 100000); } },
  'expt (7/3)^2000': { run(L) { return L.expt(L.divide(7, 3), 2000); } },
  'toString of 5000!': { setup(L) { return fact(L, 5000); }, run(L, x) { return x.toString().length; } },
  'fromString 10000 digits': { setup() { let s = ''; for (let i = 0; i < 10000; i++) s += String((i * 7 + 3) % 10); return '9' + s; }, run(L, s) { return L.fromString(s); } },
  'quotient/modulo 2000-digit by 1000-digit (200x)': { setup(L) { return [fib(L, 9500), fib(L, 4800)]; }, run(L, [a, b]) { let r; for (let i = 0; i < 200; i++) r = L.add(L.quotient(a, b), L.modulo(a, b)); return r; } },
  'gcd of fib(5000), fib(4000)': { setup(L) { return [fib(L, 5000), fib(L, 4000)]; }, run(L, [a, b]) { return L.gcd(a, b); } },
  'integerSqrt of 10^2000+1': { setup(L) { return L.add(L.expt(10, 2000), 1); }, run(L, x) { return L.integerSqrt(x); } },
  'toFixnum of 1000-digit rational (1000x)': { setup(L) { return L.divide(fib(L, 4801), fib(L, 4800)); }, run(L, q) { let r; for (let i = 0; i < 1000; i++) r = L.toFixnum(q); return r; } },

  // rationals whose parts become bignums
  'harmonic sum H(2000)': { run(L) { let s = 0; for (let k = 1; k <= 2000; k++) s = L.add(s, L.divide(1, k)); return s; } },
  'exact e series to 300 terms': { run(L) { let s = 0, t = 1; for (let k = 1; k <= 300; k++) { s = L.add(s, t); t = L.divide(t, k); } return s; } },
  'Newton sqrt(2) exact, 12 steps': { run(L) { let x = 1; for (let i = 0; i < 12; i++) x = L.divide(L.add(x, L.divide(2, x)), 2); return x; } },
  'toStringDigits of H(300) to 500 digits': { setup(L) { let s = 0; for (let k = 1; k <= 300; k++) s = L.add(s, L.divide(1, k)); return s; }, run(L, s) { return L.toStringDigits(s, 500); } },
};
