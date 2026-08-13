#!/bin/bash
# parity-one.sh <file.arr> — compile+run under stock and direct, diff.
cd "$(dirname "$0")/.."
prog="$1"
name=$(basename "$prog" .arr)
WORK=direct-work/parity
mkdir -p "$WORK"
node build/phaseA/pyret.jarr --build-runnable "$prog" --outfile "$WORK/$name-stock.jarr" \
  --builtin-js-dir src/js/trove/ --builtin-arr-dir src/arr/trove \
  --compiled-dir "$WORK/cache-stock" -no-display-progress \
  --require-config src/scripts/standalone-configA.json \
  > "$WORK/$name-stock.compile.out" 2>&1
sc=$?
node build/phaseA/pyret.jarr --build-runnable "$prog" --outfile "$WORK/$name-direct.jarr" \
  --builtin-js-dir src/js/trove/ --builtin-arr-dir src/arr/trove \
  --compiled-dir "$WORK/cache-direct" -direct -no-display-progress \
  --require-config src/scripts/standalone-configDirect.json \
  > "$WORK/$name-direct.compile.out" 2>&1
dc=$?
if [ $sc -ne 0 ] || [ $dc -ne 0 ]; then echo "COMPILE $name: stock=$sc direct=$dc"; exit 2; fi
node "$WORK/$name-stock.jarr" > "$WORK/$name-stock.run.out" 2> "$WORK/$name-stock.run.err"; sr=$?
node --stack-size=8192 "$WORK/$name-direct.jarr" > "$WORK/$name-direct.run.out" 2> "$WORK/$name-direct.run.err"; dr=$?
if [ "$sr" != "$dr" ]; then echo "FAIL $name: exit $sr vs $dr"; exit 1; fi
if ! diff -q "$WORK/$name-stock.run.out" "$WORK/$name-direct.run.out" >/dev/null; then
  echo "FAIL $name: stdout differs"; exit 1
fi
echo "PASS $name (exit $sr)"
