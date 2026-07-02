#!/bin/bash
set -e

rm -rf pyret-lang
git clone --single-branch -b horizon https://github.com/brownplt/pyret-lang.git

pushd pyret-lang
npm install
make phaseA libA
# Optionally also build the TypeScript port of the compiler so the published
# package supports `pyret --backend ts` (see pyret.js). Opt-in because it is
# strictly additive to the stock backend.
if [ "${PYRET_NPM_TS:-}" = "1" ]; then
  make ts-compiler ts-libA
fi
touch .npmignore
popd

