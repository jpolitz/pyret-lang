// Test-support code for the js-numbers suite. Authored by Claude (agent).
// Loads lang/src/js/base/js-numbers.js directly (no Pyret build needed)
// and provides a BigInt-backed exact-rational oracle plus deterministic
// pseudo-random generators for property tests.
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const SRC_PATH = path.join(__dirname, '..', '..', 'src', 'js', 'base', 'js-numbers.js');

// Optionally inject a fake `navigator` to force a specific BigInteger
// digit configuration (am1/26, am2/30, am3/28).
function loadJsNumbers(fakeNavigator) {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  let mod;
  const define = (name, factory) => { mod = factory(); };
  new Function('define', 'navigator', src)(define, fakeNavigator);
  if (!mod) throw new Error('js-numbers did not call define()');
  return mod;
}

// JSNUMS_TEST_APPNAME forces a digit configuration for the whole suite
// (e.g. "Opera" -> am1/26, "Microsoft Internet Explorer" -> am2/30).
const forcedAppName = process.env.JSNUMS_TEST_APPNAME;
const jsnums = loadJsNumbers(forcedAppName ? { appName: forcedAppName } : undefined);

// Shorthand: parse a number literal, asserting the parse succeeds.
function N(s) {
  const v = jsnums.fromString(s);
  assert.notEqual(v, false, `fromString(${JSON.stringify(s)}) failed to parse`);
  return v;
}

function kindOf(x) {
  if (typeof x === 'number') return 'fixnum';
  if (x instanceof jsnums.BigInteger) return 'bigint';
  if (x instanceof jsnums.Rational) return 'rational';
  if (x instanceof jsnums.Roughnum) return 'roughnum';
  return 'not-a-pyretnum';
}

// Numeric equality usable across every variant (eqv distinguishes
// exact from rough; two roughnums compare by their doubles).
function sameNum(a, b) {
  return jsnums.eqv(a, b);
}

function assertNum(actual, expected, msg) {
  const e = typeof expected === 'string' ? N(expected) : expected;
  assert.ok(jsnums.isPyretNumber(actual),
    `${msg || ''}: expected a pyretnum, got ${actual} (${kindOf(actual)})`);
  assert.ok(sameNum(actual, e),
    `${msg || ''}: expected ${e} but got ${actual} (${kindOf(actual)})`);
}

// Assert both value and representation kind.
function assertNumKind(actual, expected, kind, msg) {
  assertNum(actual, expected, msg);
  assert.equal(kindOf(actual), kind,
    `${msg || ''}: expected kind ${kind} for ${actual}`);
}

// Assert an integer result (fixnum or bigint) with an exact BigInt value.
function assertIntVal(actual, expectedBig, msg) {
  const k = kindOf(actual);
  assert.ok(k === 'fixnum' || k === 'bigint',
    `${msg || ''}: expected an integer representation, got ${k} (${actual})`);
  if (k === 'fixnum') {
    assert.ok(Number.isInteger(actual), `${msg || ''}: fixnum ${actual} is not an integer`);
    assert.equal(BigInt(actual), expectedBig, `${msg || ''}: got ${actual}`);
  } else {
    assert.equal(BigInt(actual.toString()), expectedBig, `${msg || ''}: got ${actual}`);
  }
}

// Assert a roughnum whose double is exactly d.
function assertRough(actual, d, msg) {
  assert.equal(kindOf(actual), 'roughnum', `${msg || ''}: expected roughnum, got ${actual} (${kindOf(actual)})`);
  assert.equal(actual.n, d, `${msg || ''}: expected ~${d}, got ${actual}`);
}

// Assert a roughnum whose double is within relTol of d.
function assertRoughApprox(actual, d, relTol, msg) {
  assert.equal(kindOf(actual), 'roughnum', `${msg || ''}: expected roughnum, got ${actual} (${kindOf(actual)})`);
  const err = Math.abs(actual.n - d);
  const bound = Math.abs(d) * (relTol || 1e-12) + Number.MIN_VALUE;
  assert.ok(err <= bound, `${msg || ''}: expected ~${d} +/- ${bound}, got ${actual}`);
}

// The default errbacks throw Error('js-numbers <tag>: ...').
function assertThrowsTag(f, tag, msg) {
  assert.throws(f, (e) => {
    const text = (e && e.message) || String(e);
    return text.indexOf('js-numbers ' + tag) !== -1;
  }, `${msg || ''}: expected a js-numbers ${tag} error`);
}

//////////////////////////////////////////////////////////////////////
// Exact-rational oracle over BigInt.

function bigGcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) { const t = a % b; a = b; b = t; }
  return a;
}

// Q: normalized fraction of BigInts, d > 0.
class Q {
  constructor(n, d) {
    if (d === undefined) d = 1n;
    if (d === 0n) throw new Error('Q: zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = bigGcd(n, d);
    this.n = g === 0n ? 0n : n / g;
    this.d = g === 0n ? 1n : d / g;
  }
  add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Q(this.n * o.n, this.d * o.d); }
  div(o) { return new Q(this.n * o.d, this.d * o.n); }
  neg() { return new Q(-this.n, this.d); }
  abs() { return this.n < 0n ? this.neg() : this; }
  // -1, 0, 1 comparison
  cmp(o) {
    const l = this.n * o.d, r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  eq(o) { return this.n === o.n && this.d === o.d; }
  isInt() { return this.d === 1n; }
  floor() {
    let q = this.n / this.d;
    if (this.n < 0n && q * this.d !== this.n) q -= 1n;
    return q;
  }
  ceil() { return -(this.neg().floor()); }
  toString() { return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`; }
}

// Convert an exact pyretnum (fixnum integer, BigInteger, Rational) to Q.
function pyToQ(x) {
  const k = kindOf(x);
  if (k === 'fixnum') {
    if (!Number.isInteger(x)) throw new Error(`pyToQ: non-integer fixnum ${x}`);
    return new Q(BigInt(x));
  }
  if (k === 'bigint') return new Q(BigInt(x.toString()));
  if (k === 'rational') {
    const n = x.n, d = x.d;
    const toB = (v) => typeof v === 'number' ? BigInt(v) : BigInt(v.toString());
    return new Q(toB(n), toB(d));
  }
  throw new Error(`pyToQ: cannot convert ${x} (${k})`);
}

// Exact rational value of a finite JS double (binary decomposition).
function doubleToQ(x) {
  if (!isFinite(x)) throw new Error('doubleToQ: non-finite');
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, x);
  const hi = BigInt(buf.getUint32(0)), lo = BigInt(buf.getUint32(4));
  const bits = (hi << 32n) | lo;
  const sign = (bits >> 63n) & 1n;
  const expo = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0xfffffffffffffn;
  let m, e;
  if (expo === 0) { m = frac; e = -1074; }
  else { m = frac | 0x10000000000000n; e = expo - 1075; }
  if (sign === 1n) m = -m;
  if (e >= 0) return new Q(m * (1n << BigInt(e)));
  return new Q(m, 1n << BigInt(-e));
}

function bitLength(b) {
  return b === 0n ? 0 : b.toString(2).length;
}

// Reference correctly-rounded (round-half-even) conversion Q -> double,
// implemented over BigInt. Validated bit-exactly against IEEE semantics
// in properties.test.js before being used as an oracle.
function qToNearestDouble(q) {
  let n = q.n, d = q.d;
  if (n === 0n) return 0;
  const neg = n < 0n;
  if (neg) n = -n;
  const shift = 55 - (bitLength(n) - bitLength(d));
  let num = n, den = d;
  if (shift > 0) num = n << BigInt(shift);
  else if (shift < 0) den = d << BigInt(-shift);
  const quo = num / den;
  const rem = num % den;
  let e2 = bitLength(quo) - 1 - shift;
  if (e2 > 1023) return neg ? -Infinity : Infinity;
  if (e2 < -1075) return neg ? -0 : 0;
  const keep = Math.min(53, 1075 + e2);
  const drop = BigInt(bitLength(quo) - keep);
  let q2 = quo >> drop;
  const low = quo - (q2 << drop);
  const half = 1n << (drop - 1n);
  if (low > half || (low === half && (rem !== 0n || (q2 & 1n) === 1n))) {
    q2 += 1n;
  }
  if (q2 === 0n) return neg ? -0 : 0;
  let res = Number(q2);
  let s = e2 - keep + 1;
  while (s > 0) { res *= 2; s -= 1; }
  while (s < 0) { res *= 0.5; s += 1; }
  return neg ? -res : res;
}

//////////////////////////////////////////////////////////////////////
// Deterministic PRNG (mulberry32) and generators.

function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    bool: () => next() < 0.5,
    // random BigInt with up to `maxBits` bits (never negative)
    bigint(maxBits) {
      const bits = rng.int(1, maxBits);
      let v = 0n;
      for (let got = 0; got < bits; got += 30) {
        v = (v << 30n) | BigInt(rng.int(0, (1 << 30) - 1));
      }
      const excess = bitLength(v) - bits;
      if (excess > 0) v >>= BigInt(excess);
      return v;
    },
    signedBigint(maxBits) {
      const v = rng.bigint(maxBits);
      return rng.bool() ? -v : v;
    },
    // random finite double spanning the full exponent range (incl. subnormals)
    double() {
      const buf = new DataView(new ArrayBuffer(8));
      buf.setUint32(0, rng.int(0, 0xffffffff));
      buf.setUint32(4, rng.int(0, 0xffffffff));
      let x = buf.getFloat64(0);
      if (!isFinite(x)) x = rng.next() * 2e15 - 1e15;
      return x;
    },
    // random fixnum-range safe integer
    fixnumInt() {
      const mag = Math.floor(Math.pow(10, rng.next() * 15.9));
      const v = rng.int(0, Math.min(mag, 9e15));
      return rng.bool() ? -v : v;
    },
  };
  return rng;
}

// Build a pyretnum from a Q via strings (exercises fromString for
// integers, division for general rationals).
function qToPy(q) {
  if (q.isInt()) return N(q.n.toString());
  return jsnums.divide(N(q.n.toString()), N(q.d.toString()));
}

module.exports = {
  jsnums, loadJsNumbers, N, kindOf, sameNum,
  assertNum, assertNumKind, assertIntVal, assertRough, assertRoughApprox, assertThrowsTag,
  Q, bigGcd, pyToQ, doubleToQ, qToNearestDouble, bitLength,
  makeRng, qToPy,
};
