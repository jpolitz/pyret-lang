#!/bin/bash
set -e

cd "$(dirname "$0")"

(cd ../lang && npm ci && make phaseA libA)

# Optionally also build the TypeScript port of the compiler so the packaged
# CLI supports `pyret --backend ts` (see pyret.js). Opt-in because it is
# strictly additive to the stock backend.
if [ "${PYRET_NPM_TS:-}" = "1" ]; then
  (cd ../lang && make ts-compiler ts-libA)
fi

rm -rf pyret-lang
mkdir -p pyret-lang/build
cp -r ../lang/build/phaseA pyret-lang/build/
if [ "${PYRET_NPM_TS:-}" = "1" ]; then
  cp -r ../lang/build/ts-compiler pyret-lang/build/
fi
