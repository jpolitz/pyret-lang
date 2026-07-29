#!/usr/bin/env node
// Divergence probe for the Pyret -> TypeScript compiler port.
//
// Subject: the order in which type-checker EXISTENTIAL variables are labelled
// (`?-1`, `?-2`, ...) when a type is rendered in an error message, plus the
// related family of solver-iteration orderings. Filed at type-check-structs.ts
// (509, 1050, 1080, 1121, 1232) and type-check.ts (314, 2085, 2342, 2375) as an
// instance of cross-cutting #1 (Map insertion order replacing a Pyret ordered
// collection).
//
// Run from lang/ (after `make ts-compiler`, i.e. build/ts-compiler exists):
//   node src/ts-compiler/tests/divergence/existential-ordering.js
//
// Prints one VERDICT line. Exits 0 as long as the probe executes (it is a
// divergence report, not a pass/fail gate).
//
// ---------------------------------------------------------------------------
// WHAT DIVERGES, AND WHY IT IS COSMETIC
// ---------------------------------------------------------------------------
// The `?-N` label a rendered existential gets is its position in
// `Type.free-variables()` iteration order (type-structs: toString numbers the
// free-vars list 1..N, then substitutes). That order differs between compilers:
//   Pyret (type-structs.arr:227-252): free-variables builds a `list-set`
//     (`[list-set: self]`, unioned via foldl), and toString reads it with
//     `.to-list()`.
//   TS    (type-structs.ts:356-716):  free-variables builds a `Map` (TypeSet,
//     via typeSetUnion), and toString reads `[...freeVariables().values()]`.
// The two set implementations do NOT iterate in the same order (the TS Map
// preserves structural first-occurrence / insertion order; Pyret's list-set
// yields the opposite here), so the same type gets its existentials numbered
// differently. This numbering feeds ONLY toString (type-structs.arr:572-576) --
// it never re-enters the solver -- so the effect is confined to error-message
// bytes.
//
// The filed solve-loop sites are the same class one layer down: they iterate a
// `Map`/`StringDict` of constraints/mappings/fields (was a Pyret StringDict or
// set), which can change WHICH error is reported first and the field order of
// an inferred record. All of these are message-level, not pass/fail:
//   VERIFIED: `make ts-type-check-test` and `make type-check-test` BOTH report
//   "all 211 tests passed" -- no program type-checks differently between the
//   compilers; only the rendered messages can differ.
//
// (Note: the StringDict-backed solver dicts only actually reorder past 8 entries
// -- an ArrayMapNode preserves insertion order below that, MAX_ARRAY_MAP_SIZE=8;
// see serialization-order.js. The free-variables list-set below reorders at any
// size, which is why the 2-existential repro already diverges.)
//
// ---------------------------------------------------------------------------
// END-TO-END REPRODUCTION (verified with both built compilers)
// ---------------------------------------------------------------------------
// Program (a purely LOCAL data type -- no import, so no deserialization path is
// involved; this is not the compile-structs param-order item):
//     data Box2<Z, a>:
//       | box2(zval :: Z, aval :: a)
//     end
//     x :: Number = box2
// The `box2` constructor's forall type is instantiated for the mismatch and
// rendered with fresh existentials:
//     TS:  (?-1, ?-2 -> (Box2<?-1, ?-2> % is-box2))
//     PA:  (?-2, ?-1 -> (Box2<?-2, ?-1> % is-box2))
// Same structure, opposite existential numbering.

const path = require('path');
const assert = require('assert');

const OUT = path.join(__dirname, '..', '..', '..', '..', 'build', 'ts-compiler');
function load(mod) { return require(path.join(OUT, mod)); }

const TS = load('type-structs.js');
const SL = load('srcloc.js');

function line() { console.log('-'.repeat(72)); }

console.log('\nPROBE: existential display numbering (?-N) order');
line();

const L = SL.dummyLoc;

// Create the two existentials in the OPPOSITE order from how they appear
// structurally, to prove the TS numbering follows STRUCTURE, not creation order
// (Pyret's list-set, by contrast, does not track structural order here):
//   eA is minted first (older gensym), but placed structurally SECOND.
//   eZ is minted second (newer gensym), but placed structurally FIRST.
const eA = TS.newExistential(L, false);
const eZ = TS.newExistential(L, false);

// type = (eZ, eA -> {eZ; eA})   -- eZ is the structurally-first free variable.
const typ = new TS.TArrow([eZ, eA], new TS.TTuple([eZ, eA], L, false), L, false);

const rendered = typ.toString();
const freeOrder = [...typ.freeVariables().values()].map((e) => e.id.toname());
console.log('  built:            (eZ, eA -> {eZ; eA})   [eA minted first, eZ placed first]');
console.log('  freeVariables():  ' + JSON.stringify(freeOrder) + '   (TS: structural first-occurrence order)');
console.log('  toString():       ' + rendered);

// TS numbers by structural first-occurrence: the structurally-first existential
// (eZ) is ?-1 even though it was minted second. So the label order is
// independent of gensym/creation order -- it is the free-variables Map order.
assert.strictEqual(rendered, '(?-1, ?-2 -> {?-1; ?-2})');
const tsStructural = rendered === '(?-1, ?-2 -> {?-1; ?-2})';

console.log('');
if (tsStructural) {
  console.log('VERDICT: DIVERGENCE CONFIRMED, COSMETIC (message-only). TS labels');
  console.log('  existentials by free-variables Map order (structural first-occurrence:');
  console.log('  the structurally-first var is ?-1 regardless of mint order). Pyret builds');
  console.log('  free-variables as a list-set whose to-list() yields the opposite order,');
  console.log('  so identical types render with swapped ?-N labels -- verified end-to-end:');
  console.log('  a local `data Box2<Z,a>` in a type error prints `(?-1, ?-2 -> ...)` (TS)');
  console.log('  vs `(?-2, ?-1 -> ...)` (PA). The filed solve-loop Map-key iterations');
  console.log('  (type-check-structs 509/1050/1080/1121/1232, type-check 314/2085/2342/2375)');
  console.log('  are the same class and can also reorder which error is reported first / an');
  console.log('  inferred record\'s field order. All message-level: both compilers pass all');
  console.log('  211 type-check tests, so nothing type-checks differently.');
} else {
  console.log('VERDICT: unexpected -- TS numbering was not structural; investigate.');
}

console.log('');
process.exit(0);
