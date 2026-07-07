#!/usr/bin/env bash
# Build the single-executable Pyret compiler with bun.
#
# Prereq: `make ts-compiler` has produced build/ts-compiler/js/*.js
# (the generated parser + copied support modules that pyret-sea.ts embeds).
#
# Usage: src/ts-compiler/sea/build-sea.sh [outfile]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
lang="$(cd "$here/../../.." && pwd)"
out="${1:-$lang/build/ts-compiler/pyret-sea}"
# The friendly `pyret <file>.arr` frontend lands next to the drop-in binary
# unless an explicit outfile was given (then only the drop-in is built).
cli_out="${2:-$lang/build/ts-compiler/pyret}"

cd "$lang"

if [ ! -f build/ts-compiler/js/pyret-parser.js ]; then
  echo "error: build/ts-compiler/js/pyret-parser.js missing; run 'make ts-compiler' first" >&2
  exit 1
fi

# Precompile the `global` closure into a read-only cache the binary embeds, so
# first runs skip recompiling the trove ("no Compiling N/M"). Uses the node
# build (always present after `make ts-compiler`). A seed program pulls in the
# closure; its own cache entry is dropped (the generator also skips *.arr-*).
precompiled="build/ts-compiler/lib-precompiled"
seed="build/ts-compiler/.sea-seed.arr"
rm -rf "$precompiled"
printf 'import global as G\nprint("")\n' > "$seed"
node build/ts-compiler/pyret.js --build-runnable "$seed" \
  --outfile build/ts-compiler/.sea-seed.jarr \
  --builtin-js-dir src/js/trove/ --builtin-arr-dir src/arr/trove/ \
  --compiled-dir "$precompiled/" \
  --deps-file build/ts-compiler/bundled-node-compile-deps.js \
  -no-check-mode -no-display-progress \
  --require-config src/scripts/standalone-configA.json >/dev/null 2>&1
rm -f "$seed" build/ts-compiler/.sea-seed.jarr "$precompiled"/.sea-seed.arr-*
echo "precompiled builtins: $(ls "$precompiled"/*-static.js 2>/dev/null | wc -l) modules"

# Generate the embedded-filesystem manifest (trove sources, runtime JS, config,
# deps bundle, + the precompiled builtins above) so the binaries are
# self-contained compilers. Reads build/phaseA and build/ts-compiler, so it
# needs `make ts-compiler` (+ build/phaseA/js).
node "$here/gen-embedded-fs.mjs"

# Optional cross-compile: PYRET_SEA_TARGET=bun-darwin-arm64 (or bun-darwin-x64,
# bun-linux-x64, bun-windows-x64, ...) builds a binary for that platform. The
# embedded assets and on-disk assets are plain platform-independent JS/text, so
# a cross-built binary runs against the same checkout. Default: host platform.
target_arg=()
if [ -n "${PYRET_SEA_TARGET:-}" ]; then
  target_arg=(--target="$PYRET_SEA_TARGET")
  echo "cross-compiling for: $PYRET_SEA_TARGET"
fi

# 1) Drop-in for `node build/ts-compiler/pyret.js` (byte-exact output).
bun build --compile --minify "${target_arg[@]}" "$here/pyret-sea.ts" --outfile "$out"
echo "built: $out"

# 2) Friendly single-command compile+run CLI (`pyret ahoy-world.arr`).
bun build --compile --minify "${target_arg[@]}" "$here/pyret-cli.ts" --outfile "$cli_out"
echo "built: $cli_out"

ls -la "$out" "$cli_out"
