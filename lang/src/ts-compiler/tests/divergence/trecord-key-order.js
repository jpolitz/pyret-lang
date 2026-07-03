#!/usr/bin/env node
// Divergence probe: TRecord.key()/toString() field-order sensitivity.
//
// Finding under test: TRecord.key() (type-structs.ts) iterates its
// `fields: Map<string, Type>` in INSERTION order, whereas the Pyret original
// (type-structs.arr) iterates a hash-trie StringDict whose iteration order is
// a deterministic function of the CONTENTS, not of insertion order. So two
// structurally-equal record types built with different field-insertion orders
// should produce the SAME key() in Pyret, but may produce DIFFERENT key()
// strings in TS. key() is used as a type-identity string (TypeSet in
// type-check-structs.ts is a Map keyed by type.key()), so a divergence here is
// a correctness hazard, not cosmetics.
//
// Run from lang/:
//   node src/ts-compiler/tests/divergence/trecord-key-order.js

const path = require('path');
const assert = require('assert');

const OUT = path.join(__dirname, '..', '..', '..', '..', 'build', 'ts-compiler');
function load(mod) { return require(path.join(OUT, mod)); }

const TS = load('type-structs.js');
const SL = load('srcloc.js');
const L = SL.dummyLoc;

// Two simple, distinguishable field types so ordering is observable.
function anyT() { return new TS.TTop(L, false); }
function botT() { return new TS.TBot(L, false); }

// Build a TRecord from an ordered list of [name, type] pairs, inserting into
// the fields Map in exactly that order.
function record(pairs) {
  const m = new Map();
  for (const [name, ty] of pairs) { m.set(name, ty); }
  return new TS.TRecord(m, L, false);
}

// Identical name->type mapping, inserted in two different orders.
const recAB = record([['a', anyT()], ['b', botT()]]);
const recBA = record([['b', botT()], ['a', anyT()]]);

let brokenProbe = false;

// ---- Probe a1: key() order sensitivity ----------------------------------
(function probeKey() {
  const kAB = recAB.key();
  const kBA = recBA.key();
  console.log('  recAB.key() = ' + JSON.stringify(kAB));
  console.log('  recBA.key() = ' + JSON.stringify(kBA));
  if (typeof kAB !== 'string' || typeof kBA !== 'string') {
    brokenProbe = true;
    console.log('PROBE BROKEN: key() did not return a string');
    return;
  }
  if (kAB !== kBA) {
    console.log('DIVERGENCE CONFIRMED: TRecord.key() is field-insertion-order sensitive; '
      + 'two structurally-equal records produced different keys ('
      + JSON.stringify(kAB) + ' vs ' + JSON.stringify(kBA) + ').');
  } else {
    console.log('NOT REPRODUCED: TRecord.key() produced the same string for both insertion orders.');
  }
})();

// ---- Probe a2: toString() order sensitivity -----------------------------
(function probeToString() {
  const sAB = recAB.toString();
  const sBA = recBA.toString();
  console.log('  recAB.toString() = ' + JSON.stringify(sAB));
  console.log('  recBA.toString() = ' + JSON.stringify(sBA));
  if (typeof sAB !== 'string' || typeof sBA !== 'string') {
    brokenProbe = true;
    console.log('PROBE BROKEN: toString() did not return a string');
    return;
  }
  if (sAB !== sBA) {
    console.log('DIVERGENCE CONFIRMED: TRecord.toString() is field-insertion-order sensitive; '
      + 'two structurally-equal records rendered differently ('
      + JSON.stringify(sAB) + ' vs ' + JSON.stringify(sBA) + ').');
  } else {
    console.log('NOT REPRODUCED: TRecord.toString() produced the same string for both insertion orders.');
  }
})();

// ---- Probe b: downstream consequence ------------------------------------
// (1) equals() and key() disagree as identity notions: equals() is
//     order-independent (typeMembersEquals uses Map.get), key() is not.
// (2) A key()-keyed Map (mimicking TypeSet in type-check-structs.ts) stores
//     two structurally-equal records as two distinct entries.
(function probeConsequence() {
  const eq = recAB.equals(recBA);
  const sameKey = recAB.key() === recBA.key();
  console.log('  recAB.equals(recBA) = ' + eq + ';  key() equal = ' + sameKey);

  // Mimic TypeSet: Map keyed by type.key().
  const typeSet = new Map();
  typeSet.set(recAB.key(), recAB);
  typeSet.set(recBA.key(), recBA);

  if (eq && !sameKey) {
    console.log('DIVERGENCE CONFIRMED: equals() reports the two records EQUAL while key() '
      + 'reports them DIFFERENT -- key() and equals() disagree as type-identity notions. '
      + 'Consequence: a key()-keyed Map (TypeSet-style) holds ' + typeSet.size
      + ' distinct entries for what equals() considers ONE type '
      + '(expected 1 to match Pyret semantics).');
  } else if (!eq) {
    console.log('NOT REPRODUCED: equals() did not consider the two records equal, so there is '
      + 'no equals()/key() disagreement to demonstrate.');
  } else {
    console.log('NOT REPRODUCED: key() agreed with equals(); TypeSet-style Map holds '
      + typeSet.size + ' entr' + (typeSet.size === 1 ? 'y' : 'ies') + '.');
  }
})();

// Sanity: the probe machinery itself worked (both records are t-records).
assert.strictEqual(recAB.$name, 't-record');
assert.strictEqual(recBA.$name, 't-record');

process.exit(brokenProbe ? 1 : 0);
