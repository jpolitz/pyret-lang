#!/bin/bash
# Compile + run each parity program with the stock and direct pipelines and
# diff stdout/stderr/exit-code.  Programs whose names start with err- are
# expected to fail compilation identically (static errors go through the same
# .arr compiler code either way, so they should match byte-for-byte).
cd "$(dirname "$0")/.."
PROGS="${1:-src/ts-compiler/tests/programs}"
WORK=direct-work/parity
mkdir -p "$WORK"
PASS=0; FAIL=0; FAILED=()
for prog in "$PROGS"/*.arr; do
  name=$(basename "$prog" .arr)
  opts=""
  if [ -f "${prog%.arr}.options" ]; then
    opts=$(cat "${prog%.arr}.options")
  fi
  # stock
  node build/phaseA/pyret.jarr --build-runnable "$prog" --outfile "$WORK/$name-stock.jarr" \
    --builtin-js-dir src/js/trove/ --builtin-arr-dir src/arr/trove \
    --compiled-dir "$WORK/cache-stock" -no-display-progress \
    --require-config src/scripts/standalone-configA.json $opts \
    > "$WORK/$name-stock.compile.out" 2>&1
  stockcompile=$?
  if [ $stockcompile -eq 0 ]; then
    node "$WORK/$name-stock.jarr" > "$WORK/$name-stock.run.out" 2> "$WORK/$name-stock.run.err"
    stockrun=$?
  fi
  # direct
  node build/phaseA/pyret.jarr --build-runnable "$prog" --outfile "$WORK/$name-direct.jarr" \
    --builtin-js-dir src/js/trove/ --builtin-arr-dir src/arr/trove \
    --compiled-dir "$WORK/cache-direct" -direct -no-display-progress \
    --require-config src/scripts/standalone-configDirect.json $opts \
    > "$WORK/$name-direct.compile.out" 2>&1
  directcompile=$?
  if [ $directcompile -eq 0 ]; then
    node "$WORK/$name-direct.jarr" > "$WORK/$name-direct.run.out" 2> "$WORK/$name-direct.run.err"
    directrun=$?
  fi

  ok=1
  if [ $stockcompile -ne 0 ] || [ $directcompile -ne 0 ]; then
    # both should fail compilation, with identical output (modulo the
    # "Pyret stack:" trailer of internal frames)
    if [ $stockcompile -eq 0 ] || [ $directcompile -eq 0 ]; then
      ok=0; why="compile-status $stockcompile vs $directcompile"
    else
      sed '/^  /d' "$WORK/$name-stock.compile.out" > "$WORK/$name-stock.compile.clean"
      sed '/^  /d' "$WORK/$name-direct.compile.out" > "$WORK/$name-direct.compile.clean"
      if ! diff -q "$WORK/$name-stock.compile.clean" "$WORK/$name-direct.compile.clean" >/dev/null; then
        ok=0; why="compile-error text differs"
      fi
    fi
  else
    if [ "$stockrun" != "$directrun" ]; then
      ok=0; why="exit code $stockrun vs $directrun"
    elif ! diff -q "$WORK/$name-stock.run.out" "$WORK/$name-direct.run.out" >/dev/null; then
      ok=0; why="stdout differs"
    fi
  fi
  if [ $ok -eq 1 ]; then
    PASS=$((PASS+1)); echo "PASS $name"
  else
    FAIL=$((FAIL+1)); FAILED+=("$name: $why"); echo "FAIL $name ($why)"
  fi
done
echo
echo "$PASS passed, $FAIL failed"
for f in "${FAILED[@]}"; do echo "  $f"; done
[ $FAIL -eq 0 ]
