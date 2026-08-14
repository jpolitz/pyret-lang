#!/usr/bin/env bash
# Back-end parity: build each program in tests/programs/ twice with the
# SAME compiler front end -- once with `--backend js` (the code generator)
# and once with `--backend interp` (bytecode for the Pyret VM) -- run both
# standalones, and require identical stdout/stderr and exit codes.
#
# This is the interpreter's direct behavioral coverage. Because both runs
# share parsing, well-formedness, scope resolution, desugaring, ANF and
# the type checker, any difference is a difference in the back end or the
# machine: value representation, evaluation order, arity/annotation
# checking, check-block results, error rendering, exit codes.
#
# Run from lang/: bash src/ts-compiler/tests/interp-parity.sh

set -u
cd "$(dirname "$0")/../../.."   # lang/

NODE="node --max-old-space-size=8192"
PYRET=build/ts-compiler/pyret.js
PROGRAMS_DIR=src/ts-compiler/tests/programs
# Programs written for this test specifically; see that directory's README.
INTERP_PROGRAMS_DIR=src/ts-compiler/tests/interp-programs
WORK=build/ts-compiler/interp-parity
COMMON_OPTS=(--builtin-js-dir src/js/trove/
             --builtin-arr-dir src/arr/trove/
             --deps-file build/phaseA/bundled-node-compile-deps.js
             -no-display-progress)

mkdir -p "$WORK"
pass=0
fail=0
failed_programs=()

run_one() {
  local prog="$1"
  local base
  base=$(basename "$prog" .arr)
  local extra_opts=()
  local opts_file="$(dirname "$prog")/$base.options"
  if [ -f "$opts_file" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && extra_opts+=($line)
    done < "$opts_file"
  fi

  local dir_j="$WORK/$base-js" dir_i="$WORK/$base-interp"
  mkdir -p "$dir_j" "$dir_i"

  $NODE $PYRET "${COMMON_OPTS[@]}" ${extra_opts[@]+"${extra_opts[@]}"} \
        --backend js \
        --require-config src/scripts/standalone-configA.json \
        --compiled-dir "$dir_j/compiled" \
        --build-runnable "$prog" --outfile "$dir_j/$base.jarr" \
        > "$dir_j/compile.out" 2>&1
  local cstat_j=$?
  $NODE $PYRET "${COMMON_OPTS[@]}" ${extra_opts[@]+"${extra_opts[@]}"} \
        --backend interp \
        --require-config src/scripts/standalone-config-interp.json \
        --compiled-dir "$dir_i/compiled" \
        --build-runnable "$prog" --outfile "$dir_i/$base.jarr" \
        > "$dir_i/compile.out" 2>&1
  local cstat_i=$?

  if [ "$cstat_j" -ne "$cstat_i" ]; then
    echo "FAIL $base: compile exit codes differ (js=$cstat_j interp=$cstat_i)"
    return 1
  fi

  # Compile errors come from the shared front end, so they must match
  # exactly (there is no "Pyret stack:" trailer on either side here --
  # both runs are the same non-Pyret-hosted compiler).
  #
  # But a program that fails to compile only ever compares two error
  # messages: it never RUNS, so it exercises no back end at all. That is
  # fine for the err-*.arr programs, which exist to pin error rendering,
  # and is a broken test for anything else -- so only err-* may take this
  # path. (Three programs in this directory sat here silently, "passing"
  # on matching compile errors, until this check was added.)
  if [ "$cstat_j" -ne 0 ]; then
    case "$base" in
      err-*) ;;
      *)
        echo "FAIL $base: does not compile, so it never reaches a back end:"
        sed -n '1,3p' "$dir_i/compile.out" | sed 's/^/       /'
        return 1
        ;;
    esac
    if diff -u "$dir_j/compile.out" "$dir_i/compile.out" > "$WORK/$base.compile.diff"; then
      return 0
    else
      echo "FAIL $base: compile error output differs (see $WORK/$base.compile.diff)"
      return 1
    fi
  fi

  $NODE "$dir_j/$base.jarr" > "$dir_j/run.out" 2>&1
  local rstat_j=$?
  $NODE "$dir_i/$base.jarr" > "$dir_i/run.out" 2>&1
  local rstat_i=$?

  if [ "$rstat_j" -ne "$rstat_i" ]; then
    echo "FAIL $base: run exit codes differ (js=$rstat_j interp=$rstat_i)"
    return 1
  fi
  if ! diff -u "$dir_j/run.out" "$dir_i/run.out" > "$WORK/$base.run.diff"; then
    echo "FAIL $base: run output differs (see $WORK/$base.run.diff)"
    return 1
  fi
  return 0
}

shopt -s nullglob
programs=("$PROGRAMS_DIR"/*.arr "$INTERP_PROGRAMS_DIR"/*.arr)
if [ "${#programs[@]}" -eq 0 ]; then
  echo "No test programs found in $PROGRAMS_DIR or $INTERP_PROGRAMS_DIR"
  exit 1
fi

for prog in "${programs[@]}"; do
  if run_one "$prog"; then
    case "$(basename "$prog")" in
      err-*) echo "ok   $(basename "$prog")  (compile-error program)" ;;
      *)     echo "ok   $(basename "$prog")" ;;
    esac
    pass=$((pass+1))
  else
    fail=$((fail+1))
    failed_programs+=("$(basename "$prog")")
  fi
done

echo
echo "interp parity: $pass passed, $fail failed"
if [ "$fail" -ne 0 ]; then
  echo "failed: ${failed_programs[*]}"
  exit 1
fi
