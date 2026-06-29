// dump-existing.js
//
// Loads the compiled Pyret runtime + the `parse-pyret` builtin out of
// lang/build/phaseA/pyret.jarr, calls `surface-parse(src, uri)`, and prints a
// canonical, deterministic s-expression dump of the resulting Program AST.
//
// Usage:
//   node dump-existing.js <file.arr>     # parse a file
//   node dump-existing.js                # parse a tiny hardcoded program
//
// HOW THE MODULE LOAD WORKS
// -------------------------
// pyret.jarr is a self-contained AMD bundle (its own `define`/`requirejs`).
// It ends with a "handalone" block:
//
//   requirejs(["pyret-base/js/runtime", ..., "program"], function(runtimeLib, ..., program) {
//     ... runtime.runStandalone(staticModules, realm, depMap, toLoad, postLoadHooks) ...
//   });
//
// That block, if run, would boot the *compiler CLI* and process.exit(). We do
// not want that. So we slice the jarr text right before that block (keeping all
// the `define(...)`s, including `define("program", ...)`, and the bundled npm
// deps), then append OUR OWN driver that uses the in-scope `requirejs` to grab
// `pyret-base/js/runtime` and the `program` bundle.
//
// `program` contains { staticModules, depMap, toLoad, uris } for the WHOLE
// compiler. parse-pyret + its deps (ast, srcloc, lists, ...) are already in
// there with correct content-hash depMap entries. We run `runStandalone` over
// only the prefix of `toLoad` up to and including "builtin://parse-pyret", then
// pull the instantiated module out of realm.instantiated and call surface-parse.
//
// The whole thing is eval'd via direct `eval` inside this (non-strict, CommonJS)
// module so the jarr's top-level `var define, requirejs;` land in this function
// scope and our appended driver can see them. `require` inside the eval'd code
// resolves npm deps by walking up to /home/exedev/pyret-lang/node_modules.

var fs = require("fs");
var path = require("path");

var JARR_PATH = path.resolve(__dirname, "../../lang/build/phaseA/pyret.jarr");
var HANDALONE_MARKER =
  'requirejs(["pyret-base/js/runtime", "pyret-base/js/post-load-hooks", "pyret-base/js/exn-stack-parser", "program"]';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
var inputFile = process.argv[2];
var SRC, URI;
if (inputFile) {
  SRC = fs.readFileSync(inputFile, "utf8");
  URI = "file://" + path.resolve(inputFile);
} else {
  SRC = "x = 1\nfun f(y): y + 1 end";
  URI = "tinyprog";
}

// ---------------------------------------------------------------------------
// The reflective AST dumper.
//
// Runtime value shapes (discovered from lang/src/js/base/runtime.js):
//   * data value:  has own/proto props $name (variant name), $arity,
//                   $app_fields, and $constructor.$fieldNames (ordered field
//                   names). Field values live in val.dict[fieldName].
//                   runtime.isDataValue(v) tests for $name/$app_fields/$arity.
//   * number:      runtime.isNumber(v); render with runtime.num_tostring(v)
//                   (handles ints AND exact rationals like 4/5).
//   * string:      runtime.isString(v) -> raw JS string.
//   * boolean:     runtime.isBoolean(v) -> raw JS boolean.
//   * nothing:     runtime.isNothing(v).
//   * Srcloc:      a data value. Variant "srcloc" has the 7 fields
//                   source/start-line/start-column/start-char/end-line/
//                   end-column/end-char. Variant "builtin" has module-name.
//   * List:        data value, variants "link"(first,rest) / "empty".
//   * Option:      data value, variants "some"(value) / "none".
// ---------------------------------------------------------------------------
function makeDumper(rt) {
  function ind(n) { return new Array(n + 1).join("  "); }

  function fieldNamesOf(v) {
    // Singleton constructors (e.g. none, a-blank) use $arity === -1 as a
    // sentinel and have NO data fields -- their dict only holds shared methods.
    if (v.$arity === -1) { return []; }
    if (v.$constructor && v.$constructor.$fieldNames) {
      return v.$constructor.$fieldNames;
    }
    // Fallback: deterministic, sorted dict keys that aren't methods/functions.
    var ks = [];
    for (var k in v.dict) {
      if (typeof v.dict[k] !== "function" && !rt.isFunction(v.dict[k])) { ks.push(k); }
    }
    ks.sort();
    return ks;
  }

  // srcloc variant has 7 fields; render all of them on one line.
  function renderSrcloc(v) {
    var d = v.dict;
    return "(srcloc " +
      JSON.stringify(d["source"]) + " " +
      rt.num_tostring(d["start-line"]) + " " +
      rt.num_tostring(d["start-column"]) + " " +
      rt.num_tostring(d["start-char"]) + " " +
      rt.num_tostring(d["end-line"]) + " " +
      rt.num_tostring(d["end-column"]) + " " +
      rt.num_tostring(d["end-char"]) + ")";
  }

  function isSrclocVariant(v) {
    return v.$name === "srcloc" &&
      Object.prototype.hasOwnProperty.call(v.dict, "start-char");
  }
  function isBuiltinSrcloc(v) {
    return v.$name === "builtin" &&
      Object.prototype.hasOwnProperty.call(v.dict, "module-name");
  }

  // Flatten a List (link/empty) into a JS array of element values.
  function listToArray(v) {
    var out = [];
    while (rt.isDataValue(v) && v.$name === "link") {
      out.push(v.dict["first"]);
      v = v.dict["rest"];
    }
    return out;
  }

  function dump(v, depth) {
    // Primitives
    if (v === undefined) { return "undefined"; }
    if (v === null) { return "null"; }
    if (rt.isNothing && rt.isNothing(v)) { return "nothing"; }
    if (rt.isBoolean(v)) { return v ? "true" : "false"; }
    if (rt.isNumber(v)) { return rt.num_tostring(v); }
    if (rt.isString(v)) { return JSON.stringify(v); }
    if (rt.isFunction(v)) { return "<function>"; }

    if (rt.isDataValue(v)) {
      // Srclocs: special-cased.
      if (isSrclocVariant(v)) { return renderSrcloc(v); }
      if (isBuiltinSrcloc(v)) {
        return "(builtin " + JSON.stringify(v.dict["module-name"]) + ")";
      }

      // Lists: render flat as (list e1 e2 ...).
      if (v.$name === "empty") { return "(list)"; }
      if (v.$name === "link") {
        var elems = listToArray(v);
        if (elems.length === 0) { return "(list)"; }
        var pieces = elems.map(function(e) {
          return ind(depth + 1) + dump(e, depth + 1);
        });
        return "(list\n" + pieces.join("\n") + ")";
      }

      // Generic data value (AST nodes, Name nodes, Option, etc.)
      var names = fieldNamesOf(v);
      if (names.length === 0) {
        return "(" + v.$name + ")";
      }
      var parts = names.map(function(fn) {
        var fv = v.dict[fn];
        return ind(depth + 1) + ":" + fn + " " + dump(fv, depth + 1);
      });
      return "(" + v.$name + "\n" + parts.join("\n") + ")";
    }

    // Raw JS array (shouldn't normally appear, but be safe).
    if (Array.isArray(v)) {
      var ap = v.map(function(e) { return ind(depth + 1) + dump(e, depth + 1); });
      return "(array\n" + ap.join("\n") + ")";
    }

    // Fallback for unknown objects: show keys deterministically.
    if (typeof v === "object") {
      if (v.dict) {
        var ks = [];
        for (var k in v.dict) { ks.push(k); }
        ks.sort();
        var op = ks.map(function(kk) {
          return ind(depth + 1) + ":" + kk + " " + dump(v.dict[kk], depth + 1);
        });
        return "(object\n" + op.join("\n") + ")";
      }
      return "(opaque " + JSON.stringify(Object.prototype.toString.call(v)) + ")";
    }

    return JSON.stringify(v);
  }

  return function(v) { return dump(v, 0); };
}

// ---------------------------------------------------------------------------
// Boot the runtime out of the jarr and parse.
// ---------------------------------------------------------------------------
var jarrText = fs.readFileSync(JARR_PATH, "utf8");
var cut = jarrText.indexOf(HANDALONE_MARKER);
if (cut === -1) {
  throw new Error("Could not find handalone marker in " + JARR_PATH);
}
var prefix = jarrText.slice(0, cut);

// Our driver. Runs in the same scope as the jarr's `var define, requirejs;`.
// We stash the work into globalThis so it's reachable from anywhere, but we do
// the real work inside the requirejs callback so we don't care about sync/async.
var driver = [
  ";(function(){",
  "  requirejs([\"pyret-base/js/runtime\", \"pyret-base/js/post-load-hooks\", \"program\"], function(runtimeLib, loadHooksLib, program) {",
  "    global.__PYRET_BOOT__(runtimeLib, loadHooksLib, program);",
  "  });",
  "})();"
].join("\n");

global.__PYRET_BOOT__ = function(runtimeLib, loadHooksLib, program) {
  var runtime = runtimeLib.makeRuntime({
    stdout: function(s) { process.stdout.write(s); },
    stderr: function(s) { process.stderr.write(s); },
    stdin: process.stdin
  });
  // Some builtin modules read this param at load time (like handalone does).
  runtime.setParam("command-line-arguments", process.argv.slice(1));

  var staticModules = program.staticModules;
  var depMap = program.depMap;
  var toLoad = program.toLoad;
  var realm = { instantiated: {}, static: {} };

  var PP = "builtin://parse-pyret";
  var idx = toLoad.indexOf(PP);
  if (idx === -1) {
    process.stderr.write("parse-pyret not found in program.toLoad\n");
    process.exit(1);
  }
  var subLoad = toLoad.slice(0, idx + 1);

  // Post-load hooks wire up runtime.ffi, runtime.srcloc, etc. as modules load.
  var postLoadHooks = loadHooksLib.makeDefaultPostLoadHooks(runtime, {
    main: PP, checks: "none", checksFormat: "text"
  });

  function fail(stage, result) {
    process.stderr.write("Failure during " + stage + ":\n");
    try {
      if (result && result.exn) {
        process.stderr.write(require("util").format(result.exn) + "\n");
      } else {
        process.stderr.write(require("util").format(result) + "\n");
      }
    } catch (e) { /* ignore */ }
    process.exit(1);
  }

  runtime.runThunk(function() {
    runtime.modules = realm.instantiated;
    return runtime.runStandalone(staticModules, realm, depMap, subLoad, postLoadHooks);
  }, function(loadResult) {
    if (!runtime.isSuccessResult(loadResult)) { return fail("module load", loadResult); }

    runtime.runThunk(function() {
      // parse-pyret returns a makeModuleReturn object; its provided values
      // live under provide-plus-types.values (getExported isn't on the public
      // runtime API, so we walk the fields directly).
      var ppt = runtime.getField(realm.instantiated[PP], "provide-plus-types");
      var values = runtime.getField(ppt, "values");
      var surfaceParse = runtime.getField(values, "surface-parse");
      return surfaceParse.app(runtime.makeString(SRC), runtime.makeString(URI));
    }, function(parseResult) {
      if (!runtime.isSuccessResult(parseResult)) { return fail("surface-parse", parseResult); }
      var ast = parseResult.result;
      var dumper = makeDumper(runtime);
      var out = dumper(ast);
      process.stdout.write(out + "\n", function() { process.exit(0); });
    });
  });
};

// Eval the jarr prefix + our driver as ONE script in this function scope.
// (Direct eval so `var define, requirejs` declared in the jarr are visible to
// the appended driver code.)
// eslint-disable-next-line no-eval
eval(prefix + "\n" + driver);
