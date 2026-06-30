// Unit tests for the REPL's multiline-input heuristic (needsContinuation).
// This decides whether a snippet looks complete or whether the REPL should
// keep reading continuation lines before sending it to the server.
const { needsContinuation } = require('../repl-client');

// Helper: the function takes an array of lines (as readline accumulates them).
const cont = (src) => needsContinuation(src.split('\n'));

describe('needsContinuation', () => {
  describe('complete single-line snippets submit immediately', () => {
    test.each([
      '1 + 1',
      '"hello"',
      '[list: 1, 2, 3]',
      'x = 10',
      'print("hi")',
      'check: 2 + 2 is 4 end',
    ])('%s is complete', (src) => {
      expect(cont(src)).toBe(false);
    });
  });

  describe('genuinely incomplete snippets ask for more', () => {
    test.each([
      'fun f(x):',
      'cases(List) l:',
      'if x:',
      'for each(y from l):',
      'data D:',
    ])('%s needs continuation', (src) => {
      expect(cont(src)).toBe(true);
    });
  });

  describe('clause keywords share their parent end (regression)', () => {
    // These previously wedged the REPL: `block`/`where`/`shared` were counted
    // as block-openers, so the heuristic waited forever for an `end` that the
    // construct never has — it shares the enclosing construct's single `end`.
    test('explicit block form is complete', () => {
      expect(cont('fun f(x) block:\n  x\nend')).toBe(false);
    });
    test('where clause is complete', () => {
      expect(cont('fun f(x): x\nwhere:\n  f(1) is 1\nend')).toBe(false);
    });
    test('data with sharing is complete', () => {
      expect(cont('data D:\n  | a\nsharing:\n  method m(self): 1 end\nend')).toBe(false);
    });
  });

  describe('multi-line constructs', () => {
    test('open fun needs continuation, closed fun does not', () => {
      expect(cont('fun f(x):')).toBe(true);
      expect(cont('fun f(x):\n  x * 2\nend')).toBe(false);
    });
    test('nested blocks balance', () => {
      expect(cont('fun f():\n  cases(List) l:\n    | empty => 0')).toBe(true);
      expect(cont('fun f():\n  cases(List) l:\n    | empty => 0\n    | link(a, r) => a\n  end\nend')).toBe(false);
    });
  });

  describe('strings and comments do not skew the count', () => {
    test('keyword inside a string literal is ignored', () => {
      expect(cont('x = "fun if cases"')).toBe(false);
    });
    test('keyword inside a comment is ignored', () => {
      expect(cont('x = 1 # fun if data')).toBe(false);
    });
    test('unterminated triple-backtick string needs continuation', () => {
      expect(cont('s = ```line one')).toBe(true);
      expect(cont('s = ```line one\nline two```')).toBe(false);
    });
  });
});
