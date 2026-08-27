// js-numbers tests: vendored-jsbn digit configurations (am1/26, am2/30,
// am3/28) and the divRemTo quotient-digit correction.
// Authored by Claude (agent).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadJsNumbers, jsnums, makeRng } = require('./helpers.js');

const CONFIGS = [
  ['am3-28 (default; no usable navigator.appName)', undefined],
  ['am3-28 (Netscape appName)', { appName: 'Netscape' }],
  ['am1-26 (other appName)', { appName: 'Opera' }],
  ['am2-30 (IE appName)', { appName: 'Microsoft Internet Explorer' }],
];

test('default Node environment uses the 28-bit configuration',
     { skip: !!process.env.JSNUMS_TEST_APPNAME }, () => {
  const b = jsnums.makeBignum('12345678901234567890');
  assert.equal(b.DB, 28, 'expected dbits 28 under Node');
});

for (const [label, nav] of CONFIGS) {
  test(`division regression and oracle checks under ${label}`, () => {
    const JN = loadJsNumbers(nav);

    // The case that produced quotient-1 with remainder == divisor under
    // the 26-bit configuration (jsbn's floating estimate has no slack
    // when F2 === 0).
    const a = JN.makeBignum('33911095126815243304');
    const b = JN.makeBignum('2129087680346');
    const qr = a.divideAndRemainder(b);
    assert.equal(qr[0].toString(), '15927524');
    assert.equal(qr[1].toString(), '0');
    assert.equal(JN.quotient(a, b).toString(), '15927524');
    assert.equal(JN.remainder(a, b).toString(), '0');

    // A rational identity that failed through the same path.
    const pa = JN.divide(JN.makeBignum('15927524'), 3001);
    const pb = JN.divide(119768, JN.makeBignum('71107063'));
    assert.ok(JN.equals(JN.multiply(JN.divide(pa, pb), pb), pa));

    // Randomized division oracle per configuration.
    const rng = makeRng(0xd1f1de);
    for (let i = 0; i < 3000; i++) {
      const x = rng.bigint(rng.pick([50, 54, 80, 130, 220]));
      const y = rng.bigint(rng.pick([28, 52, 56, 90])) + 1n;
      // include many exact multiples: those sit on the estimator boundary
      const exact = rng.bool();
      const xa = exact ? x * y : x;
      const bx = JN.makeBignum(xa.toString());
      const by = JN.makeBignum(y.toString());
      const got = bx.divideAndRemainder(by);
      assert.equal(got[0].toString(), (xa / y).toString(), `${xa} quo ${y} [${label}]`);
      assert.equal(got[1].toString(), (xa % y).toString(), `${xa} rem ${y} [${label}]`);
    }

    // Multiplication and addition oracle checks (exercises am directly).
    for (let i = 0; i < 1500; i++) {
      const x = (rng.bool() ? -1n : 1n) * rng.bigint(200);
      const y = (rng.bool() ? -1n : 1n) * rng.bigint(200);
      const px = JN.fromString(x.toString()), py = JN.fromString(y.toString());
      const prod = JN.multiply(px, py);
      const sum = JN.add(px, py);
      assert.equal(prod.toString(), (x * y).toString(), `${x} * ${y} [${label}]`);
      assert.equal(sum.toString(), (x + y).toString(), `${x} + ${y} [${label}]`);
    }

    // toString/parse roundtrip across radix boundaries.
    for (const s of ['0', '1', '-1', '268435455', '268435456', '268435457',
                     '72057594037927935', '72057594037927936',
                     '99999999999999999999999999999999999999']) {
      assert.equal(JN.fromString(s).toString(), s, `${s} [${label}]`);
    }
  });
}

test('modPow and gcd remain consistent across configurations', () => {
  const rng = makeRng(0x9c9c);
  const libs = CONFIGS.map(([label, nav]) => [label, loadJsNumbers(nav)]);
  for (let i = 0; i < 200; i++) {
    const a = rng.bigint(120), b = rng.bigint(120);
    let expected = null;
    for (const [label, JN] of libs) {
      const g = JN.gcd(JN.fromString(a.toString()), JN.fromString(b.toString()));
      if (expected === null) expected = g.toString();
      assert.equal(g.toString(), expected, `gcd(${a}, ${b}) [${label}]`);
    }
  }
});
