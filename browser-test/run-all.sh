#!/usr/bin/env bash
#
# run-all.sh -- reproduce the whole cross-environment demonstration:
#   (0) baseline: code.pyret.org's own mocha suite on /editor
#   (1) the SAME assertions on the embed API's embedded instances
#   (2) fidelity check of the in-page assertion port against /editor
#   (3) the SAME assertions on the vscode extension's webviews
#
# It is strictly additive: it only reads code.pyret.org / vscode, and writes
# results under browser-test/results/.
#
# Prereqs (installed/built once):
#   - code.pyret.org built (build/web/js/cpo-main.jarr present) + npm deps
#   - vscode extension built: (cd vscode && npm i && npm run compile) with
#     `build` symlinked to ../code.pyret.org/build
#   - browser-test deps: (cd browser-test && npm i)
#   - a Chrome + matching chromedriver (see CHROMEDRIVER_BINARY below)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CPO="$ROOT/code.pyret.org"
RESULTS="$HERE/results"
mkdir -p "$RESULTS"

# ---- environment expected by the CPO server + selenium harness ----
export BASE_URL="${BASE_URL:-http://localhost:4999}"
export PORT="${PORT:-4999}"
export PYRET="${PYRET:-http://localhost:4999/js/cpo-main.jarr}"
export POSTMESSAGE_ORIGIN="${POSTMESSAGE_ORIGIN:-*}"
export NODE_ENV="${NODE_ENV:-development}"
export SESSION_SECRET="${SESSION_SECRET:-not-so-secret}"
export URL_FILE_MODE="${URL_FILE_MODE:-all-remote}"
export IMAGE_PROXY_BYPASS="${IMAGE_PROXY_BYPASS:-true}"
export SHARED_FETCH_SERVER="${SHARED_FETCH_SERVER:-https://code.pyret.org}"
export GOOGLE_CHROME_BINARY="${GOOGLE_CHROME_BINARY:-/bin/google-chrome}"
# CHROMEDRIVER_BINARY should point at a chromedriver matching your Chrome.
export CHROMEDRIVER_BINARY="${CHROMEDRIVER_BINARY:-}"

# ---- (re)start the CPO server if not already serving /editor ----
if ! curl -fs -o /dev/null "$BASE_URL/editor"; then
  echo "Starting CPO server..."
  ( cd "$CPO" && node src/run.js > "$RESULTS/cpo-server.log" 2>&1 & )
  for i in $(seq 1 30); do curl -fs -o /dev/null "$BASE_URL/editor" && break; sleep 1; done
fi
curl -fs -o /dev/null "$BASE_URL/editor" || { echo "CPO server not reachable at $BASE_URL"; exit 1; }
echo "CPO server reachable at $BASE_URL"

echo "=== (1) EMBED: upstream assertions on embedded instances ==="
( cd "$CPO" && ./node_modules/.bin/mocha \
    "$HERE"/embed/*.spec.js --reporter spec ) | tee "$RESULTS/embed-full.txt"

echo "=== (2) FIDELITY: in-page port vs /editor (same specs) ==="
( cd "$HERE" && node fidelity/run-cpo-fidelity.js ) | tee "$RESULTS/cpo-fidelity-full.txt"

echo "=== (3) VSCODE: same assertions on the extension's webviews ==="
( cd "$HERE" && node vscode/run-vscode-tests.js ) | tee "$RESULTS/vscode-full.txt"

echo "Done. See $RESULTS/."
