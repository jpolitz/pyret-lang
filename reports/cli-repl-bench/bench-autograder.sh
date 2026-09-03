#!/bin/bash
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
P=~/work/pyret-lang/npm/pyret.js
N=${N:-20}
killservers() { ps aux | grep -E "[p]yret.jarr|[t]s-compiler/pyret.js" | awk '{print $2}' | xargs -r kill -9; sleep 1; rm -f /tmp/ag*.sock; }
mksubs() { local root="$1"; rm -rf "$root"; for i in $(seq 1 $N); do mkdir -p "$root/s$i"; printf 'print("ok-%s\\n")\ncheck: %s + 1 is %s end\n' "$i" "$i" "$((i+1))" > "$root/s$i/sub.arr"; done; }

for backend in pyret ts; do
  killservers
  mksubs "$SP/agb-$backend"
  # warm the server with one throwaway compile
  ( cd "$SP/agb-$backend/s1" && timeout 300 node $P --backend $backend --port /tmp/ag1.sock sub.arr >/dev/null 2>&1 )
  s=$(date +%s%N)
  for i in $(seq 2 $N); do ( cd "$SP/agb-$backend/s$i" && node $P --backend $backend --port /tmp/ag1.sock sub.arr >/dev/null 2>&1 ); done
  e=$(date +%s%N)
  tot=$(( (e-s)/1000000 )); per=$(( tot / (N-1) ))
  echo "$backend  sequential, one warm server:  $((N-1)) submissions in ${tot} ms  = ${per} ms each"
  rss=$(ps -eo rss,cmd --no-headers | grep -E "pyret.jarr -serve|ts-compiler/pyret.js" | grep -v grep | awk '{s+=$1} END {printf "%.0f", s/1024}')
  echo "         server RSS after the run: ${rss} MB"
done

# Parallel, but with one server per worker -- the workaround that is actually safe.
killservers
mksubs "$SP/agb-par"
for w in 1 2 3 4; do ( cd "$SP/agb-par/s$w" && timeout 300 node $P --backend pyret --port /tmp/ag-w$w.sock sub.arr >/dev/null 2>&1 ); done
rss=$(ps -eo rss,cmd --no-headers | grep "pyret.jarr -serve" | grep -v grep | awk '{s+=$1} END {printf "%.0f", s/1024}')
nsrv=$(ps aux | grep -c "[p]yret.jarr -serve")
s=$(date +%s%N)
for i in $(seq 5 $N); do
  w=$(( (i % 4) + 1 ))
  ( cd "$SP/agb-par/s$i" && node $P --backend pyret --port /tmp/ag-w$w.sock sub.arr >/dev/null 2>&1 ) &
  while [ "$(jobs -rp | wc -l)" -ge 4 ]; do wait -n; done
done
wait
e=$(date +%s%N)
tot=$(( (e-s)/1000000 )); per=$(( tot / (N-4) ))
echo "pyret  4-way parallel, 4 separate servers: $((N-4)) submissions in ${tot} ms = ${per} ms each"
echo "         $nsrv servers, ${rss} MB total"
killservers
echo "### AG DONE"
