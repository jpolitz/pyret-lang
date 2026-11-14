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

// The "canvas" module used by image-lib, make-image, and charts-lib is backed
// by skia-canvas (https://github.com/samizdatco/skia-canvas) when running in
// node. skia-canvas ships prebuilt binaries as per-platform optional
// dependencies, so there is no node-gyp/Cairo build step at install time.
//
// It is loaded with nodeRequire so browserify does not try to bundle the
// native addon, and lazily (inside the define callback) so programs that never
// touch images do not pay to load the native library.
//
// The adapter exposes the small subset of the node-canvas API that Pyret's
// trove files use: createCanvas, Canvas (for instanceof checks), and Image.
define("canvas", [], function() {
  var skia = nodeRequire("skia-canvas");
  return {
    createCanvas: function(width, height) { return new skia.Canvas(width, height); },
    Canvas: skia.Canvas,
    Image: skia.Image,
    ImageData: skia.ImageData,
    loadImage: skia.loadImage
  };
});

seedrandom = require("seedrandom");
define("seedrandom", [], function() {return seedrandom;});

csv = require("fast-csv");
define("fast-csv", [], function() {return csv;});

crossFetch = require("cross-fetch");
define("cross-fetch", [], function() {return crossFetch;});

sourcemap = require("source-map");
define("source-map", [], function () { return sourcemap; });

jssha256 = require("js-sha256");
define("js-sha256", [], function () { return jssha256; });

buffer = require("buffer");
define("buffer", [], function () { return buffer; });

fs = nodeRequire("fs");
define("fs", [], function () { return fs; });

readline = nodeRequire("readline");
define("readline", [], function () { return readline; });

path = nodeRequire("path");
define("path", [], function () { return path; });

http = nodeRequire("http");
define("http", [], function () {return http;});


resolve = nodeRequire("resolve");
define("resolve", [], function () {return resolve;});

vegaMin = nodeRequire(nodeRequire('node:path').dirname(nodeRequire.resolve('vega')) + '/vega.js');
define("vegaMin", [], function () {return global.vega;});

