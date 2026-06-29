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

// tree-sitter frontend (for --use-tree-sitter). nodeRequire (not require) so browserify
// leaves these to node's resolver at runtime. Absolute paths: the tree-sitter runtime +
// built grammar live under tree-sitter-pyret/, outside lang/node_modules. (Machine-specific;
// make configurable for a real integration.)
treeSitterRuntime = nodeRequire("/home/exedev/pyret-lang/tree-sitter-pyret/node_modules/tree-sitter");
define("tree-sitter-runtime", [], function () { return treeSitterRuntime; });
treeSitterGrammar = nodeRequire("/home/exedev/pyret-lang/tree-sitter-pyret/build/Release/tree_sitter_pyret_binding.node");
define("tree-sitter-grammar", [], function () { return treeSitterGrammar; });
treeSitterLowering = nodeRequire("/home/exedev/pyret-lang/lang/src/js/trove/tree-sitter-lowering.bundle.js");
define("tree-sitter-lowering", [], function () { return treeSitterLowering; });
