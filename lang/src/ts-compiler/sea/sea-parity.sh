#!/usr/bin/env bash
# SEA parity: compile (and run) each test program with BOTH the node build
# (build/ts-compiler/pyret.js) and the single-executable build
# (build/ts-compiler/pyret-sea), using identical options and fresh caches,
# then compare:
#   - compile exit code
#   - compiled .jarr, byte-for-byte
#   - compile stdout/stderr
#   - run exit code + run stdout/stderr (for programs that compiled)
#
# This is the acceptance test for "byte-exact output compared to the build
# that ts-compiler already provides." Run from lang/.

set -u
cd "$(dirname "$0")/../../.."   # lang/

NODE="node --max-old-space-size=8192"
PYRET_NODE="$NODE build/ts-compiler/pyret.js"
PYRET_SEA="build/ts-compiler/pyret-sea"
PROGRAMS_DIR=src/ts-compiler/tests/programs
WORK=build/ts-compiler/sea-parity
COMMON_OPTS=(--builtin-js-dir src/js/trove/
             --builtin-arr-dir src/arr/trove/
             --require-config src/scripts/standalone-configA.json
             --deps-file build/phaseA/bundled-node-compile-deps.js
             -no-display-progress)

rm -rf "$WORK"; mkdir -p "$WORK"
pass=0; fail=0; failed_programs=()

run_one() {
  local prog="$1"
  local base; base=$(basename "$prog" .arr)
  local extra_opts=()
  if [ -f "$PROGRAMS_DIR/$base.options" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && extra_opts+=($line)
    done < "$PROGRAMS_DIR/$base.options"
  fi

  local dir_n="$WORK/$base-node" dir_s="$WORK/$base-sea"
  mkdir -p "$dir_n" "$dir_s"

  $PYRET_NODE "${COMMON_OPTS[@]}" ${extra_opts[@]+"${extra_opts[@]}"} \
        --compiled-dir "$dir_n/compiled" \
        --build-runnable "$prog" --outfile "$dir_n/$base.jarr" \
        > "$dir_n/compile.out" 2>&1
  local cstat_n=$?
  $PYRET_SEA "${COMMON_OPTS[@]}" ${extra_opts[@]+"${extra_opts[@]}"} \
        --compiled-dir "$dir_s/compiled" \
        --build-runnable "$prog" --outfile "$dir_s/$base.jarr" \
        > "$dir_s/compile.out" 2>&1
  local cstat_s=$?

  if [ "$cstat_n" -ne "$cstat_s" ]; then
    echo "FAIL $base: compile exit codes differ (node=$cstat_n sea=$cstat_s)"
    echo "  sea compile tail: $(tail -3 "$dir_s/compile.out" | head -c 400)"
    return 1
  fi

  # Compile stdout/stderr must match byte-for-byte.
  if ! diff -u "$dir_n/compile.out" "$dir_s/compile.out" > "$WORK/$base.compile.diff"; then
    echo "FAIL $base: compile output differs (see $WORK/$base.compile.diff)"
    return 1
  fi

  # Compile-error case: no .jarr produced; the matching stdout above is enough.
  if [ "$cstat_n" -ne 0 ]; then
    return 0
  fi

  # The compiled standalone must be byte-identical.
  if ! cmp -s "$dir_n/$base.jarr" "$dir_s/$base.jarr"; then
    echo "FAIL $base: compiled .jarr differs ($(cmp "$dir_n/$base.jarr" "$dir_s/$base.jarr" 2>&1))"
    return 1
  fi

  # And running them must match (exit + output). Byte-identical jarrs
  # guarantee this, but we run to be thorough.
  $NODE "$dir_n/$base.jarr" > "$dir_n/run.out" 2>&1; local rstat_n=$?
  $NODE "$dir_s/$base.jarr" > "$dir_s/run.out" 2>&1; local rstat_s=$?
  if [ "$rstat_n" -ne "$rstat_s" ]; then
    echo "FAIL $base: run exit codes differ (node=$rstat_n sea=$rstat_s)"
    return 1
  fi
  if ! diff -u "$dir_n/run.out" "$dir_s/run.out" > "$WORK/$base.run.diff"; then
    echo "FAIL $base: run output differs (see $WORK/$base.run.diff)"
    return 1
  fi
  return 0
}

shopt -s nullglob
programs=("$PROGRAMS_DIR"/*.arr)
for prog in "${programs[@]}"; do
  if run_one "$prog"; then
    echo "ok   $(basename "$prog") (jarr byte-identical)"
    pass=$((pass+1))
  else
    fail=$((fail+1)); failed_programs+=("$(basename "$prog")")
  fi
done

echo
echo "sea-parity: $pass passed, $fail failed"
if [ "$fail" -ne 0 ]; then
  echo "failed: ${failed_programs[*]}"; exit 1
fi
