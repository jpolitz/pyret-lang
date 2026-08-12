#!/bin/bash
set -e

cd "$(dirname "$0")"

(cd ../lang && npm ci && make phaseA libA)

rm -rf pyret-lang
mkdir -p pyret-lang/build
cp -r ../lang/build/phaseA pyret-lang/build/
