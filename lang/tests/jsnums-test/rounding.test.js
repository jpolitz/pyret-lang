// js-numbers tests: floor, ceiling, round, roundEven, numerator/denominator,
// toRepeatingDecimal, toStringDigits.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  jsnums: JN, N, kindOf,
  assertNum, assertNumKind, assertIntVal, assertRough, assertThrowsTag,
  Q, pyToQ, qToPy, makeRng,
} = require('./helpers.js');

test('floor and ceiling', () => {
  const cases = [
    // [value, floor, ceiling]
    ['5', 5, 5], ['-5', -5, -5], ['0', 0, 0],
    ['1/2', 0, 1], ['-1/2', -1, 0],
    ['7/2', 3, 4], ['-7/2', -4, -3],
    ['5/3', 1, 2], ['-5/3', -2, -1],
    ['~2.5', 2, 3], ['~-2.5', -3, -2],
    ['~2', 2, 2], ['~-2', -2, -2],
  ];
  for (const [s, f, c] of cases) {
    assertNum(JN.floor(N(s)), f, `floor(${s})`);
    assertNum(JN.ceiling(N(s)), c, `ceiling(${s})`);
  }
  assertIntVal(JN.floor(N('1e20')), 10n ** 20n);
  assertIntVal(JN.ceiling(N('1e20')), 10n ** 20n);
  assertIntVal(JN.floor(JN.divide(N('1e20'), 3)), 10n ** 20n / 3n);
  assertIntVal(JN.ceiling(JN.divide(N('1e20'), 3)), 10n ** 20n / 3n + 1n);
  assertIntVal(JN.floor(JN.divide(N('-1e20'), 3)), -(10n ** 20n) / 3n - 1n);
});

test('floor/ceiling/round of huge roughnums produce exact integers', () => {
  for (const f of [JN.floor, JN.ceiling, JN.round, JN.roundEven]) {
    const v = f(N('~1e300'));
    assert.ok(JN.isInteger(v), `${v} should be an integer`);
    assert.ok(!JN.isRoughnum(v));
    assert.ok(JN.equals(v, N('1e300')));
    const w = f(N('~-1e300'));
    assert.ok(JN.equals(w, N('-1e300')));
  }
});

test('round: half away from zero', () => {
  const cases = [
    ['1/2', 1], ['-1/2', -1], ['5/2', 3], ['-5/2', -3],
    ['3/2', 2], ['-3/2', -2], ['1/3', 0], ['2/3', 1],
    ['-1/3', 0], ['-2/3', -1], ['7', 7], ['-7', -7],
    ['~2.5', 3], ['~-2.5', -3], ['~2.4', 2], ['~2.6', 3],
    ['~-2.4', -2], ['~-2.6', -3], ['~0.5', 1], ['~-0.5', -1],
  ];
  for (const [s, expected] of cases) {
    assertNum(JN.round(N(s)), expected, `round(${s})`);
  }
});

test('roundEven: half to even', () => {
  const cases = [
    ['1/2', 0], ['-1/2', 0], ['5/2', 2], ['-5/2', -2],
    ['3/2', 2], ['-3/2', -2], ['7/2', 4], ['-7/2', -4],
    ['~0.5', 0], ['~1.5', 2], ['~2.5', 2], ['~3.5', 4],
    ['~-0.5', 0], ['~-1.5', -2], ['~-2.5', -2], ['~-3.5', -4],
    ['~2.6', 3], ['~-2.6', -3], ['5', 5],
  ];
  for (const [s, expected] of cases) {
    assertNum(JN.roundEven(N(s)), expected, `roundEven(${s})`);
  }
});

test('property: rounding relations on rationals', () => {
  const rng = makeRng(0xf100);
  for (let i = 0; i < 800; i++) {
    const q = new Q(rng.signedBigint(70), rng.bigint(40) + 1n);
    const p = qToPy(q);
    const fl = JN.floor(p), ce = JN.ceiling(p), ro = JN.round(p), re = JN.roundEven(p);
    assertIntVal(fl, q.floor(), `floor(${q})`);
    assertIntVal(ce, q.ceil(), `ceiling(${q})`);
    // floor <= x <= ceiling
    assert.ok(JN.lessThanOrEqual(fl, p) && JN.lessThanOrEqual(p, ce));
    // round lands on floor or ceiling
    assert.ok(JN.equals(ro, fl) || JN.equals(ro, ce), `round(${q})`);
    assert.ok(JN.equals(re, fl) || JN.equals(re, ce), `roundEven(${q})`);
    // |x - round(x)| <= 1/2
    const diff = JN.abs(JN.subtract(p, ro));
    assert.ok(JN.lessThanOrEqual(diff, N('1/2')), `round distance (${q})`);
    const diffE = JN.abs(JN.subtract(p, re));
    assert.ok(JN.lessThanOrEqual(diffE, N('1/2')), `roundEven distance (${q})`);
    // roundEven ties go to even
    if (JN.equals(diffE, N('1/2'))) {
      assertNum(JN.modulo(re, 2), 0, `roundEven parity (${q})`);
    }
  }
});

test('numerator and denominator', () => {
  assertNum(JN.numerator(5), 5);
  assertNum(JN.denominator(5), 1);
  assertNum(JN.numerator(N('3/4')), 3);
  assertNum(JN.denominator(N('3/4')), 4);
  assertNum(JN.numerator(N('-3/4')), -3);
  assertNum(JN.denominator(N('-3/4')), 4);
  assertIntVal(JN.numerator(N('1e20')), 10n ** 20n);
  assertNum(JN.denominator(N('1e20')), 1);
  assertRough(JN.numerator(N('~0.75')), 3);
  assertRough(JN.denominator(N('~0.75')), 4);
  assertRough(JN.numerator(N('~-0.75')), -3);
  assertRough(JN.numerator(N('~3')), 3);
  assertRough(JN.denominator(N('~3')), 1);
  // exponential-notation doubles (regression: used to be garbage)
  assertRough(JN.numerator(JN.makeRoughnum(1.5e-7)), 3);
  assertRough(JN.denominator(JN.makeRoughnum(1.5e-7)), 20000000);
  assertRough(JN.numerator(JN.makeRoughnum(1e21)), 1e21);
  assertRough(JN.denominator(JN.makeRoughnum(1e21)), 1);
});

test('property: numerator/denominator reconstruct the value', () => {
  const rng = makeRng(0xdead);
  for (let i = 0; i < 500; i++) {
    const q = new Q(rng.signedBigint(60), rng.bigint(40) + 1n);
    const p = qToPy(q);
    const n = JN.numerator(p), d = JN.denominator(p);
    assert.ok(JN.equals(JN.divide(n, d), p), `reconstruct ${q}`);
    assert.ok(JN.isInteger(n) && JN.isInteger(d));
    assert.ok(JN.isPositive(d));
    // canonical: gcd(n, d) === 1
    assertNum(JN.gcd(n, d), 1, `reduced ${q}`);
  }
});

test('toRepeatingDecimal', () => {
  assert.deepEqual(JN.toRepeatingDecimal(1, 7), ['0', '', '142857']);
  assert.deepEqual(JN.toRepeatingDecimal(-1, 7), ['-0', '', '142857']);
  assert.deepEqual(JN.toRepeatingDecimal(1, 3), ['0', '', '3']);
  assert.deepEqual(JN.toRepeatingDecimal(1, 2), ['0', '5', '0']);
  assert.deepEqual(JN.toRepeatingDecimal(22, 7), ['3', '', '142857']);
  assert.deepEqual(JN.toRepeatingDecimal(5, 1), ['5', '', '0']);
  assert.deepEqual(JN.toRepeatingDecimal(1, 700), ['0', '00', '142857']);
  assert.deepEqual(JN.toRepeatingDecimal(1, 6), ['0', '1', '6']);
  assert.deepEqual(JN.toRepeatingDecimal(N('1e20'), 3),
                   [(10n ** 20n / 3n).toString(), '', '3']);
  // limit cutoff
  const cut = JN.toRepeatingDecimal(1, 65537, { limit: 10 });
  assert.equal(cut[2], '...');
  assertThrowsTag(() => JN.toRepeatingDecimal(N('1/2'), 3), 'domain-error');
  assertThrowsTag(() => JN.toRepeatingDecimal(1, 0), 'domain-error');
  assertThrowsTag(() => JN.toRepeatingDecimal(1, -3), 'domain-error');
});

test('property: toRepeatingDecimal reconstructs the rational', () => {
  const rng = makeRng(0x7e9);
  for (let i = 0; i < 300; i++) {
    const n = BigInt(rng.int(0, 100000));
    const d = BigInt(rng.int(1, 2000));
    const [ip, fixed, rep] = JN.toRepeatingDecimal(N(n.toString()), N(d.toString()), { limit: 5000 });
    assert.notEqual(rep, '...', `unexpected cutoff for ${n}/${d}`);
    // value = ip + (fixed + rep repeating) / scale:
    // x = ip + fixed/10^f + rep/(10^f * (10^r - 1))   (when rep repeats)
    const f = BigInt(fixed.length), r = BigInt(rep.length);
    const ipB = BigInt(ip), fixedB = fixed === '' ? 0n : BigInt(fixed), repB = BigInt(rep);
    let val = new Q(ipB);
    const tenF = 10n ** f;
    val = val.add(new Q(fixedB, tenF));
    if (repB !== 0n) {
      val = val.add(new Q(repB, tenF * (10n ** r - 1n)));
    }
    assert.ok(val.eq(new Q(n, d)), `reconstruct ${n}/${d}: got ${val} from ${JSON.stringify([ip, fixed, rep])}`);
  }
});

test('toStringDigits', () => {
  assert.equal(JN.toStringDigits(N('1/3'), 4), '0.3333');
  assert.equal(JN.toStringDigits(N('-1/3'), 4), '-0.3333');
  assert.equal(JN.toStringDigits(N('2/3'), 4), '0.6667');
  assert.equal(JN.toStringDigits(5, 2), '5.00');
  assert.equal(JN.toStringDigits(N('5/2'), 0), '3');
  assert.equal(JN.toStringDigits(N('-1/8'), 2), '-0.13');
  assert.equal(JN.toStringDigits(1234, -2), '1200');
  assert.equal(JN.toStringDigits(1250, -2), '1300');
  assert.equal(JN.toStringDigits(N('~1.5'), 2), '1.50');
  assert.equal(JN.toStringDigits(0, 3), '0.000');
  assert.equal(JN.toStringDigits(N('1/7'), 7), '0.1428571');
  assert.equal(JN.toStringDigits(N('1e20'), 1), '100000000000000000000.0');
  assertThrowsTag(() => JN.toStringDigits(5, N('1/2')), 'domain-error');
});

test('toStringDigits beyond the default repeating-decimal limit', () => {
  // regression: digit counts past ~500 used to splice literal "..." in
  for (const [den, d] of [[1867, 600], [65537, 700], [7, 555]]) {
    const s = JN.toStringDigits(JN.divide(1, den), d);
    assert.ok(!s.includes('.' + '.'), `no dots in toStringDigits(1/${den}, ${d})`);
    assert.equal(s.length, 2 + d, `length of toStringDigits(1/${den}, ${d})`);
    // oracle: round(10^d / den) digits
    const scaled = (10n ** BigInt(d) + BigInt(Math.floor(den / 2))) / BigInt(den);
    const digits = scaled.toString().padStart(d, '0');
    assert.equal(s, '0.' + digits, `digits of toStringDigits(1/${den}, ${d})`);
  }
});

test('property: toStringDigits output parses back within 10^-d', () => {
  const rng = makeRng(0x51de);
  for (let i = 0; i < 300; i++) {
    const q = new Q(rng.signedBigint(40), rng.bigint(25) + 1n);
    const p = qToPy(q);
    const d = rng.int(0, 8);
    const s = JN.toStringDigits(p, d);
    const parsed = N(s);
    const tol = JN.divide(1, JN.expt(10, d));
    const err = JN.abs(JN.subtract(parsed, p));
    assert.ok(JN.lessThanOrEqual(err, tol), `toStringDigits(${q}, ${d}) = ${s}`);
  }
});
