({
  requires: [
    { "import-type": "builtin", name: "checker" }
  ],
  // The *real* post-load-hooks module -- the same code load-lib.js:345 loads.
  // Its "builtin://checker" hook contains the unguarded call under test.
  nativeRequires: ["pyret-base/js/post-load-hooks"],
  provides: {
    values: {
      "checker-hook-stores-continuation-under-low-gas": "tany"
    }
  },
  theModule: function(runtime, namespace, uri, checkerVals, loadHooksLib) {
    // load-lib.js:340 and post-load-hooks.js:140 both do, with no run-loop /
    // safeCall wrapper around the .app():
    //
    //   var currentChecker = getField(checker, "make-check-context")
    //                          .app(makeString(main), checks);
    //   setParam("current-checker", currentChecker);
    //
    // make-check-context is a compiled Pyret function, so its body checks GAS
    // on entry (runtime.js safeCall): if GAS is already spent, .app() returns
    // a *continuation object* instead of the check-context, expecting an
    // enclosing trampoline to catch and retry it. Because these call sites
    // have no such wrapper, the continuation escapes and gets stored in the
    // "current-checker" param -- and the run detonates later when something
    // pulls "current-checker" back out expecting a check-context.
    //
    // This probe drives the real post-load-hooks checker hook with GAS forced
    // to 1 (make-check-context is entered with no GAS left) and reports whether
    // a continuation ended up stored in "current-checker". It should be `false`
    // (i.e. a real check-context was stored). It is `true` while the call sites
    // remain unguarded. State is saved and restored so the surrounding check
    // harness -- which relies on the live "current-checker" param -- is not
    // corrupted by the probe.
    function probeCheckerHookUnderLowGas() {
      // A required builtin is handed to us as its provide-plus-types object,
      // but the post-load-hooks checker hook expects the raw module and digs
      // out .provide-plus-types itself, so wrap it back up the way the module
      // system would have handed it to the hook.
      var rawCheckerModule = runtime.makeObject({
        "provide-plus-types": checkerVals
      });
      var hooks = loadHooksLib.makeDefaultPostLoadHooks(runtime, {
        main: "unguarded-checker-app-continuation-regression",
        checks: "all"
      });

      var savedChecker = runtime.getParam("current-checker");
      var savedGas = runtime.GAS;
      try {
        runtime.GAS = 1;
        // The real post-load-hooks.js:140 code path runs here.
        hooks["builtin://checker"](rawCheckerModule);
        var stored = runtime.getParam("current-checker");
        return runtime.makeBoolean(runtime.isContinuation(stored));
      } finally {
        runtime.GAS = savedGas;
        runtime.setParam("current-checker", savedChecker);
      }
    }

    return runtime.makeModuleReturn({
      "checker-hook-stores-continuation-under-low-gas":
        runtime.makeFunction(probeCheckerHookUnderLowGas,
                             "checker-hook-stores-continuation-under-low-gas")
    }, {});
  }
})
