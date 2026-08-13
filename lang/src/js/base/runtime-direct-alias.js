// In direct-mode standalones, the AMD name "pyret-base/js/runtime" (which
// make-standalone unconditionally adds to the program's dependencies)
// resolves to the direct runtime.
define("pyret-base/js/runtime", ["pyret-base/js/runtime-direct"], function(rd) {
  return rd;
});
