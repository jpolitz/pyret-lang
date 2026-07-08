#!/usr/bin/env node
// Divergence probes for the Pyret -> TypeScript compiler port.
//
// Both probes concern the same mechanism: the Pyret original iterated a
// StringDict, but the TS port iterates a JS Map (insertion order). Where the
// derived order is both (a) past the StringDict's hash-order threshold and
// (b) observable, the two compilers can disagree byte-for-byte on serialized
// output. Probe A (forall/data type params) turns out to be LATENT -- it needs
// 9+ params to even differ and was not found to reach observable output; Probe
// B (CCPDict module fields) routinely crosses the threshold and diverges.
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
// FINDING (as filed): forall/data type-param lists are built by iterating a
// Map (TS) vs a StringDict (Pyret), so param order can diverge.
//
// WIRE ENCODING (type-util.js:9-19, anf-loop-compiler.arr:2129-2134):
//     { tag: "forall", args: ["a","b"], onto: <type> }   // POSITIONAL ARRAY
// The params arrive as an ordered array of tyvar names, not a dict, so there is
// no wire dict key order to flip. Both compilers seed an intermediate name env
// from the array and read the params back OUT of it:
//   Pyret (compile-structs.arr:480-482,524-526): for SD.map-keys(k from env)
//   TS    (compile-structs.ts:805-808,857-860):  for (const k of env.keys())
//
// THE THRESHOLD (this is the key correction to the original probe). The TS Map
// always iterates in INSERTION order (= the wire array order). Pyret's
// StringDict iterates in insertion order ONLY while it is small: it is a HAMT
// whose ArrayMapNode preserves insertion order until it exceeds
// MAX_ARRAY_MAP_SIZE = SIZE/4 = 8 entries (string-dict.js:138,385-403,428),
// after which it becomes a hash-ordered trie. Verified with a StringDict built
// reverse-alphabetically and read via keys-list()/map-keys():
//     8 keys  ->  insertion order preserved   (h,g,f,e,d,c,b,a)
//     9 keys  ->  hash order                   (a,b,c,d,e,f,g,h,i)
// So the Pyret<->TS param-order divergence exists ONLY for a forall/data type
// with 9+ combined type parameters (the env holds the enclosing tyvars plus
// this binder's args). Below 9, BOTH compilers emit insertion order and the
// param lists are byte-identical. The originally filed "observable with 2+
// params" claim therefore does NOT hold -- a 2-entry env (incl. the inherited
// {z} example) is an insertion-ordered ArrayMapNode in Pyret too. Nine+ type
// params on a single forall/data essentially never occurs in real Pyret;
// contrast Probe B's CCPDict, whose module-object routinely has 9+ fields.
//
// SURFACE OBSERVABILITY: not independently reachable. A polymorphic type driven
// into a type error DOES print differently between the compilers, but that is a
// SEPARATE divergence -- existential NUMBERING direction -- reproducible with a
// purely local data type (no import, so datatypeFromRaw never runs):
//     TS: (?-1, ?-2 -> Box2<?-1, ?-2>)     PA: (?-2, ?-1 -> Box2<?-2, ?-1>)
// even at 2 params. That is the type-check-structs existential-id finding, not
// this one; both compilers still render the params themselves in source order.
//
// This probe therefore only demonstrates the TS side: params track insertion
// (= wire array) order at every size, including past the 9-entry threshold
// where Pyret would reshuffle.

console.log('\nPROBE A: typeFromRaw forall type-parameter ordering');
line();

function forallParamNames(rawArgs) {
  // onto = {tag:"any"} keeps the type valid without needing the tyvars bound.
  const raw = { tag: 'forall', args: rawArgs, onto: { tag: 'any' } };
  const t = CS.typeFromRaw('builtin://probe', raw, new Map());
  assert.strictEqual(t.$name, 't-forall');
  return t.introduces.map((tv) => tv.id.toname());
}

// Small case (<= 8 entries): TS insertion order; Pyret's ArrayMapNode gives the
// SAME order, so there is no divergence here.
const ab = forallParamNames(['a', 'b']);
const ba = forallParamNames(['b', 'a']);
console.log('  raw args ["a","b"]  ->  params ' + JSON.stringify(ab) + '   (Pyret: identical, insertion order)');
console.log('  raw args ["b","a"]  ->  params ' + JSON.stringify(ba) + '   (Pyret: identical, insertion order)');
assert.deepStrictEqual(ab, ['a', 'b']);
assert.deepStrictEqual(ba, ['b', 'a']);

// Threshold case (9 entries): TS still tracks insertion/array order; Pyret's
// StringDict is now a HAMT and reshuffles into hash order -> the lists diverge.
const nineIn = ['Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const nineOut = forallParamNames(nineIn);
const pyretHashOrder = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'Z']; // Z: 90&31=26 sorts last
console.log('  raw args ' + JSON.stringify(nineIn) + '  (9 entries)');
console.log('    TS    -> ' + JSON.stringify(nineOut) + '   (insertion/array order)');
console.log('    Pyret -> ' + JSON.stringify(pyretHashOrder) + '   (hash order; verified via SD.map-keys on 9 keys)');
assert.deepStrictEqual(nineOut, nineIn); // TS preserves insertion/array order
const divergesAtNine = JSON.stringify(nineOut) !== JSON.stringify(pyretHashOrder);

console.log('');
if (JSON.stringify(ab) === '["a","b"]' && divergesAtNine) {
  console.log('VERDICT A: DIVERGENCE IS LATENT AND THRESHOLDED. The forall/data param');
  console.log('  list differs between compilers ONLY at 9+ combined type parameters,');
  console.log('  where Pyret\'s StringDict switches from an insertion-ordered ArrayMapNode');
  console.log('  to a hash-ordered HAMT (MAX_ARRAY_MAP_SIZE=8, string-dict.js:138,428).');
  console.log('  Below 9 both compilers emit insertion order and are byte-identical, so');
  console.log('  the filed "2+ params" observation does not hold. 9+ type params on one');
  console.log('  type essentially never occur, and no program was found where this list');
  console.log('  order changes observable output independently of the separate');
  console.log('  existential-id divergence (which reproduces with a local data type). TS');
  console.log('  preserves the wire/array order -- arguably the more faithful order.');
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
// insertion order in the TS port, vs string-dict hash order in Pyret. (Unlike
// Probe A, the module object routinely holds 9+ fields, so it is past the
// StringDict's 8-entry insertion-order threshold and genuinely diverges.)

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
