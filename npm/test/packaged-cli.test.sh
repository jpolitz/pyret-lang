#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

tarball="$PWD/$(npm pack --silent | tail -n 1)"
smokedir=$(mktemp -d)
trap 'rm -rf "$smokedir" "$tarball"' EXIT

cd "$smokedir"
npm init -y > /dev/null
npm install --no-audit --no-fund "$tarball" > /dev/null

cat > smoke.arr <<'ARR'
check "smoke":
  1 + 1 is 2
end
ARR

run_backend() {
  local backend="$1"
  local sock="$smokedir/comm-$backend.sock"
  local out="$smokedir/out-$backend.log"
  local status
  set +e
  node node_modules/pyret-npm/pyret.js --backend "$backend" --port "$sock" smoke.arr > "$out" 2>&1
  status=$?
  set -e
  node node_modules/pyret-npm/pyret.js --backend "$backend" --port "$sock" -s > /dev/null 2>&1 || true
  if [ "$status" -ne 0 ] || ! grep -q "Looks shipshape" "$out"; then
    echo "packaged cli failed for backend $backend (exit $status):"
    cat "$out"
    exit 1
  fi
  echo "packaged cli: backend $backend is shipshape"
}

run_backend pyret
if [ -e node_modules/pyret-npm/pyret-lang/build/ts-compiler/pyret.js ]; then
  run_backend ts
else
  echo "packaged cli: ts backend not in package, skipped"
fi

# The REPL is what students run, and it takes a different path through the
# package than the batch compile: repl-local.js loads the ts-compiler build's
# AMD bundle out of the installed tree. Check it end to end from the tarball.
repl_out="$smokedir/out-repl.log"
repl_status=0
set +e
{
  echo '21 * 2'
  echo 'include image'
  echo 'image-width(circle(50, "solid", "red"))'
  echo 'check: 2 + 2 is 4 end'
} | node node_modules/pyret-npm/pyret.js --repl > "$repl_out" 2>&1
repl_status=$?
set -e
if [ -e node_modules/pyret-npm/pyret-lang/build/ts-compiler/pyret.js ]; then
  # No ts build would mean a silent fall back to the compile-server REPL, so
  # assert we really took the in-process path.
  if grep -q "Starting Parley server" "$repl_out"; then
    echo "packaged cli: --repl fell back to the compile server despite a ts build:"
    cat "$repl_out"
    exit 1
  fi
fi
for expected in "42" "100" "Looks shipshape"; do
  if ! grep -q "$expected" "$repl_out"; then
    echo "packaged cli: --repl missing '$expected' (exit $repl_status):"
    cat "$repl_out"
    exit 1
  fi
done
if [ "$repl_status" -ne 0 ]; then
  echo "packaged cli: --repl exited $repl_status:"
  cat "$repl_out"
  exit 1
fi
echo "packaged cli: --repl is shipshape"
