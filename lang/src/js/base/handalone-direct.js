// Boot file for direct-mode standalones (analogue of handalone.js).
// Links all modules synchronously on the direct runtime, runs main,
// renders check results, and maps errors to the same exit codes.
if(typeof window === 'undefined') {
  var window = this;
}
requirejs(["pyret-base/js/runtime-direct", "pyret-base/js/post-load-hooks", "program"], function(runtimeLib, loadHooksLib, program) {

  var staticModules = program.staticModules;
  var depMap = program.depMap;
  var toLoad = program.toLoad;
  var realm = { instantiated: {}, static: {} };
  var util = require('util');

  var main = toLoad[toLoad.length - 1];

  var runtime = runtimeLib.makeRuntime({
    stdout: function(s) { process.stdout.write(s); },
    stderr: function(s) { process.stderr.write(s); },
    stdin: process.stdin,
    requireNative: function(name) {
      // Native requires are resolved through the AMD loader (raw-js entries
      // in the config), falling back to node's require.
      var res;
      requirejs([name], function(m) { res = m; });
      return res;
    },
    evalModule: function(str) {
      return eval("(" + str + ")");
    }
  });

  var EXIT_SUCCESS = 0;
  var EXIT_ERROR = 1;
  var EXIT_ERROR_RENDERING_ERROR = 2;
  var EXIT_ERROR_DISPLAYING_ERROR = 3;
  var EXIT_ERROR_CHECK_FAILURES = 4;
  var EXIT_ERROR_JS = 5;
  var EXIT_ERROR_UNKNOWN = 6;

  runtime.setParam("command-line-arguments", process.argv.slice(1));

  function checkFlag(name) {
    return program.runtimeOptions && program.runtimeOptions[name];
  }

  function renderChecksAndExit(answer) {
    var checks = checkFlag("checks");
    if (checks && checks === "none") { process.exit(EXIT_SUCCESS); }
    var checkerLib = runtime.modules["builtin://checker"];
    if (!checkerLib) { process.exit(EXIT_SUCCESS); }
    var checker = checkerLib["provide-plus-types"]["values"];
    var getStack = function(err) { return runtime.ffi.makeList([]); };
    var toCall = runtime.getField(checker, "render-check-results-stack");
    var checkResults = runtime.getField(answer, "checks");
    var summary = toCall(checkResults, getStack, checkFlag("checksFormat") || "text");
    if (runtime.isObject(summary)) {
      var errs = runtime.getField(summary, "errored");
      var failed = runtime.getField(summary, "failed");
      var exitCode = (errs !== 0 || failed !== 0) ? EXIT_ERROR_CHECK_FAILURES : EXIT_SUCCESS;
      process.stdout.write(util.format(runtime.getField(summary, "message")));
      process.stdout.write("\n", function() { process.exit(exitCode); });
    } else {
      process.exit(EXIT_SUCCESS);
    }
  }

  function isExitValue(v) {
    return runtime.isDataValue(v) && (v.$name === "exit" || v.$name === "exit-quiet");
  }

  function renderErrorAndExit(e) {
    var errVal = e.val;
    process.stderr.write("The run ended in error:\n");
    try {
      var rendererrorMod = runtime.modules["builtin://render-error-display"];
      var reason;
      if (runtime.isObject(errVal) && runtime.hasField(errVal, "render-reason")) {
        reason = runtime.getField(errVal, "render-reason")();
      } else if (rendererrorMod) {
        reason = null;
      }
      if (reason && rendererrorMod) {
        var displayToString = rendererrorMod["provide-plus-types"]["values"]["display-to-string"];
        var cliRender = function(val) { return runtime.torepr(val); };
        var str = displayToString(reason, cliRender, runtime.ffi.makeList([]));
        process.stderr.write(util.format(str));
        process.stderr.write("\n", function() { process.exit(EXIT_ERROR); });
        return;
      }
    } catch(renderE) {
      process.stderr.write("While rendering the error, another error occurred:\n" +
        util.format(renderE && renderE.stack ? renderE.stack : renderE) + "\n");
    }
    try {
      process.stderr.write(runtime.tostring(errVal));
    } catch(strE) {
      process.stderr.write(String(errVal));
    }
    if (process.env.DIRECT_DEBUG) {
      process.stderr.write("\nJS stack:\n" + String(e.stack) + "\n");
    }
    process.stderr.write("\n", function() { process.exit(EXIT_ERROR); });
  }

  var postLoadHooks = loadHooksLib.makeDefaultPostLoadHooks(runtime, {
    main: main,
    checks: checkFlag("checks"),
    checksFormat: checkFlag("checksFormat")
  });
  delete postLoadHooks[main]; // check rendering handled below, synchronously

  try {
    runtime.runStandalone(staticModules, realm, depMap, toLoad, postLoadHooks);
    renderChecksAndExit(runtime.modules[main]);
  } catch(e) {
    if (runtime.isPyretException(e)) {
      if (isExitValue(e.val)) {
        var exitCode = runtime.jsnums.toFixnum(runtime.getField(e.val, "code"), runtime.NumberErrbacks);
        if (e.val.$name === "exit") {
          process.stdout.write("Exited with code " + String(exitCode) + "\n");
        }
        process.stdout.write("", function() { process.exit(exitCode); });
      } else {
        renderErrorAndExit(e);
      }
    } else {
      process.stderr.write("Abstraction breaking: Uncaught JavaScript error:\n" + util.format(e));
      process.stderr.write("Stack trace:\n" + util.format(e && e.stack) + "\n",
        function() { process.exit(EXIT_ERROR_JS); });
    }
  }
});
