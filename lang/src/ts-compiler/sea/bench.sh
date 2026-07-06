#!/usr/bin/env bash
# Benchmark the single-executable compiler (build/ts-compiler/pyret-sea)
# against the node build (node build/ts-compiler/pyret.js).
#
# Two workloads:
#   startup  - a trivial invocation (bad option -> usage), isolating process
#              startup + module-load overhead with ~no compile work
#   warm     - recompiling a small program against an already-warm cache,
#              i.e. startup overhead + a small fixed amount of real work
#
# Run from lang/. Reports min/mean over N runs (default 10).
set -u
cd "$(dirname "$0")/../../.."   # lang/

N="${1:-10}"
SEA=build/ts-compiler/pyret-sea
NODE_TS="node build/ts-compiler/pyret.js"
NODE_TS_NR="env PYRET_TS_NO_RESPAWN=1 node build/ts-compiler/pyret.js"
BUN_TS="env PYRET_TS_NO_RESPAWN=1 bun build/ts-compiler/pyret.js"

WORK=build/ts-compiler/bench
rm -rf "$WORK"; mkdir -p "$WORK"
cat > "$WORK/hello.arr" <<'EOF'
import global as G
fun fact(n): if n == 0: 1 else: n * fact(n - 1) end end
print("fact 5 = " + num-to-string(fact(5)) + "\n")
check "math": 2 + 2 is 4 end
EOF

# Elapsed seconds via the bash `time` keyword — a shell builtin (low overhead,
# and portable to macOS's default bash 3.2, unlike `date +%N` or GNU `time -v`).
timeit() { # $@ = command; prints elapsed wall seconds
  local t
  { t=$( { TIMEFORMAT='%R'; time "$@" >/dev/null 2>&1; } 2>&1 ); } 2>/dev/null
  echo "$t"
}

bench() { # $1 label ; rest = command
  local label="$1"; shift
  local min=99999 sum=0 t
  for i in $(seq 1 "$N"); do
    t=$(timeit "$@")
    sum=$(awk -v a="$sum" -v b="$t" 'BEGIN{printf "%.4f", a+b}')
    min=$(awk -v a="$min" -v b="$t" 'BEGIN{print (b<a)?b:a}')
  done
  awk -v l="$label" -v s="$sum" -v n="$N" -v m="$min" \
    'BEGIN{printf "%-28s  mean=%6.3fs  min=%6.3fs  (n=%d)\n", l, s/n, m, n}'
}

warm_opts=(--builtin-js-dir src/js/trove/ --builtin-arr-dir src/arr/trove/
           --require-config src/scripts/standalone-configA.json
           --deps-file build/ts-compiler/bundled-node-compile-deps.js
           --compiled-dir "$WORK/cache" -no-check-mode -no-display-progress)

# Pre-warm the compile cache once (shared, read-only reuse afterwards).
$SEA "${warm_opts[@]}" --build-runnable "$WORK/hello.arr" --outfile "$WORK/warm.jarr" >/dev/null 2>&1

echo "### Startup (trivial invocation: unknown option -> usage) — N=$N"
bench "node-TS (default respawn)"  $NODE_TS  --bogus
bench "node-TS (no respawn)"       $NODE_TS_NR --bogus
bench "bun on pyret.js"            $BUN_TS   --bogus
bench "SEA (pyret-sea)"            $SEA      --bogus

echo
echo "### Warm-cache compile of small program — N=$N"
bench "node-TS (default respawn)"  $NODE_TS    "${warm_opts[@]}" --build-runnable "$WORK/hello.arr" --outfile "$WORK/n.jarr"
bench "node-TS (no respawn)"       $NODE_TS_NR "${warm_opts[@]}" --build-runnable "$WORK/hello.arr" --outfile "$WORK/nr.jarr"
bench "SEA (pyret-sea)"            $SEA        "${warm_opts[@]}" --build-runnable "$WORK/hello.arr" --outfile "$WORK/s.jarr"

echo
echo "byte-check: SEA warm output == node-TS warm output:"
cmp "$WORK/s.jarr" "$WORK/n.jarr" && echo "  IDENTICAL"
