#!/usr/bin/env bash
# Type-checked tables test suite (TS compiler only; the table type checker
# lives in src/ts-compiler/src/type-check-tables.ts).
#
#   tests/type-check/tables-good/*.arr  must compile with -type-check AND run
#                                       with all checks passing
#   tests/type-check/tables-bad/*.arr   must fail to compile with a type error
#
# Run from lang/:  bash src/ts-compiler/tests/tables-test.sh
set -u

TS_PYRET="node build/ts-compiler/pyret.js"
OUTDIR="tests/ts-compiled/tables-suite"
mkdir -p "$OUTDIR"

COMMON_ARGS=(--builtin-js-dir src/js/trove/
             --builtin-arr-dir src/arr/trove/
             --require-config src/scripts/standalone-configA.json
             --compiled-dir tests/ts-compiled/
             -type-check)

pass=0
fail=0
failures=()

compile() { # file outfile -> exit status; stdout+stderr to $compile_out
  local f="$1" out="$2"
  compile_out=$($TS_PYRET --build-runnable "$f" --outfile "$out" "${COMMON_ARGS[@]}" 2>&1)
}

for f in tests/type-check/tables-good/*.arr; do
  base=$(basename "$f" .arr)
  out="$OUTDIR/$base.jarr"
  compile "$f" "$out"
  if echo "$compile_out" | grep -q "There were compilation errors\|The run ended in error\|parse error"; then
    fail=$((fail+1)); failures+=("GOOD $f failed to compile:"$'\n'"$(echo "$compile_out" | tail -12)")
    continue
  fi
  run_out=$(node "$out" 2>&1)
  if echo "$run_out" | grep -q "shipshape"; then
    pass=$((pass+1)); echo "ok (good, runs) $f"
  else
    fail=$((fail+1)); failures+=("GOOD $f compiled but tests did not pass:"$'\n'"$(echo "$run_out" | tail -12)")
  fi
done

for f in tests/type-check/tables-bad/*.arr; do
  base=$(basename "$f" .arr)
  out="$OUTDIR/$base.jarr"
  compile "$f" "$out"
  if echo "$compile_out" | grep -q "There were compilation errors"; then
    # must be a *type* error, not a well-formedness/unbound error
    if echo "$compile_out" | grep -q "cannot be type-checked\|type inconsistency\|type checker rejected\|type constraint"; then
      pass=$((pass+1)); echo "ok (bad, rejected) $f"
    else
      fail=$((fail+1)); failures+=("BAD $f errored, but not with a type error:"$'\n'"$(echo "$compile_out" | tail -12)")
    fi
  else
    fail=$((fail+1)); failures+=("BAD $f should have been rejected but compiled")
  fi
done

echo
echo "tables-test: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  printf '%s\n\n' "${failures[@]}"
  exit 1
fi
