/*
 * Unit tests for substitute-vars.js (run: node --test src/substitute-vars.test.js).
 * Pins the six supported spellings, mustache-compatible escaping and
 * null/undefined handling, the closed-world errors, the narrowness of the
 * pattern (minified-JS braces must never match), and the preload translation.
 */
const test = require("node:test");
const assert = require("node:assert");
const { substituteVars, findVars, pyretPreloadTag } = require("./substitute-vars.js");

test("all six spellings substitute; & and triple are raw, plain double escapes", () => {
  const out = substituteVars(
    'a={{X}} b={{ X }} c={{&X}} d={{ &X }} e={{{X}}} f={{{ X }}}',
    { X: '<v>&"' });
  assert.strictEqual(out,
    'a=&lt;v&gt;&amp;&quot; b=&lt;v&gt;&amp;&quot; c=<v>&" d=<v>&" e=<v>&" f=<v>&"');
});

test("escaping matches mustache's entity set exactly", () => {
  const out = substituteVars("{{X}}", { X: `&<>"'/\`=` });
  assert.strictEqual(out, "&amp;&lt;&gt;&quot;&#39;&#x2F;&#x60;&#x3D;");
});

test("undefined/null values render as empty string (mustache-compatible)", () => {
  assert.strictEqual(
    substituteVars("[{{A}}][{{ &B }}]", { A: undefined, B: null }), "[][]");
});

test("a referenced variable missing from the dictionary is an error", () => {
  assert.throws(() => substituteVars("{{ &PRESENT }} {{ABSENT}}", { PRESENT: "x" }),
    /missing from the dictionary: ABSENT/);
});

test("minified-JS braces and lowercase/mixed tags never match", () => {
  const js = 'function f(doc,line,span){{var end;if(x){{}}}} "{{notAVar}}" "{{ Mixed_Case }}"';
  assert.strictEqual(substituteVars(js, {}), js);
});

test("$ in values is inert (no replacement-pattern expansion)", () => {
  assert.strictEqual(substituteVars("{{ &X }}", { X: "$& $1 $` $'" }), "$& $1 $` $'");
});

test("findVars lists each referenced variable once, sorted", () => {
  assert.deepStrictEqual(
    findVars("{{B}} {{ &A }} {{{C}}} {{B}}"), ["A", "B", "C"]);
});

test("pyretPreloadTag: tag when not gzipped, empty when gzipped", () => {
  assert.strictEqual(pyretPreloadTag("https://x/p.js", ""),
    '<link crossorigin="anonymous" rel="preload" href="https://x/p.js" as="script">');
  assert.strictEqual(pyretPreloadTag("https://x/p.js", "true"), "");
});
