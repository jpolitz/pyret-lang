General:

Check npm build against TS
Check VScode filesystem against TS
Thunked $name methods for consistency may not be needed (flatten to fields)
Type synonyms for OptionOf for T | undefined
Inconsistencies between constructor use (e.g. CCPFile uses new, CS.ok uses the function wrapper)
Maybe an optimization - unthunk uri() on Locator
Use a never-argument to mimick "no cases matched" statically (e.g. in if/else translations of cases with if-splitting)
Eliminate exports when possible (it mirrors provide *, but we don't actually need everything)
Search generated code for as-casts to check for bad typing
Search generated code for any-types to check for bad typing


Testing coverage:

`make bootstrap-converge` proves phaseB == phaseB-ts byte-for-byte, but a
successful self-compile renders NO errors, so the whole error/diagnostic-rendering
surface is untested by it. [DONE, merge cleanup: this is now ts-type-check-parity
(174 programs), ts-wf-parity (147 extracted from the in-suite wf tests), and the
err-parse-* parity programs -- all byte-diff diagnostics from both compilers, all
in CI. First runs caught 4 real bugs; see src/ts-compiler/README.md.]

Post-merge testing plan (agreed 2026-08-10, during merge cleanup):

The compiler-tests.arr suite (split out of main2.arr) always exercises the .arr
compiler's logic, whichever compiler builds it. TS-native coverage for those
modules, in priority order -- the ts-repl route (translate the test, drive the
TS implementation via tests/in-process-host.js; repl-test.js is the template,
same-name pairing + header cross-references keep the pair in sync):
  1. test-compile-lib -> compile-lib-test.js (worklist build/order/cycles)
  2. test-modules, test-include (provides / include semantics)
  3. test-file-locators, test-builtin-locator (locator APIs)
  - test-contracts / test-rec: first reclassify -- mostly language tests riding
    compile-str; candidates to return to main2 or become run-parity programs.
  - test-flatness: deprioritized; flatness divergence is codegen divergence,
    already guarded by byte-parity.
NOT extract-and-parity for these (that fits program->diagnostic tests only) and
NOT a load-lib shim (the bridge would absorb the divergences under test).

ts-compiler-test was considered and NOT created: clean-room comparison
(2026-08-10) showed the TS compiler's build of compiler-tests.arr is
byte-identical to phaseA's (sha256-equal 35MB standalones -- a stronger
codegen check than bootstrap-converge, since the worklist spans the 13 test
modules + the whole compiler + builtins). So a TS-built run would re-run the
bytes `make compiler-test` already runs. The modules still get TS-compiled
inside all-ts.jarr (codegen corpus); narrowing uses `make compiler-test`.
CAVEAT (learned the hard way, 2026-08-10): the cmp is only valid with FRESH
dedicated --compiled-dir on both sides and the same worklist. Gensym counters
carry across a compile run instead of resetting per module, so cached module
bytes are a function of the worklist that led to them -- the same compiler
produces different (functionally equivalent) bytes for the same module in
different run shapes. Comparing jarrs assembled from caches with different
histories diffs cache history, not compilers. (Same reason bootstrap-converge
works: both chains compile the same worklist.) Caches stay functionally
interchangeable; they are just not byte-stable across run shapes.

Other post-merge cleanup, same batch:
  - delete lang/Makefile.old (dead since the lang/ move)
  - prune tests/type-check/should/ and should-not/ (dead dirs no harness runs;
    5 of 14 markers have silently come true, 1 is bit-rotted to a parse error --
    graduate the come-true ones into good//bad/, fix or drop the rest)
  - another pass on the ts-test cache setup (see Makefile cache-warm comments)
  - scope test-pprint's tree walk to src/ + tests/ (today the suite's test count
    is a function of build artifacts on disk)
  - jsnums-test runs in no CI job
  - serve-smoke.js is orphaned; --serve ships via npm --backend ts untested
  - browser-side: no CPO spec triggers a parse error (the ffi bridge switch in
    ts-compiler-lib.js is untested); editor-side wf-error coverage is 2 specs


cli-module-loader:

Check if toRepr's else case (JSON.stringify) is reachable in cli-module-loader
[ANSWERED, merge cleanup: it was -- type errors that ED.embed a Type reached it
and printed raw JSON (caught by ts-type-check-parity); a TypeBase branch now
renders via toString(). The JSON fallback remains for anything else.]
Why no _equals on the locators made in getCached in cli-module-loader?
Why is there a new field compiledReadOnlyDirs on the CLIContext? Because we forgot it...
CL.CompiledProgram vs a record type on export function compile
never vs. void return types (handleCompilationErrors/propagateExit)
Why is the type of trace any in onCompile?
LOL "standalone" key in stats. That's correctly copied our bad code