#!/usr/bin/env bash
# usage: v8-trace.sh <variant> <program>  -> prints deopt/opt/inlining counts
set -e
LANG_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
jarr="$LANG_DIR/build/codegen-bench/$1/$2.jarr"
ulimit -s unlimited
out="$(NODE_PATH="$LANG_DIR/node_modules" node --stack-size=1000000 --trace-deopt --trace-opt --trace-turbo-inlining "$jarr" 2>&1)"
deopts=$(grep -c 'bailout (kind' <<<"$out" || true)
lazy=$(grep -c 'bailout (kind: deopt-lazy' <<<"$out" || true)
opts=$(grep -c 'completed compiling\|completed optimizing' <<<"$out" || true)
inl_all=$(grep -c '^Inlining ' <<<"$out" || true)
inl_pyret=$(grep -E '^Inlining [^<]*<SharedFunctionInfo _[0-9a-f]{64}__[0-9]+>' <<<"$out" | wc -l)
echo "$1 $2 deopts=$deopts lazy=$lazy optimized=$opts inlined=$inl_all inlined-compiled-pyret=$inl_pyret"
