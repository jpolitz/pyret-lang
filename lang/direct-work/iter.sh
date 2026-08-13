#!/bin/bash
# Iteration loop for direct-mode development:
# rebuild phaseA (incremental), compile $1 in direct mode, run it.
set -e
cd "$(dirname "$0")/.."
PROG="${1:-direct-work/hello.arr}"
OUT="${2:-direct-work/out-direct.jarr}"
make phaseA 2>&1 | grep -E "error|Error|ERROR" && exit 1 || true
# The direct cache can't see codegen changes; always start fresh
rm -rf compiled-direct
node build/phaseA/pyret.jarr --build-runnable "$PROG" --outfile "$OUT" \
  --builtin-js-dir src/js/trove/ --builtin-arr-dir src/arr/trove \
  -direct -no-display-progress \
  --require-config src/scripts/standalone-configDirect.json
echo "=== running $OUT ==="
node "$OUT"
