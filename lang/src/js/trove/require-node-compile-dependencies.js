//
// When building a standalone, browserify will parse this file
// and produce a version which include each dependency that is required()
//
sexpr = require("s-expression");
define("s-expression", [], function() {return sexpr;});

q = require("q");
define("q", [], function() {return q;});

jsmd5 = require("js-md5");
define("js-md5", [], function() {return jsmd5;});

crossFetch = require("cross-fetch");
define("cross-fetch", [], function() {return crossFetch;});

seedrandom = require("seedrandom");
define("seedrandom", [], function() {return seedrandom;});

sourcemap = require("source-map");
define("source-map", [], function () { return sourcemap; });

buffer = require("buffer");
define("buffer", [], function () { return buffer; });

jssha256 = require("js-sha256");
define("js-sha256", [], function () { return jssha256; });

fs = nodeRequire("fs");
define("fs", [], function () { return fs; });

path = nodeRequire("path");
define("path", [], function () { return path; });

http = nodeRequire("http");
define("http", [], function () {return http;});

ws = nodeRequire("ws");
define("ws", [], function () { return ws });

resolve = nodeRequire("resolve");
define("resolve", [], function () { return resolve });

// Lezer parser frontend (for --use-lezer). nodeRequire (not require) so browserify
// leaves it to node's resolver at runtime. The self-contained Lezer bundle (parser +
// external tokenizer + to-rnglr adapter + @lezer/lr) lives under lezer-pyret/, outside
// lang/node_modules. Resolve it PORTABLY (relative to cwd, which is lang/ for the
// Makefile, or the repo root) and NON-FATALLY: if it's absent, the default parser is
// completely unaffected and only --use-lezer is unavailable.
lezerPyretFrontend = null;
(function () {
  var p, fs, proc;
  try { p = nodeRequire("path"); fs = nodeRequire("fs"); } catch (e) { return; }
  // IMPORTANT: use the REAL node `process` via nodeRequire, not the global `process`
  // — in the browserify standalone the global one is a shim whose cwd() returns '/'.
  try { proc = nodeRequire("process"); } catch (e) { proc = null; }
  var bases = [];
  if (proc) {
    try { bases.push(proc.cwd()); } catch (e) {}                       // lang/ for the Makefile
    try { if (proc.argv && proc.argv[1]) bases.push(p.dirname(proc.argv[1])); } catch (e) {} // dir of pyret.jarr
  }
  try { bases.push(__dirname); } catch (e) {}
  var rels = ["../lezer-pyret/lezer-bundle.js", "lezer-pyret/lezer-bundle.js",
              "../../lezer-pyret/lezer-bundle.js", "../../../lezer-pyret/lezer-bundle.js"];
  for (var b = 0; b < bases.length && !lezerPyretFrontend; b++) {
    if (!bases[b]) continue;
    for (var r = 0; r < rels.length; r++) {
      var cand;
      try { cand = p.resolve(bases[b], rels[r]); } catch (e) { continue; }
      try { if (fs.existsSync(cand)) { lezerPyretFrontend = nodeRequire(cand); break; } } catch (e) {}
    }
  }
})();
// Publish on a global rather than via define()/nativeRequires: parse-pyret reads it
// lazily (only for --use-lezer), so built standalones that bundle parse-pyret but not
// this compile-deps module don't need the module defined. This module only loads in
// the compiler, which is the only place --use-lezer runs.
try { (typeof global !== "undefined" ? global : this).__PYRET_LEZER_FRONTEND__ = lezerPyretFrontend; } catch (e) {}
