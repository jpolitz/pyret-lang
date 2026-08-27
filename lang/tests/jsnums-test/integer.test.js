// js-numbers tests: quotient, remainder, modulo, gcd, lcm, integerSqrt, expt.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  jsnums: JN, N,
  assertNum, assertNumKind, assertIntVal, assertRough, assertThrowsTag,
  makeRng, pyToQ,
} = require('./helpers.js');

function bigOf(x) {
  return typeof x === 'number' ? BigInt(x) : BigInt(x.toString());
}

test('quotient truncates toward zero; remainder has dividend sign', () => {
  const cases = [
    [7, 2, 3, 1], [-7, 2, -3, -1], [7, -2, -3, 1], [-7, -2, 3, -1],
    [6, 3, 2, 0], [0, 5, 0, 0], [1, 5, 0, 1], [-1, 5, 0, -1],
  ];
  for (const [x, y, q, r] of cases) {
    assertNum(JN.quotient(x, y), q, `quotient(${x}, ${y})`);
    assertNum(JN.remainder(x, y), r, `remainder(${x}, ${y})`);
  }
});

test('modulo result matches divisor sign', () => {
  const cases = [
    [7, 2, 1], [-7, 2, 1], [7, -2, -1], [-7, -2, -1],
    [6, 3, 0], [-6, 3, 0], [0, 5, 0], [12, 7, 5], [-12, 7, 2],
  ];
  for (const [x, y, m] of cases) {
    assertNum(JN.modulo(x, y), m, `modulo(${x}, ${y})`);
  }
});

test('quotient/remainder/modulo on bignums', () => {
  const a = 10n ** 20n + 7n, b = -(10n ** 20n) - 7n;
  assertIntVal(JN.quotient(N(a.toString()), 7), a / 7n);
  assertIntVal(JN.quotient(N(b.toString()), 7), b / 7n);
  assertIntVal(JN.remainder(N(a.toString()), 7), a % 7n);
  assertIntVal(JN.remainder(N(b.toString()), 7), b % 7n);
  assertIntVal(JN.modulo(N(b.toString()), 7), ((b % 7n) + 7n) % 7n);
  assertIntVal(JN.modulo(N(a.toString()), -7), ((a % -7n) - 7n) % -7n);
  assertIntVal(JN.quotient(N('1e40'), N('1e20')), 10n ** 20n);
  assertIntVal(JN.remainder(N('1e40'), N('1e20')), 0n);
});

test('division-by-zero errors for integer operations', () => {
  for (const x of [1, 0, -5, N('1e20')]) {
    assertThrowsTag(() => JN.quotient(x, 0), 'division-by-zero', `quotient(${x}, 0)`);
    assertThrowsTag(() => JN.remainder(x, 0), 'division-by-zero', `remainder(${x}, 0)`);
    assertThrowsTag(() => JN.modulo(x, 0), 'domain-error', `modulo(${x}, 0)`);
    const bigzero = JN.subtract(N('1e20'), N('1e20'));
    assertThrowsTag(() => JN.quotient(x, bigzero), 'division-by-zero');
    assertThrowsTag(() => JN.remainder(x, bigzero), 'division-by-zero');
  }
  assertThrowsTag(() => JN.remainder(N('~2'), N('~0')), 'division-by-zero');
});

test('non-integer arguments are rejected', () => {
  assertThrowsTag(() => JN.quotient(N('7/2'), 2), 'domain-error');
  assertThrowsTag(() => JN.quotient(7, N('1/2')), 'domain-error');
  assertThrowsTag(() => JN.modulo(N('7/2'), 2), 'domain-error');
  assertThrowsTag(() => JN.modulo(7, N('1/2')), 'domain-error');
  assertThrowsTag(() => JN.gcd(N('7/2'), 2), 'domain-error');
  assertThrowsTag(() => JN.lcm(N('7/2'), 2), 'domain-error');
  assertThrowsTag(() => JN.integerSqrt(N('7/2')), 'domain-error');
  assertThrowsTag(() => JN.modulo(N('~4'), 2), 'domain-error');
});

test('remainder extends to rationals and roughnums', () => {
  assertNum(JN.remainder(N('7/2'), N('1/2')), 0);
  assertNum(JN.remainder(N('7/2'), 1), N('1/2'));
  assertNum(JN.remainder(N('7/3'), N('1/2')), N('1/3'));
  assertRough(JN.remainder(N('~7.5'), 2), 7.5 % 2);
  assertRough(JN.remainder(N('~-7.5'), 2), -7.5 % 2);
});

test('gcd and lcm', () => {
  assertNum(JN.gcd(12, 8), 4);
  assertNum(JN.gcd(-12, 8), 4);
  assertNum(JN.gcd(12, -8), 4);
  assertNum(JN.gcd(-12, -8), 4);
  assertNum(JN.gcd(0, 5), 5);
  assertNum(JN.gcd(5, 0), 5);
  assertNum(JN.gcd(0, 0), 0);
  assertNum(JN.lcm(4, 6), 12);
  assertNum(JN.lcm(-4, 6), 12);
  assertNum(JN.lcm(4, -6), 12);
  assertNum(JN.lcm(0, 5), 0);
  assertNum(JN.lcm(5, 0), 0);
  assertNum(JN.lcm(0, 0), 0);
  assertIntVal(JN.gcd(N((2n ** 70n).toString()), N((2n ** 68n).toString())), 2n ** 68n);
  assertIntVal(JN.lcm(N('1e20'), N('1e30')), 10n ** 30n);
});

test('property: gcd/lcm match BigInt oracle', () => {
  const rng = makeRng(0x6cd);
  const bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
  for (let i = 0; i < 800; i++) {
    const a = (rng.bool() ? -1n : 1n) * rng.bigint(rng.pick([20, 53, 90]));
    const b = (rng.bool() ? -1n : 1n) * rng.bigint(rng.pick([20, 53, 90]));
    const g = bgcd(a, b);
    assertIntVal(JN.gcd(N(a.toString()), N(b.toString())), g, `gcd(${a}, ${b})`);
    const l = (a === 0n || b === 0n) ? 0n : (a * b < 0n ? -(a * b) : a * b) / g;
    assertIntVal(JN.lcm(N(a.toString()), N(b.toString())), l, `lcm(${a}, ${b})`);
  }
});

test('property: Euclidean identities for quotient/remainder/modulo', () => {
  const rng = makeRng(0xeec);
  for (let i = 0; i < 1200; i++) {
    const x = (rng.bool() ? -1n : 1n) * rng.bigint(rng.pick([10, 40, 53, 60, 100]));
    const y = (rng.bool() ? -1n : 1n) * (rng.bigint(rng.pick([5, 30, 53, 70])) + 1n);
    const px = N(x.toString()), py = N(y.toString());
    const q = JN.quotient(px, py), r = JN.remainder(px, py), m = JN.modulo(px, py);
    // truncated division oracle
    assertIntVal(q, x / y, `quotient(${x}, ${y})`);
    assertIntVal(r, x % y, `remainder(${x}, ${y})`);
    // x === q*y + r
    assert.ok(JN.equals(JN.add(JN.multiply(q, py), r), px), `euclid(${x}, ${y})`);
    // modulo: sign follows divisor, congruent mod y
    const mb = bigOf(typeof m === 'number' ? m : m);
    const mv = ((x % y) + y) % y; // floored-mod oracle
    assertIntVal(m, mv, `modulo(${x}, ${y})`);
    assert.ok(JN.equals(JN.modulo(JN.subtract(px, m), py), 0), `modulo congruence(${x}, ${y})`);
  }
});

test('integerSqrt exact values', () => {
  assertNum(JN.integerSqrt(0), 0);
  assertNum(JN.integerSqrt(1), 1);
  assertNum(JN.integerSqrt(3), 1);
  assertNum(JN.integerSqrt(4), 2);
  assertNum(JN.integerSqrt(8), 2);
  assertNum(JN.integerSqrt(9), 3);
  assertIntVal(JN.integerSqrt(N('1e40')), 10n ** 20n);
  assertThrowsTag(() => JN.integerSqrt(-4), 'sqrt-negative');
  assertThrowsTag(() => JN.integerSqrt(N('-1e40')), 'domain-error');
});

test('integerSqrt near perfect squares (adversarial precision cases)', () => {
  // Math.floor(Math.sqrt(k*k - 1)) === k for these without correction.
  for (const k of [94868329, 94868328, 67108864, 94906265]) {
    const kk = k * k;
    if (kk > 9e15) continue;
    assertNum(JN.integerSqrt(kk), k, `integerSqrt(${k}^2)`);
    assertNum(JN.integerSqrt(kk - 1), k - 1, `integerSqrt(${k}^2 - 1)`);
    assertNum(JN.integerSqrt(kk + 1), k, `integerSqrt(${k}^2 + 1)`);
  }
});

test('property: integerSqrt invariant s^2 <= x < (s+1)^2', () => {
  const rng = makeRng(0x5a5a);
  for (let i = 0; i < 600; i++) {
    const x = rng.bigint(rng.pick([20, 40, 53, 60, 120]));
    const s = JN.integerSqrt(N(x.toString()));
    const sb = bigOf(s);
    assert.ok(sb * sb <= x, `integerSqrt(${x}) = ${s} too big`);
    assert.ok((sb + 1n) * (sb + 1n) > x, `integerSqrt(${x}) = ${s} too small`);
  }
  // adversarial: exact squares and neighbors of random roots
  for (let i = 0; i < 400; i++) {
    const root = rng.bigint(rng.pick([10, 26, 40, 80]));
    for (const x of [root * root, root * root - 1n, root * root + 1n]) {
      if (x < 0n) continue;
      const s = bigOf(JN.integerSqrt(N(x.toString())));
      assert.ok(s * s <= x && (s + 1n) * (s + 1n) > x, `integerSqrt(${x}) = ${s}`);
    }
  }
});

test('expt with integer exponents', () => {
  assertNumKind(JN.expt(2, 10), 1024, 'fixnum');
  assertNumKind(JN.expt(-2, 3), -8, 'fixnum');
  assertNumKind(JN.expt(-2, 2), 4, 'fixnum');
  assertNum(JN.expt(5, 0), 1);
  assertNum(JN.expt(0, 0), 1);
  assertNum(JN.expt(0, 5), 0);
  assertNum(JN.expt(1, 100000), 1);
  assertNum(JN.expt(-1, 101), -1);
  assertNum(JN.expt(2, -2), N('1/4'));
  assertNum(JN.expt(-2, -3), N('-1/8'));
  assertIntVal(JN.expt(2, 64), 2n ** 64n);
  assertIntVal(JN.expt(10, 100), 10n ** 100n);
  assertIntVal(JN.expt(N('1e20'), 3), 10n ** 60n);
  assertNum(JN.expt(N('1/2'), 3), N('1/8'));
  assertNum(JN.expt(N('-2/3'), 2), N('4/9'));
  assertNum(JN.expt(N('2/3'), -2), N('9/4'));
  assertNum(JN.expt(2, JN.makeBignum('64')), JN.expt(2, 64));
  assertThrowsTag(() => JN.expt(0, -1), 'division-by-zero');
  assertThrowsTag(() => JN.expt(0, N('-1/2')), 'division-by-zero');
});

test('property: integer expt is exact (BigInt oracle)', () => {
  const rng = makeRng(0xe897);
  for (let i = 0; i < 800; i++) {
    const b = rng.int(-99, 99);
    const e = rng.int(1, 40);
    const expected = BigInt(b) ** BigInt(e);
    if (expected > 10n ** 60n || expected < -(10n ** 60n)) continue;
    assertIntVal(JN.expt(b, e), expected, `${b}^${e}`);
  }
  // stress the fixnum/bignum boundary with bases near overflow roots
  for (let i = 0; i < 400; i++) {
    const e = rng.int(2, 8);
    const approxRoot = Math.floor(Math.pow(9e15, 1 / e));
    const b = approxRoot + rng.int(-2, 2);
    if (b < 2) continue;
    assertIntVal(JN.expt(b, e), BigInt(b) ** BigInt(e), `${b}^${e}`);
  }
});

test('expt with rational exponents', () => {
  assertNumKind(JN.expt(4, N('1/2')), 2, 'fixnum');
  assertNumKind(JN.expt(8, N('1/3')), 2, 'fixnum');
  assertNumKind(JN.expt(-8, N('1/3')), -2, 'fixnum');
  assertNumKind(JN.expt(27, N('2/3')), 9, 'fixnum');
  assertNum(JN.expt(N('1/4'), N('1/2')), N('1/2'));
  assertNum(JN.expt(N('1/4'), N('-1/2')), 2);
  assertNum(JN.expt(N('8/27'), N('2/3')), N('4/9'));
  assertIntVal(JN.expt(N('1e40'), N('1/2')), 10n ** 20n);
  assertRough(JN.expt(2, N('1/2')), Math.SQRT2);
  assert.ok(JN.isRoughnum(JN.expt(2, N('1/3'))));
  assertThrowsTag(() => JN.expt(-2, N('1/2')), 'domain-error');
});

test('expt with roughnums', () => {
  assertRough(JN.expt(N('~2'), 3), 8);
  assertRough(JN.expt(N('~2'), N('~0.5')), Math.SQRT2);
  assertRough(JN.expt(2, N('~0.5')), Math.SQRT2);
  assertRough(JN.expt(N('~2'), -1), 0.5);
  assertRough(JN.expt(2, N('~0')), 1);
  assertRough(JN.expt(N('~0'), 5), 0);
  assertNum(JN.expt(1, N('~2.5')), 1);
  assertRough(JN.expt(0, N('~0')), 1);
  assertNum(JN.expt(N('~1'), 5), N('~1'));
  assertThrowsTag(() => JN.expt(-2, N('~0.5')), 'domain-error');
  assertThrowsTag(() => JN.expt(N('~2'), N('~5000')), 'domain-error'); // overflow
  assertThrowsTag(() => JN.expt(0, N('~-1')), 'division-by-zero');
});

test('expt exponent identities', () => {
  const rng = makeRng(0x1de);
  for (let i = 0; i < 200; i++) {
    const x = N(`${rng.int(-20, 20)}/${rng.int(1, 20)}`.replace('/-', '/'));
    const a = rng.int(0, 8), b = rng.int(0, 8);
    if (JN.equals(x, 0)) continue;
    assert.ok(JN.equals(JN.expt(x, a + b), JN.multiply(JN.expt(x, a), JN.expt(x, b))),
      `x^(a+b) = x^a * x^b for x=${x}, a=${a}, b=${b}`);
    assert.ok(JN.equals(JN.expt(x, -a), JN.divide(1, JN.expt(x, a))),
      `x^-a = 1/x^a for x=${x}, a=${a}`);
  }
});

test('fastExpt via huge exponents on 1/-1 and bignum exponent guard', () => {
  assertNum(JN.expt(1, N('1e30')), 1);
  assertNum(JN.expt(0, N('1e30')), 0);
  assertThrowsTag(() => JN.makeBignum('2').expt(JN.makeBignum(String(0xffffffff + 1))), 'domain-error');
  // rational bases get the same guard instead of attempting an
  // astronomically large exact power
  assertThrowsTag(() => JN.expt(N('1/2'), N('1e20')), 'domain-error');
});
