/*
  Registers the embedded compiler-fixed sources (see gen-embedded-fs.mjs) as the
  compiler's fixed-fs provider, so the binary is a *self-contained compiler*:
  `.arr -> .jarr` needs no asset tree on disk.

  The compiler's read sites for fixed sources go through interop/fixed-fs, which
  is disk-first / embedded-fallback: a present checkout always wins (byte-exact,
  and a user's own --builtin-*-dir is never shadowed); the embedded copy is
  served only when the file is missing.

  Matching is by repo-root-relative *suffix*, so it is independent of cwd and of
  where the binary or the (absent) asset root nominally live: a read of
  `/anything/src/arr/trove/lists.arr` resolves to embedded key
  `src/arr/trove/lists.arr`.
*/
import { EMBEDDED_FS } from './embedded-fs.generated';
import { setFixedFsProvider } from '../src/interop/fixed-fs';

// basename -> candidate keys, for O(1)-ish suffix lookup.
const byBase = new Map<string, string[]>();
for (const key of Object.keys(EMBEDDED_FS)) {
  const base = key.slice(key.lastIndexOf('/') + 1);
  const list = byBase.get(base);
  if (list) list.push(key);
  else byBase.set(base, [key]);
}

function lookup(p: string): string | undefined {
  const norm = p.split('\\').join('/');
  const base = norm.slice(norm.lastIndexOf('/') + 1);
  const cands = byBase.get(base);
  if (!cands) return undefined;
  for (const key of cands) {
    if (norm === key || norm.endsWith('/' + key)) return key;
  }
  return undefined;
}

// Precompiled read-only cache entries live under this prefix; they must report
// a positive mtime so cli-module-loader.cachedAvailable accepts them (sources
// report 0 — the "always happy with the compiled version" convention).
const PRECOMPILED_PREFIX = 'build/ts-compiler/lib-precompiled/';

export function installEmbeddedFs(): void {
  setFixedFsProvider({
    read(path: string): string | undefined {
      const key = lookup(path);
      return key === undefined ? undefined : EMBEDDED_FS[key];
    },
    mtime(path: string): number {
      const key = lookup(path);
      return key !== undefined && key.startsWith(PRECOMPILED_PREFIX) ? 1 : 0;
    },
  });
}
