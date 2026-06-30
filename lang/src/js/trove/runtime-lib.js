({
  requires: [],
  nativeRequires: ["pyret-base/js/runtime"],
  provides: {
    values: {
      "make-runtime": "tany",
      "set-stdout": "tany"
    },
    types: {
      "Runtime": "tany"
    }
  },
  theModule: function(runtime, ns, uri, runtimeLib) {
    var get = runtime.getField;
    function applyBrand(brand, val) {
      return get(brand, "brand").app(val);
    }

    var brandRuntime = runtime.namedBrander("runtime", ["runtime-lib: runtime brander"]);
    var annRuntime = runtime.makeBranderAnn(brandRuntime, "Runtime");
    var checkRuntime = function(v) { runtime._checkAnn(["runtime"], annRuntime, v); };

    function makeRuntime() {
      return applyBrand(brandRuntime, runtime.makeObject({
        "runtime": runtime.makeOpaque(runtimeLib.makeRuntime({
          stdout: runtime.stdout,
          stderr: runtime.stderr,
          stdin: runtime.stdin
        }))
      }));
    }

    // Sets the stdout of a Runtime object to a Pyret function (String -> Nothing).
    // Used by the REPL server to redirect print() output per interaction.
    function setStdout(rtObj, fn) {
      var jsRt = runtime.getField(rtObj, "runtime").val;
      jsRt.setStdout(function(s) {
        runtime.runThunk(function() {
          return fn.app(runtime.makeString(s));
        }, function() {});
      });
      return runtime.nothing;
    }

    var values = {
      "make-runtime": runtime.makeFunction(makeRuntime, "make-runtime"),
      "set-stdout": runtime.makeFunction(setStdout, "set-stdout")
    };
    var types = {
      Runtime: annRuntime
    };
    var internal = {
      makeRuntime: makeRuntime,
      checkRuntime: checkRuntime,
      brandRuntime: brandRuntime
    };
    return runtime.makeModuleReturn(values, types, internal);
  }
})

