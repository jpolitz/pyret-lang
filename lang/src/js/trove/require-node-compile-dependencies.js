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

// NOTE: the Lezer parser frontend (for --use-lezer) is NOT loaded here. It is a
// normal raw-js module "lezer-pyret-frontend" declared in the require-configs
// (standalone-config{A,B,C}.json, node_modules-config.json) pointing at
// ../lezer-pyret/lezer-bundle.js, and listed in parse-pyret's nativeRequires —
// exactly like pyret-base/js/pyret-tokenizer and pyret-parser. So it is bundled
// into the compiler and every standalone that uses parse-pyret, with no special
// handling required here.
