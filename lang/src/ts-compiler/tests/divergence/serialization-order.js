#!/usr/bin/env node
// Divergence probes for the Pyret -> TypeScript compiler port.
//
// Both probes target the same class of latent divergence: the Pyret original
// iterated a StringDict in *hash order*, but the TS port iterates a JS Map in
// *insertion order*. Where the emitted/derived order is observable, the two
// compilers can disagree byte-for-byte on serialized output.
//
// Run from lang/ (after `make ts-compiler`, i.e. build/ts-compiler exists):
//   node src/ts-compiler/tests/divergence/serialization-order.js
//
// Each probe prints exactly one VERDICT line. The script exits 0 as long as
// the probes execute (it is a divergence report, not a pass/fail gate).

const path = require('path');
const assert = require('assert');

const OUT = path.join(__dirname, '..', '..', '..', '..', 'build', 'ts-compiler');
function load(mod) { return require(path.join(OUT, mod)); }

const CS = load('compile-structs.js');
const JOP = load('js-of-pyret.js');
const J = load('js-ast.js');
const A = load('ast.js');

function line() { console.log('-'.repeat(72)); }

// ===========================================================================
// PROBE A: typeFromRaw / datatypeFromRaw type-parameter ordering
//   compile-structs.ts:805-808 (forall) and 857-860 (data)
// ===========================================================================
//
// FINDING (as filed): t-forall / t-data param lists are built by iterating a
// Map, so param order supposedly follows "JSON key insertion order".
//
// WHAT THE RAW ENCODING ACTUALLY IS (verified in src/js/base/type-util.js:9-19
// and the codegen in anf-loop-compiler.arr:2129-2134):
//
//     { tag: "forall", args: ["a", "b"], onto: <type> }
//
// i.e. the type parameters arrive as a POSITIONAL ARRAY of tyvar-name strings,
// NOT as a dict. So the literal "reorder the JSON dict keys" probe is not
// applicable -- there is no dict on the wire whose key order could vary.
//
// The REAL Pyret->TS divergence is still present, one level in. Both compilers
// funnel the array through an intermediate name-dict and then read the params
// back OUT of that dict:
//   Pyret  (compile-structs.arr:480-482):  params = for SD.map-keys(k from new-env) ...  // HASH order
//   TS     (compile-structs.ts:805-808):   for (const k of newEnv.keys()) ...            // INSERTION order
// For the same wire input, Pyret reshuffles params into string-dict hash
// order; the TS port preserves array/insertion order. These generally differ
// for 2+ params. This probe demonstrates the TS side's behaviour concretely.

console.log('\nPROBE A: typeFromRaw forall/data type-parameter ordering');
line();

function forallParamNames(rawArgs) {
  // onto = {tag:"any"} keeps the type valid without needing the tyvars bound.
  const raw = { tag: 'forall', args: rawArgs, onto: { tag: 'any' } };
  const t = CS.typeFromRaw('builtin://probe', raw, new Map());
  assert.strictEqual(t.$name, 't-forall');
  return t.introduces.map((tv) => tv.id.toname());
}

const ab = forallParamNames(['a', 'b']);
const ba = forallParamNames(['b', 'a']);
console.log('  raw args ["a","b"]  ->  t-forall params ' + JSON.stringify(ab));
console.log('  raw args ["b","a"]  ->  t-forall params ' + JSON.stringify(ba));

// The TS port faithfully mirrors the positional array order (via Map insertion
// order). Reordering the ARRAY reorders the output; there is no dict to
// reorder independently.
assert.deepStrictEqual(ab, ['a', 'b']);
assert.deepStrictEqual(ba, ['b', 'a']);
const trackedArrayOrder =
  JSON.stringify(ab) === JSON.stringify(['a', 'b']) &&
  JSON.stringify(ba) === JSON.stringify(['b', 'a']);

// Supporting evidence for the genuine divergence surface: the intermediate
// dict (newEnv) is seeded from the ENCLOSING tyvar env, and TS reads params
// out of it in insertion order -- so an inherited outer tyvar is PREPENDED in
// insertion order. This is precisely the spot where Pyret's SD.map-keys would
// instead reshuffle everything into hash order.
const outer = A.globalNames.makeAtom('z');
const inheritedEnv = new Map([['z', outer]]);
const rawInner = { tag: 'forall', args: ['a'], onto: { tag: 'any' } };
const inner = CS.typeFromRaw('builtin://probe', rawInner, inheritedEnv);
const innerNames = inner.introduces.map((tv) => tv.id.toname());
console.log('  inherited env {z}, raw args ["a"]  ->  params ' +
  JSON.stringify(innerNames) + '   (outer tyvar prepended in insertion order)');
assert.deepStrictEqual(innerNames, ['z', 'a']);

console.log('');
if (trackedArrayOrder) {
  console.log('VERDICT A: NOT APPLICABLE as a JSON-dict-reorder probe -- the wire');
  console.log('  encoding of forall/data type params is a POSITIONAL ARRAY');
  console.log('  (type-util.js:9-19), not a dict, so there is no dict key order to');
  console.log('  flip. The underlying Pyret->TS divergence is nonetheless REAL and');
  console.log('  structurally confirmed: Pyret reads params via SD.map-keys (hash');
  console.log('  order, compile-structs.arr:480-482,524-526) while the TS port reads');
  console.log('  via Map.keys() (insertion order, compile-structs.ts:805-808,857-860).');
  console.log('  Shown above: TS preserves array/insertion order and prepends');
  console.log('  inherited tyvars by insertion -- exactly what Pyret hash order would');
  console.log('  reshuffle, so re-serialized param order can diverge for 2+ params.');
} else {
  console.log('VERDICT A: unexpected -- TS did not track array order; investigate.');
}

// ===========================================================================
// PROBE B: CCPDict emitted module field order
//   js-of-pyret.ts:21-30 (clMapSd) via CCPDict.toJExpr (js-of-pyret.ts:41-43)
// ===========================================================================
//
// clMapSd folds with clCons (PREPEND), so the emitted field order is the
// REVERSE of the key-iteration order. The divergence is in that iteration:
//   Pyret (js-of-pyret.arr:19-23): SD.fold-keys  -> HASH order (then reversed)
//   TS    (js-of-pyret.ts:24-30):  Map.keys()    -> INSERTION order (then reversed)
// So the top-level shape of every compiled file has its fields ordered by Map
// insertion order in the TS port, vs string-dict hash order in Pyret.

console.log('\nPROBE B: CCPDict emitted module field order');
line();

function emit(insertionOrder) {
  const d = new Map();
  for (const k of insertionOrder) {
    d.set(k, k === 'a' ? new J.JNum(1) : new J.JStr(k));
  }
  const src = new JOP.CCPDict(d).pyretToJsRunnable();
  // Extract the field-name order from the emitted ({...}) object literal.
  const fields = [...src.matchAll(/"([a-z]+)":/g)].map((m) => m[1]);
  return { src, fields };
}

const ba2 = emit(['b', 'a']);
const ab2 = emit(['a', 'b']);
console.log('  Map insertion [b,a]  ->  ' + ba2.src);
console.log('                          emitted field order ' + JSON.stringify(ba2.fields));
console.log('  Map insertion [a,b]  ->  ' + ab2.src);
console.log('                          emitted field order ' + JSON.stringify(ab2.fields));

// Emitted field order = reverse of insertion order, and it TRACKS insertion
// order: the two identical dicts (same keys, same values) serialize to
// different byte strings purely because of insertion order.
assert.notStrictEqual(ba2.src, ab2.src);
assert.deepStrictEqual(ba2.fields, ['a', 'b']); // reverse of [b,a]
assert.deepStrictEqual(ab2.fields, ['b', 'a']); // reverse of [a,b]

console.log('');
console.log('VERDICT B: DIVERGENCE CONFIRMED (field order = reverse of Map');
console.log('  insertion order; Pyret used string-dict hash order via SD.fold-keys).');
console.log('  Two CCPDicts with identical keys+values but different insertion order');
console.log('  emit different byte strings -- the top-level shape of every compiled');
console.log('  file. Pyret would order these fields by hash, independent of how the');
console.log('  dict was built, so the TS port can emit a different field order.');

console.log('');
process.exit(0);
