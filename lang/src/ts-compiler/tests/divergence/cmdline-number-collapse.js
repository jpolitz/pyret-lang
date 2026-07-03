#!/usr/bin/env node
// Divergence probe: cmdline.ts ReadNumber.parse collapses exact Pyret numbers.
//
// Run from lang/:
//   node src/ts-compiler/tests/divergence/cmdline-number-collapse.js
// Requires the ts-compiler build (build/ts-compiler/); run `make ts-compiler`
// (or `npx tsc -p .` in src/ts-compiler) first.
//
// FINDING (primary): ReadNumber.parse at src/cmdline.ts:65-77 does
//   `return left(jsnums.toFixnum(n))`
// so a Number-typed CLI argument is collapsed to a JS double. The Pyret
// original (src/arr/trove/cmdline.arr:52-58) returned `left(n)` — the exact
// PyretNumber (rationals / bignums preserved). So `--count 1/3` becomes the
// inexact double 0.3333333333333333 in the TS CLI where the Pyret CLI kept an
// exact 1/3, and a bignum like 12345678901234567890123 loses precision.
//
// FINDING (secondary): usageInfo (src/cmdline.ts:246-249) and short-name
// conflict detection (src/cmdline.ts:311-324) iterate a JS Map in INSERTION
// order; Pyret string-dict iteration was hash-based, so usage-text line ORDER
// can differ (per-line text is identical). We can't run the Pyret side here,
// so that probe reports PLAUSIBLE rather than CONFIRMED.

const path = require('path');
const assert = require('assert');

const OUT = path.join(__dirname, '..', '..', '..', '..', 'build', 'ts-compiler');
function load(mod) { return require(path.join(OUT, mod)); }

const C = load('cmdline.js');
const jn = load('interop/js-numbers.js');

let exitCode = 0;

// ---------------------------------------------------------------------------
// Probe (a): exact number collapse in ReadNumber.parse
// ---------------------------------------------------------------------------
console.log('=== Probe (a): ReadNumber.parse collapses exact numbers ===');

function parseNumberArg(argStr) {
  // A single Number-typed option parsed against an explicit argv array (never
  // process.argv). A trailing non-option arg terminates option processing.
  const opts = new Map([['count', C.nextVal(C.Num, C.once, 'a count')]]);
  const res = C.parseArgs(opts, ['--count', argStr, 'prog.arr']);
  assert.strictEqual(res.$name, 'success', `parse of ${argStr} should succeed`);
  return res.parsed.get('count');
}

const cases = ['1/3', '12345678901234567890123'];
for (const input of cases) {
  const parsed = parseNumberArg(input);
  // What js-numbers (string-tonumber, as the Pyret CLI used) would preserve:
  const exact = jn.jsnums.fromString(input);
  const exactStr = String(exact);
  const isExactBoxed = (typeof exact === 'object') && jn.jsnums.isExact(exact);

  console.log(`  input ${JSON.stringify(input)}:`);
  console.log(`    TS CLI parsed value : ${parsed}  (typeof ${typeof parsed})`);
  console.log(`    js-numbers exact    : ${exactStr}  (typeof ${typeof exact}, isExact=${isExactBoxed})`);

  // The TS CLI result is a plain JS double...
  assert.strictEqual(typeof parsed, 'number',
    'ReadNumber.parse returns a JS number (toFixnum), not a boxed PyretNumber');
  // ...and its textual form differs from the exact value Pyret would have kept.
  assert.notStrictEqual(String(parsed), exactStr,
    'the collapsed double should not render identically to the exact value');
  // ...while js-numbers would have preserved an exact, non-double value.
  assert.strictEqual(isExactBoxed, true,
    'js-numbers.fromString yields a boxed exact value the Pyret CLI kept');
}

// Spell out the canonical 1/3 case for the record.
const third = parseNumberArg('1/3');
assert.strictEqual(third, 1 / 3);
assert.strictEqual(String(jn.jsnums.fromString('1/3')), '1/3');
console.log('  DIVERGENCE CONFIRMED: --count 1/3 -> ' + third +
  " (JS double) in the TS CLI; Pyret CLI kept exact '1/3'.");
console.log('  DIVERGENCE CONFIRMED: --count 12345678901234567890123 -> ' +
  parseNumberArg('12345678901234567890123') +
  " (precision-lost double); Pyret CLI kept exact '12345678901234567890123'.");
console.log('');

// ---------------------------------------------------------------------------
// Probe (b): usageInfo line ordering follows Map insertion order
// ---------------------------------------------------------------------------
console.log('=== Probe (b): usageInfo line ordering ===');

// Keys chosen so that insertion order is NOT alphabetical or hash-like; this
// makes it observable that the emitted order tracks insertion.
const insertionOrder = ['zebra', 'alpha', 'middle', 'beta'];
const usageOpts = new Map([
  ['zebra',  C.flag(C.once, 'the zebra flag')],
  ['alpha',  C.nextVal(C.Str, C.once, 'the alpha value')],
  ['middle', C.flag(C.many, 'the middle flag')],
  ['beta',   C.nextVal(C.Num, C.once, 'the beta value')],
]);

const usage = C.usageInfo(usageOpts);
// usage[0] is the "Usage: ... where:" header; option lines follow.
const optionLines = usage.slice(1);
const emittedKeys = optionLines.map((line) => {
  const m = line.match(/^\s+-{1,2}([a-z]+)/);
  return m ? m[1] : null;
});

console.log('  insertion order : ' + JSON.stringify(insertionOrder));
console.log('  emitted order   : ' + JSON.stringify(emittedKeys));

assert.deepStrictEqual(emittedKeys, insertionOrder,
  'usageInfo emits option lines in Map insertion order');

console.log('  NOTE: Pyret string-dict iteration was hash-based, so the Pyret');
console.log('        CLI could emit these same lines in a different ORDER');
console.log('        (per-line text is identical). Cannot run the Pyret side');
console.log('        here to capture its hash order.');
console.log('  DIVERGENCE PLAUSIBLE (ordering source differs): TS uses Map');
console.log('        insertion order; Pyret used string-dict hash order.');
console.log('');

console.log('divergence probes complete.');
process.exit(exitCode);
