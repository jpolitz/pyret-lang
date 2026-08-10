#!/usr/bin/env bash
# Well-formedness / scope-error parity: compile every inline program from the
# in-suite wf and compile-error tests (extracted at runtime by
# extract-suite-programs.js -- see its header) under BOTH the Pyret-hosted
# compiler (build/phaseA/pyret.jarr) and the TypeScript compiler
# (build/ts-compiler/pyret.js), with default options, and require identical
# exit codes and diagnostics (modulo the "Pyret stack:" trailer).
#
# WHY THIS EXISTS: like the type-check corpus (see type-check-parity.sh), the
# in-suite tests import src/arr/compiler/*, so building them with the TS
# compiler only proves TS codegen of the .arr well-formedness checker. This
# harness runs the same accumulated corpus through well-formed.ts /
# resolve-scope.ts and the TS CLI's error rendering. Compile-only: parity is
# on the compiler's verdict and message bytes, not on runtime behavior (the
# corpus's `cok` success programs are asserted to compile cleanly in both).
#
# Run from the pyret-lang root (lang/):
#   bash src/ts-compiler/tests/wf-parity.sh          (or `make ts-wf-parity`)
#
# Own warm builtin cache dirs (NOT shared with type-check-parity: cache
# entries are keyed by URI+mtime only, not compile options, and that harness
# compiles builtins under -type-check).

set -u
cd "$(dirname "$0")/../../.."   # lang/

NODE="node --max-old-space-size=8192"
PYRET_ARR=build/phaseA/pyret.jarr
PYRET_TS=build/ts-compiler/pyret.js
SOURCES=(tests/pyret/tests/test-well-formed.arr
         tests/pyret/tests/test-compile-errors.arr)
WORK=build/ts-compiler/wf-parity
COMMON_OPTS=(--builtin-js-dir src/js/trove/
             --builtin-arr-dir src/arr/trove/
             --require-config src/scripts/standalone-configA.json
             --deps-file build/phaseA/bundled-node-compile-deps.js
             -no-display-progress)

rm -rf "$WORK/programs" "$WORK/out"
mkdir -p "$WORK/programs" "$WORK/out" "$WORK/compiled-arr" "$WORK/compiled-ts"

# The generated .arr programs must not outlive the run -- even on failure:
# tests/pyret/tests/test-pprint.arr walks the whole lang/ tree at suite
# runtime and adds 3 tests per .arr file it finds, so leftover generated
# programs silently inflate the main suite's test count (build artifacts
# included; see the cache-warm comment in the Makefile for the same issue).
# The manifest and per-program .out/.diff files survive for debugging; to
# reproduce a failing program, re-run this script (extraction is
# deterministic) or find its source at the manifest's file:line.
trap 'rm -f "$WORK/programs"/p*.arr' EXIT

count=$(node src/ts-compiler/tests/extract-suite-programs.js "$WORK/programs" "${SOURCES[@]}")
echo "extracted $count unique programs from ${SOURCES[*]}"

pass=0
fail=0
failed_programs=()

compile_one() {  # $1=compiler $2=cache-dir $3=program $4=outbase -> exit status
  $NODE "$1" "${COMMON_OPTS[@]}" \
        --compiled-dir "$2" \
        --build-runnable "$3" --outfile "$WORK/out/$4.jarr" \
        > "$WORK/out/$4.out" 2>&1
}

run_one() {
  local prog="$1"
  local base
  base=$(basename "$prog" .arr)

  compile_one "$PYRET_ARR" "$WORK/compiled-arr" "$prog" "$base-arr"
  local stat_a=$?
  compile_one "$PYRET_TS" "$WORK/compiled-ts" "$prog" "$base-ts"
  local stat_t=$?

  if [ "$stat_a" -ne "$stat_t" ]; then
    echo "FAIL $base ($(grep "^$base " "$WORK/programs/manifest.txt" | head -1)): exit codes differ (arr=$stat_a ts=$stat_t)"
    echo "  arr tail: $(tail -2 "$WORK/out/$base-arr.out" | head -c 300)"
    echo "  ts  tail: $(tail -2 "$WORK/out/$base-ts.out" | head -c 300)"
    return 1
  fi

  sed -i '/^Pyret stack:/,$d' "$WORK/out/$base-arr.out"
  sed -i '/^Pyret stack:/,$d' "$WORK/out/$base-ts.out"
  if diff -u "$WORK/out/$base-arr.out" "$WORK/out/$base-ts.out" > "$WORK/out/$base.diff"; then
    rm -f "$WORK/out/$base.diff"
    return 0
  else
    echo "FAIL $base ($(grep "^$base " "$WORK/programs/manifest.txt" | head -1)): diagnostics differ (see $WORK/out/$base.diff)"
    return 1
  fi
}

shopt -s nullglob
for prog in "$WORK/programs"/p*.arr; do
  if run_one "$prog"; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    failed_programs+=("$(basename "$prog" .arr)")
  fi
done

echo
echo "wf parity: $pass passed, $fail failed (of $count)"
if [ "$fail" -ne 0 ]; then
  echo "failed: ${failed_programs[*]}"
  echo "(map names to sources via $WORK/programs/manifest.txt)"
  exit 1
fi
