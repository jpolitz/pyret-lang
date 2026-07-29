#!/usr/bin/env node
// Divergence probe: `unique` / `structurallyEqual` in compile-lib.ts vs Pyret's
// `sets.list-to-list-set(lst).to-list()`.
//
// Finding under test (compile-lib.ts:352-384): the TS `structurallyEqual` used
// by `unique` to dedup compile-error lists short-circuits on `key()`: two
// same-constructor objects whose `key()` return equal strings are treated as
// equal REGARDLESS of their other fields. Pyret `==` is fully structural.
//
// Lever: Srcloc.key() (srcloc.ts:81-83) returns `source:startChar-endChar`,
// IGNORING line/column. So two Srclocs identical in source/startChar/endChar
// but different in line/col have equal key() yet are structurally different.
// Pyret `==` calls them different; `structurallyEqual` calls them equal.
//
// `unique` is exported; `structurallyEqual` is not, so it is probed through
// `unique`. Run from anywhere:
//   node src/ts-compiler/tests/divergence/structural-equal-dedup.js
// Requires a built lang/build/ts-compiler (npm run build in src/ts-compiler).

const path = require('path');
const assert = require('assert');

const OUT = path.join(__dirname, '..', '..', '..', '..', 'build', 'ts-compiler');
function load(mod) { return require(path.join(OUT, mod)); }

const SL = load('srcloc.js');
const CL = load('compile-lib.js');
const CE = load('compile-errors.js');

let confirmed = 0;
let notReproduced = 0;

// ---------------------------------------------------------------------------
// Probe (a): Srcloc key() collision -> unique() collapses structurally-distinct
// locations.
// ---------------------------------------------------------------------------
(function probeA() {
  // Same source / startChar / endChar, DIFFERENT line & column.
  //   Srcloc(source, startLine, startColumn, startChar, endLine, endColumn, endChar)
  const locA = new SL.Srcloc('f.arr',  1, 0, 10,  1, 5, 20);
  const locB = new SL.Srcloc('f.arr',  9, 3, 10, 12, 7, 20);

  console.log('--- Probe (a): Srcloc.key() ignores line/column ---');
  console.log('  locA = ' + locA.toString());
  console.log('  locB = ' + locB.toString());
  console.log('  locA.key()   = ' + JSON.stringify(locA.key()));
  console.log('  locB.key()   = ' + JSON.stringify(locB.key()));
  console.log('  locA.equals(locB) [Pyret ==] = ' + locA.equals(locB));

  assert.strictEqual(locA.key(), locB.key(), 'expected key() collision');
  assert.strictEqual(locA.equals(locB), false,
    'expected the two locs to be structurally distinct (Pyret ==)');

  // Probe structurallyEqual through the exported `unique`: two structurally
  // distinct values collapse iff structurallyEqual considers them equal.
  const deduped = CL.unique([locA, locB]);
  console.log('  unique([locA, locB]).length = ' + deduped.length +
    '   (Pyret set-to-list would keep 2)');

  if (deduped.length === 1) {
    console.log('DIVERGENCE CONFIRMED: unique collapsed two structurally-distinct ' +
      'Srclocs (differing line/col) because their key() strings collide; ' +
      'Pyret == keeps both.');
    confirmed++;
  } else {
    console.log('NOT REPRODUCED: unique preserved both Srclocs (length ' +
      deduped.length + ').');
    notReproduced++;
  }
  console.log('');
})();

// ---------------------------------------------------------------------------
// Probe (b): real CompileError (UnboundVar) list dedup.
//   - first-occurrence ordering is preserved (matches note that Pyret set order
//     differed);
//   - two same-constructor errors with equal-key() but structurally-different
//     embedded locs are wrongly collapsed.
// UnboundVar(id: string, loc: Loc); CompileErrorBase has no key(), so
// structurallyEqual recurses into fields and hits the loc's key() short-circuit.
// ---------------------------------------------------------------------------
(function probeB() {
  console.log('--- Probe (b): unique() over real UnboundVar compile errors ---');

  // Distinct source char-ranges -> distinct keys; used for ordering check.
  const loc1 = new SL.Srcloc('f.arr', 1, 0,  5, 1, 4,  9);   // key f.arr:5-9
  const loc2 = new SL.Srcloc('f.arr', 2, 0, 30, 2, 4, 34);   // key f.arr:30-34

  // Same char-range as loc1 (key f.arr:5-9) but different line/col: a genuine
  // structural difference that key() erases.
  const loc1b = new SL.Srcloc('f.arr', 8, 2, 5, 8, 6, 9);

  const eX_1  = new CE.UnboundVar('x', loc1);
  const eY_2  = new CE.UnboundVar('y', loc2);
  const eX_1b = new CE.UnboundVar('x', loc1b);   // same id, key-colliding loc
  const eX_1dup = new CE.UnboundVar('x', loc1);  // true structural duplicate

  // Ordering + genuine-dup dedup: [eX_1, eY_2, eX_1dup] -> [eX_1, eY_2]
  const orderIn = [eX_1, eY_2, eX_1dup];
  const ordered = CL.unique(orderIn);
  console.log('  unique([UnboundVar x@5-9, UnboundVar y@30-34, dup x@5-9])');
  console.log('    -> length ' + ordered.length + ', ids ' +
    JSON.stringify(ordered.map((e) => e.id)));
  assert.strictEqual(ordered.length, 2, 'true structural duplicate should collapse');
  assert.deepStrictEqual(ordered.map((e) => e.id), ['x', 'y'],
    'first-occurrence order should be preserved');
  console.log('  ok: first-occurrence ordering preserved, real duplicate collapsed.');

  // The divergence: eX_1 vs eX_1b differ only in the loc's line/col.
  console.log('  eX_1.loc  = ' + eX_1.loc.toString());
  console.log('  eX_1b.loc = ' + eX_1b.loc.toString());
  console.log('  eX_1.loc.equals(eX_1b.loc) [Pyret ==] = ' + eX_1.loc.equals(eX_1b.loc));

  const collided = CL.unique([eX_1, eX_1b]);
  console.log('  unique([eX_1, eX_1b]).length = ' + collided.length +
    '   (Pyret == keeps 2)');

  if (collided.length === 1 && eX_1.loc.equals(eX_1b.loc) === false) {
    console.log('DIVERGENCE CONFIRMED: two UnboundVar errors with the same id but ' +
      'structurally-different locs (same char-range, different line/col) were ' +
      'deduplicated to one; Pyret structural == would keep both.');
    confirmed++;
  } else {
    console.log('NOT REPRODUCED: unique kept both UnboundVar errors (length ' +
      collided.length + ').');
    notReproduced++;
  }
  console.log('');
})();

console.log('=== summary: ' + confirmed + ' divergence(s) confirmed, ' +
  notReproduced + ' not reproduced ===');
process.exit(0);
