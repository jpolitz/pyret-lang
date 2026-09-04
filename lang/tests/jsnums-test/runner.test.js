'use strict';

// node --test runner over the frozen oracle cases, under each jsbn digit
// configuration. JSNUMS_PATH points at an alternative js-numbers.js;
// JSNUMS_FILTER restricts to case ids containing the given text.

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./suite');
const { loadLibrary } = require('./load');

const libPath = process.env.JSNUMS_PATH || undefined;
const filterText = process.env.JSNUMS_FILTER;
const filter = filterText ? (c => c.id.includes(filterText)) : null;
const MAX_SHOWN = 25;

const files = S.caseFiles().map(name => ({ name, data: S.readCaseFile(name) }));
const ulpStats = {};

for (const bits of [28, 30, 26]) {
  const { lib, digitBits } = loadLibrary(libPath, bits);
  assert.equal(digitBits, bits, 'digit configuration did not take effect');
  for (const { name, data } of files) {
    test(name.replace(/\.json$/, '') + ' [' + bits + '-bit digits]', () => {
      const results = S.runCases(lib, data, filter);
      const s = S.summarize(results);
      const key = data.op;
      ulpStats[key] = ulpStats[key] === undefined || s.maxUlp > ulpStats[key] ? s.maxUlp : ulpStats[key];
      if (s.fail) {
        const shown = s.failures.slice(0, MAX_SHOWN).map(S.formatFailure);
        assert.fail(s.fail + ' of ' + s.total + ' cases failed:\n  ' + shown.join('\n  ') +
          (s.fail > MAX_SHOWN ? '\n  ... ' + (s.fail - MAX_SHOWN) + ' more' : ''));
      }
    });
  }
}

test.after(() => {
  const lines = Object.entries(ulpStats).filter(([, v]) => v > 0n).map(([k, v]) => k + '=' + v);
  if (lines.length) console.log('# max ulp error observed: ' + lines.join(' '));
});
