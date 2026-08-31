#!/bin/bash
# The pause-schedule correspondence oracle: build every test program with
# the js and vm backends under the same baked-in schedule dispatcher, run
# both under each schedule profile with PYRET_PAUSE_TRACE, and require
# byte-identical stdout, exit codes, AND trace files (same stacks at the
# same pauses; diff is the comparator -- no normalization).
set -u
cd "$(dirname "$0")/../../.."

NODE=${NODE:-node}
PYRET=build/ts-compiler/pyret.js
WORK=build/ts-compiler/vm-pause-oracle
mkdir -p "$WORK"

PROFILES=${PROFILES:-"rand-small rand-wide const-small const-medium sawtooth alternate"}

# One schedule file embedding every profile, selected at run time by
# PS_PROFILE: lets each program build once per backend instead of once
# per (backend x profile).
MULTI="$WORK/multi-sched.js"
{
  echo "var profiles = {};"
  for f in tests/pause-schedules/*.js; do
    name=$(basename "$f" .js)
    echo "(function() { var module = { exports: {} };"
    cat "$f"
    echo "profiles[\"$name\"] = module.exports; })();"
  done
  echo "module.exports = profiles[(typeof process !== 'undefined' && process.env.PS_PROFILE) || 'rand-small'];"
} > "$MULTI"

COMMON_OPTS=(--builtin-js-dir src/js/trove/
             --builtin-arr-dir src/arr/trove/
             --pause-schedule "$MULTI")

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
    # The oracle bakes its own schedule; drop any --pause-schedule pair.
    local skip_next=0
    while IFS= read -r line; do
      for w in $line; do
        if [ "$skip_next" = 1 ]; then skip_next=0; continue; fi
        if [ "$w" = "--pause-schedule" ]; then skip_next=1; continue; fi
        extra_opts+=("$w")
      done
    done < "$opts_file"
  fi

  local dir_j="$WORK/$base-js" dir_i="$WORK/$base-vm"
  mkdir -p "$dir_j" "$dir_i"

  $NODE $PYRET "${COMMON_OPTS[@]}" ${extra_opts[@]+"${extra_opts[@]}"} \
        --backend js \
        --require-config src/scripts/standalone-configA.json \
        --compiled-dir "$dir_j/compiled" \
        --build-runnable "$prog" --outfile "$dir_j/$base.jarr" \
        > "$dir_j/compile.out" 2>&1
  local cstat_j=$?
  $NODE $PYRET "${COMMON_OPTS[@]}" ${extra_opts[@]+"${extra_opts[@]}"} \
        --backend vm \
        --require-config src/scripts/standalone-config-vm.json \
        --compiled-dir "$dir_i/compiled" \
        --build-runnable "$prog" --outfile "$dir_i/$base.jarr" \
        > "$dir_i/compile.out" 2>&1
  local cstat_i=$?
  if [ "$cstat_j" -ne 0 ] || [ "$cstat_i" -ne 0 ]; then
    echo "FAIL $base: compile failed (js=$cstat_j vm=$cstat_i)"
    return 1
  fi

  local prof
  for prof in $PROFILES; do
    PS_PROFILE=$prof PYRET_PAUSE_TRACE="$dir_j/$prof.trace" \
      $NODE "$dir_j/$base.jarr" > "$dir_j/$prof.out" 2> "$dir_j/$prof.err"
    local rj=$?
    PS_PROFILE=$prof PYRET_PAUSE_TRACE="$dir_i/$prof.trace" \
      $NODE "$dir_i/$base.jarr" > "$dir_i/$prof.out" 2> "$dir_i/$prof.err"
    local ri=$?
    if [ "$rj" -ne "$ri" ]; then
      echo "FAIL $base/$prof: exit codes differ (js=$rj vm=$ri)"
      return 1
    fi
    if ! cmp -s "$dir_j/$prof.out" "$dir_i/$prof.out"; then
      echo "FAIL $base/$prof: stdout differs"
      return 1
    fi
    if ! cmp -s "$dir_j/$prof.trace" "$dir_i/$prof.trace"; then
      echo "FAIL $base/$prof: pause traces differ:"
      diff "$dir_j/$prof.trace" "$dir_i/$prof.trace" | head -6 | sed 's/^/    /'
      return 1
    fi
  done
  local npauses
  npauses=$(tail -1 "$dir_i/${prof}.trace" 2>/dev/null | sed 's/T //')
  echo "ok   $base  ($npauses on ${prof})"
  return 0
}

progs=()
for p in src/ts-compiler/tests/programs/*.arr src/ts-compiler/tests/vm-programs/*.arr; do
  case "$(basename "$p")" in
    err-*) continue;;
  esac
  progs+=("$p")
done

for p in "${progs[@]}"; do
  if run_one "$p"; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    failed_programs+=("$(basename "$p")")
  fi
done

echo
echo "vm pause oracle: $pass passed, $fail failed"
if [ "$fail" -gt 0 ]; then
  echo "failed: ${failed_programs[*]}"
  exit 1
fi
