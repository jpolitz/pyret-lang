// dump-batch.js — boot the Pyret runtime ONCE, then parse+dump many files into a cache.
//
//   node dump-batch.js <manifest> <cacheDir>
//
// <manifest>: a file with one ABSOLUTE .arr path per line.
// For each file we write <cacheDir>/<sha1(abspath)>.sexp  (the canonical dump) on
// success, or <cacheDir>/<sha1(abspath)>.err (first line of the parse error) on failure.
// The harness (diff.ts) reads these by the same sha1 key. URI = "file://" + abspath.
// NOTE: no "use strict" — the eval'd jarr uses sloppy-mode features (duplicate params).

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var makeDumper = require("./dumper-core.js");

var MANIFEST = process.argv[2];
var CACHE_DIR = process.argv[3];
if (!MANIFEST || !CACHE_DIR) {
  process.stderr.write("usage: node dump-batch.js <manifest> <cacheDir>\n");
  process.exit(2);
}
fs.mkdirSync(CACHE_DIR, { recursive: true });
var FILES = fs.readFileSync(MANIFEST, "utf8").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);

function keyFor(abspath) { return crypto.createHash("sha1").update(abspath).digest("hex"); }

var JARR_PATH = path.resolve(__dirname, "../../lang/build/phaseA/pyret.jarr");
var HANDALONE_MARKER =
  'requirejs(["pyret-base/js/runtime", "pyret-base/js/post-load-hooks", "pyret-base/js/exn-stack-parser", "program"]';

var jarrText = fs.readFileSync(JARR_PATH, "utf8");
var cut = jarrText.indexOf(HANDALONE_MARKER);
if (cut === -1) { throw new Error("Could not find handalone marker in " + JARR_PATH); }
var prefix = jarrText.slice(0, cut);

var driver = [
  ";(function(){",
  "  requirejs([\"pyret-base/js/runtime\", \"pyret-base/js/post-load-hooks\", \"program\"], function(runtimeLib, loadHooksLib, program) {",
  "    global.__PYRET_BOOT__(runtimeLib, loadHooksLib, program);",
  "  });",
  "})();"
].join("\n");

global.__PYRET_BOOT__ = function (runtimeLib, loadHooksLib, program) {
  var runtime = runtimeLib.makeRuntime({
    stdout: function (s) { process.stdout.write(s); },
    stderr: function (s) { /* swallow per-parse stderr noise */ },
    stdin: process.stdin
  });
  runtime.setParam("command-line-arguments", process.argv.slice(1));

  var realm = { instantiated: {}, static: {} };
  var PP = "builtin://parse-pyret";
  var idx = program.toLoad.indexOf(PP);
  if (idx === -1) { process.stderr.write("parse-pyret not in toLoad\n"); process.exit(1); }
  var subLoad = program.toLoad.slice(0, idx + 1);
  var postLoadHooks = loadHooksLib.makeDefaultPostLoadHooks(runtime, { main: PP, checks: "none", checksFormat: "text" });

  runtime.runThunk(function () {
    runtime.modules = realm.instantiated;
    return runtime.runStandalone(program.staticModules, realm, program.depMap, subLoad, postLoadHooks);
  }, function (loadResult) {
    if (!runtime.isSuccessResult(loadResult)) {
      process.stderr.write("module load failed\n"); process.exit(1);
    }
    var ppt = runtime.getField(realm.instantiated[PP], "provide-plus-types");
    var values = runtime.getField(ppt, "values");
    var surfaceParse = runtime.getField(values, "surface-parse");
    var dumper = makeDumper(runtime);

    var i = 0, ok = 0, err = 0;
    function next() {
      if (i >= FILES.length) {
        process.stdout.write("\nbatch done: " + ok + " ok, " + err + " err, of " + FILES.length + "\n");
        process.exit(0);
      }
      var file = FILES[i++];
      var key = keyFor(file);
      var src, uri = "file://" + file;
      try { src = fs.readFileSync(file, "utf8"); }
      catch (e) {
        fs.writeFileSync(path.join(CACHE_DIR, key + ".err"), "read-error: " + e.message);
        err++; return setImmediate(next);
      }
      runtime.runThunk(function () {
        return surfaceParse.app(runtime.makeString(src), runtime.makeString(uri));
      }, function (res) {
        if (runtime.isSuccessResult(res)) {
          var out = dumper(res.result) + "\n";
          fs.writeFileSync(path.join(CACHE_DIR, key + ".sexp"), out);
          ok++;
        } else {
          var msg = "parse-error";
          try {
            var ex = res.exn !== undefined ? res.exn : res;
            msg = require("util").format(ex).split("\n")[0];
          } catch (e) { /* ignore */ }
          fs.writeFileSync(path.join(CACHE_DIR, key + ".err"), msg);
          err++;
        }
        if (i % 50 === 0) process.stdout.write("  " + i + "/" + FILES.length + "\n");
        setImmediate(next);
      });
    }
    next();
  });
};

// eslint-disable-next-line no-eval
eval(prefix + "\n" + driver);
