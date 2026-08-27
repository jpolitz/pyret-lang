// js-numbers tests: add/subtract/multiply/divide, comparisons, equality.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  jsnums: JN, N, kindOf,
  assertNum, assertNumKind, assertIntVal, assertRough, assertThrowsTag,
  Q, pyToQ, qToPy, makeRng,
} = require('./helpers.js');

test('basic arithmetic on fixnums', () => {
  assertNumKind(JN.add(1, 2), 3, 'fixnum');
  assertNumKind(JN.subtract(1, 2), -1, 'fixnum');
  assertNumKind(JN.multiply(3, 4), 12, 'fixnum');
  assertNumKind(JN.divide(6, 3), 2, 'fixnum');
  assertNumKind(JN.divide(1, 3), N('1/3'), 'rational');
  assertNumKind(JN.divide(-1, 3), N('-1/3'), 'rational');
  assertNumKind(JN.divide(1, -3), N('-1/3'), 'rational');
});

test('fixnum overflow promotes to exact bignums', () => {
  assertIntVal(JN.add(9e15, 9e15), 18000000000000000n);
  assertIntVal(JN.add(9e15, 1), 9000000000000001n);
  assertIntVal(JN.subtract(-9e15, 1), -9000000000000001n);
  assertIntVal(JN.multiply(9e15, 9e15), 81000000000000000000000000000000n);
  assertIntVal(JN.multiply(94906266, 94906266), 9007199326062756n);
  // exactness near 2^53: a sum whose double rounding would lose the low bit
  assertIntVal(JN.add(9007199254740992, 3), 9007199254740995n);
  assertIntVal(JN.multiply(3037000499, 3037000501), 9223372037000249999n);
});

test('bignum results collapse back to fixnums', () => {
  assertNumKind(JN.subtract(N('1e20'), N('1e20')), 0, 'fixnum');
  assertNumKind(JN.divide(N('1e20'), N('1e20')), 1, 'fixnum');
  assertNumKind(JN.subtract(N('100000000000000000001'), N('100000000000000000000')), 1, 'fixnum');
  assertNumKind(JN.add(N('1e20'), JN.negate ? JN.negate(N('1e20')) : JN.subtract(0, N('1e20'))), 0, 'fixnum');
  assertNumKind(JN.gcd(N('100000000000000000000'), N('100000000000000000001')), 1, 'fixnum');
});

test('mixed-type arithmetic: value and contagion', () => {
  // fixnum + bignum
  assertIntVal(JN.add(1, N('1e20')), 100000000000000000001n);
  // fixnum + rational
  assertNum(JN.add(1, N('1/2')), N('3/2'));
  // fixnum + roughnum
  assertRough(JN.add(1, N('~0.5')), 1.5);
  // bignum + rational
  assertNum(JN.add(N('1e20'), N('1/2')), N('200000000000000000001/2'));
  // bignum + roughnum
  assertRough(JN.add(N('1e20'), N('~0.5')), 1e20 + 0.5);
  // rational + roughnum
  assertRough(JN.add(N('1/2'), N('~0.25')), 0.75);
  // roughnum + roughnum
  assertRough(JN.add(N('~0.5'), N('~0.25')), 0.75);

  assertNum(JN.multiply(N('1/3'), 3), 1);
  assertNum(JN.multiply(N('2/3'), N('3/2')), 1);
  assertRough(JN.multiply(N('~2'), N('1/2')), 1);
  assertIntVal(JN.multiply(N('1e20'), N('1e20')), 10n ** 40n);
  assertNum(JN.divide(N('1/2'), N('1/3')), N('3/2'));
  assertRough(JN.divide(N('~1'), 4), 0.25);
  assertRough(JN.subtract(N('~1'), N('1/2')), 0.5);
});

test('identity special cases preserve roughness correctly', () => {
  const r = N('~2.5');
  assertRough(JN.add(0, r), 2.5);
  assertRough(JN.add(r, 0), 2.5);
  assertRough(JN.subtract(r, 0), 2.5);
  assertRough(JN.subtract(0, r), -2.5);
  assertRough(JN.multiply(1, r), 2.5);
  assertRough(JN.multiply(r, 1), 2.5);
  assertRough(JN.multiply(-1, r), -2.5);
  // exact zero times anything is exact zero (Racket-style)
  assertNumKind(JN.multiply(0, r), 0, 'fixnum');
  assertNumKind(JN.multiply(r, 0), 0, 'fixnum');
  // exact zero divided by a roughnum is exact zero
  assertNumKind(JN.divide(0, r), 0, 'fixnum');
  // rough zero divided by anything stays rough
  assertRough(JN.divide(N('~0'), 5), 0);
  assertRough(JN.divide(N('~0'), N('1/2')), 0);
});

test('division by zero', () => {
  const zeros = [0, N('~0'), JN.subtract(N('1e20'), N('1e20'))];
  const numerators = [1, -1, N('1e20'), N('1/2'), N('~2'), 0];
  for (const z of zeros) {
    for (const x of numerators) {
      assertThrowsTag(() => JN.divide(x, z), 'division-by-zero', `divide(${x}, ${z})`);
    }
  }
});

test('roughnum arithmetic overflow errors, underflow flushes to zero', () => {
  const big = N('~1e308');
  assertThrowsTag(() => JN.add(big, big), 'domain-error');
  assertThrowsTag(() => JN.multiply(big, big), 'domain-error');
  assertThrowsTag(() => JN.subtract(JN.multiply(-1, big), big), 'domain-error');
  const tiny = N('~1e-200');
  assertRough(JN.multiply(tiny, tiny), 0);
});

test('divide of huge rational by huge rational', () => {
  const a = JN.divide(N('1e300'), 7);
  const b = JN.divide(N('1e300'), 21);
  assertNum(JN.divide(a, b), 3);
});

test('equals', () => {
  assert.ok(JN.equals(1, 1));
  assert.ok(!JN.equals(1, 2));
  assert.ok(JN.equals(N('1/2'), N('2/4')));
  assert.ok(!JN.equals(N('1/2'), N('1/3')));
  assert.ok(JN.equals(N('1e20'), N('1e20')));
  assert.ok(JN.equals(JN.makeBignum('5'), 5));
  assert.ok(JN.equals(5, JN.makeBignum('5')));
  assert.ok(!JN.equals(JN.makeBignum('5'), 6));
  assert.ok(JN.equals(N('0.5'), N('1/2')));
  assert.ok(!JN.equals(N('1/2'), 1));
  assert.ok(JN.equals(0, JN.subtract(N('1e20'), N('1e20'))));
});

test('equals on roughnums raises incomparable-values', () => {
  assertThrowsTag(() => JN.equals(N('~1'), N('~1')), 'incomparable-values');
  assertThrowsTag(() => JN.equals(N('~1'), 1), 'incomparable-values');
  assertThrowsTag(() => JN.equals(1, N('~1')), 'incomparable-values');
  assertThrowsTag(() => JN.equals(N('~1'), N('1/2')), 'incomparable-values');
});

test('eqv is total and distinguishes exactness', () => {
  assert.ok(JN.eqv(1, 1));
  assert.ok(JN.eqv(N('1/2'), N('1/2')));
  assert.ok(JN.eqv(N('1e20'), N('1e20')));
  assert.ok(JN.eqv(N('~1.5'), N('~1.5')));
  assert.ok(!JN.eqv(N('~1.5'), N('~2.5')));
  assert.ok(!JN.eqv(N('~1'), 1));
  assert.ok(!JN.eqv(1, N('~1')));
  assert.ok(!JN.eqv(N('~0.5'), N('1/2')));
  assert.ok(JN.eqv(JN.makeBignum('7'), 7));
  const r = N('~3');
  assert.ok(JN.eqv(r, r));
});

test('equalsAnyZero recognizes every zero representation', () => {
  assert.ok(JN.equalsAnyZero(0));
  assert.ok(JN.equalsAnyZero(-0));
  assert.ok(JN.equalsAnyZero(N('~0')));
  assert.ok(JN.equalsAnyZero(JN.subtract(N('1e20'), N('1e20'))));
  assert.ok(JN.equalsAnyZero(JN.makeBignum('0')));
  assert.ok(!JN.equalsAnyZero(1));
  assert.ok(!JN.equalsAnyZero(N('1/2')));
  assert.ok(!JN.equalsAnyZero(N('~0.1')));
  assert.ok(!JN.equalsAnyZero(N('1e20')));
});

test('comparisons across all type pairs', () => {
  const half = N('1/2'), third = N('1/3');
  const big = N('1e20'), bigger = N('100000000000000000001');
  const r1 = N('~1'), r2 = N('~2');

  assert.ok(JN.lessThan(1, 2));
  assert.ok(!JN.lessThan(2, 2));
  assert.ok(JN.lessThanOrEqual(2, 2));
  assert.ok(JN.greaterThan(2, 1));
  assert.ok(JN.greaterThanOrEqual(2, 2));

  assert.ok(JN.lessThan(third, half));
  assert.ok(JN.greaterThan(half, third));
  assert.ok(JN.lessThan(big, bigger));
  assert.ok(JN.greaterThan(bigger, big));
  assert.ok(JN.lessThan(1, big));
  assert.ok(JN.greaterThan(big, 1));
  assert.ok(JN.lessThan(half, 1));
  assert.ok(JN.lessThan(half, big));
  assert.ok(JN.lessThan(r1, r2));
  assert.ok(JN.lessThan(r1, 2));
  assert.ok(JN.lessThan(half, r1));
  assert.ok(JN.lessThan(r1, big));
  assert.ok(JN.greaterThanOrEqual(r1, 1));
  assert.ok(JN.lessThanOrEqual(r1, 1));
  assert.ok(JN.greaterThanOrEqual(big, big));
  assert.ok(JN.lessThanOrEqual(half, half));
  // negative bignums
  assert.ok(JN.lessThan(N('-1e20'), N('-1e19')));
  assert.ok(JN.lessThan(N('-1e20'), 0));
  assert.ok(JN.lessThan(N('-1e20'), N('-1/2')));
});

test('abs and sqr', () => {
  assertNum(JN.abs(-5), 5);
  assertNum(JN.abs(5), 5);
  assertNum(JN.abs(N('-1/2')), N('1/2'));
  assertIntVal(JN.abs(N('-1e20')), 10n ** 20n);
  assertRough(JN.abs(N('~-2.5')), 2.5);
  assertNum(JN.sqr(-3), 9);
  assertNum(JN.sqr(N('2/3')), N('4/9'));
  assertRough(JN.sqr(N('~3')), 9);
});

test('property: exact rational arithmetic matches BigInt oracle', () => {
  const rng = makeRng(0x5eed);
  for (let i = 0; i < 1500; i++) {
    const bits = rng.pick([10, 30, 60, 120]);
    const a = new Q(rng.signedBigint(bits), rng.bigint(bits) + 1n);
    const b = new Q(rng.signedBigint(bits), rng.bigint(bits) + 1n);
    const pa = qToPy(a), pb = qToPy(b);

    assert.ok(JN.equals(JN.add(pa, pb), qToPy(a.add(b))), `${a} + ${b}`);
    assert.ok(JN.equals(JN.subtract(pa, pb), qToPy(a.sub(b))), `${a} - ${b}`);
    assert.ok(JN.equals(JN.multiply(pa, pb), qToPy(a.mul(b))), `${a} * ${b}`);
    if (b.n !== 0n) {
      assert.ok(JN.equals(JN.divide(pa, pb), qToPy(a.div(b))), `${a} / ${b}`);
    }
    const cmp = a.cmp(b);
    assert.equal(JN.lessThan(pa, pb), cmp < 0, `${a} < ${b}`);
    assert.equal(JN.greaterThan(pa, pb), cmp > 0, `${a} > ${b}`);
    assert.equal(JN.lessThanOrEqual(pa, pb), cmp <= 0, `${a} <= ${b}`);
    assert.equal(JN.greaterThanOrEqual(pa, pb), cmp >= 0, `${a} >= ${b}`);
    assert.equal(JN.equals(pa, pb), cmp === 0, `${a} == ${b}`);
  }
});

test('property: integer arithmetic never loses exactness across the fixnum boundary', () => {
  const rng = makeRng(0xbeef);
  for (let i = 0; i < 2000; i++) {
    // concentrate around the overflow boundary
    const base = rng.pick([0n, 1n, 2n ** 53n, 9000000000000000n, 10n ** 20n]);
    const a = (rng.bool() ? -1n : 1n) * (base + BigInt(rng.int(0, 1000)) - 500n);
    const b = (rng.bool() ? -1n : 1n) * (rng.pick([0n, 1n, 9000000000000000n]) + BigInt(rng.int(0, 1000)) - 500n);
    const pa = N(a.toString()), pb = N(b.toString());
    assertIntVal(JN.add(pa, pb), a + b, `${a} + ${b}`);
    assertIntVal(JN.subtract(pa, pb), a - b, `${a} - ${b}`);
    assertIntVal(JN.multiply(pa, pb), a * b, `${a} * ${b}`);
  }
});

test('property: fixnum results are always canonical (never small BigIntegers)', () => {
  const rng = makeRng(0xcafe);
  for (let i = 0; i < 1000; i++) {
    const a = rng.signedBigint(80), b = rng.signedBigint(80);
    for (const [name, f] of [['add', JN.add], ['subtract', JN.subtract], ['multiply', JN.multiply]]) {
      const res = f(N(a.toString()), N(b.toString()));
      const k = kindOf(res);
      if (k === 'bigint') {
        assert.ok(!JN.lessThanOrEqual(JN.abs(res), 9e15),
          `${name}(${a}, ${b}) returned a small BigInteger ${res}`);
      }
    }
  }
});

test('property: field laws on exact numbers', () => {
  const rng = makeRng(0x1234);
  for (let i = 0; i < 400; i++) {
    const mk = () => new Q(rng.signedBigint(60), rng.bigint(40) + 1n);
    const a = mk(), b = mk(), c = mk();
    const pa = qToPy(a), pb = qToPy(b), pc = qToPy(c);
    // commutativity
    assert.ok(JN.equals(JN.add(pa, pb), JN.add(pb, pa)));
    assert.ok(JN.equals(JN.multiply(pa, pb), JN.multiply(pb, pa)));
    // associativity
    assert.ok(JN.equals(JN.add(JN.add(pa, pb), pc), JN.add(pa, JN.add(pb, pc))));
    assert.ok(JN.equals(JN.multiply(JN.multiply(pa, pb), pc), JN.multiply(pa, JN.multiply(pb, pc))));
    // distributivity
    assert.ok(JN.equals(JN.multiply(pa, JN.add(pb, pc)),
                        JN.add(JN.multiply(pa, pb), JN.multiply(pa, pc))));
    // inverses
    assertNum(JN.subtract(pa, pa), 0);
    if (a.n !== 0n) {
      assertNum(JN.divide(pa, pa), 1);
      assertNum(JN.multiply(pa, JN.divide(1, pa)), 1);
    }
    // subtraction/addition roundtrip
    assert.ok(JN.equals(JN.add(JN.subtract(pa, pb), pb), pa));
    // division/multiplication roundtrip
    if (b.n !== 0n) {
      assert.ok(JN.equals(JN.multiply(JN.divide(pa, pb), pb), pa));
    }
  }
});

test('property: roughnum arithmetic matches IEEE double arithmetic', () => {
  const rng = makeRng(0x40ff);
  let checked = 0;
  for (let i = 0; i < 2000; i++) {
    const x = rng.double(), y = rng.double();
    let px, py;
    try { px = JN.makeRoughnum(x); py = JN.makeRoughnum(y); } catch (e) { continue; }
    for (const [f, op] of [[JN.add, (a, b) => a + b],
                           [JN.subtract, (a, b) => a - b],
                           [JN.multiply, (a, b) => a * b],
                           [JN.divide, (a, b) => a / b]]) {
      const expected = op(x, y);
      if (f === JN.divide && y === 0) continue;
      if (!isFinite(expected) || (expected !== expected)) {
        assertThrowsTag(() => f(px, py), 'domain-error', `${x} op ${y}`);
      } else {
        assertRough(f(px, py), expected, `${x} op ${y}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1000, `checked ${checked} finite cases`);
});
