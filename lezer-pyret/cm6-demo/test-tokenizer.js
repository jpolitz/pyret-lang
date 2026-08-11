// Node smoke test: load Pyret's AMD tokenizer via a tiny define() shim and
// tokenize a string. Proves the browser approach (eval the 4 AMD files under a
// captured `define`) before we bundle it for the browser.
const fs = require("fs");
const path = require("path");

const V = path.join(__dirname, "vendor");
const files = [
  ["jglr/cyclicJSON", "cyclicJSON.amdtext"],
  ["jglr/rnglr", "rnglr.amdtext"],
  ["jglr/jglr", "jglr.amdtext"],
  ["pyret-base/js/pyret-tokenizer", "pyret-tokenizer.amdtext"],
];

const modules = {};
global.define = function (name, deps, factory) {
  const resolved = deps.map((d) => {
    if (!(d in modules)) throw new Error("unresolved AMD dep: " + d);
    return modules[d];
  });
  modules[name] = factory.apply(null, resolved);
};

for (const [, file] of files) {
  const src = fs.readFileSync(path.join(V, file), "utf8");
  (0, eval)(src); // indirect eval: runs in global scope, sees global.define
}

const Tok = modules["pyret-base/js/pyret-tokenizer"].Tokenizer;

const sample = 'fun f(x):\n  x + 1\nend';
Tok.tokenizeFrom(sample);
const out = [];
while (Tok.hasNext()) {
  const t = Tok.next();
  if (t.name === "EOF") break;
  out.push({ name: t.name, value: t.value, startChar: t.pos.startChar, endChar: t.pos.endChar });
}
console.log("token count:", out.length);
console.log(JSON.stringify(out, null, 0));
