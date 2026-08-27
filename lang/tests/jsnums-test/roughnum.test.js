// js-numbers tests: roughnum semantics, transcendental functions,
// roughlyEquals / roughlyEqualsRel, sqrt/log/exp.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  jsnums: JN, N, kindOf,
  assertNum, assertNumKind, assertIntVal, assertRough, assertRoughApprox, assertThrowsTag,
  makeRng,
} = require('./helpers.js');

test('sqrt across variants', () => {
  assertNumKind(JN.sqrt(4), 2, 'fixnum');
  assertNumKind(JN.sqrt(0), 0, 'fixnum');
  assertNumKind(JN.sqrt(1), 1, 'fixnum');
  assertRough(JN.sqrt(2), Math.SQRT2);
  assertNum(JN.sqrt(N('1/4')), N('1/2'));
  assertNum(JN.sqrt(N('4/9')), N('2/3'));
  assertRough(JN.sqrt(N('2/3')), Math.sqrt(2 / 3));
  assertRough(JN.sqrt(N('~2')), Math.SQRT2);
  assertRough(JN.sqrt(N('~0')), 0);
  assertIntVal(JN.sqrt(N('1e40')), 10n ** 20n);
  assert.ok(JN.isRoughnum(JN.sqrt(N('1e41'))));
  assertThrowsTag(() => JN.sqrt(-4), 'sqrt-negative');
  assertThrowsTag(() => JN.sqrt(N('-1/4')), 'sqrt-negative');
  assertThrowsTag(() => JN.sqrt(N('~-2')), 'sqrt-negative');
  assertThrowsTag(() => JN.sqrt(N('-1e40')), 'sqrt-negative');
});

test('sqrt never fakes exactness', () => {
  // near-square fixnums
  for (const k of [94868329, 67108864, 94906265, 1000000]) {
    if (k * k <= 9e15) {
      const v = JN.sqrt(k * k - 1);
      assert.ok(JN.isRoughnum(v), `sqrt(${k}^2 - 1) must be rough`);
      assertNumKind(JN.sqrt(k * k), k, 'fixnum');
    }
  }
  // huge non-perfect square cannot be represented as a roughnum: error
  assertThrowsTag(() => JN.sqrt(JN.add(N('1e620'), 1)), 'domain-error');
  assertIntVal(JN.sqrt(N('1e620')), 10n ** 310n);
});

test('exp', () => {
  assertNumKind(JN.exp(0), 1, 'fixnum');
  assertRough(JN.exp(1), Math.E);
  assertRough(JN.exp(-1), Math.exp(-1));
  assertRough(JN.exp(N('1/2')), Math.exp(0.5));
  assertRough(JN.exp(N('~2.5')), Math.exp(2.5));
  assertRough(JN.exp(709), Math.exp(709));
  assertThrowsTag(() => JN.exp(710), 'general-error');
  assertThrowsTag(() => JN.exp(N('~710')), 'domain-error');
  assertThrowsTag(() => JN.exp(N('1e20')), 'domain-error');
  assertRough(JN.exp(N('~-1000')), 0);
});

test('log', () => {
  assertNumKind(JN.log(1), 0, 'fixnum');
  assertRough(JN.log(2), Math.LN2);
  assertRough(JN.log(N('~2')), Math.LN2);
  assertRoughApprox(JN.log(N('1/2')), -Math.LN2, 1e-15);
  assertRoughApprox(JN.log(N('1e300')), 300 * Math.log(10), 1e-14);
  // beyond double range: computed from digits
  assertRoughApprox(JN.log(N('1e400')), 400 * Math.log(10), 1e-14);
  assertRoughApprox(JN.log(JN.multiply(3, N('1e400'))), Math.log(3) + 400 * Math.log(10), 1e-14);
  assertThrowsTag(() => JN.log(0), 'log-non-positive');
  assertThrowsTag(() => JN.log(-1), 'log-non-positive');
  assertThrowsTag(() => JN.log(N('-1/2')), 'log-non-positive');
  assertThrowsTag(() => JN.log(N('~-2')), 'log-non-positive');
});

test('trig: exact special cases stay exact', () => {
  assertNumKind(JN.sin(0), 0, 'fixnum');
  assertNumKind(JN.cos(0), 1, 'fixnum');
  assertNumKind(JN.tan(0), 0, 'fixnum');
  assertNumKind(JN.atan(0), 0, 'fixnum');
  assertNumKind(JN.asin(0), 0, 'fixnum');
  assertNumKind(JN.acos(1), 0, 'fixnum');
});

test('trig: rough results match Math', () => {
  for (const x of [1, -1, 2, 0.5]) {
    const px = Number.isInteger(x) ? x : N('~' + x);
    const xv = Number.isInteger(x) ? x : x;
    assertRough(JN.sin(px), Math.sin(xv), `sin(${x})`);
    assertRough(JN.cos(px), Math.cos(xv), `cos(${x})`);
    assertRough(JN.tan(px), Math.tan(xv), `tan(${x})`);
    assertRough(JN.atan(px), Math.atan(xv), `atan(${x})`);
  }
  assertRough(JN.sin(N('1/2')), Math.sin(0.5));
  assertRough(JN.cos(N('1/2')), Math.cos(0.5));
  assertRough(JN.sin(N('~0.5')), Math.sin(0.5));
  assertRough(JN.asin(N('1/2')), Math.asin(0.5));
  assertRough(JN.acos(N('1/2')), Math.acos(0.5));
  assertRough(JN.asin(1), Math.asin(1));
  assertRough(JN.asin(-1), Math.asin(-1));
  assertRough(JN.acos(-1), Math.acos(-1));
  assertRough(JN.tan(N('1/2')), Math.tan(0.5));
  assertRough(JN.atan(N('1/2')), Math.atan(0.5));
  assertRough(JN.asin(N('~0.5')), Math.asin(0.5));
  assertRough(JN.acos(N('~0.5')), Math.acos(0.5));
  // big and rational args go through toFixnum
  assertRough(JN.sin(N('1e20')), Math.sin(1e20));
  assertRough(JN.cos(N('1e20')), Math.cos(1e20));
  assertRough(JN.tan(N('1e20')), Math.tan(1e20));
  assertRough(JN.atan(N('1e20')), Math.atan(1e20));
});

test('asin/acos domain errors', () => {
  assertThrowsTag(() => JN.asin(2), 'domain-error');
  assertThrowsTag(() => JN.asin(-2), 'domain-error');
  assertThrowsTag(() => JN.acos(2), 'domain-error');
  assertThrowsTag(() => JN.acos(-2), 'domain-error');
  assertThrowsTag(() => JN.asin(N('3/2')), 'domain-error');
  assertThrowsTag(() => JN.acos(N('~1.5')), 'domain-error');
  assertThrowsTag(() => JN.asin(N('1e20')), 'domain-error');
});

test('atan2 quadrants and range [0, 2pi)', () => {
  assertNumKind(JN.atan2(0, 1), 0, 'fixnum');
  assertNumKind(JN.atan2(0, 5), 0, 'fixnum');
  assertNumKind(JN.atan2(0, N('1e20')), 0, 'fixnum');
  assertRough(JN.atan2(1, 0), Math.PI / 2);
  assertRough(JN.atan2(0, -1), Math.PI);
  assertRough(JN.atan2(-1, 0), 3 * Math.PI / 2);
  assertRough(JN.atan2(1, 1), Math.PI / 4);
  assertRoughApprox(JN.atan2(1, -1), 3 * Math.PI / 4, 1e-15);
  assertRoughApprox(JN.atan2(-1, -1), 5 * Math.PI / 4, 1e-15);
  assertRoughApprox(JN.atan2(-1, 1), 7 * Math.PI / 4, 1e-15);
  assertThrowsTag(() => JN.atan2(0, 0), 'domain-error');
  // mixed types
  assertRough(JN.atan2(N('~1'), N('1')), Math.PI / 4);
  assertRoughApprox(JN.atan2(N('1/2'), N('1/2')), Math.PI / 4, 1e-15);
});

test('roughlyEquals', () => {
  assert.ok(JN.roughlyEquals(N('~1'), 1, N('~0.1')));
  assert.ok(JN.roughlyEquals(1, N('~1.05'), N('~0.1')));
  assert.ok(!JN.roughlyEquals(1, N('~1.2'), N('~0.1')));
  assert.ok(JN.roughlyEquals(N('~1'), N('~1'), 0));
  assert.ok(JN.roughlyEquals(N('1/3'), N('333/1000'), N('1/1000')));
  assert.ok(!JN.roughlyEquals(N('1/3'), N('333/1000'), N('1/10000')));
  assert.ok(JN.roughlyEquals(5, 5, 0));
  assert.ok(JN.roughlyEquals(N('1e20'), JN.add(N('1e20'), 1), 2));
  assertThrowsTag(() => JN.roughlyEquals(1, 1, -1), 'tolerance-error');
  assertThrowsTag(() => JN.roughlyEquals(1, 1, N('~-0.1')), 'tolerance-error');
  // a MIN_VALUE tolerance is too small to compare roughnums a MIN_VALUE apart
  const minTol = JN.makeRoughnum(Number.MIN_VALUE);
  const a = JN.makeRoughnum(1e-323);
  const b = JN.makeRoughnum(1.5e-323);
  assertThrowsTag(() => JN.roughlyEquals(a, b, minTol), 'tolerance-error');
});

test('roughlyEqualsRel', () => {
  assert.ok(JN.roughlyEqualsRel(100, 101, N('1/50')));
  assert.ok(!JN.roughlyEqualsRel(100, 103, N('1/50')));
  assert.ok(JN.roughlyEqualsRel(N('~100'), N('~101'), N('~0.02')));
  assert.ok(JN.roughlyEqualsRel(0, 0, N('1/100')));
  assert.ok(JN.roughlyEqualsRel(N('1e20'), JN.add(N('1e20'), N('1e10')), N('1/1000000')));
  assertThrowsTag(() => JN.roughlyEqualsRel(1, 1, -1), 'relative-tolerance-error');
  // smoothed variant divides by min(|a|,|b|) + 1
  assert.ok(JN.roughlyEqualsRel(0, N('1/100'), N('1/50'), true));
});

test('roughnum comparisons allowed, equality forbidden', () => {
  assert.ok(JN.greaterThan(N('~2'), N('~1')));
  assert.ok(JN.lessThanOrEqual(N('~1'), N('~1')));
  assert.ok(JN.greaterThanOrEqual(N('~1'), 1));
  assertThrowsTag(() => JN.equals(N('~1'), N('~1')), 'incomparable-values');
});

test('roughnum construction edge doubles', () => {
  assertRough(JN.makeRoughnum(Number.MIN_VALUE), Number.MIN_VALUE);
  assertRough(JN.makeRoughnum(Number.MAX_VALUE), Number.MAX_VALUE);
  assertRough(JN.makeRoughnum(-0), -0);
  // toRational of extreme roughnums
  assert.ok(JN.isRational(JN.toRational(JN.makeRoughnum(Number.MIN_VALUE))));
  assert.ok(JN.isRational(JN.toRational(JN.makeRoughnum(Number.MAX_VALUE))));
  assert.equal(JN.toFixnum(JN.toRational(JN.makeRoughnum(Number.MIN_VALUE))), Number.MIN_VALUE);
  assert.equal(JN.toFixnum(JN.toRational(JN.makeRoughnum(Number.MAX_VALUE))), Number.MAX_VALUE);
});

test('property: toRational of roughnum reads the printed decimal exactly', () => {
  const rng = makeRng(0x50f7);
  for (let i = 0; i < 1000; i++) {
    const x = rng.double();
    let r;
    try { r = JN.makeRoughnum(x); } catch (e) { continue; }
    const exact = JN.toRational(r);
    assert.ok(JN.isRational(exact));
    // reading String(x) back as an exact number, then to double, gives x
    assert.equal(JN.toFixnum(exact), x, `toRational roundtrip ${x}`);
  }
});

test('integerSqrt rejects roughnums', () => {
  assertThrowsTag(() => JN.integerSqrt(N('~4')), 'domain-error');
});
