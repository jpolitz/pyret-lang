#!/bin/bash
set -u
SP="$(cd "$(dirname "$0")" && pwd)"
PYRET=~/work/pyret-lang/npm/pyret.js
SOCK=/tmp/rss.sock
killserver() { ps aux | grep -E "[p]yret.jarr|[t]s-compiler/pyret.js" | awk '{print $2}' | xargs -r kill -9; sleep 1; rm -f "$SOCK"; }

report() {
  echo "  processes:"
  ps -eo rss,cmd --no-headers | grep -E "pyret\.jarr -serve|npm/pyret\.js --repl" | grep -v grep \
    | awk '{ printf "    %8.1f MB  %s %s %s\n", $1/1024, $2, $3, $4 }'
  ps -eo rss,cmd --no-headers | grep -E "pyret\.jarr -serve|npm/pyret\.js --repl" | grep -v grep \
    | awk '{s+=$1} END { printf "    total: %.1f MB\n", s/1024 }'
}

killserver
rm -rf "$SP/rss-s"; mkdir -p "$SP/rss-s"; cd "$SP/rss-s"
( printf '1 + 1\n[list: 1,2,3]\n'; sleep 20 ) | node "$PYRET" --repl --port "$SOCK" > /dev/null 2>&1 &
sleep 12
echo "SERVER-BACKED repl, idle at the prompt:"
report
wait
killserver

rm -rf "$SP/rss-l"; mkdir -p "$SP/rss-l"; cd "$SP/rss-l"
( printf '1 + 1\n[list: 1,2,3]\n'; sleep 20 ) | node "$PYRET" --repl --no-server > /dev/null 2>&1 &
sleep 12
echo "IN-PROCESS repl, idle at the prompt:"
report
wait
killserver
echo "### RSS DONE"
