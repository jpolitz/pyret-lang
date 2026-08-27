// js-numbers tests: errbacks plumbing, error classes, fromSchemeString.
// Includes cases migrated from the previous jasmine-based jsnums-test.js.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  jsnums: JN, N, kindOf,
  assertNum, assertNumKind, assertIntVal, assertRough, assertThrowsTag,
} = require('./helpers.js');

test('per-call errbacks argument overrides and restores', () => {
  const mine = {
    throwDivByZero: (msg) => { throw new Error('MY-DIV-ZERO: ' + msg); },
    throwDomainError: (msg) => { throw new Error('MY-DOMAIN: ' + msg); },
  };
  assert.throws(() => JN.divide(1, 0, mine), /MY-DIV-ZERO/);
  // default errbacks are restored after the call, including after a throw
  assertThrowsTag(() => JN.divide(1, 0), 'division-by-zero');
  assert.throws(() => JN.toFixnum('x', mine), /MY-DOMAIN/);
  assertThrowsTag(() => JN.toFixnum('x'), 'domain-error');
  // non-erroring call with errbacks still returns normally
  assertNum(JN.divide(6, 3, mine), 2);
});

test('MakeNumberLibrary instance uses the supplied errbacks', () => {
  const sentinel = {};
  for (const name of ['throwDivByZero', 'throwDomainError', 'throwGeneralError',
                      'throwIncomparableValues', 'throwInternalError',
                      'throwLogNonPositive', 'throwRelToleranceError',
                      'throwSqrtNegative', 'throwToleranceError',
                      'throwUndefinedValue']) {
    sentinel[name] = (msg) => { throw name + ': ' + msg; };
  }
  const LIB = JN.MakeNumberLibrary(sentinel);
  assert.throws(() => LIB.divide(1, 0), /^throwDivByZero/);
  assert.throws(() => LIB.sqrt(-1), /^throwSqrtNegative/);
  assert.throws(() => LIB.log(0), /^throwLogNonPositive/);
  assert.throws(() => LIB.modulo(LIB.fromString('1/2'), 2), /^throwDomainError/);
  assert.throws(() => LIB.equals(LIB.fromString('~1'), LIB.fromString('~1')), /^throwIncomparableValues/);
  assert.throws(() => LIB.roughlyEquals(1, 1, -1), /^throwToleranceError/);
  assert.throws(() => LIB.roughlyEqualsRel(1, 2, -1), /^throwRelToleranceError/);
  assert.throws(() => LIB.exp(1000), /^throwGeneralError/);
  // migrated from the old jasmine suite:
  assert.throws(() => LIB.makeBignum(2).expt(LIB.makeBignum(0xffffffff + 1)), /^throwDomainError/);
  assert.throws(() => LIB.makeBignum(-1).log(), /^throwLogNonPositive/);
  assert.throws(() => LIB.makeBignum(-2).asin(), /^throwDomainError/);
  assert.throws(() => LIB.makeBignum(2).asin(), /^throwDomainError/);
  assert.throws(() => LIB.makeBignum(-2).acos(), /^throwDomainError/);
  assert.throws(() => LIB.makeBignum(2).acos(), /^throwDomainError/);
});

test('BigInteger canonical representation survives arithmetic (migrated)', () => {
  // Operations must not leave phantom words beyond the canonical count.
  const pairs = [
    ['1e5', JN.makeBignum('1e5')],
    ['1e30', JN.makeBignum('1e30')],
    ['1e140', JN.makeBignum('1e140')],
    ['1e309', JN.makeBignum('1e309')],
  ];
  for (const [s, viaMake] of pairs) {
    const viaParse = JN.fromString(s);
    // structural equality (same words, same t) — deepEqual distinguishes
    // phantom enumerable slots
    if (kindOf(viaParse) === 'bigint') {
      assert.deepEqual(viaParse, viaMake, `structural equality for ${s}`);
    }
    assert.ok(JN.equals(viaParse, viaMake));
  }
  assert.deepEqual(JN.makeBignum('1e3'), JN.makeBignum('1000'));
  // after arithmetic that shrinks word count
  const a = JN.makeBignum('1e30');
  const shrunk = JN.subtract(JN.add(a, 1), 1);
  assert.deepEqual(shrunk, JN.makeBignum('1e30'));
});

test('fromSchemeString: basic forms', () => {
  assertNumKind(JN.fromSchemeString('42'), 42, 'fixnum');
  assertNumKind(JN.fromSchemeString('-42'), -42, 'fixnum');
  assertNumKind(JN.fromSchemeString('1/2'), N('1/2'), 'rational');
  assertRough(JN.fromSchemeString('2.5'), 2.5);
  assertRough(JN.fromSchemeString('-2.5'), -2.5);
  assertRough(JN.fromSchemeString('.5'), 0.5);
  assertRough(JN.fromSchemeString('5.'), 5);
  assertNum(JN.fromSchemeString('1e2'), 100);
  assertIntVal(JN.fromSchemeString('123456789012345678901234567890'), 123456789012345678901234567890n);
  assert.equal(JN.fromSchemeString('nonsense'), false);
  assert.equal(JN.fromSchemeString('a/b'), false);
});

test('fromSchemeString: radix prefixes', () => {
  assertNum(JN.fromSchemeString('#x10'), 16);
  assertNum(JN.fromSchemeString('#xff'), 255);
  assertNum(JN.fromSchemeString('#x-ff'), -255);
  assertNum(JN.fromSchemeString('#b101'), 5);
  assertNum(JN.fromSchemeString('#o17'), 15);
  assertNum(JN.fromSchemeString('#d17'), 17);
  assertRough(JN.fromSchemeString('#x1.8'), 1.5);
  assertNum(JN.fromSchemeString('#b1/10'), N('1/2'));
  assertThrowsTag(() => JN.fromSchemeString('#xzz'), 'general-error');
  assertThrowsTag(() => JN.fromSchemeString('#b2'), 'general-error');
});

test('fromSchemeString: hex bignum overflow parses in the right radix', () => {
  const hex40 = 'f'.repeat(20); // 80 bits, overflows fixnums
  const expected = (1n << 80n) - 1n;
  assertIntVal(JN.fromSchemeString('#x' + hex40), expected);
  assertIntVal(JN.fromSchemeString('#x-' + hex40), -expected);
  const bin = '1' + '0'.repeat(64);
  assertIntVal(JN.fromSchemeString('#b' + bin), 1n << 64n);
});

test('fromSchemeString: exactness prefixes', () => {
  assertNum(JN.fromSchemeString('#e1.5'), N('3/2'));
  assertNum(JN.fromSchemeString('#e1/2'), N('1/2'));
  assertNumKind(JN.fromSchemeString('#e3'), 3, 'fixnum');
  assertRough(JN.fromSchemeString('#i3'), 3);
  assertRough(JN.fromSchemeString('#i1/2'), 0.5);
  assertRough(JN.fromSchemeString('#i1.5'), 1.5);
  assertRough(JN.fromSchemeString('#x#i10'), 16);
  assertRough(JN.fromSchemeString('#i#x10'), 16);
  // explicit exactness argument
  assertNum(JN.fromSchemeString('1.5', true), N('3/2'));
  assertRough(JN.fromSchemeString('1.5', false), 1.5);
  assertRough(JN.fromSchemeString('3', false), 3);
  // inexact overflow integers become roughnums
  assertRough(JN.fromSchemeString('#i100000000000000000000'), 1e20);
});

test('fromSchemeString: specials', () => {
  assertRough(JN.fromSchemeString('-0.0'), -0);
  for (const s of ['+inf.0', '-inf.0', '+nan.0', '-nan.0']) {
    assertThrowsTag(() => JN.fromSchemeString(s), 'domain-error', s);
  }
});

test('fromSchemeString: complex numbers are rejected', () => {
  for (const s of ['1+2i', '3-4i', '+i', '1@2', '1/2+1/2i']) {
    assertThrowsTag(() => JN.fromSchemeString(s), 'general-error', s);
  }
});

test('fromSchemeString: zero denominators', () => {
  assert.equal(JN.fromSchemeString('1/0'), false);
  assertThrowsTag(() => JN.fromSchemeString('#e1/0'), 'division-by-zero');
});

test('error messages carry context', () => {
  try {
    JN.divide(5, 0);
    assert.fail('should have thrown');
  } catch (e) {
    assert.match(e.message, /division by zero/);
    assert.match(e.message, /5/);
  }
  try {
    JN.modulo(N('7/2'), 2);
    assert.fail('should have thrown');
  } catch (e) {
    assert.match(e.message, /7\/2/);
  }
});

test('internal errors do not leak strict-mode ReferenceErrors', () => {
  // These used to reference undefined variables in error paths.
  assert.throws(() => JN.fromSchemeString('#xzz'), (e) => !(e instanceof ReferenceError));
  assert.throws(() => JN.fromSchemeString('#e#x@@'), (e) => !(e instanceof ReferenceError));
});
