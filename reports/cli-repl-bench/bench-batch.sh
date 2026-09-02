#!/bin/bash
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
PYRET=~/work/pyret-lang/npm/pyret.js
SOCK=/tmp/bench.sock
killserver() { ps aux | grep -E "[p]yret.jarr|[t]s-compiler/pyret.js" | awk '{print $2}' | xargs -r kill -9; sleep 1; rm -f "$SOCK"; }
mkproj() { local d="$SP/bt-$1"; rm -rf "$d"; mkdir -p "$d"; cp "$SP/proj/helper.arr" "$d/"; cat > "$d/main.arr" <<'EOF'
import file("helper.arr") as H
check:
  H.total-area(H.shapes) is-roughly 19.14159
  H.area(H.circ(2)) is-roughly 12.56636
end
print("done\n")
EOF
echo "$d"; }
timeit() { local label="$1"; shift; local s=$(date +%s%N); "$@" > /dev/null 2>&1; local st=$?; local e=$(date +%s%N); echo "$label  $(( (e-s)/1000000 )) ms (exit $st)"; }

for backend in pyret ts; do
  killserver
  D=$(mkproj "$backend")
  ( cd "$D" && timeit "batch $backend  cold (server fork + compile)" node "$PYRET" --backend "$backend" --port "$SOCK" main.arr )
  ( cd "$D" && timeit "batch $backend  warm server, cached compile   " node "$PYRET" --backend "$backend" --port "$SOCK" main.arr )
  ( cd "$D" && rm -rf .pyret/compiled && timeit "batch $backend  warm server, cache cleared    " node "$PYRET" --backend "$backend" --port "$SOCK" main.arr )
done
killserver
echo "### BATCH DONE"
