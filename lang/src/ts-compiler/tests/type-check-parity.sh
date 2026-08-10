#!/usr/bin/env bash
# Type-checker parity: compile every program in tests/type-check/
# {good,bad,should,should-not}/ with -type-check under BOTH the Pyret-hosted
# compiler (build/phaseA/pyret.jarr) and the TypeScript compiler
# (build/ts-compiler/pyret.js), and require identical exit codes and
# identical diagnostics (modulo the "Pyret stack:" trailer -- see the
# Deviations section of src/ts-compiler/README.md).
#
# WHY THIS EXISTS: the in-suite type-check tests (tests/type-check/main.arr)
# import src/arr/compiler/* directly, so building THAT suite with the TS
# compiler only proves the TS compiler can compile the .arr type checker --
# it never executes type-check.ts. This harness runs the same 174-program
# corpus through type-check.ts itself, transferring the corpus's established
# expectations to the port. Compile-only: runtime behavior of the good
# programs is the main suite's job.
#
# Run from the pyret-lang root (lang/):
#   bash src/ts-compiler/tests/type-check-parity.sh          (or `make ts-type-check-parity`)
#
# Both compilers share one warm builtin cache dir apiece (per-program dirs
# would recompile every builtin 174 times). All programs here use the same
# compile options, so sharing is safe; program cache entries are keyed by
# URI and checked against source mtime.

set -u
cd "$(dirname "$0")/../../.."   # lang/

NODE="node --max-old-space-size=8192"
PYRET_ARR=build/phaseA/pyret.jarr
PYRET_TS=build/ts-compiler/pyret.js
# good/ and bad/ are the live corpus (what tests/type-check/main.arr runs).
# should/ and should-not/ are aspirational known-gap markers that NO harness
# executes -- included here deliberately: parity only asserts the two
# compilers AGREE on today's behavior, and these files are exactly where
# behavior will change if the type checker improves, which is when a
# both-compilers-must-move-together tripwire earns its keep. (One,
# should-not/methods-contested-extension.arr, is bit-rotted to a parse
# error -- old object-literal method shorthand; both compilers must still
# reject it identically.)
CORPUS=(tests/type-check/good tests/type-check/bad
        tests/type-check/should tests/type-check/should-not)
WORK=build/ts-compiler/type-check-parity
COMMON_OPTS=(--builtin-js-dir src/js/trove/
             --builtin-arr-dir src/arr/trove/
             --require-config src/scripts/standalone-configA.json
             --deps-file build/phaseA/bundled-node-compile-deps.js
             -no-display-progress
             -type-check)

mkdir -p "$WORK/out" "$WORK/compiled-arr" "$WORK/compiled-ts"
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
  # dir-qualified base so good/x.arr and bad/x.arr don't collide
  local base
  base=$(echo "$prog" | sed 's|tests/type-check/||; s|/|--|g; s|\.arr$||')

  compile_one "$PYRET_ARR" "$WORK/compiled-arr" "$prog" "$base-arr"
  local stat_a=$?
  compile_one "$PYRET_TS" "$WORK/compiled-ts" "$prog" "$base-ts"
  local stat_t=$?

  if [ "$stat_a" -ne "$stat_t" ]; then
    echo "FAIL $base: exit codes differ (arr=$stat_a ts=$stat_t)"
    echo "  arr tail: $(tail -2 "$WORK/out/$base-arr.out" | head -c 300)"
    echo "  ts  tail: $(tail -2 "$WORK/out/$base-ts.out" | head -c 300)"
    return 1
  fi

  # The Pyret-hosted compiler appends a "Pyret stack:" trailer pointing into
  # its own compiler sources on error exits; compiler-internal, stripped.
  sed -i '/^Pyret stack:/,$d' "$WORK/out/$base-arr.out"
  sed -i '/^Pyret stack:/,$d' "$WORK/out/$base-ts.out"

  # Existential-variable labels (?-N) are numbered by solve-loop iteration
  # order, which differs between the compilers (Pyret list-set vs TS Map) and
  # was deliberately left divergent -- see the "Solve-loop iteration order"
  # entry in port-review-nonmechanical.md: gensym order in messages only,
  # nothing type-checks differently. Canonicalize by order of first
  # appearance in each output; this still fails if the two outputs use
  # DIFFERENT equality patterns among their labels (e.g. `?-1 ... ?-1` in one
  # vs `?-1 ... ?-2` in the other), so real unification differences surface.
  perl -i -pe 's/\?-(\d+)/"?-" . ($seen{$1} \/\/= ++$n)/ge' "$WORK/out/$base-arr.out"
  perl -i -pe 's/\?-(\d+)/"?-" . ($seen{$1} \/\/= ++$n)/ge' "$WORK/out/$base-ts.out"
  if diff -u "$WORK/out/$base-arr.out" "$WORK/out/$base-ts.out" > "$WORK/out/$base.diff"; then
    rm -f "$WORK/out/$base.diff"
    return 0
  else
    echo "FAIL $base: diagnostics differ (see $WORK/out/$base.diff)"
    return 1
  fi
}

shopt -s nullglob
programs=()
for d in "${CORPUS[@]}"; do programs+=("$d"/*.arr); done
if [ "${#programs[@]}" -eq 0 ]; then
  echo "No corpus programs found under tests/type-check/"
  exit 1
fi

for prog in "${programs[@]}"; do
  if run_one "$prog"; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    failed_programs+=("$prog")
  fi
done

echo
echo "type-check parity: $pass passed, $fail failed (of ${#programs[@]})"
if [ "$fail" -ne 0 ]; then
  echo "failed:"
  printf '  %s\n' "${failed_programs[@]}"
  exit 1
fi
