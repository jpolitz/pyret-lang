#!/usr/bin/env bash
# usage (from anywhere): tests/codegen-bench/run-all.sh [runs]   (default 7)
set -euo pipefail
LANG_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$LANG_DIR"
RUNS="${1:-7}"
[ -d node_modules ] || npm ci
make ts-compiler
mkdir -p build/codegen-bench
node tests/codegen-bench/bench.js --runs "$RUNS" --out build/codegen-bench/results.json 2>&1 | tee build/codegen-bench/run.log
for mode in total work speedup sizes progsizes; do
  echo
  echo "## $mode"
  node tests/codegen-bench/table.js build/codegen-bench/results.json "$mode"
done | tee build/codegen-bench/tables.md
