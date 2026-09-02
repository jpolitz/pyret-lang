#!/bin/bash
# Full REPL benchmark: server-backed vs in-process, same machine, same session.
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
PYRET=~/work/pyret-lang/npm/pyret.js
SOCK=/tmp/bench.sock
REPS=${REPS:-5}

EXPRS='["1 + 1","x = 10","x + 5","[list: 1, 2, 3]","fun sq(n): n * n end","sq(12)","check: 2 + 2 is 4 end","[list: 1,2,3].map(lam(n): n + 1 end)","include image","image-width(circle(50, \"solid\", \"red\"))"]'

killserver() { ps aux | grep "[p]yret.jarr" | awk '{print $2}' | xargs -r kill -9; sleep 1; rm -f "$SOCK"; }
freshdir() { local d="$SP/bd-$1"; rm -rf "$d"; mkdir -p "$d"; echo "$d"; }

run() { # mode dir [extra]
  local mode="$1"; local dir="$2"
  if [ "$mode" = local ]; then
    timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$dir" --mode local --exprs "$EXPRS"
  else
    timeout 900 node "$SP/bench-repl.js" --pyret "$PYRET" --cwd "$dir" --mode server --port "$SOCK" --exprs "$EXPRS"
  fi
}

echo "=== WARMUP (discarded) ==="
killserver
run local "$(freshdir warm0)" > /dev/null 2>&1
run server "$(freshdir warm1)" > /dev/null 2>&1

echo "=== A. in-process (--no-server), fresh cwd, $REPS reps ==="
for i in $(seq 1 $REPS); do run local "$(freshdir "loc$i")"; done

echo "=== B. server-backed, server ALREADY RUNNING, fresh cwd, $REPS reps ==="
for i in $(seq 1 $REPS); do run server "$(freshdir "srvw$i")"; done

echo "=== C. server-backed, server NOT running (pays the fork), fresh cwd, 3 reps ==="
for i in 1 2 3; do killserver; run server "$(freshdir "srvc$i")"; done

echo "=== BENCH DONE ==="
