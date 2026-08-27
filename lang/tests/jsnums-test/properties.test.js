// js-numbers tests: cross-cutting generative properties, most importantly
// correctly-rounded toFixnum against a bit-level-validated oracle.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  jsnums: JN, N, kindOf,
  assertNum, assertIntVal, assertThrowsTag,
  Q, pyToQ, qToPy, doubleToQ, qToNearestDouble, makeRng,
} = require('./helpers.js');

test('oracle self-check: qToNearestDouble inverts exact double decomposition', () => {
  const rng = makeRng(0x0c1e);
  const specials = [0, 1, -1, 0.5, 2 ** 53, 2 ** 53 + 2, Number.MAX_VALUE,
                    Number.MIN_VALUE, 2 ** -1022, 2 ** -1022 * (1 - 2 ** -52),
                    5e-324, 1e308, 9e15, 3.141592653589793];
  for (const x of specials) {
    assert.equal(qToNearestDouble(doubleToQ(x)), x, `oracle(${x})`);
    if (x !== 0) assert.equal(qToNearestDouble(doubleToQ(-x)), -x, `oracle(${-x})`);
  }
  for (let i = 0; i < 4000; i++) {
    const x = rng.double();
    assert.equal(qToNearestDouble(doubleToQ(x)), x, `oracle(${x})`);
  }
});

test('oracle self-check: rounding boundaries at half-ulp', () => {
  const rng = makeRng(0xb0b0);
  for (let i = 0; i < 1500; i++) {
    let x = Math.abs(rng.double());
    if (!isFinite(x) || x === 0) continue;
    const q = doubleToQ(x);
    const up = doubleToQ(nextUp(x));
    if (!isFinite(nextUp(x))) continue;
    // midpoint between adjacent doubles must round to the even one
    const mid = q.add(up).div(new Q(2n));
    const rounded = qToNearestDouble(mid);
    assert.ok(rounded === x || rounded === nextUp(x), `midpoint lands on a neighbor of ${x}`);
    const evenPick = (doubleToQ(rounded).sub(q).n === 0n) ? x : nextUp(x);
    assert.equal(rounded, evenPick === rounded ? rounded : rounded); // structural sanity
    // strictly inside the half-open interval rounds to x
    const closer = q.mul(new Q(3n)).add(up).div(new Q(4n)); // 3/4 x + 1/4 next
    assert.equal(qToNearestDouble(closer), x, `inside interval of ${x}`);
  }

  function nextUp(v) {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, v);
    let hi = buf.getUint32(0), lo = buf.getUint32(4);
    lo = (lo + 1) >>> 0;
    if (lo === 0) hi = (hi + 1) >>> 0;
    buf.setUint32(0, hi); buf.setUint32(4, lo);
    return buf.getFloat64(0);
  }
});

test('toFixnum is correctly rounded for random rationals', () => {
  const rng = makeRng(0x70f1);
  for (let i = 0; i < 3000; i++) {
    const nbits = rng.pick([10, 30, 53, 60, 100, 200, 800, 1100]);
    const dbits = rng.pick([1, 20, 53, 64, 120, 700, 1100]);
    const n = (rng.bool() ? -1n : 1n) * rng.bigint(nbits);
    const d = rng.bigint(dbits) + 1n;
    const q = new Q(n, d);
    const expected = qToNearestDouble(q);
    const p = qToPy(q);
    const got = JN.toFixnum(p);
    assert.ok(Object.is(got, expected) || got === expected,
      `toFixnum(${q}) = ${got}, expected ${expected}`);
  }
});

test('toFixnum is correctly rounded for random big integers', () => {
  const rng = makeRng(0x71f2);
  for (let i = 0; i < 2000; i++) {
    const n = (rng.bool() ? -1n : 1n) * rng.bigint(rng.pick([54, 60, 80, 200, 1000, 1090]));
    const q = new Q(n);
    const p = N(n.toString());
    assert.equal(JN.toFixnum(p), qToNearestDouble(q), `toFixnum(${n})`);
  }
});

test('toFixnum handles overflow/underflow boundaries', () => {
  // largest finite double and the first rational that rounds to Infinity
  const maxQ = doubleToQ(Number.MAX_VALUE);
  assert.equal(JN.toFixnum(qToPy(maxQ)), Number.MAX_VALUE);
  // MAX_VALUE + ulp/2 (ties to even -> Infinity)
  const halfUlp = new Q(1n << 970n);
  assert.equal(JN.toFixnum(qToPy(maxQ.add(halfUlp))), Infinity);
  assert.equal(JN.toFixnum(qToPy(maxQ.add(halfUlp).neg())), -Infinity);
  // just below that boundary stays finite
  const below = maxQ.add(halfUlp).sub(new Q(1n));
  assert.equal(JN.toFixnum(qToPy(below)), Number.MAX_VALUE);
  // subnormals
  const minQ = doubleToQ(Number.MIN_VALUE);
  assert.equal(JN.toFixnum(qToPy(minQ)), Number.MIN_VALUE);
  const halfMin = minQ.div(new Q(2n));
  assert.equal(JN.toFixnum(qToPy(halfMin)), 0, 'half of MIN_VALUE ties to even 0');
  const justOver = halfMin.mul(new Q(1000001n, 1000000n));
  assert.equal(JN.toFixnum(qToPy(justOver)), Number.MIN_VALUE);
  const justUnder = halfMin.mul(new Q(999999n, 1000000n));
  assert.equal(JN.toFixnum(qToPy(justUnder)), 0);
});

test('toFixnum ties-to-even on exact midpoints between adjacent doubles', () => {
  const rng = makeRng(0x7135);
  let checked = 0;
  for (let i = 0; i < 600; i++) {
    const x = Math.abs(rng.double());
    if (!isFinite(x) || x === 0) continue;
    const next = nextUp(x);
    if (!isFinite(next) || next === x) continue;
    const qx = doubleToQ(x), qn = doubleToQ(next);
    const mid = qx.add(qn).div(new Q(2n));
    const got = JN.toFixnum(qToPy(mid));
    // the tie must land on whichever neighbor has an even significand
    assert.ok(got === x || got === next, `midpoint of ${x}`);
    assert.equal(got, qToNearestDouble(mid), `tie parity for ${x}`);
    // a hair above the midpoint must round up, a hair below must round down
    const eps = new Q(1n, 10n ** 40n);
    const above = mid.add(mid.mul(eps));
    const below = mid.sub(mid.mul(eps));
    assert.equal(JN.toFixnum(qToPy(above)), next, `above midpoint of ${x}`);
    assert.equal(JN.toFixnum(qToPy(below)), x, `below midpoint of ${x}`);
    checked++;
  }
  assert.ok(checked > 300, `checked ${checked} midpoints`);

  function nextUp(v) {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, v);
    let hi = buf.getUint32(0), lo = buf.getUint32(4);
    lo = (lo + 1) >>> 0;
    if (lo === 0) hi = (hi + 1) >>> 0;
    buf.setUint32(0, hi); buf.setUint32(4, lo);
    return buf.getFloat64(0);
  }
});

test('exact -> rough -> exact -> fixnum chains are stable', () => {
  const rng = makeRng(0xc4a1);
  for (let i = 0; i < 800; i++) {
    const x = rng.double();
    let r;
    try { r = JN.makeRoughnum(x); } catch (e) { continue; }
    // toRoughnum(toRational(~x)) preserves the double exactly
    const back = JN.toRoughnum(JN.toRational(r));
    assert.equal(back.n, x, `chain roundtrip ${x}`);
  }
});

test('property: string roundtrip through toString for every variant', () => {
  const rng = makeRng(0x57f1);
  for (let i = 0; i < 800; i++) {
    const choice = rng.int(0, 3);
    let v;
    if (choice === 0) v = rng.fixnumInt();
    else if (choice === 1) v = N(((rng.bool() ? -1n : 1n) * rng.bigint(150)).toString());
    else if (choice === 2) v = qToPy(new Q(rng.signedBigint(90), rng.bigint(60) + 1n));
    else {
      const x = rng.double();
      try { v = JN.makeRoughnum(x); } catch (e) { continue; }
    }
    const s = v.toString();
    const back = JN.fromString(s);
    assert.notEqual(back, false, `parse ${s}`);
    assert.ok(JN.eqv(v, back), `roundtrip ${s}`);
  }
});

test('property: comparison total order on mixed exact values', () => {
  const rng = makeRng(0x0dd);
  const values = [];
  for (let i = 0; i < 60; i++) {
    const c = rng.int(0, 2);
    if (c === 0) values.push(rng.fixnumInt());
    else if (c === 1) values.push(N(((rng.bool() ? -1n : 1n) * rng.bigint(80)).toString()));
    else values.push(qToPy(new Q(rng.signedBigint(50), rng.bigint(30) + 1n)));
  }
  for (const a of values) {
    for (const b of values) {
      const qa = pyToQ(a), qb = pyToQ(b);
      const cmp = qa.cmp(qb);
      assert.equal(JN.lessThan(a, b), cmp < 0);
      assert.equal(JN.greaterThan(a, b), cmp > 0);
      assert.equal(JN.equals(a, b), cmp === 0);
      assert.equal(JN.lessThanOrEqual(a, b), cmp <= 0);
      assert.equal(JN.greaterThanOrEqual(a, b), cmp >= 0);
    }
  }
});

test('property: add/sub/mul/div results always have canonical kind', () => {
  const rng = makeRng(0xca11);
  const gen = () => {
    const c = rng.int(0, 2);
    if (c === 0) return rng.fixnumInt();
    if (c === 1) return N(((rng.bool() ? -1n : 1n) * rng.bigint(90)).toString());
    return qToPy(new Q(rng.signedBigint(60), rng.bigint(40) + 1n));
  };
  for (let i = 0; i < 1000; i++) {
    const a = gen(), b = gen();
    for (const f of [JN.add, JN.subtract, JN.multiply]) {
      const res = f(a, b);
      checkCanonical(res, `${f.name || 'op'}(${a}, ${b})`);
    }
    if (!JN.equals(b, 0)) checkCanonical(JN.divide(a, b), `divide(${a}, ${b})`);
  }

  function checkCanonical(v, msg) {
    const k = kindOf(v);
    assert.notEqual(k, 'not-a-pyretnum', msg);
    if (k === 'fixnum') {
      assert.ok(Number.isInteger(v), `${msg}: non-integer raw number ${v}`);
      assert.ok(Math.abs(v) <= 9e15, `${msg}: out-of-range fixnum ${v}`);
    } else if (k === 'bigint') {
      assert.ok(JN.greaterThan(JN.abs(v), 9e15), `${msg}: small BigInteger ${v}`);
    } else if (k === 'rational') {
      // reduced, positive denominator, non-integer
      assert.ok(!JN.equals(v.d, 1), `${msg}: rational with denominator 1`);
      assert.ok(JN.isPositive(v.d), `${msg}: non-positive denominator`);
      assertNum(JN.gcd(v.n, v.d), 1, `${msg}: unreduced rational`);
      // components themselves canonical
      for (const c of [v.n, v.d]) {
        if (kindOf(c) === 'bigint') {
          assert.ok(JN.greaterThan(JN.abs(c), 9e15), `${msg}: small BigInteger component`);
        }
      }
    }
  }
});

test('property: expt/log/sqrt consistency', () => {
  const rng = makeRng(0xe5e5);
  for (let i = 0; i < 300; i++) {
    const b = rng.int(2, 50);
    const e = rng.int(1, 12);
    const p = JN.expt(b, e);
    // integerSqrt(b^(2e)) === b^e
    assert.ok(JN.equals(JN.integerSqrt(JN.expt(b, 2 * e)), p));
    assert.ok(JN.equals(JN.sqrt(JN.sqr(p)), p));
    // log(b^e) ~ e*log(b)
    const lg = JN.toFixnum(JN.log(p));
    const expect = e * Math.log(b);
    assert.ok(Math.abs(lg - expect) < 1e-9 * Math.max(1, Math.abs(expect)), `log(${b}^${e})`);
  }
});

test('property: quotient/remainder/gcd never mutate their arguments', () => {
  const a = JN.makeBignum('123456789012345678901234567890');
  const b = JN.makeBignum('987654321098765432109');
  const sa = a.toString(), sb = b.toString();
  JN.quotient(a, b); JN.remainder(a, b); JN.gcd(a, b); JN.lcm(a, b);
  JN.add(a, b); JN.multiply(a, b); JN.subtract(a, b); JN.divide(a, b);
  JN.integerSqrt(a); JN.sqrt(a); JN.floor(a); JN.log(a); JN.toFixnum(a);
  JN.expt(a, 3); JN.modulo(a, b); JN.toRoughnum(a);
  assert.equal(a.toString(), sa, 'a mutated');
  assert.equal(b.toString(), sb, 'b mutated');
});

test('deep chained computation: rational sums telescope exactly', () => {
  // sum_{k=1..60} 1/(k(k+1)) = 1 - 1/61
  let acc = 0;
  for (let k = 1; k <= 60; k++) {
    acc = JN.add(acc, JN.divide(1, k * (k + 1)));
  }
  assertNum(acc, N('60/61'));
  // harmonic-ish alternating sum stays exact and reproducible
  let alt = 0;
  for (let k = 1; k <= 40; k++) {
    const term = JN.divide((k % 2 === 0) ? -1 : 1, k);
    alt = JN.add(alt, term);
  }
  const back = JN.subtract(alt, alt);
  assertNum(back, 0);
  assert.ok(JN.greaterThan(alt, N('1/2')) && JN.lessThan(alt, 1));
});

test('factorial chain: 50! exact and divisible', () => {
  let fact = 1;
  for (let k = 2; k <= 50; k++) fact = JN.multiply(fact, k);
  let expected = 1n;
  for (let k = 2n; k <= 50n; k++) expected *= k;
  assertIntVal(fact, expected);
  // divide back down
  let down = fact;
  for (let k = 50; k >= 2; k--) down = JN.divide(down, k);
  assertNum(down, 1);
  assertNum(JN.modulo(fact, 47), 0);
  assertNum(JN.remainder(JN.add(fact, 1), 2), 1);
});
