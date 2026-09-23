#!/bin/bash
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
PYRET=~/work/pyret-lang/npm/pyret.js
SOCK=/tmp/bench.sock
EXPRS='["import file(\"helper.arr\") as H","H.total-area(H.shapes)","H.area(H.circ(10))"]'
killserver() { ps aux | grep "[p]yret.jarr" | awk '{print $2}' | xargs -r kill -9; sleep 1; rm -f "$SOCK"; }
mkproj() { local d="$SP/pj-$1"; rm -rf "$d"; mkdir -p "$d"; cp "$SP/proj/helper.arr" "$d/"; echo "$d"; }

echo "### LOCAL: first session in a fresh project (helper.arr not yet compiled)"
D=$(mkproj l1); timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$D" --mode local --exprs "$EXPRS"
echo "### LOCAL: second session, same project (.pyret/compiled warm)"
timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$D" --mode local --exprs "$EXPRS"
echo "### LOCAL: third session, same project"
timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$D" --mode local --exprs "$EXPRS"
echo "### .pyret/compiled contents (local):"; ls "$D/.pyret/compiled" 2>/dev/null | head -20; ls "$D/.pyret/compiled" 2>/dev/null | wc -l

killserver
echo "### SERVER: first session in a fresh project (server just started)"
D=$(mkproj s1); timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$D" --mode server --port "$SOCK" --exprs "$EXPRS"
echo "### SERVER: second session, same project, same server"
timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$D" --mode server --port "$SOCK" --exprs "$EXPRS"
echo "### SERVER: third session, same project, same server"
timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$D" --mode server --port "$SOCK" --exprs "$EXPRS"
echo "### .pyret/compiled contents (server):"; ls "$D/.pyret/compiled" 2>/dev/null | head -20; ls "$D/.pyret/compiled" 2>/dev/null | wc -l
killserver
echo "### PROJ DONE"
