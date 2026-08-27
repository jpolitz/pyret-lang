// js-numbers tests: parsing, construction, predicates, conversions.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  jsnums: JN, N, kindOf,
  assertNum, assertNumKind, assertIntVal, assertRough, assertThrowsTag,
  makeRng,
} = require('./helpers.js');

test('fromString: integers', () => {
  assertNumKind(N('0'), 0, 'fixnum');
  assertNumKind(N('42'), 42, 'fixnum');
  assertNumKind(N('-42'), -42, 'fixnum');
  assertNumKind(N('+42'), 42, 'fixnum');
  assertNumKind(N('007'), 7, 'fixnum');
  assertNumKind(N('9000000000000000'), 9e15, 'fixnum');
  assertIntVal(N('9000000000000001'), 9000000000000001n);
  assert.equal(kindOf(N('9000000000000001')), 'bigint');
  assertIntVal(N('-123456789012345678901234567890'), -123456789012345678901234567890n);
  assertIntVal(N('1e20'), 10n ** 20n);
  assertIntVal(N('1E20'), 10n ** 20n);
});

test('fromString: rationals', () => {
  assertNumKind(N('1/2'), JN.divide(1, 2), 'rational');
  assertNumKind(N('2/4'), N('1/2'), 'rational');
  assertNumKind(N('-3/6'), N('-1/2'), 'rational');
  assertNumKind(N('4/2'), 2, 'fixnum');
  assertNumKind(N('0/5'), 0, 'fixnum');
  const big = N('123456789012345678901/2');
  assert.equal(kindOf(big), 'rational');
  assertIntVal(JN.numerator(big), 123456789012345678901n);
  assertIntVal(JN.denominator(big), 2n);
});

test('fromString: decimals become exact rationals', () => {
  assertNumKind(N('0.5'), N('1/2'), 'rational');
  assertNumKind(N('-0.5'), N('-1/2'), 'rational');
  assertNumKind(N('2.0'), 2, 'fixnum');
  assertNumKind(N('0.1'), N('1/10'), 'rational');
  assertNumKind(N('3.14'), N('157/50'), 'rational');
  assertNum(N('0.000000000000000000001'), N('1/1000000000000000000000'));
});

test('fromString: scientific notation', () => {
  assertNumKind(N('1e-2'), N('1/100'), 'rational');
  assertNum(N('1.5e2'), 150);
  assertNum(N('1.5E2'), 150);
  assertNum(N('-2.5e-3'), N('-1/400'));
  assertNum(N('2.5e+3'), 2500);
  assertIntVal(N('1e400'), 10n ** 400n);
  assertNum(N('1e-400'), JN.divide(1, N('1e400')));
});

test('fromString: roughnums', () => {
  assertRough(N('~0'), 0);
  assertRough(N('~2.5'), 2.5);
  assertRough(N('~-2.5'), -2.5);
  assertRough(N('~+2.5'), 2.5);
  assertRough(N('~1e3'), 1000);
  assertRough(N('~1.5e-7'), 1.5e-7);
  assertRough(N('~1/2'), 0.5);
  assertRough(N('~-1/4'), -0.25);
});

test('fromString: rejects non-numbers', () => {
  for (const s of ['', 'abc', '.5', '5.', '~', '1_000', '0x10', '1/2/3',
                   '--5', '1e', 'e5', '1.2.3', ' 5', '5 ', '1 / 2', 'NaN',
                   'Infinity', '~NaN', '+inf.0', '1/-2', '~1/-2']) {
    assert.equal(JN.fromString(s), false, `fromString(${JSON.stringify(s)})`);
  }
});

test('fromString: zero denominators are not numbers', () => {
  assert.equal(JN.fromString('1/0'), false);
  assert.equal(JN.fromString('-2/0'), false);
  assert.equal(JN.fromString('0/0'), false);
  assert.equal(JN.fromString('~1/0'), false);
});

test('fromString: roughnum overflow errors', () => {
  assertThrowsTag(() => JN.fromString('~1e400'), 'domain-error');
});

test('fromFixnum: integers', () => {
  assertNumKind(JN.fromFixnum(5), 5, 'fixnum');
  assertNumKind(JN.fromFixnum(-5), -5, 'fixnum');
  assertNumKind(JN.fromFixnum(0), 0, 'fixnum');
  assertIntVal(JN.fromFixnum(1e21), 10n ** 21n);
});

test('fromFixnum: non-integer doubles become exact rationals (decimal reading)', () => {
  assertNum(JN.fromFixnum(0.5), N('1/2'));
  assertNum(JN.fromFixnum(0.1), N('1/10'));
  assertNum(JN.fromFixnum(-0.125), N('-1/8'));
  assertNum(JN.fromFixnum(1.5e-7), N('3/20000000'));
});

test('fromFixnum: rejects NaN and infinities', () => {
  assertThrowsTag(() => JN.fromFixnum(NaN), 'domain-error');
  assertThrowsTag(() => JN.fromFixnum(Infinity), 'domain-error');
  assertThrowsTag(() => JN.fromFixnum(-Infinity), 'domain-error');
});

test('toFixnum(fromFixnum(x)) === x for random doubles', () => {
  const rng = makeRng(0xf00d);
  for (let i = 0; i < 5000; i++) {
    const x = rng.double();
    const back = JN.toFixnum(JN.fromFixnum(x));
    assert.ok(Object.is(back, x) || back === x, `roundtrip ${x} -> ${back}`);
  }
});

test('toFixnum(fromFixnum(x)) === x for special doubles', () => {
  for (const x of [0, 1, -1, 0.5, 0.1, 2 ** 53, -(2 ** 53), 9e15, -9e15,
                   Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Number.MIN_VALUE,
                   5e-324, 1e308, 4.9e-324, 2 ** -1022, 1.7976931348623157e308,
                   3.141592653589793, 1e300, 1e-300]) {
    assert.equal(JN.toFixnum(JN.fromFixnum(x)), x, `roundtrip ${x}`);
  }
});

test('makeBignum', () => {
  assertIntVal(JN.makeBignum('5'), 5n);
  assertIntVal(JN.makeBignum('-5'), -5n);
  assertIntVal(JN.makeBignum('0'), 0n);
  assertIntVal(JN.makeBignum('1e5'), 100000n);
  assertIntVal(JN.makeBignum(123), 123n);
  assertIntVal(JN.makeBignum('123456789012345678901234567890'), 123456789012345678901234567890n);
  assert.ok(JN.equals(JN.makeBignum('1e30'), N('1e30')));
});

test('makeBignum rejects non-integer strings', () => {
  for (const s of ['1.5', 'abc', '--5', ' 5', '', '1/2', '~2', '0x10']) {
    assertThrowsTag(() => JN.makeBignum(s), 'domain-error', `makeBignum(${JSON.stringify(s)})`);
  }
});

test('makeRational', () => {
  assertNumKind(JN.makeRational(1, 2), N('1/2'), 'rational');
  assertNumKind(JN.makeRational(2, 4), N('1/2'), 'rational');
  assertNumKind(JN.makeRational(1, -2), N('-1/2'), 'rational');
  assertNumKind(JN.makeRational(-1, -2), N('1/2'), 'rational');
  assertNumKind(JN.makeRational(4, 2), 2, 'fixnum');
  assertNumKind(JN.makeRational(0, 7), 0, 'fixnum');
  assertNumKind(JN.makeRational(7), 7, 'fixnum');
  assertNum(JN.makeRational(JN.makeBignum('1e20'), 3), N('100000000000000000000/3'));
});

test('makeRational rejects zero denominators', () => {
  assertThrowsTag(() => JN.makeRational(1, 0), 'division-by-zero');
  assertThrowsTag(() => JN.makeRational(0, 0), 'division-by-zero');
  assertThrowsTag(() => JN.makeRational(JN.makeBignum('5'), JN.makeBignum('0')), 'division-by-zero');
});

test('makeRoughnum', () => {
  assertRough(JN.makeRoughnum(2.5), 2.5);
  assertRough(JN.makeRoughnum(0), 0);
  assertThrowsTag(() => JN.makeRoughnum(NaN), 'domain-error');
  assertThrowsTag(() => JN.makeRoughnum(Infinity), 'domain-error');
  assertThrowsTag(() => JN.makeRoughnum(-Infinity), 'domain-error');
});

test('predicate matrix', () => {
  const fix = 5, neg = -5, zero = 0;
  const big = N('1e20'), negBig = N('-1e20');
  const rat = N('1/2'), negRat = N('-1/2');
  const rough = N('~2.5'), negRough = N('~-2.5'), roughZero = N('~0');

  const rows = [
    // [value, isRational, isInteger, isRoughnum, isPositive, isNegative]
    [fix, true, true, false, true, false],
    [neg, true, true, false, false, true],
    [zero, true, true, false, false, false],
    [big, true, true, false, true, false],
    [negBig, true, true, false, false, true],
    [rat, true, false, false, true, false],
    [negRat, true, false, false, false, true],
    [rough, false, false, true, true, false],
    [negRough, false, false, true, false, true],
    [roughZero, false, false, true, false, false],
  ];
  for (const [v, isRat, isInt, isRough, isPos, isNeg] of rows) {
    assert.ok(JN.isPyretNumber(v), `isPyretNumber(${v})`);
    assert.ok(JN.isReal(v), `isReal(${v})`);
    assert.equal(JN.isRational(v), isRat, `isRational(${v})`);
    assert.equal(JN.isExact(v), isRat, `isExact(${v})`);
    assert.equal(JN.isInteger(v), isInt, `isInteger(${v})`);
    assert.equal(JN.isRoughnum(v), isRough, `isRoughnum(${v})`);
    assert.equal(JN.isPositive(v), isPos, `isPositive(${v})`);
    assert.equal(JN.isNegative(v), isNeg, `isNegative(${v})`);
    assert.equal(JN.isNonNegative(v), !isNeg, `isNonNegative(${v})`);
    assert.equal(JN.isNonPositive(v), !isPos, `isNonPositive(${v})`);
  }
});

test('non-numbers fail predicates', () => {
  for (const v of ['5', null, undefined, {}, [], true, 0.5, 1.5, NaN, Infinity]) {
    assert.equal(JN.isPyretNumber(v), false, `isPyretNumber(${v})`);
    assert.equal(JN.isRational(v), false, `isRational(${v})`);
    assert.equal(JN.isInteger(v), false, `isInteger(${v})`);
    assert.equal(JN.isRoughnum(v), false, `isRoughnum(${v})`);
    assert.equal(JN.isPositive(v), false, `isPositive(${v})`);
  }
});

test('toRational / toExact', () => {
  assertNumKind(JN.toRational(5), 5, 'fixnum');
  assertNum(JN.toRational(N('1/2')), N('1/2'));
  assertNumKind(JN.toRational(N('~0.5')), N('1/2'), 'rational');
  assertNumKind(JN.toRational(N('~2')), 2, 'fixnum');
  assertNum(JN.toExact(N('~0.1')), N('1/10'));
  assertIntVal(JN.toRational(N('1e20')), 10n ** 20n);
  // exact decimal reading of the double's printed form
  assertNum(JN.toRational(JN.makeRoughnum(1.5e-7)), N('3/20000000'));
});

test('toRoughnum', () => {
  assertRough(JN.toRoughnum(5), 5);
  assertRough(JN.toRoughnum(N('1/2')), 0.5);
  assertRough(JN.toRoughnum(N('1e20')), 1e20);
  assertRough(JN.toRoughnum(N('~2.5')), 2.5);
  assertThrowsTag(() => JN.toRoughnum(N('1e400')), 'domain-error');
});

test('toFixnum', () => {
  assert.equal(JN.toFixnum(5), 5);
  assert.equal(JN.toFixnum(N('1/2')), 0.5);
  assert.equal(JN.toFixnum(N('~2.5')), 2.5);
  assert.equal(JN.toFixnum(N('1e20')), 1e20);
  assert.equal(JN.toFixnum(N('1/3')), 1 / 3);
  assert.equal(JN.toFixnum(N('-1/3')), -1 / 3);
  // beyond double range
  assert.equal(JN.toFixnum(N('1e400')), Infinity);
  assert.equal(JN.toFixnum(N('-1e400')), -Infinity);
  assert.equal(JN.toFixnum(JN.divide(1, N('1e400'))), 0);
  assertThrowsTag(() => JN.toFixnum('5'), 'domain-error');
  assertThrowsTag(() => JN.toFixnum(null), 'domain-error');
});

test('toString representations', () => {
  assert.equal(N('1/2').toString(), '1/2');
  assert.equal(N('-1/2').toString(), '-1/2');
  assert.equal(N('~2.5').toString(), '~2.5');
  assert.equal(N('~-2.5').toString(), '~-2.5');
  assert.equal(N('1e20').toString(), '100000000000000000000');
  assert.equal(N('-1e20').toString(), '-100000000000000000000');
  assert.equal(String(N('42')), '42');
});

test('toString/fromString roundtrip preserves value and kind', () => {
  const rng = makeRng(0xabcdef);
  for (let i = 0; i < 500; i++) {
    const n = rng.signedBigint(200);
    const d = rng.bigint(100) + 1n;
    const v = JN.divide(N(n.toString()), N(d.toString()));
    const back = N(v.toString());
    assert.ok(JN.equals(v, back), `roundtrip ${v}`);
    assert.equal(kindOf(back), kindOf(v) === 'bigint' ? kindOf(back) : kindOf(v));
  }
  for (let i = 0; i < 500; i++) {
    const x = rng.double();
    let r;
    try { r = JN.makeRoughnum(x); } catch (e) { continue; }
    const back = N(r.toString());
    assertRough(back, x, `roughnum roundtrip ${x}`);
  }
});

test('module exports the full surface', () => {
  for (const name of ['fromFixnum', 'fromString', 'fromSchemeString', 'makeBignum',
                      'makeRational', 'makeRoughnum', 'isPyretNumber', 'isRational',
                      'isReal', 'isExact', 'isInteger', 'isRoughnum', 'isPositive',
                      'isNegative', 'isNonPositive', 'isNonNegative', 'toFixnum',
                      'toExact', 'toRational', 'toRoughnum', 'add', 'subtract',
                      'multiply', 'divide', 'equals', 'equalsAnyZero', 'eqv',
                      'roughlyEquals', 'roughlyEqualsRel', 'greaterThanOrEqual',
                      'lessThanOrEqual', 'greaterThan', 'lessThan', 'expt', 'exp',
                      'modulo', 'numerator', 'denominator', 'integerSqrt', 'sqrt',
                      'abs', 'quotient', 'remainder', 'floor', 'ceiling', 'round',
                      'roundEven', 'log', 'tan', 'atan', 'atan2', 'cos', 'sin',
                      'acos', 'asin', 'sqr', 'gcd', 'lcm', 'toRepeatingDecimal',
                      'toStringDigits', 'MakeNumberLibrary']) {
    assert.equal(typeof JN[name], 'function', `${name} should be a function`);
  }
  assert.equal(typeof JN.BigInteger, 'function');
  assert.equal(typeof JN.Rational, 'function');
  assert.equal(typeof JN.Roughnum, 'function');
  assert.equal(JN.MIN_FIXNUM, -9e15);
  assert.equal(JN.MAX_FIXNUM, 9e15);
  assert.ok(JN._innards);
});
