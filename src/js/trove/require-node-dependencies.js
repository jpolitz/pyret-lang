//
// When building a standalone, browserify will parse this file
// and produce a version which include each dependency that is required()
//
global.sexpr = require("s-expression");
define("s-expression", [], function() {return sexpr;});

global.q = require("q");
define("q", [], function() {return q;});

global.jsmd5 = require("js-md5");
define("js-md5", [], function() {return jsmd5;});

global.canvas = require("canvas");
define("canvas", [], function() {return canvas;});

global.seedrandom = require("seedrandom");
define("seedrandom", [], function() {return seedrandom;});

global.csv = require("fast-csv");
define("fast-csv", [], function() {return csv;});

global.crossFetch = require("cross-fetch");
define("cross-fetch", [], function() {return crossFetch;});

global.sourcemap = require("source-map");
define("source-map", [], function () { return sourcemap; });

global.jssha256 = require("js-sha256");
define("js-sha256", [], function () { return jssha256; });

global.buffer = require("buffer");
define("buffer", [], function () { return buffer; });

global.fs = nodeRequire("fs");
define("fs", [], function () { return fs; });

global.readline = nodeRequire("readline");
define("readline", [], function () { return readline; });

global.path = nodeRequire("path");
define("path", [], function () { return path; });

global.http = nodeRequire("http");
define("http", [], function () {return http;});


global.resolve = nodeRequire("resolve");
define("resolve", [], function () {return resolve;});

global.vegaMin = nodeRequire(nodeRequire('node:path').dirname(nodeRequire.resolve('vega')) + '/vega.js');
define("vegaMin", [], function () {return global.vega;});

