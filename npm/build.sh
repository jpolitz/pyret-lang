#!/bin/bash
set -e

# This package ships the Pyret compiler built from the lang/ directory of this
# monorepo (previously this cloned a separate pyret-lang repo). Build the local
# compiler and stage its phaseA output under ./pyret-lang, matching the layout
# pyret.js and the published package expect: pyret-lang/build/phaseA/pyret.jarr.

pushd ../lang
npm install
make phaseA libA
popd

rm -rf pyret-lang
mkdir -p pyret-lang/build
cp -R ../lang/build/phaseA pyret-lang/build/phaseA
touch pyret-lang/.npmignore
