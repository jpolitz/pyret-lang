// Browser-side loader for Pyret's own tokenizer.
//
// Pyret's tokenizer is an AMD module pair (pyret-tokenizer.js depending on
// jglr/jglr -> jglr/rnglr -> jglr/cyclicJSON). esbuild can't follow those
// `define(...)` calls, so we inline the four source files as TEXT (via the
// `.amdtext` text loader) and eval them under a tiny captured `define` shim
// that wires the dependency graph by name. The end result is the same
// `Tokenizer` singleton the Node oracle uses, running unchanged in the browser.
import cyclicSrc from "./vendor/cyclicJSON.amdtext";
import rnglrSrc from "./vendor/rnglr.amdtext";
import jglrSrc from "./vendor/jglr.amdtext";
import tokSrc from "./vendor/pyret-tokenizer.amdtext";

const modules = {};
// Expose `define` globally so the indirect-eval'd AMD bodies can find it.
globalThis.define = function (name, deps, factory) {
  const resolved = deps.map((d) => {
    if (!(d in modules)) throw new Error("unresolved AMD dep: " + d);
    return modules[d];
  });
  modules[name] = factory.apply(null, resolved);
};

// Order matters: deps before dependents.
(0, eval)(cyclicSrc);
(0, eval)(rnglrSrc);
(0, eval)(jglrSrc);
(0, eval)(tokSrc);

export const Tokenizer = modules["pyret-base/js/pyret-tokenizer"].Tokenizer;

// Tokenize a string -> array of { name, value, startChar, endChar }.
// Comments/whitespace are SKIPPED by the tokenizer (in its `ignore` set), so
// they never appear here (and thus never in the Lezer tree).
export function tokenize(str) {
  Tokenizer.tokenizeFrom(str);
  const out = [];
  while (Tokenizer.hasNext()) {
    const t = Tokenizer.next();
    if (t.name === "EOF") break;
    out.push({
      name: t.name,
      value: t.value,
      startChar: t.pos.startChar,
      endChar: t.pos.endChar,
    });
  }
  return out;
}
