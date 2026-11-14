//
// When building a web-standalone, browserify will parse this file
// and produce a version which include each dependency that is required()
//
// Unfortunately some of these libraries have optional transitive dependencies
// that are enormous and unused, so we need to prevent them from getting bundled.
// See the browserify options in the Makefile, which currently prevent the 
// crypto, buffer, and stylus libraries from being bundled, saving ~700kb.

sexpr = require("s-expression");
define("s-expression", [], function() {return sexpr;});

//q = require("q");
if(!!Q) {
  define("q", [], function() {return Q;});
}

seedrandom = require("seedrandom");
define("seedrandom", [], function() {return seedrandom;});

csv = require("fast-csv");
define("fast-csv", [], function() {return csv;});

sourcemap = require("source-map");
define("source-map", [], function () { return sourcemap; });

jssha256 = require("js-sha256");
define("js-sha256", [], function () { return jssha256; });

jsmd5 = require("js-md5");
define("js-md5", [], function () { return jsmd5; });

// In the browser, the "canvas" module used by image-lib, make-image, and
// charts-lib is just the DOM. (On node, lang/ backs it with skia-canvas; see
// lang/src/js/trove/require-node-dependencies.js.) This replaces the shim we
// used to get from node-canvas's "browser" field, so CPO no longer needs the
// native canvas package installed at all.
define("canvas", [], function () {
  return {
    createCanvas: function (width, height) {
      return Object.assign(document.createElement('canvas'), { width: width, height: height });
    }
    // NOTE: deliberately no Canvas/Image here, matching node-canvas's browser
    // shim: make-image.js falls back to window.Image, and charts-lib.js's
    // `instanceof canvasLib.Canvas` check stays off in the browser.
  };
});

crossfetch = require("cross-fetch");
define("cross-fetch", [], function() { return crossfetch; });

buffer = require("buffer");
define("buffer", [], function() { return buffer; });

colorspaces = require("colorspaces");
define("colorspaces", [], function () { return colorspaces; });

d3 = require("d3");
define("d3", [], function() { return d3; });

d3_tip = require("d3-tip");
define("d3-tip", [], function() { return d3_tip(d3); });

define("google-charts", [], function() { return window.google || { info: "Google charts library did not load" }; });

// vegaMin = require('vega');
define("vegaMin", [], function () {return vega;});

// require('vega-tooltip');

function rpcForwardCallback(module, name) {
  return async function(...args) {
    const realargs = args.slice(0, args.length - 1);
    const callback = args[args.length - 1];
    if(!(window.MESSAGES && window.MESSAGES.sendRpc)) { throw new Error("Cannot " + name + " on the web"); }
    else {
      try {
        const result = await window.MESSAGES.sendRpc(module, name, realargs);
        return callback(undefined, result);
      }
      catch(e) {
        return callback(e);
      }
    }
  }
}

var fsWrapper = {
  fs: {
    writeFile: rpcForwardCallback('fs', 'writeFile'),
    readFile: rpcForwardCallback('fs', 'readFile'),
  }
}
define("fs", [], function () { return fsWrapper.fs; });

// NOTE(joe): this is slightly bogus, but due to the way pathlib can load, even
// though it's not used, this needs to be defined (it represents the separator
// for the system).
define("path", [], function () { return {
    sep: "/",
  };
});

define("http", [], function () {return {};});

define("lockfile", [], function () { return {}; });

define("websocket", [], function () { return {}; });
